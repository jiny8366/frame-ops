"""Supabase 클라이언트 — 호스팅(클라우드) Postgres + PostgREST. 로컬 전용 DB는 사용하지 않습니다."""

from __future__ import annotations

import base64
import json
import os
from functools import lru_cache
from pathlib import Path
from urllib.parse import urlparse

from dotenv import load_dotenv
from supabase import Client, create_client
from supabase.lib.client_options import SyncClientOptions

_BASE = Path(__file__).resolve().parents[2]
load_dotenv(_BASE / ".env", override=True)


def _config_value(env_key: str, nested: tuple[str, str] | None = None) -> str:
    """
    1) 프로세스 환경변수(.env 포함)
    2) Streamlit secrets — 평면 키 또는 [supabase] 테이블
    """
    v = (os.environ.get(env_key) or "").strip()
    if v:
        return v
    try:
        import streamlit as st

        sec = getattr(st, "secrets", None)
        if sec is None:
            return ""
        if env_key in sec:
            return str(sec[env_key]).strip()
        if nested:
            section, sub = nested
            if section in sec and sub in sec[section]:
                return str(sec[section][sub]).strip()
    except Exception:
        pass
    return ""


def get_configured_supabase_url() -> str:
    return _config_value("SUPABASE_URL", ("supabase", "url"))


def get_configured_supabase_key() -> str:
    return _config_value("SUPABASE_SERVICE_ROLE_KEY", ("supabase", "service_role_key")) or _config_value(
        "SUPABASE_KEY", ("supabase", "anon_key")
    )


def get_configured_supabase_jwt_role() -> str | None:
    """`get_configured_supabase_key()` 에 해당하는 JWT의 `role` (anon / service_role 등)."""
    k = get_configured_supabase_key()
    if not k:
        return None
    return _jwt_payload_role(k)


def _jwt_payload_role(jwt: str) -> str | None:
    """
    Supabase 키에서 JWT `role` 클레임을 추출합니다.

    Supabase는 두 가지 키 포맷을 사용합니다.
    - 구형 JWT: eyJ... (3-part, base64)
    - 신형 접두어 포맷 (2025~): sb_secret_* / sb_publishable_*
    """
    if not jwt:
        return None
    # 신형 접두어 포맷 처리
    low = jwt.lower()
    if low.startswith("sb_secret_"):
        return "service_role"
    if low.startswith("sb_publishable_"):
        return "anon"
    # 구형 JWT 3-part 처리
    parts = jwt.split(".")
    if len(parts) != 3:
        return None
    seg = parts[1]
    pad = "=" * (-len(seg) % 4)
    try:
        raw = base64.urlsafe_b64decode(seg + pad)
        payload = json.loads(raw.decode("utf-8"))
        r = payload.get("role")
        return str(r) if r is not None else None
    except Exception:
        return None


def get_configured_supabase_anon_key() -> str:
    """
    POS 담당자 비밀번호 확인(sign_in)용 — 반드시 **anon / publishable** 키.
    SUPABASE_ANON_KEY 우선, 없으면 SUPABASE_KEY 가 service_role 이 아닐 때만 사용.
    """
    w = _config_value("SUPABASE_ANON_KEY", ("supabase", "anon_key"))
    if w and _jwt_payload_role(w) != "service_role":
        return w
    fallback = _config_value("SUPABASE_KEY", ("supabase", "key"))
    if fallback and _jwt_payload_role(fallback) != "service_role":
        return fallback
    return ""


def is_probably_remote_supabase(url: str) -> bool:
    """localhost / 127.0.0.1 이 아니면 원격(서버) Supabase로 간주."""
    if not url.startswith("http"):
        return False
    host = (urlparse(url).hostname or "").lower()
    if host in ("localhost", "127.0.0.1", "::1"):
        return False
    if host.endswith(".local"):
        return False
    return True


