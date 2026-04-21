#!/usr/bin/env python3
"""
FRAME OPS — 북촌 판매일지 xlsx → fo_sales 적재 (재고 차감).

  .venv/bin/python scripts/import_bukchon_xlsx.py --file 판매일지.xlsx --sheet 0410 --dry-run
  .venv/bin/python scripts/import_bukchon_xlsx.py --file 판매일지.xlsx --all-mmdd

프로젝트 루트에서 실행. 형식은 `frame_ops/lib/bukchon_sales_xlsx.py` · README 참고.
"""

from __future__ import annotations

import argparse
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
FRAME = ROOT / "frame_ops"
sys.path.insert(0, str(FRAME))

from lib.bukchon_sales_xlsx import (  # noqa: E402
    bukchon_sales_xlsx_all_mmdd_to_csv_text,
    bukchon_sales_xlsx_to_csv_text,
)
from lib.sales_import import run_import_csv_text  # noqa: E402
from lib.supabase_client import get_supabase  # noqa: E402


def main(argv: list[str] | None = None) -> int:
    p = argparse.ArgumentParser(description="북촌 판매일지 xlsx → fo_sales")
    p.add_argument("--file", required=True, help="xlsx 경로")
    p.add_argument("--sheet", default="", help="MMDD 시트명 (예: 0410). --all-mmdd 와 배타")
    p.add_argument("--all-mmdd", action="store_true", help="MMDD 시트 전부 합쳐 적재")
    p.add_argument("--dry-run", action="store_true", help="DB 쓰기 없이 검증만")
    args = p.parse_args(argv)

    if args.all_mmdd and args.sheet:
        p.error("--all-mmdd 와 --sheet 는 함께 쓸 수 없습니다.")
    if not args.all_mmdd and not args.sheet:
        p.error("--sheet 또는 --all-mmdd 가 필요합니다.")

    path = Path(args.file)
    if not path.is_file():
        print(f"파일 없음: {path}")
        return 1

    try:
        if args.all_mmdd:
            csv_text = bukchon_sales_xlsx_all_mmdd_to_csv_text(path)
        else:
            _biz, csv_text = bukchon_sales_xlsx_to_csv_text(path, args.sheet)
    except Exception as e:
        print(f"변환 실패: {e}")
        return 1

    try:
        sb = get_supabase()
    except RuntimeError as e:
        print(f"Supabase: {e}")
        return 1

    err, warn, log = run_import_csv_text(sb, csv_text, dry_run=args.dry_run)
    for w in warn:
        print(f"WARN {w}")
    for e in err:
        print(f"ERR {e}")
    if err:
        return 1
    if args.dry_run:
        print("검증 통과 (적재 안 함)")
        return 0
    for line in log:
        print(line)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
