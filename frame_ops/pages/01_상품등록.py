"""상품 등록·수정 — 브랜드·FRM/SUN·제품/컬러·카테고리·코드/바코드(QR·Code128)"""

from __future__ import annotations

import sys
from pathlib import Path

import streamlit as st

_ROOT = Path(__file__).resolve().parents[1]
if str(_ROOT) not in sys.path:
    sys.path.insert(0, str(_ROOT))

st.set_page_config(
    page_title="상품 등록 — FRAME OPS",
    layout="wide",
    initial_sidebar_state="collapsed",
)

from lib.service_portal import render_frame_ops_chrome, fo_page_link  # noqa: E402

render_frame_ops_chrome()

from lib.barcode_images import product_code_to_code128_png, product_code_to_qr_png  # noqa: E402
from lib.constants import get_data_entry_start_date  # noqa: E402
from lib.fo_product_codes import (  # noqa: E402
    LINE_FRM,
    LINE_LABELS,
    LINE_SUN,
    allocate_unique_product_code,
    build_product_code_base,
    display_name_three_part,
    normalize_product_line,
)
from lib.supabase_client import get_supabase  # noqa: E402

# 세션 키
K_EDIT_ID = "fo_edit_product_id"
K_EDIT_CODE = "fo_edit_product_code"
K_PICK_APPLIED = "fo_pick_product_applied_label"
K_CAT_EXTRA = "fo_category_option_extra"
K_BRAND_NO_HITS_TERM = "fo_brand_no_hits_term"
K_PENDING_EDIT_ROW = "fo_pending_edit_row"
K_BRAND_DLG_OPEN = "fo_brand_dialog_open"
K_BRAND_DLG_PAGE = "fo_brand_dialog_page"
K_STYLE_DLG_OPEN = "fo_style_dialog_open"
K_STYLE_DLG_PAGE = "fo_style_dialog_page"
K_COLOR_DLG_OPEN = "fo_color_dialog_open"
K_COLOR_DLG_PAGE = "fo_color_dialog_page"

st.title("상품 등록 · 수정")
st.markdown(
    """
    <style>
    div[data-testid="stTextInput"],
    div[data-testid="stNumberInput"],
    div[data-testid="stSelectbox"] {
        max-width: 220px;
    }
    div[data-testid="stNumberInput"] button {
        display: none !important;
    }
    </style>
    """,
    unsafe_allow_html=True,
)

fo_page_link("pages/90_admin_portal.py", label="홈")
fo_page_link("pages/03_입고.py", label="→ 입고")
fo_page_link("pages/02_POS판매.py", label="→ POS 판매")

try:
    sb = get_supabase()
except RuntimeError as e:
    st.error(str(e))
    st.stop()

try:
    from postgrest.exceptions import APIError
except ImportError:
    APIError = Exception  # type: ignore[misc,assignment]


def _table_missing(exc: BaseException) -> bool:
    if APIError is Exception:
        return "PGRST205" in str(exc) or "Could not find the table" in str(exc)
    return getattr(exc, "code", None) == "PGRST205" or (
        "Could not find the table" in (getattr(exc, "message", None) or str(exc))
    )


def _require_new_schema() -> None:
    for tbl in ("fo_brands", "fo_product_categories"):
        try:
            sb.table(tbl).select("id").limit(1).execute()
        except Exception as ex:
            if _table_missing(ex):
                st.error(
                    f"DB에 **`{tbl}`** 테이블이 없습니다. SQL Editor에서 순서대로 실행하세요: "
                    "`20260423_frame_ops_brands.sql` → `20260424_frame_ops_product_line_categories.sql`"
                )
                st.stop()
            raise


_require_new_schema()


def load_category_labels() -> list[str]:
    rows = (
        sb.table("fo_product_categories")
        .select("label")
        .order("sort_order")
        .order("label")
        .execute()
        .data
        or []
    )
    return [str(r["label"]) for r in rows if r.get("label")]


