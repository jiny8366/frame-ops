"""
실판매(외부 POS·엑셀 등) CSV → `fo_sales` / `fo_sale_lines` 적재.

- 동일 `receipt_key` 행을 한 건의 판매로 묶습니다.
- 결제: `sum(단가×수량 − 행할인) − discount_total == cash_amount + card_amount` 이어야 합니다.
- 재고는 POS와 동일하게 **차감**합니다. 사전 입고가 없으면 음수 재고가 될 수 있습니다.
- 정산된 영업일·`FRAME_OPS_DATA_START_DATE` 이전 날짜는 거절합니다.

CSV 컬럼명은 대소문자 무시·앞뒤 공백 무시합니다.
"""

from __future__ import annotations

import csv
import io
import uuid
from dataclasses import dataclass, field
from datetime import datetime
from typing import Any, BinaryIO, Iterable, TextIO
from zoneinfo import ZoneInfo

from lib.constants import get_data_entry_start_date
from lib.settlement_guard import is_business_day_settled
from lib.stock import bump_stock, find_product
from lib.supabase_client import get_supabase

_TZ_SEOUL = ZoneInfo("Asia/Seoul")


def _norm_header(k: str) -> str:
    return k.strip().lower().replace(" ", "_").replace("-", "_")


def _norm_row(row: dict[str, str]) -> dict[str, str]:
    out: dict[str, str] = {}
    for k, v in row.items():
        if k is None:
            continue
        nk = _norm_header(str(k))
        if not nk:
            continue
        out[nk] = (v or "").strip()
    return out


def parse_sold_at(raw: str) -> datetime:
    s = raw.strip()
    if not s:
        raise ValueError("sold_at 비어 있음")
    if s.endswith("Z"):
        s = s[:-1] + "+00:00"
    dt = datetime.fromisoformat(s)
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=_TZ_SEOUL)
    return dt


def _int_field(d: dict[str, str], key: str, *, required: bool) -> int | None:
    v = d.get(key, "").strip()
    if not v:
        if required:
            raise ValueError(f"{key} 필수")
        return None
    try:
        return int(float(v))
    except ValueError as e:
        raise ValueError(f"{key} 정수 아님: {v!r}") from e


def _float_qty(d: dict[str, str], key: str) -> float:
    v = d.get(key, "").strip()
    if not v:
        raise ValueError(f"{key} 필수")
    q = float(v)
    if q <= 0:
        raise ValueError(f"{key}는 0보다 커야 합니다: {v!r}")
    return q


@dataclass
class SaleLineDraft:
    product_code: str
    barcode: str
    quantity: float
    unit_price: int
    line_discount: int
    cost_price_at_sale: int | None


@dataclass
class SaleDraft:
    receipt_key: str
    store_code: str
    sold_at: datetime
    lines: list[SaleLineDraft] = field(default_factory=list)
    cash_amount: int = 0
    card_amount: int = 0
    discount_total: int = 0
    discount_type_code: str | None = None
    seller_code: str | None = None
    clerk_note: str | None = None
    idempotency_key: str | None = None


def _row_to_line(d: dict[str, str]) -> SaleLineDraft:
    pc = (d.get("product_code") or "").strip()
    bc = (d.get("barcode") or "").strip()
    if not pc and not bc:
        raise ValueError("product_code 또는 barcode 필요")
    ld = _int_field(d, "line_discount", required=False) or 0
    if ld < 0:
        raise ValueError("line_discount 음수 불가")
    cps = _int_field(d, "cost_price_at_sale", required=False)
    unit_price = _int_field(d, "unit_price", required=True)
    if unit_price is None:
        raise ValueError("unit_price 필수")
    return SaleLineDraft(
        product_code=pc,
        barcode=bc,
        quantity=_float_qty(d, "quantity"),
        unit_price=unit_price,
        line_discount=int(ld),
        cost_price_at_sale=cps,
    )


