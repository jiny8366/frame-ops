"""지점 등록 점검 + 지점 매니저·판매사 계정(비밀번호)·역할(권한) 설정."""

from __future__ import annotations

import os
import sys
from pathlib import Path

import pandas as pd
import streamlit as st

_ROOT = Path(__file__).resolve().parents[1]
if str(_ROOT) not in sys.path:
    sys.path.insert(0, str(_ROOT))

st.set_page_config(
    page_title="지점·매니저·판매사 — FRAME OPS",
    layout="wide",
    initial_sidebar_state="collapsed",
)

from lib.service_portal import render_frame_ops_chrome, fo_page_link  # noqa: E402

render_frame_ops_chrome()

from lib.schema_guard import stop_if_staff_rbac_migration_missing  # noqa: E402
from lib.staff_rbac import (  # noqa: E402
    create_staff_user,
    is_configured_service_role_key,
    list_profiles_for_store,
    list_staff_roles,
    replace_store_scopes,
    set_user_password,
    update_staff_profile_fields,
)
from lib.streamlit_fo_stores import load_stores_with_business_fields_or_halt  # noqa: E402
from lib.store_registration import (  # noqa: E402
    store_registration_checklist,
    store_registration_fully_ok,
    store_registration_mandatory_ok,
)
from lib.supabase_client import get_supabase  # noqa: E402

_STORE_ROLES = ("store_manager", "store_salesperson", "store_staff")

st.title("지점 · 매니저 · 판매사")
st.caption(
    "지점이 **등록·정비**된 뒤, 해당 지점만 접근하도록 **매니저**·**판매사**(및 스태프) 계정을 만듭니다. "
    "역할·지점 범위는 DB(`fo_staff_*`)에 저장되며, 다른 화면 강제는 추후 로그인 연동 시 적용됩니다."
)

try:
    sb = get_supabase()
except RuntimeError as e:
    st.error(str(e))
    st.stop()

stop_if_staff_rbac_migration_missing(sb)

can_admin = is_configured_service_role_key()
if not can_admin:
    st.error(
        "이 페이지의 **계정 생성·비밀번호 설정**은 `SUPABASE_SERVICE_ROLE_KEY`(서비스 롤)가 필요합니다."
    )
    st.stop()


def _hq_pin() -> str:
    v = (os.environ.get("FRAME_OPS_HQ_PIN") or "").strip()
    if v:
        return v
    try:
        sec = getattr(st, "secrets", None)
        if sec is not None and "FRAME_OPS_HQ_PIN" in sec:
            return str(sec["FRAME_OPS_HQ_PIN"]).strip()
    except Exception:
        pass
    return ""


_pin = _hq_pin()
if _pin:
    if not st.session_state.get("fo_store_staff_pin_ok"):
        st.info("**계정·비밀번호·권한** 변경 전 PIN을 입력하세요. (`FRAME_OPS_HQ_PIN`)")
        entered = st.text_input("PIN", type="password", key="fo_sp_pin_field")
        if st.button("확인", key="fo_sp_pin_btn"):
            if entered == _pin:
                st.session_state.fo_store_staff_pin_ok = True
                st.rerun()
            else:
                st.error("PIN이 일치하지 않습니다.")
        st.stop()
else:
    st.caption("PIN 미설정(로컬). 배포 시 `FRAME_OPS_HQ_PIN` 설정을 권장합니다.")

stores = [s for s in load_stores_with_business_fields_or_halt(sb) if s.get("active", True)]
if not stores:
    st.warning("활성 지점이 없습니다. **홈**에서 지점을 먼저 등록하세요.")
    fo_page_link("pages/90_admin_portal.py", label="← 홈")
    st.stop()

store_labels = [f"{s['store_code']} — {s['name']}" for s in stores]
ix = st.selectbox("지점 선택", range(len(stores)), format_func=lambda i: store_labels[i], key="fo_sp_store")
sel = stores[ix]
sid = str(sel["id"])

st.subheader("1. 지점 등록 점검")
chk = store_registration_checklist(sel)
df_chk = pd.DataFrame(
    [
        {
            "항목": c["label"],
            "필수": "예" if c["mandatory"] else "권장",
            "상태": "✓" if c["ok"] else "보완",
            "내용": c["value"],
        }
        for c in chk
    ]
)
st.dataframe(df_chk, use_container_width=True, hide_index=True)
if not store_registration_mandatory_ok(sel):
    st.warning("**지점 코드·상호**는 필수입니다. 홈의 지점 수정에서 채워 주세요.")
elif not store_registration_fully_ok(sel):
    st.info("사업자번호·주소·전화는 주문서 PDF 등에 쓰입니다. 가능하면 홈에서 보완하세요.")