def load_products_for_picker() -> list[dict]:
    return (
        sb.table("fo_products")
        .select(
            "id, product_code, display_name, category, product_line, style_code, color_code, "
            "brand_id, cost_price, suggested_retail, sale_price"
        )
        .order("created_at", desc=True)
        .limit(500)
        .execute()
        .data
        or []
    )


def search_brands(term: str) -> list[dict]:
    t = (term or "").strip()
    if not t:
        return []
    q = sb.table("fo_brands").select("id, name").ilike("name", f"%{t}%").limit(50).execute().data or []
    return list(q)


def insert_brand(name: str) -> dict | None:
    n = (name or "").strip()
    if not n:
        return None
    sb.table("fo_brands").insert({"name": n}).execute()
    rows = (
        sb.table("fo_brands")
        .select("id, name")
        .ilike("name", n)
        .order("created_at", desc=True)
        .limit(1)
        .execute()
        .data
        or []
    )
    return rows[0] if rows else None


def find_product_row(brand_id: str, style: str, color: str, line: str) -> dict | None:
    rows = (
        sb.table("fo_products")
        .select("id, product_code, cost_price, suggested_retail, sale_price")
        .eq("brand_id", brand_id)
        .eq("style_code", (style or "").strip())
        .eq("color_code", (color or "").strip())
        .eq("product_line", normalize_product_line(line))
        .limit(1)
        .execute()
        .data
        or []
    )
    return rows[0] if rows else None


def clear_edit_and_form_defaults(cat_labels: list[str]) -> None:
    st.session_state.pop(K_EDIT_ID, None)
    st.session_state.pop(K_EDIT_CODE, None)
    st.session_state.pop(K_CAT_EXTRA, None)
    st.session_state.pop("fo_brand_id", None)
    st.session_state.pop("fo_brand_name", None)
    st.session_state.pop("fo_brand_hits", None)
    for k in ("fo_style", "fo_color", "fo_cost", "fo_sug", "fo_sale", "fo_new_brand", "fo_brand_search"):
        st.session_state.pop(k, None)
    st.session_state["fo_pr_line"] = LINE_FRM
    st.session_state["fo_pr_category"] = (cat_labels[0] if cat_labels else "(없음)")
    st.session_state["fo_cost"] = 0
    st.session_state["fo_sug"] = 0
    st.session_state["fo_sale"] = 0
    for _k in (
        K_BRAND_DLG_OPEN,
        K_BRAND_DLG_PAGE,
        K_STYLE_DLG_OPEN,
        K_STYLE_DLG_PAGE,
        K_COLOR_DLG_OPEN,
        K_COLOR_DLG_PAGE,
    ):
        st.session_state.pop(_k, None)


def apply_product_to_form(row: dict, brand_name: str, cat_labels: list[str]) -> None:
    st.session_state[K_EDIT_ID] = str(row["id"])
    st.session_state[K_EDIT_CODE] = str(row.get("product_code") or "")
    pl = row.get("product_line") or LINE_FRM
    st.session_state["fo_pr_line"] = LINE_SUN if str(pl).upper() == LINE_SUN else LINE_FRM
    cat = (row.get("category") or "").strip()
    base_opts = cat_labels[:] if cat_labels else ["(없음)"]
    if cat and cat not in base_opts:
        st.session_state[K_CAT_EXTRA] = cat
    else:
        st.session_state.pop(K_CAT_EXTRA, None)
    st.session_state["fo_pr_category"] = cat if cat else (base_opts[0] if base_opts else "(없음)")
    bid = row.get("brand_id")
    if bid:
        st.session_state["fo_brand_id"] = str(bid)
        st.session_state["fo_brand_name"] = brand_name
        st.session_state["fo_brand_search"] = brand_name
    else:
        st.session_state.pop("fo_brand_id", None)
        st.session_state.pop("fo_brand_name", None)
    st.session_state["fo_style"] = str(row.get("style_code") or "")
    st.session_state["fo_color"] = str(row.get("color_code") or "")
    st.session_state["fo_cost"] = int(row.get("cost_price") or 0)
    st.session_state["fo_sug"] = int(row.get("suggested_retail") or 0)
    st.session_state["fo_sale"] = int(row.get("sale_price") or 0)
    st.session_state.pop("fo_brand_hits", None)
    st.session_state.pop(K_BRAND_NO_HITS_TERM, None)


