"""POS 판매 저장 전 — 스태프 본인 비밀번호(anon Auth) + 프로필·지점 권한 확인."""

from __future__ import annotations

from contextlib import suppress
from typing import Any

from supabase import Client, create_client
from supabase.lib.client_options import SyncClientOptions
from supabase_auth.errors import AuthApiError

from lib.staff_rbac import list_store_scopes_for_user
from lib.supabase_client import get_configured_supabase_anon_key, get_configured_supabase_url

# POS에서 판매 저장을 허용하는 fo_staff_roles.code
POS_SELLER_ROLE_CODES = frozenset(
    {
        "store_manager",
        "store_salesperson",
        "store_staff",
    }
)


def verify_clerk_for_pos_sale(
    sb: Client,
    *,
    email: str,
    password: str,
    store_id: str,
) -> tuple[str, str, str]:
    """
    이메일·비밀번호로 Auth 확인 후, 스태프 프로필·지점 범위를 검사합니다.

    Returns
    -------
    (seller_user_id, seller_label, seller_code)
        seller_label: 검색·화면 표시용 스냅샷
        seller_code: 통계·기존 컬럼 호환(짧은 식별자)
    """
    url = get_configured_supabase_url()
    anon = get_configured_supabase_anon_key()
    if not anon:
        raise RuntimeError(
            "POS 담당자 확인을 위해 **anon(공개) API 키**가 필요합니다.\n\n"
            "`.env` 또는 Streamlit secrets 에 `SUPABASE_ANON_KEY` 를 넣거나, "
            "`SUPABASE_KEY` 에 서비스 롤이 **아닌** 키를 넣으세요. "
            "(대시보드 Project Settings → API 의 anon public 키)"
        )

    em = (email or "").strip()
    pw = password or ""
    if not em or not pw:
        raise ValueError("판매 담당자 이메일과 비밀번호를 입력하세요.")

    anon_client = create_client(
        url,
        anon,
        options=SyncClientOptions(
            postgrest_client_timeout=30,
            storage_client_timeout=30,
        ),
    )
    try:
        try:
            res = anon_client.auth.sign_in_with_password({"email": em, "password": pw})
        except AuthApiError as e:
            if getattr(e, "code", None) == "invalid_credentials":
                raise ValueError("이메일 또는 비밀번호가 올바르지 않습니다.") from e
            raise ValueError(getattr(e, "message", None) or str(e)) from e
        if not res.user:
            raise ValueError("로그인에 실패했습니다.")
        uid = str(res.user.id)
        uemail = res.user.email or em
    finally:
        with suppress(Exception):
            anon_client.auth.sign_out()

    prof_rows = (
        sb.table("fo_staff_profiles")
        .select("display_name, role_code, active")
        .eq("user_id", uid)
        .limit(1)
        .execute()
        .data
        or []
    )
    if not prof_rows:
        raise ValueError(
            "이 계정은 스태프로 등록되어 있지 않습니다. 「지점·매니저·판매사」에서 계정을 만드세요."
        )
    p: dict[str, Any] = dict(prof_rows[0])
    if not p.get("active", True):
        raise ValueError("비활성 처리된 계정입니다. 관리자에게 문의하세요.")
    rc = str(p.get("role_code") or "")
    if rc not in POS_SELLER_ROLE_CODES:
        raise ValueError(
            f"POS 판매 저장은 매니저·판매사·지점 스태프만 가능합니다. (현재 역할: {rc})"
        )

    scopes = list_store_scopes_for_user(sb, uid)
    if scopes and store_id not in scopes:
        raise ValueError("선택한 지점에서 판매할 권한이 없습니다.")

    dn = (p.get("display_name") or "").strip()
    label = f"{dn} ({uemail})" if dn else uemail
    short = (dn[:40] if dn else (uemail.split("@")[0] if "@" in uemail else uemail)[:40]) or "clerk"
    return uid, label, short
