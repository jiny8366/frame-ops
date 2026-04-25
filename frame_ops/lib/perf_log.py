"""퍼포먼스 타이밍 로그 — 프로덕션 병목 분석용.

활성화: 환경변수 FRAME_OPS_PERF_LOG=1 (또는 streamlit secrets)
비활성 기본값 시 `perf_timed` / `perf_section` 은 no-op 에 가까운 비용 (0.1μs 미만).
출력: stdout 에 `[PERF] <label>: <ms>ms ...` 형식.
Railway 로그에서 `grep '\\[PERF\\]'` 로 추출.
"""

from __future__ import annotations

import os
import time
from contextlib import contextmanager
from functools import wraps
from typing import Any, Callable, TypeVar


def _is_enabled() -> bool:
    # 환경변수 우선, 없으면 Streamlit secrets 확인
    raw = (os.environ.get("FRAME_OPS_PERF_LOG") or "").strip().lower()
    if raw:
        return raw in ("1", "true", "yes", "on")
    try:
        import streamlit as st

        sec = getattr(st, "secrets", None)
        if sec is not None and "FRAME_OPS_PERF_LOG" in sec:
            return str(sec["FRAME_OPS_PERF_LOG"]).strip().lower() in ("1", "true", "yes", "on")
    except Exception:
        pass
    return False


# 프로세스 시작 시 한 번만 평가 (이후 요청마다 재평가하지 않음)
PERF_LOG_ENABLED = _is_enabled()


def emit_perf(label: str, ms: float, extra: str = "") -> None:
    # PERF_LOG_ENABLED=False 면 no-op. 상위 wrapper 에서 이미 차단되지만 안전장치.
    if not PERF_LOG_ENABLED:
        return
    # flush=True 로 Railway 로그가 즉시 flush 되도록
    suffix = f" {extra}" if extra else ""
    print(f"[PERF] {label}: {ms:.1f}ms{suffix}", flush=True)


F = TypeVar("F", bound=Callable[..., Any])


def perf_timed(label: str, *, include_args: bool = False) -> Callable[[F], F]:
    """함수 실행시간을 밀리초 단위로 stdout에 로깅.

    include_args=True 면 첫 2개 위치 인자를 짧게 출력 (디버깅용).
    PERF_LOG_ENABLED=False 면 원본 함수를 그대로 반환하여 오버헤드 0.
    """
    def decorator(fn: F) -> F:
        if not PERF_LOG_ENABLED:
            return fn

        @wraps(fn)
        def wrapped(*args: Any, **kwargs: Any) -> Any:
            t0 = time.perf_counter()
            result = fn(*args, **kwargs)
            dt_ms = (time.perf_counter() - t0) * 1000
            extra = ""
            if include_args and args:
                pieces = []
                for a in args[:2]:
                    s = str(a)
                    if len(s) > 24:
                        s = s[:21] + "..."
                    pieces.append(s)
                extra = f"args=({', '.join(pieces)})"
            emit_perf(label, dt_ms, extra)
            return result

        return wrapped  # type: ignore[return-value]

    return decorator


@contextmanager
def perf_section(label: str, extra: str = ""):
    """블록 실행시간 측정.

    사용:
        with perf_section("POS script rerun", extra=f"#{count}"):
            ...
    """
    if not PERF_LOG_ENABLED:
        yield
        return
    t0 = time.perf_counter()
    try:
        yield
    finally:
        dt_ms = (time.perf_counter() - t0) * 1000
        emit_perf(label, dt_ms, extra)


def perf_mark(label: str, extra: str = "") -> None:
    """단순 이벤트 마커 (시간 측정 없이 '지점 통과' 기록용)."""
    if not PERF_LOG_ENABLED:
        return
    print(f"[PERF] mark {label}{(' ' + extra) if extra else ''}", flush=True)
