"""판매 검색 — 상품코드·영업일(KST) 기준."""

from __future__ import annotations

from datetime import date
from typing import Any

from supabase import Client

from lib.constants import iso_to_kst_date, kst_day_range_utc_iso


def escape_ilike_fragment(s: str) -> str:
    """PostgREST ilike 패턴에서 % _ 를 이스케이프."""
    t = (s or "").strip()
    return t.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")


def search_sales_lines_by_product_code_and_day(
    sb: Client,
    *,
    day: date,
    product_code_contains: str,
    store_id: str | None = None,
    max_sales: int = 2000,
) -> list[dict[str, Any]]:
    """
    한국 영업일 day 안에 sold_at 이 있는 전표 중, 상품코드가 부분 일치하는 라인.
    반환 행: 판매일(KST), 지점, 상품코드, 상품명, 수량, 단가, 금액, 판매담당자 표시.
    """
    qraw = (product_code_contains or "").strip()
    if not qraw:
        return []

    lo, hi = kst_day_range_utc_iso(day)
    sq = (
        sb.table("fo_sales")
        .select("id, store_id, sold_at, seller_label, seller_code, seller_user_id")
        .gte("sold_at", lo)
        .lt("sold_at", hi)
    )
    if store_id:
        sq = sq.eq("store_id", store_id)
    sale_rows = (sq.order("sold_at", desc=True).limit(max_sales).execute().data or [])
    if not sale_rows:
        return []

    sale_by_id: dict[str, dict[str, Any]] = {}
    store_ids_u: set[str] = set()
    for s in sale_rows:
        sid = str(s["id"])
        sale_by_id[sid] = s
        if s.get("store_id"):
            store_ids_u.add(str(s["store_id"]))
    sale_ids = list(sale_by_id.keys())

    store_meta: dict[str, dict[str, Any]] = {}
    sids_list = list(store_ids_u)
    for i in range(0, len(sids_list), 80):
        chunk = sids_list[i : i + 80]
        for r in sb.table("fo_stores").select("id, store_code, name").in_("id", chunk).execute().data or []:
            store_meta[str(r["id"])] = r

    pat = escape_ilike_fragment(qraw)
    prods = (
        sb.table("fo_products")
        .select("id, product_code, display_name")
        .ilike("product_code", f"%{pat}%")
        .limit(200)
        .execute()
        .data
        or []
    )
    if not prods:
        return []
    prod_by_id = {str(p["id"]): p for p in prods}
    pids = list(prod_by_id.keys())

    out: list[dict[str, Any]] = []
    chunk = 80
    for i in range(0, len(sale_ids), chunk):
        part_ids = sale_ids[i : i + chunk]
        lines = (
            sb.table("fo_sale_lines")
            .select("sale_id, product_id, quantity, unit_price, line_discount")
            .in_("sale_id", part_ids)
            .in_("product_id", pids)
            .execute()
            .data
            or []
        )
        for ln in lines:
            sid = str(ln["sale_id"])
            sale = sale_by_id.get(sid)
            if not sale:
                continue
            pid = str(ln["product_id"])
            pr = prod_by_id.get(pid)
            if not pr:
                continue
            st_row = store_meta.get(str(sale.get("store_id") or "")) or {}
            store_code = st_row.get("store_code") or ""
            store_name = st_row.get("name") or ""
            qty = float(ln.get("quantity") or 0)
            up = int(ln.get("unit_price") or 0)
            ld = int(ln.get("line_discount") or 0)
            line_amt = max(0, int(qty * up) - ld)
            sold_at = sale.get("sold_at") or ""
            kst_d = iso_to_kst_date(str(sold_at)) if sold_at else day
            clerk = (sale.get("seller_label") or "").strip() or (sale.get("seller_code") or "").strip() or "—"
            out.append(
                {
                    "sale_id": sid,
                    "판매일(KST)": kst_d.isoformat(),
                    "지점코드": store_code,
                    "지점명": store_name,
                    "상품코드": pr.get("product_code") or "",
                    "상품명": pr.get("display_name") or "",
                    "수량": qty,
                    "단가": up,
                    "라인할인": ld,
                    "금액": line_amt,
                    "판매담당자": clerk,
                }
            )

    out.sort(key=lambda r: (r["판매일(KST)"], r["sale_id"]), reverse=True)
    return out
