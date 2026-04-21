"""일별 정산: 시재·차액·시재 지출 + 영업일 잠금."""

from __future__ import annotations

import sys
from pathlib import Path

import streamlit as st

_ROOT = Path(__file__).resolve().parents[1]
if str(_ROOT) not in sys.path:
    sys.path.insert(0, str(_ROOT))

st.set_page_config(
    page_title="정산 — FRAME OPS",
    layout="wide",
    initial_sidebar_state="collapsed",
)

from lib.service_portal import render_frame_ops_chrome  # noqa: E402

render_frame_ops_chrome()

from lib.constants import get_data_entry_start_date, today_kst
from lib.sales_helpers import store_cash_sales_total
from lib.schema_guard_extended import stop_if_returns_migration_missing
from lib.settlement_guard import is_business_day_settled, stop_if_settlement_migration_missing
from lib.store_defaults import default_store_index
from lib.streamlit_fo_stores import active_fo_stores_list_or_halt
from lib.supabase_client import get_supabase

st.title("정산")

try:
    sb = get_supabase()
except RuntimeError as e:
    st.error(str(e))
    st.stop()

stop_if_settlement_migration_missing(sb)
stop_if_returns_migration_missing(sb)

stores = active_fo_stores_list_or_halt(sb)
if not stores:
    st.warning("먼저 홈에서 지점을 등록하세요.")
    st.stop()

with st.container():
    z1, z2 = st.columns(2)
    with z1:
        store_labels = [f"{s['store_code']} — {s['name']}" for s in stores]
        sp = st.selectbox("지점", store_labels, index=default_store_index(stores))
        store_id = stores[store_labels.index(sp)]["id"]
    with z2:
        biz_day = st.date_input(
            "정산할 영업일",
            value=today_kst(),
            min_value=get_data_entry_start_date(),
            max_value=today_kst(),
            help="확정 후 같은 지점·같은 날짜의 POS·입고·출고 등은 저장할 수 없습니다.",
        )

# ── 전일 시재 조회 ────────────────────────────────────────────
from datetime import timedelta  # noqa: E402

_prev_day = biz_day - timedelta(days=1)
_prev_settle = (
    sb.table("fo_settlements")
    .select("cash_counted")
    .eq("store_id", store_id)
    .eq("business_date", _prev_day.isoformat())
    .limit(1)
    .execute()
    .data or []
)

_any_settle = (
    sb.table("fo_settlements")
    .select("cash_counted")
    .eq("store_id", store_id)
    .order("business_date", desc=True)
    .limit(1)
    .execute()
    .data or []
)

_is_first_settle = not _any_settle
_prev_cash = int(
    (_prev_settle[0]["cash_counted"] or 0) if _prev_settle
    else (_any_settle[0]["cash_counted"] or 0) if _any_settle
    else 0
)

# number_input +/- 버튼 숨기기
st.markdown(
    "<style>"
    "button.step-up, button.step-down,"
    "[data-testid='stNumberInput'] button {display:none !important;}"
    "</style>",
    unsafe_allow_html=True,
)

# ── 1) 현금시재 (좌측 라벨 + 우측 금액, 수정 불가) ─────────────
_init_cash_key = f"fo_settle_init_{store_id}"
if _is_first_settle:
    st.info("이 지점의 최초 정산입니다. **현금시재**를 직접 입력해 주세요. 이후 정산부터는 변경할 수 없습니다.")
    _coh_l, _coh_r = st.columns([1, 1])
    with _coh_l:
        st.markdown("**현금시재**")
    with _coh_r:
        cash_on_hand = st.text_input("현금시재 입력", value="0", key=_init_cash_key, label_visibility="collapsed")
        cash_on_hand = int(cash_on_hand) if (cash_on_hand or "").strip().isdigit() else 0
