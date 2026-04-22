"""본사·지점 스태프 역할·프로필·지점 범위 — Supabase Auth(admin) + fo_staff_* 테이블."""

from __future__ import annotations

import base64
import json
import re
import secrets
from typing import Any

from supabase import Client

try:
    from postgrest.exceptions import APIError as PostgrestAPIError
except ImportError:
    PostgrestAPIError = Exception  # type: ignore[misc,assignment]

from lib.supabase_client import get_configured_supabase_key

JOB_TITLE_CODE_RE = re.compile(r"^[a-z][a-z0-9_]{0,62}$")

_PROFILE_SELECT_MIN = (
    "user_id,email,display_name,role_code,active,created_at,updated_at"
)
_PROFILE_SELECT_EXT = _PROFILE_SELECT_MIN + ",job_title_code,phone,login_id"


def _postgrest_schema_missing(exc: BaseException) -> bool:
    if PostgrestAPIError is not Exception and isinstance(exc, PostgrestAPIError):
        if getattr(exc, "code", None) == "PGRST205":
            return True
        msg = getattr(exc, "message", None) or str(exc)
        return "Could not find the table" in (msg or "")
    s = str(exc)
    return "PGRST205" in s or "Could not find the table" in s


def _profile_select_missing_column(exc: BaseException) -> bool:
    if _postgrest_schema_missing(exc):
        return True
    m = str(exc).lower()
    return "job_title_code" in m and ("column" in m or "does not exist" in m)


def staff_job_titles_table_available(sb: Client) -> bool:
    """`fo_staff_job_titles` + 프로필 확장 컬럼 마이그레이션 적용 여부."""
    try:
        sb.table("fo_staff_job_titles").select("code").limit(1).execute()
        return True
    except Exception as exc:
        if _postgrest_schema_missing(exc):
            return False
        raise


def _pad_profile_min_row(row: dict[str, Any]) -> dict[str, Any]:
    out = dict(row)
    out.setdefault("job_title_code", None)
    out.setdefault("phone", None)
    out.setdefault("login_id", None)
    return out


def supabase_jwt_role(jwt: str) -> str | None:
    """
    JWT payload 의 role 클레임 (anon / authenticated / service_role). 검증 없이 디코드만.

    Supabase 신형 키 포맷(2025~)도 지원합니다.
    - sb_secret_*    → service_role
    - sb_publishable_* → anon
    """
    if not jwt:
        return None
    low = jwt.lower()
    if low.startswith("sb_secret_"):
        return "service_role"
    if low.startswith("sb_publishable_"):
        return "anon"
    parts = jwt.split(".")
    if len(parts) != 3:
        return None
    seg = parts[1]
    pad = "=" * (-len(seg) % 4)
    try:
        raw = base64.urlsafe_b64decode(seg + pad)
        payload = json.loads(raw.decode("utf-8"))
    except Exception:
        return None
    r = payload.get("role")
    return str(r) if r is not None else None


def is_configured_service_role_key() -> bool:
    return supabase_jwt_role(get_configured_supabase_key()) == "service_role"


ROLE_CODE_RE = re.compile(r"^[a-z][a-z0-9_]{0,62}$")


def list_staff_roles(sb: Client) -> list[dict[str, Any]]:
    r = (
        sb.table("fo_staff_roles")
        .select("code,label,description,sort_order")
        .order("sort_order")
        .execute()
    )
    return list(r.data or [])


def insert_staff_role(
    sb: Client,
    *,
    code: str,
    label: str,
    description: str = "",
    sort_order: int = 100,
) -> None:
    code_s = (code or "").strip().lower()
    if not code_s or not ROLE_CODE_RE.match(code_s):
        raise ValueError(
            "역할 코드는 영문 소문자로 시작하고, 영문·숫자·밑줄(_)만 사용할 수 있습니다."
        )
    label_s = (label or "").strip()
    if not label_s:
        raise ValueError("역할 표시명을 입력하세요.")
    sb.table("fo_staff_roles").insert(
        {
            "code": code_s,
            "label": label_s,
            "description": (description or "").strip() or None,
            "sort_order": int(sort_order),
        }
    ).execute()


def update_staff_role_fields(
    sb: Client,
    code: str,
    *,
    label: str | None = None,
    description: str | None = None,
    sort_order: int | None = None,
) -> None:
    patch: dict[str, Any] = {}
    if label is not None:
        ls = (label or "").strip()
        if not ls:
            raise ValueError("역할 표시명은 비울 수 없습니다.")
        patch["label"] = ls
    if description is not None:
        patch["description"] = (description or "").strip() or None
    if sort_order is not None:
        patch["sort_order"] = int(sort_order)
    if not patch:
        return
    sb.table("fo_staff_roles").update(patch).eq("code", code).execute()