def category_select_options(cat_labels: list[str]) -> list[str]:
    extra = st.session_state.get(K_CAT_EXTRA)
    base = cat_labels[:] if cat_labels else ["(없음)"]
    if extra and str(extra).strip() and extra not in base:
        return [str(extra).strip()] + base
    return base


def product_row_label(row: dict) -> str:
    return (
        f"{row.get('product_code', '')} · "
        f"{str(row.get('display_name') or '')[:40]} ·"
        f"{str(row.get('id', ''))[-8:]}"
    )


def _brand_page_size(n: int) -> int:
    if n <= 4:
        return 4
    if n <= 9:
        return 9
    return 12


def _brand_grid_cols(page_size: int) -> int:
    return 2 if page_size == 4 else 3 if page_size == 9 else 4


def load_distinct_style_codes(brand_id: str) -> list[str]:
    rows = (
        sb.table("fo_products")
        .select("style_code")
        .eq("brand_id", brand_id)
        .execute()
        .data
        or []
    )
    return sorted(
        {
            str(r["style_code"])
            for r in rows
            if r.get("style_code") is not None and str(r.get("style_code") or "").strip() != ""
        }
    )


def load_distinct_color_codes(brand_id: str, style_code_val: str) -> list[str]:
    stc = (style_code_val or "").strip()
    if not stc:
        return []
    rows = (
        sb.table("fo_products")
        .select("color_code")
        .eq("brand_id", brand_id)
        .eq("style_code", stc)
        .execute()
        .data
        or []
    )
    return sorted(
        {
            str(r["color_code"])
            for r in rows
            if r.get("color_code") is not None and str(r.get("color_code") or "").strip() != ""
        }
    )


@st.dialog("브랜드 선택")
def fo_brand_pick_dialog() -> None:
    hits_d: list[dict] = st.session_state.get("fo_brand_hits") or []
    if not hits_d:
        st.warning("검색 결과가 없습니다. 먼저 검색하세요.")
        if st.button("닫기", key="fo_brand_dlg_close_empty"):
            st.session_state.pop(K_BRAND_DLG_OPEN, None)
            st.rerun()
        return
    n = len(hits_d)
    page_size = _brand_page_size(n)
    page = int(st.session_state.get(K_BRAND_DLG_PAGE, 0))
    start = page * page_size
    chunk = hits_d[start : start + page_size]
    cols_n = _brand_grid_cols(page_size)
    n_rows = (page_size + cols_n - 1) // cols_n
    idx = 0
    for _r in range(n_rows):
        cols = st.columns(cols_n)
        for c in range(cols_n):
            with cols[c]:
                if idx < len(chunk):
                    h = chunk[idx]
                    nm = str(h.get("name") or "")
                    if st.button(nm, key=f"fo_br_dlg_{start}_{idx}", use_container_width=True):
                        st.session_state["fo_brand_id"] = str(h["id"])
                        st.session_state["fo_brand_name"] = nm
                        st.session_state["fo_brand_search"] = nm
                        st.session_state.pop(K_BRAND_NO_HITS_TERM, None)
                        st.session_state["fo_style"] = ""
                        st.session_state["fo_color"] = ""
                        st.session_state.pop(K_BRAND_DLG_OPEN, None)
                        st.session_state.pop(K_BRAND_DLG_PAGE, None)
                        st.rerun()
                else:
                    st.empty()
                idx += 1
    nav_l, nav_r = st.columns([4, 1])
    with nav_l:
        if st.button("닫기", key="fo_brand_dlg_close"):
            st.session_state.pop(K_BRAND_DLG_OPEN, None)
            st.rerun()
    with nav_r:
        if start + page_size < n:
            if st.button("다음", key="fo_brand_dlg_next"):
                st.session_state[K_BRAND_DLG_PAGE] = page + 1
                st.rerun()