def describe_database_connection() -> tuple[str, str | None]:
    """
    UI용 한 줄 요약과 (필요 시) 경고 문구.
    Returns: (markdown_safe_caption, warning_text_or_none)
    """
    url = get_configured_supabase_url()
    if not url:
        return ("", None)
    host = urlparse(url).hostname or url
    if is_probably_remote_supabase(url):
        return (f"연결 DB: `{host}` (Supabase · 서버)", None)
    return (
        f"연결 DB: `{host}`",
        "현재 `SUPABASE_URL`이 **로컬** 주소입니다. 운영·공유 데이터를 쓰려면 Supabase 대시보드의 "
        "**Project URL**(`*.supabase.co`)과 서비스 롤 키를 `.env`에 넣으세요. "
        "로컬 Supabase CLI만 쓸 때는 이 경고를 무시해도 됩니다.",
    )


@lru_cache(maxsize=4)
def _build_supabase_client(url: str, key: str) -> Client:
    """실제 create_client 호출을 (url, key) 기준으로 프로세스 단위 공유.

    서비스 롤 키 기반 클라이언트라 stateless(persistSession=False, 세션 저장 없음)이므로
    재사용 시 사이드이펙트 없음. 환경 변경(.env 수정) 시 프로세스 재시작이 필요하지만
    이는 현재 동작과 동일.

    perf 로그 활성 시 실제 create_client 호출이 한 번만 일어나는지(캐시 정상 작동)
    확인 가능.
    """
    # 지연 import: perf_log 자체가 streamlit 의존 — 직접 import 하면 tests 등 비-Streamlit
    # 컨텍스트에서 supabase_client import 시 연쇄 영향 가능. 함수 호출 시점에 import.
    try:
        from lib.perf_log import PERF_LOG_ENABLED, emit_perf
    except Exception:
        PERF_LOG_ENABLED = False
        emit_perf = None  # type: ignore[assignment]
    import time as _time
    _t0 = _time.perf_counter() if PERF_LOG_ENABLED else 0.0
    client = create_client(
        url,
        key,
        options=SyncClientOptions(
            postgrest_client_timeout=120,
            storage_client_timeout=120,
        ),
    )
    if PERF_LOG_ENABLED and emit_perf is not None:
        emit_perf("_build_supabase_client (cache miss)", (_time.perf_counter() - _t0) * 1000)
    return client


def get_supabase() -> Client:
    url = get_configured_supabase_url()
    key = get_configured_supabase_key()
    if not url.startswith("http") or not key:
        raise RuntimeError(
            "SUPABASE_URL 과 SUPABASE_SERVICE_ROLE_KEY(또는 SUPABASE_KEY)가 필요합니다.\n\n"
            "· 로컬: 프로젝트 루트 `.env` (`.env.example` 참고)\n"
            "· Streamlit 배포: `.streamlit/secrets.toml` 또는 Cloud **Secrets** "
            "(`.streamlit/secrets.toml.example` 참고)\n\n"
            "FRAME OPS는 Supabase(호스팅 Postgres)에만 연결합니다."
        )
    strict_raw = (os.environ.get("FRAME_OPS_REQUIRE_HOSTED_SUPABASE") or "").strip().lower()
    if not strict_raw:
        try:
            import streamlit as st

            sec = getattr(st, "secrets", None)
            if sec is not None and "FRAME_OPS_REQUIRE_HOSTED_SUPABASE" in sec:
                strict_raw = str(sec["FRAME_OPS_REQUIRE_HOSTED_SUPABASE"]).strip().lower()
        except Exception:
            pass
    strict = strict_raw in ("1", "true", "yes")
    # strict 검증은 매 호출 수행(환경 변경 즉시 반영). 클라이언트 생성만 캐시.
    if strict and not is_probably_remote_supabase(url):
        raise RuntimeError(
            "`FRAME_OPS_REQUIRE_HOSTED_SUPABASE=1` 인데 `SUPABASE_URL`이 로컬입니다. "
            "서버 DB만 허용하려면 URL을 `https://xxxx.supabase.co` 형태로 설정하세요."
        )
    return _build_supabase_client(url, key)
