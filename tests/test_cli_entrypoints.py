"""import_* CLI — --help 가 종료 0으로 동작하는지 (DB·네트워크 불필요)."""

from __future__ import annotations

import subprocess
import sys
from pathlib import Path

import pytest

_ROOT = Path(__file__).resolve().parents[1]

_CLI_SCRIPTS = (
    "scripts/import_frame_ops_sales.py",
    "scripts/import_bukchon_xlsx.py",
)


def test_print_frame_ops_urls_runs() -> None:
    script = _ROOT / "scripts" / "print_frame_ops_urls.py"
    assert script.is_file()
    r = subprocess.run(
        [sys.executable, str(script), "--base", "http://localhost:9999"],
        cwd=str(_ROOT),
        capture_output=True,
        text=True,
        timeout=30,
    )
    assert r.returncode == 0, r.stderr or r.stdout
    assert "9999" in r.stdout
    assert "00_" in r.stdout


@pytest.mark.parametrize("rel", _CLI_SCRIPTS)
def test_import_cli_help_exits_zero(rel: str) -> None:
    script = _ROOT / rel
    assert script.is_file(), f"없음: {script}"
    r = subprocess.run(
        [sys.executable, str(script), "--help"],
        cwd=str(_ROOT),
        capture_output=True,
        text=True,
        timeout=30,
    )
    assert r.returncode == 0, r.stderr or r.stdout


def test_pytest_collects_bukchon_and_sales_tests() -> None:
    """수집 단계에서 핵심 모듈이 import 가능한지."""
    from lib import bukchon_sales_xlsx  # noqa: F401
    from lib import sales_import  # noqa: F401

    assert hasattr(bukchon_sales_xlsx, "bukchon_sales_xlsx_to_csv_text")
    assert hasattr(sales_import, "run_import_csv_text")