@st.dialog("제품번호 선택")
def fo_style_pick_dialog() -> None:
    bid_s = st.session_state.get("fo_brand_id")
    if not bid_s:
        st.error("브랜드를 먼저 선택하세요.")
        if st.button("닫기", key="fo_style_dlg_close_err"):
            st.session_state.pop(K_STYLE_DLG_OPEN, None)
            st.rerun()
        return
    styles = load_distinct_style_codes(str(bid_s))
    if not styles:
        st.info("이 브랜드에 등록된 제품번호가 없습니다. 상품을 먼저 등록하세요.")
        if st.button("닫기", key="fo_style_dlg_close_none"):
            st.session_state.pop(K_STYLE_DLG_OPEN, None)
            st.rerun()
        return
    page_sz = 15
    pg = int(st.session_state.get(K_STYLE_DLG_PAGE, 0))
    st0 = pg * page_sz
    page_styles = styles[st0 : st0 + page_sz]
    st.caption(f"총 **{len(styles)}**개 · {pg + 1}페이지")
    n_cols = 5
    for row_i in range(0, len(page_styles), n_cols):
        row_items = page_styles[row_i : row_i + n_cols]
        cols = st.columns(n_cols)
        for j, sc in enumerate(row_items):
            with cols[j]:
                if st.button(sc, key=f"fo_st_dlg_{st0}_{row_i}_{j}", use_container_width=True):
                    st.session_state["fo_style"] = sc
                    st.session_state["fo_color"] = ""
                    st.session_state.pop(K_STYLE_DLG_OPEN, None)
                    st.session_state.pop(K_STYLE_DLG_PAGE, None)
                    st.rerun()
    nav_sl, nav_sr = st.columns([4, 1])
    with nav_sl:
        if st.button("닫기", key="fo_style_dlg_close"):
            st.session_state.pop(K_STYLE_DLG_OPEN, None)
            st.rerun()
    with nav_sr:
        if st0 + page_sz < len(styles):
            if st.button("다음", key="fo_style_dlg_next"):
                st.session_state[K_STYLE_DLG_PAGE] = pg + 1
                st.rerun()


@st.dialog("칼라 선택")
def fo_color_pick_dialog() -> None:
    bid_c = st.session_state.get("fo_brand_id")
    stv = (st.session_state.get("fo_style") or "").strip()
    if not bid_c or not stv:
        st.error("브랜드와 제품번호를 먼저 선택하세요.")
        if st.button("닫기", key="fo_color_dlg_close_err"):
            st.session_state.pop(K_COLOR_DLG_OPEN, None)
            st.rerun()
        return
    colors = load_distinct_color_codes(str(bid_c), stv)
    if not colors:
        st.info("해당 제품번호에 등록된 칼라가 없습니다.")
        if st.button("닫기", key="fo_color_dlg_close_none"):
            st.session_state.pop(K_COLOR_DLG_OPEN, None)
            st.rerun()
        return
    page_sz = 6
    pg = int(st.session_state.get(K_COLOR_DLG_PAGE, 0))
    c0 = pg * page_sz
    page_colors = colors[c0 : c0 + page_sz]
    st.caption(f"총 **{len(colors)}**개 · {pg + 1}페이지")
    n_cols = 3
    for row_i in range(0, len(page_colors), n_cols):
        row_items = page_colors[row_i : row_i + n_cols]
        cols = st.columns(n_cols)
        for j, cc in enumerate(row_items):
            with cols[j]:
                if st.button(cc, key=f"fo_co_dlg_{c0}_{row_i}_{j}", use_container_width=True):
                    st.session_state["fo_color"] = cc
                    st.session_state.pop(K_COLOR_DLG_OPEN, None)
                    st.session_state.pop(K_COLOR_DLG_PAGE, None)
                    st.rerun()
    nav_cl, nav_cr = st.columns([4, 1])
    with nav_cl:
        if st.button("닫기", key="fo_color_dlg_close"):
            st.session_state.pop(K_COLOR_DLG_OPEN, None)
            st.rerun()
    with nav_cr:
        if c0 + page_sz < len(colors):
            if st.button("다음", key="fo_color_dlg_next"):
                st.session_state[K_COLOR_DLG_PAGE] = pg + 1
                st.rerun()


