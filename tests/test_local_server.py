"""local_server — FRAME OPS 로컬 포트."""

from __future__ import annotations

import pytest

from lib.local_server import (
    FRAME_OPS_DEFAULT_SERVER_PORT,
    frame_ops_local_base_url,
    frame_ops_server_port,
)


def test_default_port() -> None:
    assert FRAME_OPS_DEFAULT_SERVER_PORT == 8502


def test_frame_ops_server_port_default(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.delenv("FRAME_OPS_SERVER_PORT", raising=False)
    assert frame_ops_server_port() == 8502


def test_frame_ops_server_port_from_env(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("FRAME_OPS_SERVER_PORT", "9000")
    assert frame_ops_server_port() == 9000


def test_frame_ops_server_port_invalid_falls_back(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("FRAME_OPS_SERVER_PORT", "xyz")
    assert frame_ops_server_port() == 8502


def test_base_url() -> None:
    assert frame_ops_local_base_url() == "http://localhost:8502"