def list_staff_job_titles(sb: Client, *, active_only: bool = False) -> list[dict[str, Any]]:
    try:
        q = sb.table("fo_staff_job_titles").select("code,label,sort_order,active,created_at")
        if active_only:
            q = q.eq("active", True)
        r = q.order("sort_order").execute()
        return list(r.data or [])
    except Exception as exc:
        if _postgrest_schema_missing(exc):
            return []
        raise


def insert_staff_job_title(
    sb: Client,
    *,
    label: str,
    code: str | None = None,
    sort_order: int = 100,
) -> str:
    label_s = (label or "").strip()
    if not label_s:
        raise ValueError("직급 표시명을 입력하세요.")
    raw = (code or "").strip().lower()
    if raw:
        if not JOB_TITLE_CODE_RE.match(raw):
            raise ValueError(
                "내부 코드는 영문 소문자로 시작하고, 영문·숫자·밑줄(_)만 사용할 수 있습니다."
            )
        c = raw
    else:
        c = f"jt_{secrets.token_hex(4)}"
    sb.table("fo_staff_job_titles").insert(
        {"code": c, "label": label_s, "sort_order": int(sort_order), "active": True}
    ).execute()
    return c


def update_staff_job_title_fields(
    sb: Client,
    code: str,
    *,
    label: str | None = None,
    sort_order: int | None = None,
    active: bool | None = None,
) -> None:
    patch: dict[str, Any] = {}
    if label is not None:
        ls = label.strip()
        if not ls:
            raise ValueError("직급 표시명은 비울 수 없습니다.")
        patch["label"] = ls
    if sort_order is not None:
        patch["sort_order"] = int(sort_order)
    if active is not None:
        patch["active"] = bool(active)
    if not patch:
        return
    sb.table("fo_staff_job_titles").update(patch).eq("code", code).execute()


def list_staff_profiles(sb: Client) -> list[dict[str, Any]]:
    try:
        r = (
            sb.table("fo_staff_profiles")
            .select(_PROFILE_SELECT_EXT)
            .order("created_at", desc=True)
            .execute()
        )
        return list(r.data or [])
    except Exception as exc:
        if not _profile_select_missing_column(exc):
            raise
        r2 = (
            sb.table("fo_staff_profiles")
            .select(_PROFILE_SELECT_MIN)
            .order("created_at", desc=True)
            .execute()
        )
        return [_pad_profile_min_row(x) for x in (r2.data or [])]


def list_store_scopes_for_user(sb: Client, user_id: str) -> list[str]:
    r = (
        sb.table("fo_staff_store_scopes")
        .select("store_id")
        .eq("user_id", user_id)
        .execute()
    )
    rows = r.data or []
    return [str(x["store_id"]) for x in rows if x.get("store_id")]


def replace_store_scopes(sb: Client, user_id: str, store_ids: list[str]) -> None:
    sb.table("fo_staff_store_scopes").delete().eq("user_id", user_id).execute()
    if not store_ids:
        return
    sb.table("fo_staff_store_scopes").insert(
        [{"user_id": user_id, "store_id": sid} for sid in store_ids]
    ).execute()


def upsert_staff_profile(
    sb: Client,
    *,
    user_id: str,
    email: str | None,
    display_name: str,
    role_code: str,
    active: bool = True,
    job_title_code: str | None = None,
    phone: str | None = None,
    login_id: str | None = None,
) -> None:
    row: dict[str, Any] = {
        "user_id": user_id,
        "email": (email or "").strip() or None,
        "display_name": display_name.strip() or None,
        "role_code": role_code,
        "active": active,
    }
    if staff_job_titles_table_available(sb):
        row["job_title_code"] = (job_title_code or "").strip() or None
        row["phone"] = (phone or "").strip() or None
        row["login_id"] = (login_id or "").strip() or None
    sb.table("fo_staff_profiles").upsert(row, on_conflict="user_id").execute()