else:
    cash_on_hand = _prev_cash
    _coh_l, _coh_r = st.columns([1, 1])
    with _coh_l:
        st.markdown("**현금시재**")
    with _coh_r:
        st.markdown(
            f"<div style='text-align:right;font-size:1.3rem;font-weight:700;padding:0.3rem 0'>"
            f"{cash_on_hand:,}원</div>",
            unsafe_allow_html=True,
        )

# ── 2) 현금매출 + 카드매출 (한 줄 배치) ──────────────────────
_cash_sales_key = f"fo_settle_cash_sales_{store_id}_{biz_day.isoformat()}"
_card_sales_key = f"fo_settle_card_sales_{store_id}_{biz_day.isoformat()}"
if _cash_sales_key not in st.session_state:
    st.session_state[_cash_sales_key] = "0"
if _card_sales_key not in st.session_state:
    st.session_state[_card_sales_key] = "0"

_sc1, _sc2 = st.columns(2)
with _sc1:
    _csv = st.text_input("현금매출", key=_cash_sales_key)
    cash_sales = int(_csv) if (_csv or "").strip().lstrip("-").isdigit() else 0
with _sc2:
    _cdv = st.text_input("카드매출", key=_card_sales_key)
    card_sales = int(_cdv) if (_cdv or "").strip().lstrip("-").isdigit() else 0

# ── 3) 지출내역 ──────────────────────────────────────────────
ex_key = f"fo_settle_exp_{store_id}_{biz_day.isoformat()}"
if ex_key not in st.session_state:
    st.session_state[ex_key] = []

st.subheader("지출내역")
with st.form("add_exp"):
    _ec1, _ec2 = st.columns([3, 1])
    with _ec1:
        em = st.text_input("적요")
    with _ec2:
        ea = st.text_input("금액", value="0")
    ea_int = int(ea) if (ea or "").strip().isdigit() else 0
    if st.form_submit_button("지출 행 추가") and ea_int > 0:
        st.session_state[ex_key].append({"memo": (em or "").strip(), "amount": ea_int})
        st.rerun()

total_expense = 0
if st.session_state[ex_key]:
    for i, ex in enumerate(st.session_state[ex_key]):
        c1, c2, c3 = st.columns([3, 1, 1])
        with c1:
            st.write(ex.get("memo") or "-")
        with c2:
            st.write(f"{ex['amount']:,}원")
        with c3:
            if st.button("삭제", key=f"sex_{i}_{ex_key}"):
                st.session_state[ex_key].pop(i)
                st.rerun()
    total_expense = sum(e["amount"] for e in st.session_state[ex_key])
    st.caption(f"지출 합계: **{total_expense:,}원**")

# ── 4) 돈통합계 = 현금매출 + 시재 - 지출내역 ─────────────────
st.divider()
money_box = int(cash_sales) + int(cash_on_hand) - int(total_expense)
st.metric("돈통합계 (현금매출 + 시재 − 지출)", f"{money_box:,}원")

# ── 5) 입금처리 ──────────────────────────────────────────────
_deposit_key = f"fo_settle_deposit_{store_id}_{biz_day.isoformat()}"
if _deposit_key not in st.session_state:
    st.session_state[_deposit_key] = "0"
_dep_v = st.text_input(
    "입금처리 — 돈통에서 본사로 입금한 현금",
    key=_deposit_key,
)
deposit = int(_dep_v) if (_dep_v or "").strip().lstrip("-").isdigit() else 0

carry_over = money_box - int(deposit)

# ── 6) 비고 ──────────────────────────────────────────────────
st.divider()
note = st.text_area("비고 (선택)")

# ── 7) 정산처리 ──────────────────────────────────────────────
already = is_business_day_settled(sb, store_id, biz_day)
if already:
    st.info(f"{biz_day.isoformat()} 은 이미 정산 처리되었습니다.")

