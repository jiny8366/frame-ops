"""매입처 관리 — fo_suppliers 등록·수정·비활성."""

from __future__ import annotations

import re
import sys
from pathlib import Path

import pandas as pd
import streamlit as st

_ROOT = Path(__file__).resolve().parents[1]
if str(_ROOT) not in sys.path:
    sys.path.insert(0, str(_ROOT))

st.set_page_config(
    page_title="매입처 관리 — FRAME OPS",
    layout="wide",
    initial_sidebar_state="collapsed",
)

from lib.service_portal import render_frame_ops_chrome, fo_page_link  # noqa: E402

render_frame_ops_chrome()

from lib.supabase_client import get_supabase  # noqa: E402

st.title("매입처 관리")
st.caption(
    "매입처명/코드/사업자등록번호/주소/연락처/취급브랜드/메모를 관리합니다. "
    "상품등록 화면에서는 매입처를 직접 입력하지 않습니다."
)
fo_page_link("pages/01_상품등록.py", label="→ 상품 등록")

try:
    sb = get_supabase()
except RuntimeError as e:
    st.error(str(e))
    st.stop()

try:
    brands = (
        sb.table("fo_brands")
        .select("id,name")
        .order("name")
        .limit(1000)
        .execute()
        .data
        or []
    )
except Exception as ex:
    st.error(f"브랜드 조회 실패: {ex}")
    st.stop()

brand_by_id = {str(b["id"]): str(b.get("name") or "") for b in brands}
brand_ids_all = list(brand_by_id.keys())


def _fmt_biz_no(v: str) -> str:
    d = re.sub(r"\D", "", (v or ""))
    if len(d) == 10:
        return f"{d[:3]}-{d[3:5]}-{d[5:]}"
    return (v or "").strip()


def _is_schema_missing(ex: BaseException) -> bool:
    s = str(ex).lower()
    return ("does not exist" in s and ("column" in s or "relation" in s)) or "pgrst205" in s


supplier_ext_ok = True
supplier_brand_link_ok = True
supplier_ext_err = ""
supplier_brand_link_err = ""

try:
    rows = (
        sb.table("fo_suppliers")
        .select("id,name,supplier_code,business_number,address,contact,memo,active,created_at")
        .order("created_at", desc=True)
        .limit(500)
        .execute()
        .data
        or []
    )
except Exception as ex:
    if not _is_schema_missing(ex):
        st.error(f"매입처 조회 실패: {ex}")
        st.stop()
    supplier_ext_ok = False
    supplier_ext_err = str(ex)
    rows = (
        sb.table("fo_suppliers")
        .select("id,name,supplier_code,created_at")
        .order("created_at", desc=True)
        .limit(500)
        .execute()
        .data
        or []
    )

supplier_brand_map: dict[str, list[str]] = {}
if supplier_ext_ok:
    try:
        sbr = sb.table("fo_supplier_brands").select("supplier_id,brand_id").limit(5000).execute().data or []
        for r in sbr:
            sid = str(r.get("supplier_id") or "")
            bid = str(r.get("brand_id") or "")
            if sid and bid:
                supplier_brand_map.setdefault(sid, []).append(bid)
    except Exception as ex:
        if not _is_schema_missing(ex):
            st.error(f"매입처-브랜드 조회 실패: {ex}")
            st.stop()
        supplier_brand_link_ok = False
        supplier_brand_link_err = str(ex)

if not supplier_ext_ok or not supplier_brand_link_ok:
    st.warning(
        "매입처 확장 필드/브랜드 연결 스키마가 아직 없습니다. "
        "아래 파일을 Supabase SQL Editor에서 실행한 뒤 새로고침하세요:\n"
        "`supabase/migrations/20260426_frame_ops_suppliers_extended.sql`"
    )
    with st.expander("진단 정보", expanded=False):
        st.code(
            f"SUPPLIER_EXT_OK={supplier_ext_ok}\n"
            f"SUPPLIER_BRAND_LINK_OK={supplier_brand_link_ok}\n"
            f"SUPPLIER_EXT_ERR={supplier_ext_err or '-'}\n"
            f"SUPPLIER_BRAND_LINK_ERR={supplier_brand_link_err or '-'}",
            language="text",
        )
        st.caption(
            "로컬 일괄 적용 시: `scripts/apply_frame_ops_migrations.sh` "
            "(20260426 포함) 실행 후 앱을 새로고침하세요."
        )