role_rows = list_staff_roles(sb)
role_labels = {r["code"]: r["label"] for r in role_rows}
codes_avail = {r["code"] for r in role_rows}
for need in ("store_manager", "store_salesperson"):
    if need not in codes_avail:
        st.warning(
            f"역할 `{need}` 가 DB에 없습니다. "
            "`supabase/migrations/20260421_frame_ops_store_salesperson_role.sql` "
            "(및 `20260420_…staff_rbac.sql`) 적용 여부를 확인하세요."
        )

store_role_options = [c for c in _STORE_ROLES if c in codes_avail]
if not store_role_options:
    st.error("지점용 역할(store_manager 등)이 없습니다. 마이그레이션을 확인하세요.")
    st.stop()

st.divider()
st.subheader("2. 매니저 · 판매사 계정 만들기")
st.caption("생성되는 계정은 **선택한 지점 한 곳**만 `fo_staff_store_scopes`에 연결됩니다.")

c_m, c_s = st.columns(2)
with c_m:
    st.markdown("**지점 매니저** (`store_manager`)")
    with st.form("fo_mgr_create"):
        m_em = st.text_input("이메일", key="fo_m_em")
        m_pw = st.text_input("비밀번호", type="password", key="fo_m_pw")
        m_dn = st.text_input("이름", key="fo_m_dn")
        if st.form_submit_button("매니저 계정 생성"):
            if "store_manager" not in codes_avail:
                st.error("역할 store_manager 가 없습니다. 마이그레이션을 확인하세요.")
            else:
                try:
                    uid = create_staff_user(
                        sb,
                        email=m_em,
                        password=m_pw,
                        display_name=m_dn,
                        role_code="store_manager",
                        store_ids=[sid],
                    )
                    st.success(f"생성됨 · user_id={uid}")
                    st.rerun()
                except Exception as ex:
                    st.error(str(ex))

with c_s:
    st.markdown("**지점 판매사** (`store_salesperson`)")
    if "store_salesperson" not in codes_avail:
        st.caption("위 마이그레이션 적용 후 사용하세요.")
    with st.form("fo_sal_create"):
        s_em = st.text_input("이메일", key="fo_s_em")
        s_pw = st.text_input("비밀번호", type="password", key="fo_s_pw")
        s_dn = st.text_input("이름", key="fo_s_dn")
        if st.form_submit_button("판매사 계정 생성"):
            if "store_salesperson" not in codes_avail:
                st.error("역할 store_salesperson 이 없습니다.")
            else:
                try:
                    uid = create_staff_user(
                        sb,
                        email=s_em,
                        password=s_pw,
                        display_name=s_dn,
                        role_code="store_salesperson",
                        store_ids=[sid],
                    )
                    st.success(f"생성됨 · user_id={uid}")
                    st.rerun()
                except Exception as ex:
                    st.error(str(ex))

st.divider()
st.subheader("3. 이 지점 소속 — 비밀번호 · 권한(역할)")
profiles = list_profiles_for_store(sb, sid)
if not profiles:
    st.info("이 지점에 연결된 스태프가 없습니다. 위에서 계정을 만드세요.")
else:
    rows = []
    for p in profiles:
        rc = str(p.get("role_code") or "")
        rows.append(
            {
                "이메일": p.get("email") or "",
                "이름": p.get("display_name") or "",
                "역할": f"{rc} ({role_labels.get(rc, rc)})",
                "활성": p.get("active"),
                "user_id": str(p["user_id"]),
            }
        )
    st.dataframe(pd.DataFrame(rows), use_container_width=True, hide_index=True)

    pick_labels = [f"{r['이메일'] or r['이름'] or r['user_id'][:8]} — {r['역할']}" for r in rows]
    pick = st.selectbox("계정 선택", range(len(rows)), format_func=lambda i: pick_labels[i], key="fo_sp_pick")
    pr = profiles[pick]
    uid = str(pr["user_id"])

    npw = st.text_input("새 비밀번호(변경 시만 입력)", type="password", key="fo_sp_newpw")
    if st.button("비밀번호 적용") and npw.strip():
        try:
            set_user_password(sb, uid, npw)
            st.success("비밀번호를 변경했습니다.")
        except Exception as ex:
            st.error(str(ex))

    _rc = pr.get("role_code")
    _ri = store_role_options.index(_rc) if _rc in store_role_options else 0
    new_role = st.selectbox(
        "역할(권한)",
        store_role_options,
        index=_ri,
        format_func=lambda c: f"{c} — {role_labels.get(c, c)}",
        key="fo_sp_role",
    )
    new_active = st.checkbox("활성", value=bool(pr.get("active", True)), key="fo_sp_act")
    if st.button("역할·활성 저장"):
        try:
            update_staff_profile_fields(
                sb, uid, role_code=new_role, active=new_active
            )
            replace_store_scopes(sb, uid, [sid])
            st.success("저장했습니다. (지점 범위는 이 지점만 유지합니다.)")
            st.rerun()
        except Exception as ex:
            st.error(str(ex))

fo_page_link("pages/90_admin_portal.py", label="← 홈")
fo_page_link("pages/14_본사·스태프·권한.py", label="본사·스태프·권한(전체)")
