"""기간별 판매·라인 데이터 적재 (Pandas DataFrame)."""

from __future__ import annotations

from datetime import date, timedelta
from typing import Any

import pandas as pd

from lib.constants import kst_day_range_utc_iso

_WEEK_KR = ["월요일", "화요일", "수요일", "목요일", "금요일", "토요일", "일요일"]


def _period_utc_bounds(d0: date, d1: date) -> tuple[str, str]:
    lo, _ = kst_day_range_utc_iso(d0)
    _, hi = kst_day_range_utc_iso(d1 + timedelta(days=1))
    return lo, hi


def _chunks(xs: list, n: int):
    for i in range(0, len(xs), n):
        yield xs[i : i + n]


def load_sales_analytics(
    sb: Any,
    store_ids: list[str],
    d0: date,
    d1: date,
) -> tuple[pd.DataFrame, pd.DataFrame]:
    """
    store_ids: 모든 지점이면 fo_stores의 id 목록을 넘김.
    반환: (df_sales, df_lines 확장) — df_lines에 alloc_revenue(전표 결제액을 라인 비중으로 배분).
    """
    lo, hi = _period_utc_bounds(d0, d1)
    q = sb.table("fo_sales").select("*").gte("sold_at", lo).lt("sold_at", hi)
    if store_ids:
        q = q.in_("store_id", store_ids)
    sales_rows = q.execute().data or []
    if not sales_rows:
        return pd.DataFrame(), pd.DataFrame()

    df_s = pd.DataFrame(sales_rows)
    df_s["payment"] = df_s["cash_amount"].fillna(0).astype(int) + df_s["card_amount"].fillna(0).astype(int)
    if "seller_code" not in df_s.columns:
        df_s["seller_code"] = None

    sale_ids = [str(x) for x in df_s["id"].tolist()]
    all_lines: list[dict] = []
    for ch in _chunks(sale_ids, 80):
        part = sb.table("fo_sale_lines").select("*").in_("sale_id", ch).execute().data or []
        all_lines.extend(part)
    if not all_lines:
        return df_s, pd.DataFrame()

    df_l = pd.DataFrame(all_lines)
    df_l["quantity"] = pd.to_numeric(df_l["quantity"], errors="coerce").fillna(0)
    df_l["unit_price"] = pd.to_numeric(df_l["unit_price"], errors="coerce").fillna(0).astype(int)
    df_l["line_discount"] = pd.to_numeric(df_l.get("line_discount", 0), errors="coerce").fillna(0).astype(int)
    df_l["line_gross"] = df_l["quantity"] * df_l["unit_price"] - df_l["line_discount"]
    cogs = pd.to_numeric(df_l.get("cost_price_at_sale"), errors="coerce").fillna(0)
    df_l["cogs"] = df_l["quantity"] * cogs

    sale_cols = df_s[["id", "store_id", "sold_at", "seller_code", "payment", "cash_amount", "card_amount"]].rename(
        columns={"id": "sale_id"}
    )
    df_m = df_l.merge(sale_cols, on="sale_id", how="left")

    sub = df_m.groupby("sale_id", as_index=False)["line_gross"].sum().rename(columns={"line_gross": "sale_sub"})
    df_m = df_m.merge(sub, on="sale_id", how="left")
    df_m["sale_sub_safe"] = df_m["sale_sub"].replace(0, pd.NA)
    df_m["alloc_revenue"] = (df_m["payment"] * (df_m["line_gross"] / df_m["sale_sub_safe"])).fillna(0)

    pids = df_m["product_id"].dropna().astype(str).unique().tolist()
    prows: list[dict] = []
    for ch in _chunks(pids, 100):
        prows.extend(
            sb.table("fo_products")
            .select("id, display_name, category, supplier_id")
            .in_("id", ch)
            .execute()
            .data
            or []
        )
    if prows:
        df_p = pd.DataFrame(prows).rename(columns={"id": "product_id"})
        df_p["product_id"] = df_p["product_id"].astype(str)
        df_m["product_id"] = df_m["product_id"].astype(str)
        df_m = df_m.merge(df_p, on="product_id", how="left")
    else:
        df_m["display_name"] = ""
        df_m["category"] = ""
        df_m["supplier_id"] = pd.NA

    df_m["display_name"] = df_m["display_name"].fillna("(미상)")
    df_m["category"] = df_m["category"].fillna("")

    df_m["sold_at"] = pd.to_datetime(df_m["sold_at"], utc=True)
    dow = df_m["sold_at"].dt.tz_convert("Asia/Seoul").dt.weekday
    df_m["weekday_kr"] = dow.map(lambda i: _WEEK_KR[int(i)])

    return df_s, df_m
