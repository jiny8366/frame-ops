"""POS 판매 저장 전 — 담당자 선택 + PIN 확인."""

from __future__ import annotations

from supabase import Client

# POS에서 판매 저장을 허용하는 fo_staff_roles.code
POS_SELLER_ROLE_CODES = frozenset(
    {
        "store_manager",
        "store_salesperson",
        "store_staff",
    }
)


def verify_clerk_by_pin(
    sb: Client,
    *,
    user_id: str,
    pin: str,
    store_id: str,
) -> tuple[str, str, str]:
    """
    담당자 user_id + PIN으로 본인 확인.

    Returns
    -------
    (seller_user_id, seller_label, seller_code)
    """
    rows = (
        sb.table("fo_staff_profiles")
        .select("user_id, display_name, role_code, active, pos_pin, email")
        .eq("user_id", user_id)
        .limit(1)
        .execute()
        .data
        or []
    )
    if not rows:
        raise ValueError("담당자 정보를 찾을 수 없습니다.")

    p = dict(rows[0])
    if not p.get("active", True):
        raise ValueError("비활성 처리된 계정입니다. 관리자에게 문의하세요.")

    rc = str(p.get("role_code") or "")
    if rc not in POS_SELLER_ROLE_CODES:
        raise ValueError(f"POS 판매 저장 권한이 없습니다. (현재 직급: {rc})")

    stored_pin = (p.get("pos_pin") or "").strip()
    if not stored_pin:
        raise ValueError("PIN이 설정되지 않았습니다. 관리자에게 PIN 등록을 요청하세요.")

    if (pin or "").strip() != stored_pin:
        raise ValueError("PIN이 올바르지 않습니다.")

    # 지점 범위 확인
    scope_rows = (
        sb.table("fo_staff_store_scopes")
        .select("store_id")
        .eq("user_id", user_id)
        .execute()
        .data
        or []
    )
    scopes = [str(r["store_id"]) for r in scope_rows if r.get("store_id")]
    if scopes and store_id not in scopes:
        raise ValueError("선택한 지점에서 판매할 권한이 없습니다.")

    dn = (p.get("display_name") or "").strip()
    email = (p.get("email") or "").strip()
    label = f"{dn} ({email})" if dn and email else dn or email or user_id
    short = (dn[:40] if dn else (email.split("@")[0] if "@" in email else email)[:40]) or "clerk"
    return user_id, label, short
