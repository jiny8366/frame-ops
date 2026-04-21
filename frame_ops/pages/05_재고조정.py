"""재고 조정 — fo_stock_adjustments (이력 삭제 없음)"""

from __future__ import annotations

import sys
import uuid
from datetime import datetime, timedelta, timezone
from pathlib import Path

import streamlit as st

_ROOT = Path(__file__).resolve().parents[1]
if str(_ROOT) not in sys.path:
    sys.path.insert(0, str(_ROOT))

st.set_page_config(
    page_title="재고 조정 — FRAME OPS",
    layout="wide",
    initial_sidebar_state="collapsed",
)

from lib.service_portal import render_frame_ops_chrome  # noqa: E402

render_frame_ops_chrome()

from lib.constants import business_date_to_timestamptz, get_data_entry_start_date, today_kst
from lib.fo_product_pick_utils import (  # noqa: E402
    brand_grid_cols,
    brand_page_size,
    load_all_brands,
    load_distinct_color_codes,
    load_distinct_style_codes,
)
from lib.schema_guard import stop_if_inventory_migration_missing
from lib.settlement_guard import is_business_day_settled, settled_warning_message
from lib.staff_rbac import list_profiles_for_store, verify_store_actor
from lib.stock import bump_stock, find_product
from lib.store_defaults import default_store_index
from lib.streamlit_fo_stores import active_fo_stores_list_or_halt
from lib.supabase_client import get_supabase

st.title("재고 조정")
st.caption(
    f"수량 증·감을 한 전표에 기록합니다. 저장된 전표는 UI에서 삭제하지 않습니다. "
    f"전표일은 **{get_data_entry_start_date().isoformat()}** 이후만 선택할 수 있습니다."
)

try:
    sb = get_supabase()
except RuntimeError as e:
    st.error(str(e))
    st.stop()

stop_if_inventory_migration_missing(sb)

# ── 브랜드→제품번호→칼라 다이얼로그 session keys ────────────────
_KB_DLG = "fo_adj_br_dlg"
_KB_PG = "fo_adj_br_pg"
_KS_DLG = "fo_adj_st_dlg"
_KS_PG = "fo_adj_st_pg"
_KC_DLG = "fo_adj_co_dlg"
_KC_PG = "fo_adj_co_pg"