def iter_sale_drafts_from_rows(rows: Iterable[dict[str, str]]) -> list[SaleDraft]:
    """CSV DictReader 등에서 읽은 행 dict 목록(헤더는 `_norm_row`로 정규화)."""
    groups: dict[str, list[dict[str, str]]] = {}
    order: list[str] = []
    for raw in rows:
        d = _norm_row(raw)
        rk = (d.get("receipt_key") or "").strip()
        if not rk:
            raise ValueError("receipt_key 필수")
        sc = (d.get("store_code") or "").strip()
        if not sc:
            raise ValueError(f"receipt_key={rk!r}: store_code 필수")
        st_raw = (d.get("sold_at") or "").strip()
        if not st_raw:
            raise ValueError(f"receipt_key={rk!r}: sold_at 필수")
        if rk not in groups:
            groups[rk] = []
            order.append(rk)
        groups[rk].append(d)

    out: list[SaleDraft] = []
    for rk in order:
        parts = groups[rk]
        base_store = (parts[0].get("store_code") or "").strip()
        base_sold = parse_sold_at(parts[0]["sold_at"])
        cash = _int_field(parts[0], "cash_amount", required=False)
        card = _int_field(parts[0], "card_amount", required=False)
        disc = _int_field(parts[0], "discount_total", required=False) or 0
        dtype = (parts[0].get("discount_type_code") or "").strip() or None
        seller = (parts[0].get("seller_code") or "").strip() or None
        note = (parts[0].get("clerk_note") or "").strip() or None
        idem = (parts[0].get("idempotency_key") or "").strip() or None

        lines: list[SaleLineDraft] = []
        for d in parts:
            sc2 = (d.get("store_code") or "").strip()
            if sc2 != base_store:
                raise ValueError(f"receipt_key={rk!r}: store_code 불일치 {base_store!r} vs {sc2!r}")
            st2 = parse_sold_at(d["sold_at"])
            if st2 != base_sold:
                raise ValueError(f"receipt_key={rk!r}: sold_at 불일치")

            c2 = _int_field(d, "cash_amount", required=False)
            ca2 = _int_field(d, "card_amount", required=False)
            di2 = _int_field(d, "discount_total", required=False)
            if c2 is not None or ca2 is not None or di2 is not None:
                if (c2 or 0) != (cash or 0) or (ca2 or 0) != (card or 0) or (di2 or 0) != disc:
                    raise ValueError(
                        f"receipt_key={rk!r}: 동일 전표의 cash/card/discount_total 은 모든 행에서 같아야 합니다."
                    )
            lines.append(_row_to_line(d))

        if cash is None or card is None:
            raise ValueError(f"receipt_key={rk!r}: cash_amount·card_amount 필수(첫 행)")

        out.append(
            SaleDraft(
                receipt_key=rk,
                store_code=base_store,
                sold_at=base_sold,
                lines=lines,
                cash_amount=int(cash),
                card_amount=int(card),
                discount_total=int(disc),
                discount_type_code=dtype,
                seller_code=seller,
                clerk_note=note,
                idempotency_key=idem,
            )
        )
    return out


def parse_sales_import_csv(text: str) -> list[SaleDraft]:
    """UTF-8 CSV 문자열."""
    return parse_sales_import_io(io.StringIO(text))


def parse_sales_import_io(fp: TextIO | BinaryIO, *, encoding: str = "utf-8-sig") -> list[SaleDraft]:
    if hasattr(fp, "read") and hasattr(fp, "mode") and "b" in getattr(fp, "mode", ""):
        raw = fp.read()
        if isinstance(raw, bytes):
            text = raw.decode(encoding)
        else:
            text = str(raw)
        fp = io.StringIO(text)
    elif isinstance(fp, bytes):
        fp = io.StringIO(fp.decode(encoding))
    reader = csv.DictReader(fp)
    if not reader.fieldnames:
        raise ValueError("CSV 헤더 없음")
    return iter_sale_drafts_from_rows(reader)


def payment_check_message(sale: SaleDraft) -> str | None:
    line_sum = sum(int(round(line.unit_price * line.quantity)) - line.line_discount for line in sale.lines)
    pay = sale.cash_amount + sale.card_amount
    expect = line_sum - sale.discount_total
    if expect != pay:
        return (
            f"receipt_key={sale.receipt_key!r}: "
            f"라인합 {line_sum} − 할인 {sale.discount_total} = {expect} 인데 "
            f"현금+카드 = {pay}"
        )
    return None


