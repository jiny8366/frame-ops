"""리포트 CSV / XLSX / PDF(간단 표)."""

from __future__ import annotations

import io
from typing import Any

import matplotlib.gridspec as gridspec
import matplotlib.pyplot as plt
import pandas as pd
from matplotlib.backends.backend_pdf import PdfPages


def df_to_csv_bytes(df: pd.DataFrame) -> bytes:
    return df.to_csv(index=False).encode("utf-8-sig")


def df_to_xlsx_bytes(sheets: dict[str, pd.DataFrame]) -> bytes:
    bio = io.BytesIO()
    with pd.ExcelWriter(bio, engine="openpyxl") as writer:
        for name, df in sheets.items():
            safe = (name or "sheet")[:31]
            df.to_excel(writer, sheet_name=safe, index=False)
    return bio.getvalue()


def tables_to_pdf_bytes(items: list[tuple[str, pd.DataFrame]], *, max_rows: int = 35) -> bytes:
    """표 PDF. 한글은 AppleGothic/Malgun 등 시스템 폰트에 의존합니다."""
    bio = io.BytesIO()
    with plt.rc_context(
        {
            "font.family": ["AppleGothic", "Malgun Gothic", "NanumGothic", "DejaVu Sans", "sans-serif"],
            "axes.unicode_minus": False,
        }
    ):
        with PdfPages(bio) as pdf:
            for title, df in items:
                if df.empty:
                    continue
                view = df.head(max_rows).copy()
                fig, ax = plt.subplots(figsize=(11, 8.5))
                ax.axis("off")
                ax.set_title(str(title)[:120], fontsize=11, pad=12)
                table = ax.table(
                    cellText=view.astype(str).values,
                    colLabels=[str(c) for c in view.columns],
                    loc="center",
                    cellLoc="left",
                )
                table.auto_set_font_size(False)
                table.set_fontsize(7)
                table.scale(1, 1.2)
                fig.tight_layout()
                pdf.savefig(fig, bbox_inches="tight")
                plt.close(fig)
    return bio.getvalue()


def order_sheet_pdf_bytes(
    *,
    store: dict[str, Any],
    document_title: str,
    subtitle: str,
    lines_df: pd.DataFrame,
    max_rows: int = 40,
) -> bytes:
    """
    발주·주문서 PDF — 상호·사업자등록번호·주소·전화 헤더 + 품목 표.
    `store` 에는 `name`, `business_reg_no`, `address`, `phone`, `store_code` 등이 올 수 있습니다.
    """
    bio = io.BytesIO()
    name = str(store.get("name") or "").strip()
    code = str(store.get("store_code") or "").strip()
    br = str(store.get("business_reg_no") or "").strip()
    addr = str(store.get("address") or "").strip()
    phone = str(store.get("phone") or "").strip()

    header_lines = [f"상호: {name}" + (f"  (지점코드 {code})" if code else "")]
    if br:
        header_lines.append(f"사업자등록번호: {br}")
    if addr:
        header_lines.append(f"주소: {addr}")
    if phone:
        header_lines.append(f"전화번호: {phone}")
    header_text = "\n".join(header_lines)

    with plt.rc_context(
        {
            "font.family": ["AppleGothic", "Malgun Gothic", "NanumGothic", "DejaVu Sans", "sans-serif"],
            "axes.unicode_minus": False,
        }
    ):
        with PdfPages(bio) as pdf:
            fig = plt.figure(figsize=(11, 8.5))
            gs = gridspec.GridSpec(3, 1, height_ratios=[0.22, 0.08, 0.65], hspace=0.35, top=0.94, bottom=0.06)

            ax0 = fig.add_subplot(gs[0])
            ax0.axis("off")
            ax0.text(0.02, 0.98, header_text, transform=ax0.transAxes, va="top", ha="left", fontsize=10, linespacing=1.45)

            ax1 = fig.add_subplot(gs[1])
            ax1.axis("off")
            ax1.text(0.02, 0.9, document_title, transform=ax1.transAxes, va="top", ha="left", fontsize=12, fontweight="bold")
            if subtitle:
                ax1.text(0.02, 0.35, subtitle, transform=ax1.transAxes, va="top", ha="left", fontsize=9)

            ax2 = fig.add_subplot(gs[2])
            ax2.axis("off")
            if lines_df is not None and not lines_df.empty:
                view = lines_df.head(max_rows).copy()
                tbl = ax2.table(
                    cellText=view.astype(str).values,
                    colLabels=[str(c) for c in view.columns],
                    loc="upper center",
                    cellLoc="left",
                )
                tbl.auto_set_font_size(False)
                tbl.set_fontsize(7)
                tbl.scale(1, 1.15)
            else:
                ax2.text(0.5, 0.5, "(품목 없음)", ha="center", va="center", fontsize=10)

            pdf.savefig(fig, bbox_inches="tight")
            plt.close(fig)
    return bio.getvalue()