with st.form("fo_add_supplier"):
    st.markdown("##### 신규 매입처")
    c1, c2 = st.columns([2, 1])
    with c1:
        name = st.text_input("매입처명", placeholder="예: 안목")
    with c2:
        code = st.text_input("매입처 코드(선택)", placeholder="예: ANMOK")
    if supplier_ext_ok:
        c3, c4 = st.columns(2)
        with c3:
            biz_no = st.text_input("사업자등록번호", placeholder="예: 123-45-67890")
            contact = st.text_input("연락처", placeholder="예: 02-1234-5678 / 010-1234-5678")
        with c4:
            address = st.text_input("주소", placeholder="예: 서울시 강남구 ...")
            handle_brand_ids = st.multiselect(
                "취급브랜드",
                options=brand_ids_all,
                format_func=lambda i: brand_by_id.get(i, i),
            )
        memo = st.text_area("메모", placeholder="거래 조건, 결제일, 담당자 정보 등")
        active = st.checkbox("사용", value=True)
    else:
        biz_no = ""
        address = ""
        contact = ""
        handle_brand_ids = []
        memo = ""
        active = True
    add = st.form_submit_button("저장", type="primary")

if add and (name or "").strip():
    try:
        row = {
            "name": name.strip(),
            "supplier_code": (code or "").strip() or None,
        }
        if supplier_ext_ok:
            row.update(
                {
                    "business_number": _fmt_biz_no(biz_no),
                    "address": (address or "").strip() or None,
                    "contact": (contact or "").strip() or None,
                    "memo": (memo or "").strip() or None,
                    "active": bool(active),
                }
            )
        ins = sb.table("fo_suppliers").insert(row).execute()
        new_id = str((ins.data or [{}])[0].get("id") or "")
        if supplier_ext_ok and supplier_brand_link_ok and new_id and handle_brand_ids:
            sb.table("fo_supplier_brands").insert(
                [{"supplier_id": new_id, "brand_id": bid} for bid in handle_brand_ids if bid in brand_by_id]
            ).execute()
        st.success("매입처가 등록되었습니다.")
        st.rerun()
    except Exception as ex:
        msg = str(ex).lower()
        if "duplicate" in msg or "unique" in msg or "23505" in msg:
            st.error("같은 이름/코드의 매입처가 이미 있습니다.")
        else:
            st.error(f"등록 실패: {ex}")

st.divider()

if not rows:
    st.info("등록된 매입처가 없습니다.")