# ── 카테고리 추가 popover ─────────────────
def render_add_category_popover() -> None:
    with st.popover("➕ 카테고리 추가", help="소재 메뉴에 항목을 추가합니다"):
        st.caption("이름이 같으면 저장되지 않습니다.")
        with st.form("fo_add_category_form"):
            nl = st.text_input("새 카테고리명", placeholder="예: 나일론")
            mx = st.number_input("정렬 순서(작을수록 위)", min_value=0, value=200, step=10)
            sub = st.form_submit_button("저장")
            if sub and (nl or "").strip():
                try:
                    sb.table("fo_product_categories").insert(
                        {"label": nl.strip(), "sort_order": int(mx)}
                    ).execute()
                    st.success("추가되었습니다.")
                    st.rerun()
                except Exception as ex:
                    err = str(ex).lower()
                    if "duplicate" in err or "unique" in err or "23505" in str(ex):
                        st.error("이미 같은 이름의 카테고리가 있습니다.")
                    else:
                        st.error(f"추가 실패: {ex}")


cat_labels = load_category_labels()
if not cat_labels:
    st.warning("카테고리가 비어 있습니다. `20260424` 마이그레이션을 적용했는지 확인하세요.")

# 리스트에서 [수정] 클릭 시, 다음 rerun 초기에 폼에 안전하게 적용
pending_row = st.session_state.pop(K_PENDING_EDIT_ROW, None)
if isinstance(pending_row, dict) and pending_row.get("id"):
    apply_product_to_form(
        pending_row,
        str(pending_row.get("brand_name") or ""),
        cat_labels,
    )

edit_id = st.session_state.get(K_EDIT_ID)
edit_code = st.session_state.get(K_EDIT_CODE) or ""
if edit_id:
    st.info(f"**수정 모드** · 상품코드 유지: `{edit_code}`")
    if st.button("신규 등록으로 전환", key="fo_clear_edit"):
        st.session_state[K_PICK_APPLIED] = "(신규 등록)"
        clear_edit_and_form_defaults(cat_labels)
        st.session_state["fo_pick_product_label"] = "(신규 등록)"
        st.rerun()

st.session_state.setdefault("fo_style", "")
st.session_state.setdefault("fo_color", "")

row1_l, row1_r = st.columns(2)
with row1_l:
    line_choice = st.radio(
        "상품 라인 (코드 접두)",
        options=[LINE_FRM, LINE_SUN],
        format_func=lambda x: f"{LINE_LABELS[x]} ({x})",
        horizontal=True,
        key="fo_pr_line",
    )
    cat_opts = category_select_options(cat_labels)
    category_label = st.selectbox(
        "카테고리(소재)",
        options=cat_opts,
        key="fo_pr_category",
    )
    render_add_category_popover()

