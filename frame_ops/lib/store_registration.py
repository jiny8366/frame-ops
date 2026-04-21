"""지점 등록 필수·권장 항목 점검 (홈·지점 스태프 설정 화면)."""

from __future__ import annotations

from typing import Any


def store_registration_checklist(store: dict[str, Any]) -> list[dict[str, Any]]:
    """
    각 항목: key, label, ok, mandatory, hint.
    mandatory: 지점 코드·상호. 권장: 사업자·주소·전화(주문서 PDF 등).
    """
    code = (store.get("store_code") or "").strip()
    name = (store.get("name") or "").strip()
    br = (store.get("business_reg_no") or "").strip()
    addr = (store.get("address") or "").strip()
    phone = (store.get("phone") or "").strip()
    return [
        {
            "key": "store_code",
            "label": "지점 코드",
            "ok": bool(code),
            "mandatory": True,
            "value": code or "—",
        },
        {
            "key": "name",
            "label": "상호(지점명)",
            "ok": bool(name),
            "mandatory": True,
            "value": name or "—",
        },
        {
            "key": "business_reg_no",
            "label": "사업자등록번호",
            "ok": bool(br),
            "mandatory": False,
            "value": br or "미입력",
            "hint": "주문서·세무 대응",
        },
        {
            "key": "address",
            "label": "주소",
            "ok": bool(addr),
            "mandatory": False,
            "value": addr or "미입력",
            "hint": "주문서 PDF 헤더",
        },
        {
            "key": "phone",
            "label": "전화번호",
            "ok": bool(phone),
            "mandatory": False,
            "value": phone or "미입력",
        },
    ]


def store_registration_mandatory_ok(store: dict[str, Any]) -> bool:
    rows = store_registration_checklist(store)
    return all(r["ok"] for r in rows if r["mandatory"])


def store_registration_fully_ok(store: dict[str, Any]) -> bool:
    return all(r["ok"] for r in store_registration_checklist(store))


def store_registration_summary_label(store: dict[str, Any]) -> str:
    if not store_registration_mandatory_ok(store):
        return "필수 미충족"
    if store_registration_fully_ok(store):
        return "완료"
    return "권장 보완"