else:
    # ── 매입처 정보 수정 ────────────────────────────────────────
    st.markdown("##### 매입처 정보 수정")
    opts = [f"{r['name']} ({r.get('supplier_code') or '-'})" for r in rows]
    sel_col, btn_col = st.columns([4, 1])
    with sel_col:
        picked = st.selectbox("대상 매입처", opts, key="fo_sup_pick", label_visibility="collapsed")
    with btn_col:
        load_clicked = st.button("불러오기", key="fo_sup_load", use_container_width=True)

    _K_EDIT_ID = "fo_sup_edit_id"

    if load_clicked:
        target = rows[opts.index(picked)]
        st.session_state[_K_EDIT_ID] = str(target["id"])

    edit_id = st.session_state.get(_K_EDIT_ID)
    target = next((r for r in rows if str(r["id"]) == edit_id), None) if edit_id else None

    if target is None:
        st.info("수정할 매입처를 선택한 뒤 **불러오기**를 눌러주세요.")
    else:
        st.caption(f"수정 대상: **{target.get('name')}** (`{target.get('supplier_code') or '-'}`)")
        with st.form("fo_update_supplier"):
            c1, c2 = st.columns([2, 1])
            with c1:
                new_name = st.text_input("매입처명", value=str(target.get("name") or ""))
            with c2:
                new_code = st.text_input("매입처 코드", value=str(target.get("supplier_code") or ""))
            if supplier_ext_ok:
                c3, c4 = st.columns(2)
                with c3:
                    new_biz_no = st.text_input("사업자등록번호", value=str(target.get("business_number") or ""))
                    new_contact = st.text_input("연락처", value=str(target.get("contact") or ""))
                with c4:
                    new_address = st.text_input("주소", value=str(target.get("address") or ""))
                    cur_brand_ids = [bid for bid in supplier_brand_map.get(str(target["id"]), []) if bid in brand_by_id]
                    new_brand_ids = st.multiselect(
                        "취급브랜드",
                        options=brand_ids_all,
                        default=cur_brand_ids,
                        format_func=lambda i: brand_by_id.get(i, i),
                    )
                new_memo = st.text_area("메모", value=str(target.get("memo") or ""))
                new_active = st.checkbox("사용", value=bool(target.get("active", True)))
            else:
                new_biz_no = ""
                new_address = ""
                new_contact = ""
                new_brand_ids = []
                new_memo = ""
                new_active = True
            upd = st.form_submit_button("수정 저장", type="primary")

        if upd and (new_name or "").strip():
            try:
                patch = {
                    "name": new_name.strip(),
                    "supplier_code": (new_code or "").strip() or None,
                }
                if supplier_ext_ok:
                    patch.update(
                        {
                            "business_number": _fmt_biz_no(new_biz_no),
                            "address": (new_address or "").strip() or None,
                            "contact": (new_contact or "").strip() or None,
                            "memo": (new_memo or "").strip() or None,
                            "active": bool(new_active),
                        }
                    )
                sb.table("fo_suppliers").update(patch).eq("id", target["id"]).execute()
                if supplier_ext_ok and supplier_brand_link_ok:
                    sb.table("fo_supplier_brands").delete().eq("supplier_id", target["id"]).execute()
                    if new_brand_ids:
                        sb.table("fo_supplier_brands").insert(
                            [{"supplier_id": target["id"], "brand_id": bid} for bid in new_brand_ids if bid in brand_by_id]
                        ).execute()
                st.session_state.pop(_K_EDIT_ID, None)
                st.success("수정되었습니다.")
                st.rerun()
            except Exception as ex:
                msg = str(ex).lower()
                if "duplicate" in msg or "unique" in msg or "23505" in msg:
                    st.error("같은 이름/코드의 매입처가 이미 있습니다.")
                else:
                    st.error(f"수정 실패: {ex}")

    # ── 등록된 매입처 리스트 (버튼 토글) ──────────────────────────
    st.divider()
    _K_LIST_OPEN = "fo_sup_list_open"
    if st.button(
        "등록된 매입처 리스트 닫기" if st.session_state.get(_K_LIST_OPEN) else "등록된 매입처 리스트 보기",
        key="fo_sup_list_toggle",
    ):
        st.session_state[_K_LIST_OPEN] = not st.session_state.get(_K_LIST_OPEN, False)
        st.rerun()

    if st.session_state.get(_K_LIST_OPEN):
        keyword = st.text_input("검색 (매입처명·코드·사업자번호·연락처)", key="fo_sup_kw")
        q = (keyword or "").strip().lower()
        filtered = rows
        if q:
            filtered = [
                r
                for r in rows
                if q in str(r.get("name") or "").lower()
                or q in str(r.get("supplier_code") or "").lower()
                or q in str(r.get("business_number") or "").lower()
                or q in str(r.get("contact") or "").lower()
            ]

        rows_out = []
        for r in filtered:
            sid = str(r["id"])
            row = dict(r)
            if supplier_ext_ok and supplier_brand_link_ok:
                bnames = [brand_by_id.get(bid, "") for bid in supplier_brand_map.get(sid, []) if brand_by_id.get(bid)]
                row["brands"] = ", ".join(bnames)
            row.pop("id", None)
            rows_out.append(row)
        st.dataframe(pd.DataFrame(rows_out), use_container_width=True, hide_index=True)
