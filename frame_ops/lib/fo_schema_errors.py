"""FRAME OPS fo_* 테이블 누락 시 PostgREST 오류 → 안내 메시지."""

from __future__ import annotations

FO_CORE_MIGRATION = "supabase/migrations/20260413_frame_ops_core.sql"


class FrameOpsSchemaMissing(RuntimeError):
    """fo_* 마이그레이션 미적용 등 — Streamlit 에서 친화적으로 처리."""

    pass


def raise_if_missing_fo_table(exc: BaseException, *, table: str = "fo_stores") -> None:
    """
    PGRST205 이고 해당 fo_* 테이블이 스키마에 없을 때 RuntimeError 로 친절히 안내.
    (예: 프로젝트에 public.stores 만 있고 fo_stores 마이그레이션 미적용)
    """
    try:
        from postgrest.exceptions import APIError
    except ImportError:
        return

    if not isinstance(exc, APIError):
        return
    if exc.code != "PGRST205":
        return
    msg = exc.message or ""
    if table not in msg and f"public.{table}" not in msg:
        return

    hint = (exc.hint or "").strip()
    hint_line = f"\n\n(PostgREST 힌트: {hint})" if hint else ""

    raise FrameOpsSchemaMissing(
        f"Supabase에 FRAME OPS 테이블 **{table}** 이(가) 없습니다.{hint_line}\n\n"
        "대시보드 힌트에 **public.stores** 등이 보이면, 같은 프로젝트에 GENIUS CRM 테이블만 있고 "
        "**FRAME OPS용 fo_* 테이블**을 아직 만들지 않은 경우가 많습니다. "
        "FRAME OPS는 `stores`가 아니라 **fo_stores** 를 사용합니다.\n\n"
        "**조치:** Supabase → **SQL Editor**에서 저장소 마이그레이션을 **README 순서대로** 실행하세요. "
        f"첫 파일: `{FO_CORE_MIGRATION}`\n\n"
        "전체 목록: `frame_ops/README.md` 의 마이그레이션 절차 · 검증: "
        "`./run_frame_ops_tests.sh --preflight`"
    ) from exc
