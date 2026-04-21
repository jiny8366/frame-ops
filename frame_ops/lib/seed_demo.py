"""로컬·사무실 테스트용 데모 데이터 (중복이면 건너뜀)."""

from __future__ import annotations

from typing import Any


def run_seed_demo(sb: Any) -> list[str]:
    """
    지점 2곳(TST01/TST02), 매입처 1곳, 상품 3개를 넣습니다.
    이미 있으면 해당 단계는 스킵합니다.
    """
    log: list[str] = []

    for code, name in [("TST01", "테스트 매장 A"), ("TST02", "테스트 매장 B")]:
        hit = sb.table("fo_stores").select("id").eq("store_code", code).limit(1).execute().data
        if hit:
            log.append(f"지점 {code}: 이미 있음")
        else:
            sb.table("fo_stores").insert({"store_code": code, "name": name, "active": True}).execute()
            log.append(f"지점 {code}: 추가됨")

    sup_name = "데모 매입처"
    sh = sb.table("fo_suppliers").select("id").eq("name", sup_name).limit(1).execute().data
    if sh:
        sid = sh[0]["id"]
        log.append("매입처: 이미 있음")
    else:
        sb.table("fo_suppliers").insert({"name": sup_name}).execute()
        sh = sb.table("fo_suppliers").select("id").eq("name", sup_name).limit(1).execute().data
        sid = sh[0]["id"] if sh else None
        log.append("매입처: 추가됨")

    demo_products = [
        ("DEMO-20260401-A", "데모 메탈테 블랙", 25000, 89000, 120000),
        ("DEMO-20260401-B", "데모 티타늄 그레이", 28000, 95000, 129000),
        ("DEMO-20260401-C", "데모 아세테이트 브라운", 22000, 79000, 99000),
    ]
    for code, dname, cost, sug, sale in demo_products:
        hit = sb.table("fo_products").select("id").eq("product_code", code).limit(1).execute().data
        if hit:
            log.append(f"상품 {code}: 이미 있음")
            continue
        row = {
            "product_code": code,
            "display_name": dname,
            "category": "데모",
            "supplier_id": sid,
            "cost_price": cost,
            "suggested_retail": sug,
            "sale_price": sale,
            "status": "active",
        }
        sb.table("fo_products").insert(row).execute()
        log.append(f"상품 {code}: 추가됨")

    log.append("다음: 「입고」에서 TST01로 수량 넣기 → 「POS판매」→ 「통계리포트」.")
    return log
