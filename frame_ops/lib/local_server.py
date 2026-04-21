"""FRAME OPS 로컬 서버 — GENIUS CRM(기본 8501)과 포트를 분리."""

from __future__ import annotations

import os

# streamlit run main.py 는 .streamlit/config.toml 의 8501 유지
FRAME_OPS_DEFAULT_SERVER_PORT = 8502


def frame_ops_server_port() -> int:
    """환경변수 `FRAME_OPS_SERVER_PORT` (없으면 8502)."""
    raw = (os.environ.get("FRAME_OPS_SERVER_PORT") or "").strip()
    if not raw:
        return FRAME_OPS_DEFAULT_SERVER_PORT
    try:
        p = int(raw)
        if 1 <= p <= 65535:
            return p
    except ValueError:
        pass
    return FRAME_OPS_DEFAULT_SERVER_PORT


def frame_ops_local_base_url(host: str = "localhost") -> str:
    return f"http://{host}:{frame_ops_server_port()}"