with row1_r:
    search_col, style_col, color_col = st.columns(3)
    with search_col:
        b_search = st.text_input("브랜드", key="fo_brand_search")
        s1, s2 = st.columns(2)
        with s1:
            do_brand_search = st.button("검색", key="fo_brand_search_btn")
        with s2:
            _hits_btn = st.session_state.get("fo_brand_hits") or []
            if st.button("브랜드 선택", key="fo_brand_open_dlg", disabled=len(_hits_btn) == 0):
                st.session_state[K_BRAND_DLG_OPEN] = True
                st.session_state[K_BRAND_DLG_PAGE] = 0
                st.rerun()

    if do_brand_search:
        hits_found = search_brands(b_search)
        st.session_state.fo_brand_hits = hits_found
        if hits_found:
            st.session_state.pop(K_BRAND_NO_HITS_TERM, None)
        else:
            st.session_state[K_BRAND_NO_HITS_TERM] = (b_search or "").strip()

    hits: list[dict] = st.session_state.get("fo_brand_hits") or []
    if hits:
        st.caption(f"검색 결과 **{len(hits)}**건 — 「브랜드 선택」에서 고릅니다.")
    else:
        no_hits_term = str(st.session_state.get(K_BRAND_NO_HITS_TERM) or "").strip()
        current_term = (b_search or "").strip()
        if no_hits_term and current_term == no_hits_term and not st.session_state.get("fo_brand_id"):
            st.warning(f"`{no_hits_term}` 와(과) 유사한 브랜드를 찾지 못했습니다.")
            with st.popover("신규 브랜드 생성", help="검색 결과가 없을 때 새 브랜드를 등록합니다"):
                st.caption("브랜드명을 입력하고 저장하면 즉시 선택됩니다.")
                new_brand_name = st.text_input(
                    "브랜드명",
                    key="fo_new_brand",
                )
                if st.button("저장", key="fo_new_brand_save") and (new_brand_name or "").strip():
                    try:
                        row_b = insert_brand(new_brand_name)
                        if row_b:
                            st.session_state.fo_brand_id = str(row_b["id"])
                            st.session_state.fo_brand_name = str(row_b["name"])
                            st.session_state.fo_brand_hits = []
                            st.session_state.pop(K_BRAND_NO_HITS_TERM, None)
                            st.success("저장 후 선택되었습니다.")
                            st.rerun()
                    except Exception as ex:
                        err = str(ex).lower()
                        if "duplicate" in err or "unique" in err or "23505" in str(ex):
                            st.error("같은 이름의 브랜드가 이미 있습니다. 검색 결과에서 선택하세요.")
                        else:
                            st.error(f"실패: {ex}")
        elif no_hits_term and current_term != no_hits_term:
            st.session_state.pop(K_BRAND_NO_HITS_TERM, None)

    with style_col:
        st.text_input("제품번호", key="fo_style", disabled=True)
        _bid_for_style = st.session_state.get("fo_brand_id")
        if st.button("제품번호 선택", key="fo_style_open_dlg", disabled=not _bid_for_style):
            st.session_state[K_STYLE_DLG_OPEN] = True
            st.session_state[K_STYLE_DLG_PAGE] = 0
            st.rerun()
    with color_col:
        st.text_input("칼라", key="fo_color", disabled=True)
        _bid_for_color = st.session_state.get("fo_brand_id")
        _style_for_color = (st.session_state.get("fo_style") or "").strip()
        if st.button("칼라 선택", key="fo_color_open_dlg", disabled=not (_bid_for_color and _style_for_color)):
            st.session_state[K_COLOR_DLG_OPEN] = True
            st.session_state[K_COLOR_DLG_PAGE] = 0
            st.rerun()


if st.session_state.get(K_BRAND_DLG_OPEN):
    fo_brand_pick_dialog()
if st.session_state.get(K_STYLE_DLG_OPEN):
    fo_style_pick_dialog()
if st.session_state.get(K_COLOR_DLG_OPEN):
    fo_color_pick_dialog()


style_code = str(st.session_state.get("fo_style") or "")
color_code = str(st.session_state.get("fo_color") or "")

price_row_l, price_row_r = st.columns(2)
with price_row_l:
    cost_price = st.number_input("매입가(원)", min_value=0, value=0, step=1000, key="fo_cost")
