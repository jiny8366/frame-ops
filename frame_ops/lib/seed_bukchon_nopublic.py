"""우선 매장(서울 북촌점) + No Public 브랜드 시드 — 매입처는 안목, 중복 product_code 는 건너뜀."""

from __future__ import annotations

from typing import Any, Iterator

# 지점: 북촌점이 안목에서 매입한 No Public 라인을 다룸
STORE_CODE = "BKC01"
STORE_NAME = "서울 북촌점"
SUPPLIER_NAME = "안목"
PRODUCT_CATEGORY = "No Public"

# 가격은 테스트용 고정값(입고/POS 검증용). 운영 시 상품 등록에서 수정.
_COST = 12_000
_SUGGESTED = 100_000
_SALE = 50_000


def iter_nopublic_product_codes() -> Iterator[str]:
    """01:01 ~ 10:59 (매 시각 :01~:59) × C01~C05."""
    colors = [f"C{i:02d}" for i in range(1, 6)]
    for h in range(1, 11):
        for mm in range(1, 60):
            for col in colors:
                yield f"{h:02d}:{mm:02d}-{col}"


def _chunks(xs: list, n: int):
    for i in range(0, len(xs), n):
        yield xs[i : i + n]


def run_seed_bukchon_nopublic(sb: Any) -> list[str]:
    """
    · 지점 BKC01 / 서울 북촌점
    · 매입처 **안목** (브랜드 카테고리는 **No Public**)
    · 상품코드 `HH:MM-Cxx` 총 2,950건 (기존 코드는 insert 생략, 가격·매입처는 동기화)
    """
    log: list[str] = []

    hit = sb.table("fo_stores").select("id").eq("store_code", STORE_CODE).limit(1).execute().data
    if hit:
        log.append(f"지점 {STORE_CODE} ({STORE_NAME}): 이미 있음")
    else:
        ins = {"store_code": STORE_CODE, "name": STORE_NAME, "active": True}
        try:
            ins["business_reg_no"] = ""
            ins["address"] = ""
            ins["phone"] = ""
            sb.table("fo_stores").insert(ins).execute()
        except Exception:
            sb.table("fo_stores").insert({"store_code": STORE_CODE, "name": STORE_NAME, "active": True}).execute()
        log.append(f"지점 {STORE_CODE} ({STORE_NAME}): 추가됨")

    sh = sb.table("fo_suppliers").select("id").eq("name", SUPPLIER_NAME).limit(1).execute().data
    if sh:
        sid = sh[0]["id"]
        log.append(f"매입처 {SUPPLIER_NAME}: 이미 있음")
    else:
        sb.table("fo_suppliers").insert({"name": SUPPLIER_NAME}).execute()
        sh = sb.table("fo_suppliers").select("id").eq("name", SUPPLIER_NAME).limit(1).execute().data
        sid = sh[0]["id"] if sh else None
        log.append(f"매입처 {SUPPLIER_NAME}: 추가됨")

    all_codes = list(iter_nopublic_product_codes())
    assert len(all_codes) == 2950, len(all_codes)

    existing: set[str] = set()
    for part in _chunks(all_codes, 400):
        rows = sb.table("fo_products").select("product_code").in_("product_code", part).execute().data or []
        existing.update(str(r["product_code"]) for r in rows)

    to_insert: list[dict] = []
    for pc in all_codes:
        if pc in existing:
            continue
        row = {
            "product_code": pc,
            "display_name": f"No Public {pc.replace('-', ' ')}",
            "category": PRODUCT_CATEGORY,
            "supplier_id": sid,
            "cost_price": _COST,
            "suggested_retail": _SUGGESTED,
            "sale_price": _SALE,
            "status": "active",
        }
        to_insert.append(row)

    skipped = len(all_codes) - len(to_insert)
    batch_n = 80
    inserted = 0
    for batch in _chunks(to_insert, batch_n):
        if not batch:
            continue
        sb.table("fo_products").insert(batch).execute()
        inserted += len(batch)

    log.append(f"No Public 상품: 신규 {inserted}건 / 기존 스킵 {skipped}건 / 정의 SKU {len(all_codes)}건")

    upd = {
        "cost_price": _COST,
        "suggested_retail": _SUGGESTED,
        "sale_price": _SALE,
        "supplier_id": sid,
    }
    for part in _chunks(all_codes, 400):
        sb.table("fo_products").update(upd).in_("product_code", part).execute()
    log.append(
        f"시드 SKU 동기화: 매입 {_COST:,} / 권장 {_SUGGESTED:,} / 실판 {_SALE:,} 원, 매입처 **{SUPPLIER_NAME}**"
    )

    log.append(f"다음: 「입고」에서 지점 **{STORE_CODE}** 선택 후 원하는 코드로 수량 입고 → POS.")
    return log