def update_staff_profile_fields(
    sb: Client,
    user_id: str,
    *,
    display_name: str | None = None,
    role_code: str | None = None,
    active: bool | None = None,
    job_title_code: str | None = None,
    phone: str | None = None,
    login_id: str | None = None,
) -> None:
    patch: dict[str, Any] = {}
    if display_name is not None:
        patch["display_name"] = display_name.strip() or None
    if role_code is not None:
        patch["role_code"] = role_code
    if active is not None:
        patch["active"] = active
    if staff_job_titles_table_available(sb):
        if job_title_code is not None:
            patch["job_title_code"] = (job_title_code or "").strip() or None
        if phone is not None:
            patch["phone"] = (phone or "").strip() or None
        if login_id is not None:
            patch["login_id"] = (login_id or "").strip() or None
    if not patch:
        return
    sb.table("fo_staff_profiles").update(patch).eq("user_id", user_id).execute()


def list_auth_users_all(sb: Client) -> list[Any]:
    """service_role 전용. 페이지 단위로 전 사용자를 가져옵니다."""
    out: list[Any] = []
    page = 1
    per_page = 200
    while True:
        chunk = sb.auth.admin.list_users(page=page, per_page=per_page)
        out.extend(chunk)
        if len(chunk) < per_page:
            break
        page += 1
    return out


def create_staff_user(
    sb: Client,
    *,
    email: str,
    password: str,
    display_name: str,
    role_code: str,
    store_ids: list[str] | None,
    job_title_code: str | None = None,
    phone: str | None = None,
    login_id: str | None = None,
) -> str:
    """
    Auth 사용자 생성 후 프로필·지점 범위 저장.
    store_ids 가 비어 있으면 범위 행을 넣지 않음(앱에서 ‘전 지점’으로 표시).
    """
    email = email.strip()
    if not email or not password:
        raise ValueError("이메일과 비밀번호가 필요합니다.")
    meta: dict[str, Any] = {}
    dn = (display_name or "").strip()
    if dn:
        meta["display_name"] = dn
    ph = (phone or "").strip()
    if ph:
        meta["phone"] = ph
    lid = (login_id or "").strip()
    if lid:
        meta["login_id"] = lid
    body: dict[str, Any] = {
        "email": email,
        "password": password,
        "email_confirm": True,
    }
    if meta:
        body["user_metadata"] = meta
    resp = sb.auth.admin.create_user(body)
    uid = str(resp.user.id)
    try:
        ext = staff_job_titles_table_available(sb)
        upsert_staff_profile(
            sb,
            user_id=uid,
            email=email,
            display_name=display_name,
            role_code=role_code,
            active=True,
            job_title_code=job_title_code if ext else None,
            phone=phone if ext else None,
            login_id=login_id if ext else None,
        )
        if store_ids:
            replace_store_scopes(sb, uid, store_ids)
    except Exception:
        try:
            sb.auth.admin.delete_user(uid, should_soft_delete=False)
        except Exception:
            pass
        raise
    return uid


HQ_SUPER_ROLE = "hq_super"


def verify_hq_super(
    sb: Client,
    *,
    email: str,
    password: str,
) -> tuple[str, str, str]:
    """
    이메일·비밀번호로 Auth 확인 후 본사 총괄(hq_super) 권한을 검증합니다.

    Returns: (user_id, display_name, role_code)
    Raises:  ValueError — 인증 실패, 권한 없음, 비활성
    """
    from contextlib import suppress

    from supabase import create_client
    from supabase.lib.client_options import SyncClientOptions

    from lib.supabase_client import get_configured_supabase_anon_key, get_configured_supabase_url

    url = get_configured_supabase_url()
    anon = get_configured_supabase_anon_key()
    if not anon:
        raise ValueError(
            "담당자 확인을 위해 **anon 키**(`SUPABASE_ANON_KEY`)가 필요합니다. "
            "`.env` 또는 secrets에 추가하세요."
        )
    em = (email or "").strip()
    pw = password or ""
    if not em or not pw:
        raise ValueError("이메일과 비밀번호를 입력하세요.")

    anon_client = create_client(
        url,
        anon,
        options=SyncClientOptions(postgrest_client_timeout=30, storage_client_timeout=30),
    )
    try:
        try:
            from supabase_auth.errors import AuthApiError as _AuthErr
        except ImportError:
            _AuthErr = Exception  # type: ignore[misc,assignment]
        try:
            res = anon_client.auth.sign_in_with_password({"email": em, "password": pw})
        except _AuthErr as exc:
            code = getattr(exc, "code", None)
            raise ValueError(
                "이메일 또는 비밀번호가 올바르지 않습니다." if code == "invalid_credentials"
                else (getattr(exc, "message", None) or str(exc))
            ) from exc
        if not res.user:
            raise ValueError("로그인에 실패했습니다.")
        uid = str(res.user.id)
    finally:
        with suppress(Exception):
            anon_client.auth.sign_out()

    rows = (
        sb.table("fo_staff_profiles")
        .select("display_name,role_code,active")
        .eq("user_id", uid)
        .limit(1)
        .execute()
        .data
        or []
    )
    if not rows:
        raise ValueError("스태프로 등록되지 않은 계정입니다.")
    p = rows[0]
    if not p.get("active", True):
        raise ValueError("비활성 처리된 계정입니다.")
    rc = str(p.get("role_code") or "")
    if rc != HQ_SUPER_ROLE:
        rc_label = rc if rc else "(없음)"
        raise ValueError(f"본사 총괄(`hq_super`) 권한이 필요합니다. 현재 권한: `{rc_label}`")

    dn = str(p.get("display_name") or "").strip() or em
    return uid, dn, rc