with price_row_r:
    price2, price3 = st.columns(2)
    with price2:
        suggested_retail = st.number_input("권장소비자가(원)", min_value=0, value=0, step=1000, key="fo_sug")
    with price3:
        sale_price = st.number_input("실판매가(원)", min_value=0, value=0, step=1000, key="fo_sale")

bid = st.session_state.get("fo_brand_id")
bname = st.session_state.get("fo_brand_name") or ""

line_norm = normalize_product_line(line_choice)
preview_base = ""
if bname and (style_code or "").strip() and (color_code or "").strip():
    preview_base = build_product_code_base(line_norm, bname, style_code, color_code)
    if edit_id and edit_code:
        preview_final = edit_code
    else:
        preview_final = allocate_unique_product_code(sb, preview_base)
    disp = display_name_three_part(bname, style_code, color_code)

    st.markdown("##### 미리보기")
    st.caption(f"표시 상품명: `{disp}`")
    if edit_id:
        st.caption("수정 모드에서는 **상품코드·바코드**는 유지됩니다. (브랜드/품번/컬러/라인 변경 시 다른 상품과 겹치면 저장이 거절될 수 있습니다.)")
    st.code(preview_final, language="text")

    qr_b = product_code_to_qr_png(preview_final)
    c128_b = product_code_to_code128_png(preview_final)
    im1, im2 = st.columns(2)
    with im1:
        st.caption("QR (상품코드)")
        if qr_b:
            st.image(qr_b, width=220)
        else:
            st.caption("`pip install qrcode[pil]` 필요")
    with im2:
        st.caption("Code128 (1D)")
        if c128_b:
            st.image(c128_b, use_container_width=True)
        else:
            st.caption("`pip install python-barcode[images]` 필요")

    existing = find_product_row(bid, style_code, color_code, line_norm) if bid else None
    if existing and edit_id and str(existing["id"]) == str(edit_id):
        existing = None

    if existing and not edit_id:
        st.warning(
            f"동일 조합이 이미 있습니다. 상품코드 **{existing.get('product_code')}** — "
            "위 목록에서 해당 상품을 선택해 수정하거나, 가격만 아래에서 갱신하세요."
        )
        if st.button("기존 상품 — 가격·카테고리만 저장", key="fo_update_prices"):
            try:
                sb.table("fo_products").update(
                    {
                        "cost_price": int(cost_price),
                        "suggested_retail": int(suggested_retail),
                        "sale_price": int(sale_price),
                        "category": (category_label or "").strip(),
                    }
                ).eq("id", existing["id"]).execute()
                st.success("가격·카테고리를 갱신했습니다.")
                st.rerun()
            except Exception as ex:
                st.error(f"갱신 실패: {ex}")
    else:
        save_label = "기존상품 수정등록" if edit_id else "저장 (신규 등록)"
        if st.button(save_label, type="primary", key="fo_save_product"):
            if not bid:
                st.error("브랜드를 먼저 선택하세요.")
            elif not (category_label or "").strip() or category_label == "(없음)":
                st.error("카테고리를 선택하세요.")
            elif edit_id:
                try:
                    sb.table("fo_products").update(
                        {
                            "brand_id": bid,
                            "style_code": (style_code or "").strip(),
                            "color_code": (color_code or "").strip(),
                            "product_line": line_norm,
                            "category": (category_label or "").strip(),
                            "display_name": disp,
                            "cost_price": int(cost_price),
                            "suggested_retail": int(suggested_retail),
                            "sale_price": int(sale_price),
                        }
                    ).eq("id", edit_id).execute()
                    st.success("상품이 수정되었습니다.")
                    st.rerun()
                except Exception as ex:
                    err = str(ex).lower()
                    if "duplicate" in err or "unique" in err or "23505" in err:
                        st.error("다른 상품과 브랜드·제품번호·컬러·라인이 겹칩니다. 조합을 바꾸세요.")
                    else:
                        st.error(f"수정 실패: {ex}")
            else:
                code = allocate_unique_product_code(sb, preview_base)
                row_ins = {
                    "product_code": code,
                    "barcode": code,
                    "display_name": disp,
                    "category": (category_label or "").strip(),
                    "brand_id": bid,
                    "style_code": (style_code or "").strip(),
                    "color_code": (color_code or "").strip(),
                    "product_line": line_norm,
                    "cost_price": int(cost_price),
                    "suggested_retail": int(suggested_retail),
                    "sale_price": int(sale_price),
                }
                try:
                    sb.table("fo_products").insert(row_ins).execute()
                    st.success(f"저장되었습니다. 상품코드/바코드: **{code}**")
                    for _k in ("fo_style", "fo_color"):
                        st.session_state.pop(_k, None)
                    st.rerun()
                except Exception as ex:
                    err = str(ex)
                    if "duplicate" in err.lower() or "unique" in err.lower() or "23505" in err:
                        st.error("중복 키(같은 브랜드·제품·컬러·라인)입니다.")
                    else:
                        st.error(f"저장 실패: {ex}")
