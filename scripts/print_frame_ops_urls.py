#!/usr/bin/env python3
"""
FRAME OPS — 목적·페이지별 테스트 URL 출력 (로컬 또는 배포 베이스 URL 지정).

  .venv/bin/python scripts/print_frame_ops_urls.py
  .venv/bin/python scripts/print_frame_ops_urls.py --base https://xxx.streamlit.app
"""

from __future__ import annotations

import argparse
from pathlib import Path
from urllib.parse import quote

ROOT = Path(__file__).resolve().parents[1]
PAGES = ROOT / "frame_ops" / "pages"


def page_urls(base: str) -> list[tuple[str, str]]:
    base = base.rstrip("/")
    out: list[tuple[str, str]] = []
    for p in sorted(PAGES.glob("*.py")):
        stem = p.stem
        enc = quote(stem, safe="")
        out.append((stem, f"{base}/{enc}"))
    return out


def main() -> int:
    ap = argparse.ArgumentParser(description="FRAME OPS 페이지 URL 목록")
    ap.add_argument(
        "--base",
        default="http://localhost:8502",
        help="베이스 URL (기본: http://localhost:8502, FRAME OPS 로컬 전용 포트)",
    )
    args = ap.parse_args()
    print(f"# BASE = {args.base.rstrip('/')}\n")
    print("## 홈 (app.py)\n")
    print(f"{args.base.rstrip('/')}/\n")
    print("## pages/\n")
    for stem, url in page_urls(args.base):
        print(f"{stem}\n  {url}\n")
    print("\n## 목적 요약 (복사)\n")
    purpose = [
        ("서비스 선택", "00_서비스선택"),
        ("홈·지점", "(위 홈 URL)"),
        ("POS", "02_POS판매"),
        ("통계", "11_통계리포트"),
        ("판매 검색", "16_판매검색"),
    ]
    m = dict(page_urls(args.base))
    for label, key in purpose:
        if key == "(위 홈 URL)":
            print(f"- {label}: {args.base.rstrip('/')}/")
        else:
            print(f"- {label}: {m[key]}")
    base = args.base.rstrip("/")
    print("\n## 모드별 QA·북마크 (?mode=)\n")
    print(f"- 본사: {base}/?mode=hq")
    print(f"- 본사 대시보드: {base}/11_%ED%86%B5%EA%B3%84%EB%A6%AC%ED%8F%AC%ED%8A%B8?mode=hq_dashboard")
    print(f"- 판매 관리: {base}/02_POS%ED%8C%90%EB%A7%A4?mode=sales")
    print("\n## 용도별 전용 진입 주소\n")
    print(f"- 본사어드민: {base}/90_admin_portal")
    print(f"- 본사대시보드: {base}/91_hq_dashboard_portal")
    print(f"- 지점용: {base}/92_store_portal")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