def validate_sale_drafts(sb: Any, drafts: list[SaleDraft]) -> tuple[list[str], list[str]]:
    """(errors, warnings). errors 있으면 적재하면 안 됨."""
    errors: list[str] = []
    warnings: list[str] = []
    min_d = get_data_entry_start_date()

    stores = sb.table("fo_stores").select("id, store_code").eq("active", True).execute().data or []
    code_to_id = {str(s["store_code"]): str(s["id"]) for s in stores}

    seen_idem: set[str] = set()
    for sale in drafts:
        msg = payment_check_message(sale)
        if msg:
            errors.append(msg)

        biz = sale.sold_at.astimezone(_TZ_SEOUL).date()
        if biz < min_d:
            errors.append(
                f"receipt_key={sale.receipt_key!r}: 영업일 {biz} 은 "
                f"데이터 적재 시작일({min_d.isoformat()}) 이전입니다."
            )

        sid = code_to_id.get(sale.store_code)
        if not sid:
            errors.append(f"receipt_key={sale.receipt_key!r}: 지점 코드 없음 또는 비활성: {sale.store_code!r}")
        elif is_business_day_settled(sb, sid, biz):
            errors.append(
                f"receipt_key={sale.receipt_key!r}: {biz.isoformat()} 은 해당 지점에서 정산되어 잠겼습니다."
            )

        if sale.idempotency_key:
            if sale.idempotency_key in seen_idem:
                errors.append(f"idempotency_key 중복(파일 내): {sale.idempotency_key!r}")
            seen_idem.add(sale.idempotency_key)
            ex = (
                sb.table("fo_sales")
                .select("id")
                .eq("idempotency_key", sale.idempotency_key)
                .limit(1)
                .execute()
                .data
            )
            if ex:
                errors.append(f"receipt_key={sale.receipt_key!r}: idempotency_key 이미 DB 존재")

        for line in sale.lines:
            p = None
            if line.product_code:
                p = find_product(sb, line.product_code)
            if p is None and line.barcode:
                p = find_product(sb, line.barcode)
            if not p:
                key = line.product_code or line.barcode
                errors.append(f"receipt_key={sale.receipt_key!r}: 상품 없음 {key!r}")

        if len(sale.lines) > 50:
            warnings.append(f"receipt_key={sale.receipt_key!r}: 라인 수 {len(sale.lines)} (대량 전표)")

    return errors, warnings


def apply_sale_drafts(sb: Any, drafts: list[SaleDraft]) -> list[str]:
    """검증 없이 적재(호출 전 validate_sale_drafts 권장). 성공 로그 문자열."""
    log: list[str] = []
    stores = sb.table("fo_stores").select("id, store_code").eq("active", True).execute().data or []
    code_to_id = {str(s["store_code"]): str(s["id"]) for s in stores}

    for sale in drafts:
        store_id = code_to_id[sale.store_code]
        sale_id = str(uuid.uuid4())
        idem = sale.idempotency_key or str(uuid.uuid4())
        row_ins: dict[str, Any] = {
            "id": sale_id,
            "store_id": store_id,
            "sold_at": sale.sold_at.isoformat(),
            "cash_amount": sale.cash_amount,
            "card_amount": sale.card_amount,
            "discount_total": sale.discount_total,
            "discount_type_code": sale.discount_type_code,
            "idempotency_key": idem,
        }
        if sale.seller_code:
            row_ins["seller_code"] = sale.seller_code
        if sale.clerk_note:
            row_ins["clerk_note"] = sale.clerk_note
        sb.table("fo_sales").insert(row_ins).execute()

        for line in sale.lines:
            p = find_product(sb, line.product_code) if line.product_code else None
            if p is None and line.barcode:
                p = find_product(sb, line.barcode)
            assert p is not None
            cost = line.cost_price_at_sale
            if cost is None:
                cost = int(p.get("cost_price") or 0)
            sb.table("fo_sale_lines").insert(
                {
                    "sale_id": sale_id,
                    "product_id": p["id"],
                    "quantity": line.quantity,
                    "unit_price": line.unit_price,
                    "line_discount": line.line_discount,
                    "cost_price_at_sale": cost,
                }
            ).execute()
            bump_stock(sb, store_id, p["id"], -float(line.quantity))

        log.append(f"OK {sale.receipt_key} → sale {sale_id[:8]}… ({len(sale.lines)} lines)")
    return log


def run_import_csv_text(sb: Any, text: str, *, dry_run: bool) -> tuple[list[str], list[str], list[str]]:
    """
    파싱 → 검증 → (dry_run 아니면) 적재.
    반환: (errors, warnings, log_lines)
    """
    drafts = parse_sales_import_csv(text)
    err, warn = validate_sale_drafts(sb, drafts)
    if err or dry_run:
        return err, warn, []
    log = apply_sale_drafts(sb, drafts)
    return err, warn, log


def cli_main(argv: list[str] | None = None) -> int:
    import argparse

    p = argparse.ArgumentParser(description="FRAME OPS 실판매 CSV → fo_sales 적재")
    p.add_argument("--file", required=True, help="CSV 경로 (UTF-8)")
    p.add_argument("--dry-run", action="store_true", help="DB 쓰기 없이 검증만")
    args = p.parse_args(argv)

    path = args.file
    with open(path, encoding="utf-8-sig") as f:
        text = f.read()

    try:
        sb = get_supabase()
    except RuntimeError as e:
        print(f"Supabase 연결 실패: {e}")
        return 1

    err, warn, log = run_import_csv_text(sb, text, dry_run=args.dry_run)
    for w in warn:
        print(f"WARN {w}")
    for e in err:
        print(f"ERR {e}")
    if err:
        return 1
    if args.dry_run:
        drafts = parse_sales_import_csv(text)
        print(f"검증 통과: {len(drafts)}건의 판매 전표(적재 안 함)")
        return 0
    for line in log:
        print(line)
    return 0
