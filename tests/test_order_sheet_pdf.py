"""order_sheet_pdf_bytes — PDF 생성 스모크 (파일 출력 없음)."""

from __future__ import annotations

import pandas as pd

from lib.report_export import order_sheet_pdf_bytes


def test_order_sheet_pdf_with_header_and_rows() -> None:
    store = {
        "store_code": "BKC01",
        "name": "서울 북촌점",
        "business_reg_no": "123-45-67890",
        "address": "서울특별시 종로구",
        "phone": "02-1234-5678",
    }
    df = pd.DataFrame([{"상품코드": "01:01-C01", "수량": 1}])
    b = order_sheet_pdf_bytes(
        store=store,
        document_title="테스트 주문서",
        subtitle="2026-04-01 ~ 2026-04-07",
        lines_df=df,
    )
    assert isinstance(b, bytes)
    assert len(b) > 100
    assert b[:4] == b"%PDF"


def test_order_sheet_pdf_empty_lines() -> None:
    b = order_sheet_pdf_bytes(
        store={"name": "테스트", "store_code": "T1"},
        document_title="빈 표",
        subtitle="",
        lines_df=pd.DataFrame(),
    )
    assert len(b) > 100
    assert b[:4] == b"%PDF"
