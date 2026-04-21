"""
실제 Supabase에 붙는 스모크 테스트 (선택).

  SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY 가 있을 때만 실행:

  pytest tests/test_live_preflight.py -m live
"""

from __future__ import annotations

import os

import pytest

pytestmark = pytest.mark.live


@pytest.mark.skipif(
    not (
        (os.environ.get("SUPABASE_URL") or "").strip().startswith("http")
        and bool((os.environ.get("SUPABASE_SERVICE_ROLE_KEY") or os.environ.get("SUPABASE_KEY") or "").strip())
    ),
    reason="SUPABASE_URL 및 키가 없음",
)
def test_preflight_script_exits_zero() -> None:
    import subprocess
    import sys
    from pathlib import Path

    root = Path(__file__).resolve().parents[1]
    script = root / "scripts" / "frame_ops_preflight.py"
    r = subprocess.run([sys.executable, str(script)], cwd=str(root), capture_output=True, text=True, timeout=120)
    assert r.returncode == 0, r.stdout + r.stderr