def verify_store_actor(
    sb: Client,
    *,
    store_id: str,
    user_id: str,
    password: str,
    allowed_roles: tuple[str, ...] = ("store_manager", HQ_SUPER_ROLE),
) -> tuple[str, str, str]:
    """
    특정 지점 처리 행위자 검증.

    - 선택한 `user_id`의 이메일+비밀번호로 Auth 로그인 확인
    - 활성 계정인지 확인
    - role_code 가 `allowed_roles` 중 하나인지 확인
    - hq_super 가 아닌 경우, 해당 지점 scope 포함 여부 확인
    """
    from contextlib import suppress

    from supabase import create_client
    from supabase.lib.client_options import SyncClientOptions

    from lib.supabase_client import get_configured_supabase_anon_key, get_configured_supabase_url

    sid = str(store_id or "").strip()
    uid_expect = str(user_id or "").strip()
    pw = password or ""
    if not sid or not uid_expect:
        raise ValueError("지점/행위자 정보가 올바르지 않습니다.")
    if not pw:
        raise ValueError("행위자 비밀번호를 입력하세요.")

    rows = (
        sb.table("fo_staff_profiles")
        .select("user_id,email,display_name,role_code,active")
        .eq("user_id", uid_expect)
        .limit(1)
        .execute()
        .data
        or []
    )
    if not rows:
        raise ValueError("스태프로 등록되지 않은 계정입니다.")
    p = rows[0]
    if not p.get("active", True):
        raise ValueError("비활성 처리된 계정입니다.")
    em = str(p.get("email") or "").strip()
    if not em:
        raise ValueError("이 계정은 이메일이 없어 비밀번호 검증을 할 수 없습니다.")

    url = get_configured_supabase_url()
    anon = get_configured_supabase_anon_key()
    if not anon:
        raise ValueError(
            "행위자 비밀번호 확인을 위해 **anon 키**(`SUPABASE_ANON_KEY`)가 필요합니다. "
            "`.env` 또는 secrets에 추가하세요."
        )

    anon_client = create_client(
        url,
        anon,
        options=SyncClientOptions(postgrest_client_timeout=30, storage_client_timeout=30),
    )
    try:
        try:
            from supabase_auth.errors import AuthApiError as _AuthErr
        except ImportError:
            _AuthErr = Exception  # type: ignore[misc,assignment]
        try:
            res = anon_client.auth.sign_in_with_password({"email": em, "password": pw})
        except _AuthErr as exc:
            code = getattr(exc, "code", None)
            raise ValueError(
                "비밀번호가 올바르지 않습니다." if code == "invalid_credentials"
                else (getattr(exc, "message", None) or str(exc))
            ) from exc
        if not res.user:
            raise ValueError("로그인에 실패했습니다.")
        uid_signed = str(res.user.id)
        if uid_signed != uid_expect:
            raise ValueError("선택한 행위자와 비밀번호 계정이 일치하지 않습니다.")
    finally:
        with suppress(Exception):
            anon_client.auth.sign_out()

    rc = str(p.get("role_code") or "")
    if allowed_roles and rc not in set(allowed_roles):
        allowed_txt = ", ".join(f"`{r}`" for r in allowed_roles)
        cur = rc or "(없음)"
        raise ValueError(f"허용 권한이 아닙니다. 필요 권한: {allowed_txt} / 현재: `{cur}`")

    if rc != HQ_SUPER_ROLE:
        scopes = set(list_store_scopes_for_user(sb, uid_expect))
        if sid not in scopes:
            raise ValueError("선택한 지점에 대한 권한(scope)이 없는 계정입니다.")

    dn = str(p.get("display_name") or "").strip() or em
    return uid_expect, dn, rc


# ── 메뉴 권한 ─────────────────────────────────────────────────