if st.button("정산처리", type="primary", disabled=already):
    try:
        ins = (
            sb.table("fo_settlements")
            .insert(
                {
                    "store_id": store_id,
                    "business_date": biz_day.isoformat(),
                    "note": (note or "").strip() or None,
                    "cash_expected": int(cash_sales),
                    "cash_counted": int(carry_over),
                    "variance": int(carry_over) - int(cash_sales),
                    "cash_on_hand": int(cash_on_hand),
                    "card_sales": int(card_sales),
                    "total_expense": int(total_expense),
                    "deposit": int(deposit),
                }
            )
            .select("id")
            .execute()
            .data
        )
        if not ins:
            st.error("정산 저장 응답이 비었습니다.")
        else:
            sid = ins[0]["id"]
            for i, ex in enumerate(st.session_state[ex_key]):
                sb.table("fo_settlement_expenses").insert(
                    {
                        "settlement_id": sid,
                        "amount": ex["amount"],
                        "memo": ex.get("memo") or None,
                        "sort_order": i,
                    }
                ).execute()
            st.session_state[ex_key] = []
            st.success("정산 처리 완료. 해당 일자는 전표 입력이 막힙니다.")
            st.rerun()
    except Exception as ex:
        err = str(ex)
        if "duplicate" in err.lower() or "unique" in err.lower():
            st.error("이미 정산된 일자입니다.")
        else:
            st.error(f"저장 실패: {ex}")

st.subheader("정산 이력")
import pandas as pd  # noqa: E402
from lib.constants import kst_day_range_utc_iso  # noqa: E402

hist = (
    sb.table("fo_settlements")
    .select(
        "business_date,cash_expected,cash_on_hand,card_sales,"
        "total_expense,deposit,cash_counted,note,created_at"
    )
    .eq("store_id", store_id)
    .order("business_date", desc=True)
    .limit(100)
    .execute()
    .data
    or []
)
if hist:
    from datetime import date as _date_type

    _sale_count_cache: dict[str, tuple[int, float]] = {}

    def _sale_stats(bd_str: str) -> tuple[int, float]:
        if bd_str in _sale_count_cache:
            return _sale_count_cache[bd_str]
        try:
            bd = _date_type.fromisoformat(bd_str)
            lo, _ = kst_day_range_utc_iso(bd)
            from datetime import timedelta
            _, hi = kst_day_range_utc_iso(bd + timedelta(days=1))
            sales = (
                sb.table("fo_sales")
                .select("id")
                .eq("store_id", store_id)
                .gte("sold_at", lo)
                .lt("sold_at", hi)
                .execute()
                .data or []
            )
            cnt = len(sales)
            qty = 0.0
            if sales:
                sids = [str(s["id"]) for s in sales]
                for i in range(0, len(sids), 80):
                    chunk = sids[i:i+80]
                    lines = (
                        sb.table("fo_sale_lines")
                        .select("quantity")
                        .in_("sale_id", chunk)
                        .execute()
                        .data or []
                    )
                    qty += sum(float(ln.get("quantity") or 0) for ln in lines)
            _sale_count_cache[bd_str] = (cnt, qty)
            return cnt, qty
        except Exception:
            _sale_count_cache[bd_str] = (0, 0.0)
            return 0, 0.0

    cum_cash = 0
    cum_card = 0
    cum_exp = 0
    rows_display = []

    for h in reversed(hist):
        cs = int(h.get("cash_expected") or 0)
        cd = int(h.get("card_sales") or 0)
        te = int(h.get("total_expense") or 0)
        cum_cash += cs
        cum_card += cd
        cum_exp += te
        cnt, qty = _sale_stats(h["business_date"])
        rows_display.append({
            "정산일자": f"{h['business_date']} {(h.get('created_at') or '')[11:16]}",
            "매출합": cs + cd,
            "현금매출": cs,
            "현금누적": cum_cash,
            "카드매출": cd,
            "카드누적": cum_card,
            "지출합": te,
            "지출누적": cum_exp,
            "건수": cnt,
            "수량": qty,
        })

    rows_display.reverse()
    st.dataframe(pd.DataFrame(rows_display), hide_index=True, use_container_width=True)
else:
    st.info("정산 이력이 없습니다.")