@st.dialog("브랜드 선택")
def _adj_pick_brand() -> None:
    brands = load_all_brands(sb)
    if not brands:
        st.warning("등록된 브랜드가 없습니다.")
        if st.button("닫기", key="aj_br_close_e"):
            st.session_state.pop(_KB_DLG, None)
            st.rerun()
        return
    n = len(brands)
    ps = brand_page_size(n)
    pg = int(st.session_state.get(_KB_PG, 0))
    s0 = pg * ps
    chunk = brands[s0 : s0 + ps]
    cn = brand_grid_cols(ps)
    idx = 0
    for _ in range((ps + cn - 1) // cn):
        cols = st.columns(cn)
        for c in range(cn):
            with cols[c]:
                if idx < len(chunk):
                    h = chunk[idx]
                    nm = str(h.get("name") or "")
                    if st.button(nm, key=f"aj_br_{s0}_{idx}", use_container_width=True):
                        st.session_state["fo_adj_brand_id"] = str(h["id"])
                        st.session_state["fo_adj_brand_name"] = nm
                        st.session_state["fo_adj_style"] = ""
                        st.session_state["fo_adj_color"] = ""
                        st.session_state.pop(_KB_DLG, None)
                        st.session_state.pop(_KB_PG, None)
                        st.rerun()
                else:
                    st.empty()
                idx += 1
    nl, nr = st.columns([4, 1])
    with nl:
        if st.button("닫기", key="aj_br_close"):
            st.session_state.pop(_KB_DLG, None)
            st.rerun()
    with nr:
        if s0 + ps < n and st.button("다음", key="aj_br_next"):
            st.session_state[_KB_PG] = pg + 1
            st.rerun()


@st.dialog("제품번호 선택")
def _adj_pick_style() -> None:
    bid = st.session_state.get("fo_adj_brand_id")
    if not bid:
        st.error("브랜드를 먼저 선택하세요.")
        if st.button("닫기", key="aj_st_close_e"):
            st.session_state.pop(_KS_DLG, None)
            st.rerun()
        return
    styles = load_distinct_style_codes(sb, str(bid))
    if not styles:
        st.info("이 브랜드에 등록된 제품번호가 없습니다.")
        if st.button("닫기", key="aj_st_close_n"):
            st.session_state.pop(_KS_DLG, None)
            st.rerun()
        return
    ps = 15
    pg = int(st.session_state.get(_KS_PG, 0))
    s0 = pg * ps
    page_items = styles[s0 : s0 + ps]
    st.caption(f"총 **{len(styles)}**개 · {pg + 1}페이지")
    nc = 5
    for ri in range(0, len(page_items), nc):
        row_items = page_items[ri : ri + nc]
        cols = st.columns(nc)
        for j, sc in enumerate(row_items):
            with cols[j]:
                if st.button(sc, key=f"aj_st_{s0}_{ri}_{j}", use_container_width=True):
                    st.session_state["fo_adj_style"] = sc
                    st.session_state["fo_adj_color"] = ""
                    st.session_state.pop(_KS_DLG, None)
                    st.session_state.pop(_KS_PG, None)
                    st.rerun()
    nl, nr = st.columns([4, 1])
    with nl:
        if st.button("닫기", key="aj_st_close"):
            st.session_state.pop(_KS_DLG, None)
            st.rerun()
    with nr:
        if s0 + ps < len(styles) and st.button("다음", key="aj_st_next"):
            st.session_state[_KS_PG] = pg + 1
            st.rerun()


@st.dialog("칼라 선택")
def _adj_pick_color() -> None:
    bid = st.session_state.get("fo_adj_brand_id")
    stv = (st.session_state.get("fo_adj_style") or "").strip()
    if not bid or not stv:
        st.error("브랜드와 제품번호를 먼저 선택하세요.")
        if st.button("닫기", key="aj_co_close_e"):
            st.session_state.pop(_KC_DLG, None)
            st.rerun()
        return
    colors = load_distinct_color_codes(sb, str(bid), stv)
    if not colors:
        st.info("해당 제품번호에 등록된 칼라가 없습니다.")
        if st.button("닫기", key="aj_co_close_n"):
            st.session_state.pop(_KC_DLG, None)
            st.rerun()
        return
    ps = 6
    pg = int(st.session_state.get(_KC_PG, 0))
    c0 = pg * ps
    page_items = colors[c0 : c0 + ps]
    st.caption(f"총 **{len(colors)}**개 · {pg + 1}페이지")
    nc = 3
    for ri in range(0, len(page_items), nc):
        row_items = page_items[ri : ri + nc]
        cols = st.columns(nc)
        for j, cc in enumerate(row_items):
            with cols[j]:
                if st.button(cc, key=f"aj_co_{c0}_{ri}_{j}", use_container_width=True):
                    st.session_state["fo_adj_color"] = cc
                    st.session_state.pop(_KC_DLG, None)
                    st.session_state.pop(_KC_PG, None)
                    st.rerun()
    nl, nr = st.columns([4, 1])
    with nl:
        if st.button("닫기", key="aj_co_close"):
            st.session_state.pop(_KC_DLG, None)
            st.rerun()
    with nr:
        if c0 + ps < len(colors) and st.button("다음", key="aj_co_next"):
            st.session_state[_KC_PG] = pg + 1
            st.rerun()

stores = active_fo_stores_list_or_halt(sb)
if not stores:
    st.warning("먼저 홈에서 지점을 등록하세요.")
    st.stop()

with st.container():
    st.markdown("##### 전표 설정")
    h1, h2 = st.columns(2)
    with h1:
        store_labels = [f"{s['store_code']} — {s['name']}" for s in stores]
        sp = st.selectbox("지점", store_labels, index=default_store_index(stores))
        store_id = stores[store_labels.index(sp)]["id"]
    with h2:
        doc_day = st.date_input(
            "전표 일자",
            value=today_kst(),
            min_value=get_data_entry_start_date(),
            max_value=today_kst(),
            key="fo_adj_doc_day",
            help="정산된 영업일에는 조정 전표를 저장할 수 없습니다.",
        )

adj_locked = is_business_day_settled(sb, store_id, doc_day)
if adj_locked:
    st.warning(settled_warning_message(doc_day))

if "fo_adj_cart" not in st.session_state:
    st.session_state.fo_adj_cart = []

_ADJ_ALLOWED_ROLES = ("store_manager", "hq_super")


def _fmt_qty(v: object) -> str:
    try:
        n = float(v)
    except (TypeError, ValueError):
        return str(v or "")
    if n.is_integer():
        return str(int(n))
    return f"{n:.2f}".rstrip("0").rstrip(".")


def _adj_confirm_schema_ready() -> bool:
    try:
        sb.table("fo_stock_adjustments").select(
            "id,status,confirmed_at,confirmed_by,confirmed_by_name"
        ).limit(1).execute()
        return True
    except Exception as ex:
        msg = str(ex).lower()
        if "status" in msg or "confirmed_" in msg or "column" in msg:
            st.error(
                "재고조정 확정 컬럼이 아직 없습니다.\n\n"
                "Supabase SQL Editor에서 아래 파일 전체를 실행한 뒤 새로고침하세요.\n\n"
                "`supabase/migrations/20260428_frame_ops_stock_adjustment_confirm.sql`"
            )
            return False
        raise


adj_confirm_ready = _adj_confirm_schema_ready()
if "fo_adj_login_day" not in st.session_state:
    st.session_state.fo_adj_login_day = today_kst()
login_day = st.session_state.fo_adj_login_day

tab_code, tab_pick = st.tabs(["상품코드/바코드", "브랜드·제품번호·칼라 선택"])

with tab_code:
    with st.form("add_adj_line", clear_on_submit=True):
        lk = st.text_input("상품코드/바코드")
        delta = st.number_input("수량 변화 (+ 늘리기 / - 줄이기)", value=0, step=1)
        if st.form_submit_button("행 추가"):
            if adj_locked:
                st.error("정산된 일자에는 행을 추가할 수 없습니다.")
            elif delta == 0:
                st.error("0이 아닌 변화량을 입력하세요.")
            else:
                p = find_product(sb, lk)
                if not p:
                    st.error("상품을 찾을 수 없습니다.")
                else:
                    st.session_state.fo_adj_cart.append(
                        {
                            "product_id": p["id"],
                            "product_code": p["product_code"],
                            "display_name": p["display_name"],
                            "quantity_delta": float(delta),
                        }
                    )
                    st.rerun()

with tab_pick:
    st.caption("브랜드/제품번호/칼라로 선택한 뒤 수량 변화를 입력해 추가합니다.")
    b1, b2, b3 = st.columns(3)
    with b1:
        st.text((st.session_state.get("fo_adj_brand_name") or "").strip() or "—")
        if st.button("브랜드 선택", key="aj_btn_brand"):
            st.session_state[_KB_DLG] = True
            st.session_state[_KB_PG] = 0
            st.rerun()
    with b2:
        st.text((st.session_state.get("fo_adj_style") or "").strip() or "—")
        if st.button("제품번호 선택", key="aj_btn_style"):
            st.session_state[_KS_DLG] = True
            st.session_state[_KS_PG] = 0
            st.rerun()
    with b3:
        st.text((st.session_state.get("fo_adj_color") or "").strip() or "—")
        if st.button("칼라 선택", key="aj_btn_color"):
            st.session_state[_KC_DLG] = True
            st.session_state[_KC_PG] = 0
            st.rerun()

    _bid = st.session_state.get("fo_adj_brand_id")
    _sty = (st.session_state.get("fo_adj_style") or "").strip()
    _col = (st.session_state.get("fo_adj_color") or "").strip()
    _pick_product = None
    if _bid and _sty and _col:
        _pr = (
            sb.table("fo_products")
            .select("id,product_code,display_name")
            .eq("brand_id", _bid)
            .eq("style_code", _sty)
            .eq("color_code", _col)
            .limit(1)
            .execute()
            .data or []
        )
        _pick_product = _pr[0] if _pr else None
        if _pick_product:
            st.success(f"선택: **{_pick_product['display_name']}** (`{_pick_product['product_code']}`)")
        else:
            st.warning("브랜드+제품번호+칼라 조합에 해당하는 상품이 없습니다.")

    p_delta = st.number_input("수량 변화 (+ 늘리기 / - 줄이기)", value=0, step=1, key="fo_adj_pick_delta")
    if st.button("행 추가", key="aj_pick_add", type="primary", disabled=_pick_product is None):
        if adj_locked:
            st.error("정산된 일자에는 행을 추가할 수 없습니다.")
        elif p_delta == 0:
            st.error("0이 아닌 변화량을 입력하세요.")
        elif _pick_product:
            st.session_state.fo_adj_cart.append(
                {
                    "product_id": _pick_product["id"],
                    "product_code": _pick_product["product_code"],
                    "display_name": _pick_product["display_name"],
                    "quantity_delta": float(p_delta),
                }
            )
            st.session_state["fo_adj_brand_id"] = ""
            st.session_state["fo_adj_brand_name"] = ""
            st.session_state["fo_adj_style"] = ""
            st.session_state["fo_adj_color"] = ""
            st.rerun()

if st.session_state.get(_KB_DLG):
    _adj_pick_brand()
if st.session_state.get(_KS_DLG):
    _adj_pick_style()
if st.session_state.get(_KC_DLG):
    _adj_pick_color()

if st.session_state.fo_adj_cart:
    for i, line in enumerate(st.session_state.fo_adj_cart):
        c0, c1 = st.columns([5, 1])
        with c0:
            st.write(f"{line['display_name']} ({line['product_code']})  Δ {line['quantity_delta']:+g}")
        with c1:
            if st.button("제거", key=f"adj_rm_{i}"):
                st.session_state.fo_adj_cart.pop(i)
                st.rerun()

    reason = st.text_input("조정 사유", placeholder="예: 실사 차이")
    note = st.text_area("비고")
    if st.button("조정 전표 저장", type="primary"):
        if adj_locked:
            st.error("정산된 일자에는 전표를 저장할 수 없습니다.")
        elif not adj_confirm_ready:
            st.stop()
        elif not (reason or "").strip():
            st.error("사유를 입력하세요.")
        else:
            doc_id = str(uuid.uuid4())
            doc_at = business_date_to_timestamptz(doc_day)
            try:
                sb.table("fo_stock_adjustments").insert(
                    {
                        "id": doc_id,
                        "store_id": store_id,
                        "reason": reason.strip(),
                        "note": note or None,
                        "document_at": doc_at,
                        "status": "draft",
                    }
                ).execute()
                for line in st.session_state.fo_adj_cart:
                    sb.table("fo_stock_adjustment_lines").insert(
                        {
                            "stock_adjustment_id": doc_id,
                            "product_id": line["product_id"],
                            "quantity_delta": line["quantity_delta"],
                        }
                    ).execute()
                st.session_state.fo_adj_cart = []
                st.success(
                    f"재고조정표 저장 완료 (전표 {doc_id[:8]}…, 미확정). "
                    "하단에서 확정해야 재고에 반영됩니다."
                )
                st.rerun()
            except Exception as ex:
                st.error(f"저장 실패: {ex}")

st.subheader("전표일시 리스트 > 재고조정표")
recent_docs = (
    sb.table("fo_stock_adjustments")
    .select(
        "id, document_at, reason, status, confirmed_at, confirmed_by_name"
        if adj_confirm_ready
        else "id, document_at, reason"
    )
    .eq("store_id", store_id)
    .order("document_at", desc=True)
    .limit(50)
    .execute()
    .data
    or []
)
if recent_docs:
    st.dataframe(
        [
            {
                "전표일시": str(r.get("document_at", ""))[:19],
                "사유": r.get("reason") or "",
                "상태": (
                    "확정"
                    if (r.get("status") or "") == "confirmed"
                    else ("미확정" if adj_confirm_ready else "스키마 미적용")
                ),
                "확정일시": (
                    str(r.get("confirmed_at", ""))[:19]
                    if adj_confirm_ready and r.get("confirmed_at")
                    else ""
                ),
                "확정자": r.get("confirmed_by_name") or "" if adj_confirm_ready else "",
                "전표ID": str(r.get("id", ""))[:8],
            }
            for r in recent_docs
        ],
        hide_index=True,
        use_container_width=True,
    )
else:
    st.info("저장된 조정 전표가 없습니다.")

draft_docs = [r for r in recent_docs if (r.get("status") or "draft") != "confirmed"] if adj_confirm_ready else []
if draft_docs:
    st.markdown("##### 재고조정표 확정")
    st.caption("확정 시점에만 재고수량이 반영됩니다.")
    draft_labels = [
        f"{str(r.get('document_at', ''))[:19]} | {str(r.get('id', ''))[:8]} | {r.get('reason') or ''}"
        for r in draft_docs
    ]
    draft_idx = st.selectbox(
        "확정 대상 전표",
        range(len(draft_docs)),
        format_func=lambda i: draft_labels[i],
        key="fo_adj_confirm_pick",
    )
    target_doc = draft_docs[draft_idx]
    target_doc_id = str(target_doc.get("id") or "")

    profiles = [
        p
        for p in list_profiles_for_store(sb, str(store_id))
        if bool(p.get("active", True)) and str(p.get("role_code") or "") in _ADJ_ALLOWED_ROLES
    ]
    if not profiles:
        st.warning("이 지점에 확정 권한(`store_manager`) 계정이 없습니다.")
    else:
        actor_labels = [
            f"{(p.get('display_name') or p.get('email') or str(p.get('user_id'))[:8])} | "
            f"{p.get('role_code') or ''} | {p.get('email') or ''}"
            for p in profiles
        ]
        actor_idx = st.selectbox(
            "행위자(확정 권한자)",
            range(len(profiles)),
            format_func=lambda i: actor_labels[i],
            key="fo_adj_confirm_actor",
        )
        actor = profiles[actor_idx]
        actor_pw = st.text_input("행위자 비밀번호", type="password", key="fo_adj_confirm_pw")
        if st.button("확정", key="fo_adj_confirm_btn", type="primary"):
            if adj_locked:
                st.error("정산된 일자에는 전표를 확정할 수 없습니다.")
            elif not _adj_confirm_schema_ready():
                st.stop()
            else:
                try:
                    cur = (
                        sb.table("fo_stock_adjustments")
                        .select("status")
                        .eq("id", target_doc_id)
                        .limit(1)
                        .execute()
                        .data
                        or []
                    )
                    if not cur:
                        st.error("대상 전표를 찾을 수 없습니다.")
                        st.stop()
                    if (cur[0].get("status") or "") == "confirmed":
                        st.info("이미 확정된 전표입니다.")
                        st.stop()

                    uid, dn, _rc = verify_store_actor(
                        sb,
                        store_id=str(store_id),
                        user_id=str(actor.get("user_id") or ""),
                        password=actor_pw,
                        allowed_roles=_ADJ_ALLOWED_ROLES,
                    )
                    lines = (
                        sb.table("fo_stock_adjustment_lines")
                        .select("product_id, quantity_delta")
                        .eq("stock_adjustment_id", target_doc_id)
                        .execute()
                        .data
                        or []
                    )
                    if not lines:
                        st.error("전표 라인이 없어 확정할 수 없습니다.")
                        st.stop()
                    for ln in lines:
                        bump_stock(sb, str(store_id), str(ln["product_id"]), float(ln["quantity_delta"]))
                    sb.table("fo_stock_adjustments").update(
                        {
                            "status": "confirmed",
                            "confirmed_at": datetime.now(timezone.utc).isoformat(),
                            "confirmed_by": uid,
                            "confirmed_by_name": dn,
                        }
                    ).eq("id", target_doc_id).execute()
                    st.success(f"전표 {target_doc_id[:8]}… 확정 완료. 재고 반영이 완료되었습니다.")
                    st.rerun()
                except Exception as ex:
                    st.error(f"확정 실패: {ex}")
elif not adj_confirm_ready:
    st.info("확정 기능을 사용하려면 재고조정 확정 마이그레이션을 먼저 적용하세요.")

st.subheader("조정 이력 검색")
f1, f2, f3 = st.columns([1, 1, 0.35])
with f1:
    hist_d0 = st.date_input(
        "조회 시작일",
        value=login_day,
        min_value=get_data_entry_start_date(),
        max_value=today_kst(),
        key="fo_adj_hist_d0",
    )
with f2:
    hist_d1 = st.date_input(
        "조회 종료일",
        value=login_day,
        min_value=get_data_entry_start_date(),
        max_value=today_kst(),
        key="fo_adj_hist_d1",
    )
with f3:
    # 날짜 입력 박스 높이에 맞춰 검색 버튼 위치 정렬
    st.markdown("<div style='height: 1.9rem;'></div>", unsafe_allow_html=True)
    do_search = st.button("검색", key="fo_adj_hist_search", use_container_width=True)

if do_search:
    if hist_d0 > hist_d1:
        st.error("조회 시작일이 종료일보다 늦습니다.")
    else:
        from lib.constants import kst_day_range_utc_iso  # noqa: E402

        lo, _ = kst_day_range_utc_iso(hist_d0)
        _, hi = kst_day_range_utc_iso(hist_d1 + timedelta(days=1))

        recs = (
            sb.table("fo_stock_adjustments")
            .select("id, document_at, reason, note, status" if adj_confirm_ready else "id, document_at, reason, note")
            .eq("store_id", store_id)
            .gte("document_at", lo)
            .lt("document_at", hi)
            .order("document_at", desc=True)
            .limit(300)
            .execute()
            .data
            or []
        )

        if not recs:
            st.info("선택 기간에 조정 이력이 없습니다.")
        else:
            out_rows = []
            for r in recs:
                lines = (
                    sb.table("fo_stock_adjustment_lines")
                    .select("product_id, quantity_delta")
                    .eq("stock_adjustment_id", r["id"])
                    .execute()
                    .data
                    or []
                )
                pids = list({str(x["product_id"]) for x in lines})
                pmap = {}
                if pids:
                    for row in (
                        sb.table("fo_products")
                        .select("id, product_code, display_name")
                        .in_("id", pids)
                        .execute()
                        .data
                        or []
                    ):
                        pmap[str(row["id"])] = row
                for ln in lines:
                    pr = pmap.get(str(ln["product_id"]), {})
                    out_rows.append(
                        {
                            "전표일시": str(r.get("document_at", ""))[:19],
                            "사유": r.get("reason") or "",
                            "상태": (
                                "확정"
                                if (r.get("status") or "") == "confirmed"
                                else ("미확정" if adj_confirm_ready else "스키마 미적용")
                            ),
                            "상품코드": pr.get("product_code"),
                            "상품명": pr.get("display_name"),
                            "수량변화": _fmt_qty(ln.get("quantity_delta")),
                            "비고": r.get("note") or "",
                        }
                    )
            st.dataframe(out_rows, hide_index=True, use_container_width=True)
