#!/usr/bin/env python3
"""
FRAME OPS — 실판매 CSV를 fo_sales / fo_sale_lines에 넣습니다 (재고 차감).

  .venv/bin/python scripts/import_frame_ops_sales.py --file sales.csv --dry-run
  .venv/bin/python scripts/import_frame_ops_sales.py --file sales.csv

프로젝트 루트에서 실행. `.env`에 Supabase 설정 필요.
CSV 형식은 `frame_ops/lib/sales_import.py` 모듈 독스트링·`frame_ops/README.md` 참고.
"""

from __future__ import annotations

import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
FRAME = ROOT / "frame_ops"
sys.path.insert(0, str(FRAME))

from lib.sales_import import cli_main  # noqa: E402

if __name__ == "__main__":
    raise SystemExit(cli_main())