else:
    pass

st.divider()
st.markdown("##### 등록된 상품")
flt = st.text_input("코드·바코드·상품명·카테고리 검색", key="fo_prod_list_flt", placeholder="일부만 입력")
q = (flt or "").strip().lower()

rows = (
    sb.table("fo_products")
    .select(
        "id, product_code, barcode, display_name, category, product_line, style_code, color_code, "
        "brand_id, cost_price, suggested_retail, sale_price, status, created_at"
    )
    .order("created_at", desc=True)
    .limit(500)
    .execute()
    .data
    or []
)

bids = {str(r["brand_id"]) for r in rows if r.get("brand_id")}
brand_map: dict[str, str] = {}
if bids:
    br = sb.table("fo_brands").select("id, name").in_("id", list(bids)).execute().data or []
    brand_map = {str(x["id"]): str(x["name"]) for x in br}

for r in rows:
    r["brand_name"] = brand_map.get(str(r.get("brand_id") or ""), "")

if q:
    rows = [
        r
        for r in rows
        if q in str(r.get("product_code") or "").lower()
        or q in str(r.get("barcode") or "").lower()
        or q in str(r.get("display_name") or "").lower()
        or q in str(r.get("category") or "").lower()
        or q in str(r.get("brand_name") or "").lower()
        or q in str(r.get("style_code") or "").lower()
        or q in str(r.get("color_code") or "").lower()
        or q in str(r.get("product_line") or "").lower()
    ]

show_cols = [
    "product_code",
    "product_line",
    "brand_name",
    "style_code",
    "color_code",
    "display_name",
    "category",
    "cost_price",
    "suggested_retail",
    "sale_price",
    "barcode",
    "status",
    "created_at",
]
if rows:
    slim = [{k: r.get(k) for k in show_cols} for r in rows]
    action_placeholder = st.empty()
    st.caption(f"표시 **{len(slim)}**건 (최신순, 상위 500) — 리스트 체크 후 우측 상단 `[수정]`으로 입력단에 반영됩니다.")
    table_event = st.dataframe(
        slim,
        use_container_width=True,
        hide_index=True,
        height=min(520, 38 * (len(slim) + 2)),
        on_select="rerun",
        selection_mode="single-row",
        key="fo_products_table",
    )
    selected_idx = None
    if table_event and table_event.selection and table_event.selection.rows:
        selected_idx = int(table_event.selection.rows[0])
    selected_row = rows[selected_idx] if selected_idx is not None and 0 <= selected_idx < len(rows) else None

    with action_placeholder.container():
        _, right_col = st.columns([6, 1])
        with right_col:
            if st.button("수정", key="fo_apply_edit_btn", disabled=(selected_row is None)):
                if selected_row and selected_row.get("id"):
                    st.session_state[K_PENDING_EDIT_ROW] = selected_row
                    st.rerun()
else:
    if q:
        st.info("검색 조건에 맞는 상품이 없습니다.")
    else:
        st.info("등록된 상품이 없습니다.")
