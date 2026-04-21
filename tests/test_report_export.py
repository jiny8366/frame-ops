"""리포트 바이트 생성 — 파일 없음."""

from __future__ import annotations

import io

import pandas as pd

from lib.report_export import df_to_csv_bytes, df_to_xlsx_bytes, tables_to_pdf_bytes


def test_df_to_csv_bytes_utf8_sig_bom() -> None:
    df = pd.DataFrame({"열": [1, 2], "b": ["가", "나"]})
    raw = df_to_csv_bytes(df)
    assert raw.startswith(b"\xef\xbb\xbf")
    assert "가".encode("utf-8") in raw


def test_df_to_xlsx_bytes_zip_and_truncates_sheet_name() -> None:
    long_name = "시트이름_" + "x" * 40
    df = pd.DataFrame({"c": [1]})
    raw = df_to_xlsx_bytes({long_name: df})
    assert raw[:2] == b"PK"
    bio = io.BytesIO(raw)
    with pd.ExcelFile(bio, engine="openpyxl") as xf:
        assert len(xf.sheet_names) == 1
        assert len(xf.sheet_names[0]) <= 31


def test_tables_to_pdf_bytes_skips_empty_dataframe() -> None:
    raw = tables_to_pdf_bytes([("빈표", pd.DataFrame()), ("있음", pd.DataFrame({"a": [1]}))])
    assert raw.startswith(b"%PDF")


def test_tables_to_pdf_bytes_respects_max_rows() -> None:
    df = pd.DataFrame({"n": list(range(100))})
    raw = tables_to_pdf_bytes([("많음", df)], max_rows=5)
    assert raw.startswith(b"%PDF")
    assert len(raw) > 500