# 메뉴 코드 → 표시명 매핑
MENU_LABELS: dict[str, str] = {
    "pos_sale":     "POS 판매",
    "inbound":      "입고",
    "outbound":     "출고",
    "stock_adjust": "재고 조정",
    "stock_status": "재고 현황",
    "order_list":   "주문 리스트",
    "settlement":   "정산",
    "returns":      "반품",
    "interstore":   "매장 간 이동",
    "report":       "통계 · 리포트",
    "sales_import": "판매 데이터 가져오기",
    "purchase":     "매입 처리",
    "staff_hq":     "본사 · 스태프 · 권한",
    "staff_store":  "지점 · 매니저 · 판매사",
    "sale_search":  "판매 검색",
    "supplier":     "매입처 관리",
    "product_reg":  "상품 등록",
}


def list_menu_permissions(sb: Client, role_code: str) -> dict[str, bool]:
    """역할별 메뉴 접근 권한 반환. {menu_code: allowed}"""
    rows = (
        sb.table("fo_staff_menu_permissions")
        .select("menu_code, allowed")
        .eq("role_code", role_code)
        .execute()
        .data
        or []
    )
    return {r["menu_code"]: bool(r["allowed"]) for r in rows}


def save_menu_permissions(sb: Client, role_code: str, permissions: dict[str, bool]) -> None:
    """역할의 메뉴 권한 일괄 저장 (upsert)."""
    rows = [
        {"role_code": role_code, "menu_code": mc, "allowed": allowed}
        for mc, allowed in permissions.items()
    ]
    if rows:
        sb.table("fo_staff_menu_permissions").upsert(
            rows, on_conflict="role_code,menu_code"
        ).execute()


def list_pos_clerks_for_store(sb: Client, store_id: str) -> list[dict[str, Any]]:
    """지점 배정 활성 담당자 목록 (POS PIN 인증용)."""
    POS_ROLES = {"store_manager", "store_salesperson", "store_staff"}
    scope_rows = (
        sb.table("fo_staff_store_scopes")
        .select("user_id")
        .eq("store_id", store_id)
        .execute()
        .data
        or []
    )
    user_ids = [str(r["user_id"]) for r in scope_rows if r.get("user_id")]
    if not user_ids:
        return []
    rows = (
        sb.table("fo_staff_profiles")
        .select("user_id, display_name, role_code, active, pos_pin")
        .in_("user_id", user_ids)
        .eq("active", True)
        .execute()
        .data
        or []
    )
    return [
        {
            "user_id": str(r["user_id"]),
            "display_name": str(r.get("display_name") or ""),
            "role_code": str(r.get("role_code") or ""),
            "has_pin": bool((r.get("pos_pin") or "").strip()),
        }
        for r in rows
        if r.get("role_code") in POS_ROLES
    ]


def delete_staff_user(sb: Client, user_id: str) -> None:
    """Auth 사용자 삭제 — fo_staff_* 는 FK ON DELETE CASCADE."""
    sb.auth.admin.delete_user(user_id, should_soft_delete=False)


def set_user_password(sb: Client, user_id: str, new_password: str) -> None:
    """Auth 비밀번호 재설정 — service_role 전용."""
    pw = (new_password or "").strip()
    if len(pw) < 6:
        raise ValueError("비밀번호는 6자 이상이어야 합니다.")
    sb.auth.admin.update_user_by_id(user_id, {"password": pw})


def list_user_ids_for_store(sb: Client, store_id: str) -> list[str]:
    """fo_staff_store_scopes 에 해당 지점이 포함된 사용자."""
    r = (
        sb.table("fo_staff_store_scopes")
        .select("user_id")
        .eq("store_id", store_id)
        .execute()
    )
    return [str(x["user_id"]) for x in (r.data or []) if x.get("user_id")]


def list_profiles_for_store(sb: Client, store_id: str) -> list[dict[str, Any]]:
    uids = list_user_ids_for_store(sb, store_id)
    if not uids:
        return []
    try:
        r = (
            sb.table("fo_staff_profiles")
            .select(_PROFILE_SELECT_EXT)
            .in_("user_id", uids)
            .order("role_code")
            .execute()
        )
        return list(r.data or [])
    except Exception as exc:
        if not _profile_select_missing_column(exc):
            raise
        r2 = (
            sb.table("fo_staff_profiles")
            .select(_PROFILE_SELECT_MIN)
            .in_("user_id", uids)
            .order("role_code")
            .execute()
        )
        return [_pad_profile_min_row(x) for x in (r2.data or [])]
