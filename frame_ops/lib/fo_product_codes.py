"""브랜드·제품번호·컬러·라인(FRM/SUN) 기반 내부 상품코드 생성(표시·바코드 공통)."""

from __future__ import annotations

import re
from typing import Any

# 안경테 / 선글라스 — 상품코드 접두
LINE_FRM = "FRM"
LINE_SUN = "SUN"
LINE_LABELS = {LINE_FRM: "안경테", LINE_SUN: "선글라스"}


def sanitize_code_part(s: str) -> str:
    """영숫자와 하이픈만 남기고 대문자."""
    t = (s or "").strip().upper()
    t = re.sub(r"[^A-Z0-9\-]+", "-", t)
    t = re.sub(r"-{2,}", "-", t).strip("-")
    return t or "X"


def normalize_product_line(line: str) -> str:
    """FRM 또는 SUN."""
    x = (line or "").strip().upper()
    return LINE_SUN if x == LINE_SUN else LINE_FRM


def build_product_code_base(
    product_line: str,
    brand_name: str,
    style_code: str,
    color_code: str,
) -> str:
    """기본 코드: FRM|SUN-브랜드-제품번호-컬러."""
    pl = normalize_product_line(product_line)
    b = sanitize_code_part(brand_name)[:24]
    s = sanitize_code_part(style_code)[:32]
    c = sanitize_code_part(color_code)[:16]
    return f"{pl}-{b}-{s}-{c}"


def allocate_unique_product_code(sb: Any, base: str) -> str:
    """
    `product_code` 유일성 확보. 충돌 시 `-2`, `-3` … 접미사.
    sb: Supabase client
    """
    code = base[:180]
    if not code:
        code = "SKU"
    n = 0
    while True:
        cand = code if n == 0 else f"{code}-{n + 1}"[:180]
        hit = (
            sb.table("fo_products")
            .select("id")
            .eq("product_code", cand)
            .limit(1)
            .execute()
            .data
            or []
        )
        if not hit:
            return cand
        n += 1
        if n > 500:
            raise RuntimeError("상품코드 자동 채번 한도 초과")


def display_name_three_part(brand_name: str, style_code: str, color_code: str) -> str:
    """표시 상품명: 브랜드/제품번호/컬러번호"""
    b = (brand_name or "").strip()
    s = (style_code or "").strip()
    c = (color_code or "").strip()
    return f"{b}/{s}/{c}"
