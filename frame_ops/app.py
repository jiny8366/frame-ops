"""
FRAME OPS — 안경테 소매·재고·POS (GENIUS CRM / apps/my_crm/main.py 와 분리 실행)

실행: 프로젝트 루트에서
  ./run_frame_ops.sh
  또는  .venv/bin/python -m streamlit run frame_ops/app.py
"""

from __future__ import annotations

import sys
from pathlib import Path

import streamlit as st

_ROOT = Path(__file__).resolve().parent
if str(_ROOT) not in sys.path:
    sys.path.insert(0, str(_ROOT))

try:
    from lib.constants import get_data_entry_start_date
    from lib.seed_bukchon_nopublic import run_seed_bukchon_nopublic
    from lib.seed_demo import run_seed_demo
    from lib.streamlit_fo_stores import load_stores_with_business_fields_or_halt
    from lib.store_registration import store_registration_summary_label
    from lib.supabase_client import describe_database_connection, get_supabase
except ImportError:
    from frame_ops.lib.constants import get_data_entry_start_date
    from frame_ops.lib.seed_bukchon_nopublic import run_seed_bukchon_nopublic
    from frame_ops.lib.seed_demo import run_seed_demo
    from frame_ops.lib.streamlit_fo_stores import load_stores_with_business_fields_or_halt
    from frame_ops.lib.store_registration import store_registration_summary_label
    from frame_ops.lib.supabase_client import describe_database_connection, get_supabase

st.set_page_config(
    page_title="FRAME OPS",
    page_icon="🏬",
    layout="wide",
    initial_sidebar_state="collapsed",
)

# ── 시작 모드 자동 이동 (FRAME_OPS_DEFAULT_MODE 환경변수 또는 Streamlit Secrets) ──
import os as _os
_default_mode = (
    st.secrets.get("FRAME_OPS_DEFAULT_MODE", "")
    if hasattr(st, "secrets") else ""
) or _os.environ.get("FRAME_OPS_DEFAULT_MODE", "")
_mode_to_portal = {
    "hq": "pages/90_admin_portal.py",
    "hq_dashboard": "pages/91_hq_dashboard_portal.py",
    "sales": "pages/92_store_portal.py",
}
if _default_mode.strip() in _mode_to_portal and "fo_service_mode" not in st.session_state:
    st.switch_page(_mode_to_portal[_default_mode.strip()])

from lib.service_portal import render_frame_ops_chrome

render_frame_ops_chrome()

st.markdown(
    """
    <div style="margin-bottom:0.75rem;">
        <span style="font-size:1.35rem;font-weight:700;">FRAME OPS</span>
        <span style="color:#888;margin-left:8px;">안경테 소매 · 재고 · POS</span>
    </div>
    <p style="color:#aaa;font-size:0.9rem;margin:0;">
        <code>apps/my_crm/main.py</code>(GENIUS CRM)과 데이터가 겹치지 않습니다. <code>fo_*</code> 테이블만 사용합니다.
    </p>
    """,
    unsafe_allow_html=True,
)

_ds = get_data_entry_start_date()
st.caption(
    f"데이터 적재 기준일: **{_ds.isoformat()}** ~ 오늘(KST)까지 전표·판매일 선택 가능. "
    "`FRAME_OPS_DATA_START_DATE` 환경변수로 변경."
)

try:
    sb = get_supabase()
except RuntimeError as e:
    st.error(str(e))
    st.stop()

_db_cap, _db_warn = describe_database_connection()
if _db_cap:
    st.caption(_db_cap)
if _db_warn:
    st.warning(_db_warn)

try:
    from postgrest.exceptions import APIError

    try:
        pend = (
            sb.table("fo_interstore_transfers")
            .select("id")
            .in_("status", ["pending_approval", "on_hold"])
            .limit(1)
            .execute()
            .data
        )
        if pend:
            st.warning(
                "매장 간 이동: **수신 대기·보류** 건이 있습니다. "
                "사이드바 **매장간이동** → 수신함을 확인하세요."
            )
    except APIError:
        pass
except ImportError:
    pass

# ── 요약 지표 ──
stores = load_stores_with_business_fields_or_halt(sb)
n_stores = len(stores)
n_prod = None
try:
    pr = sb.table("fo_products").select("*", count="exact").limit(0).execute()
    n_prod = getattr(pr, "count", None)
except Exception:
    try:
        n_prod = len(sb.table("fo_products").select("id").limit(5000).execute().data or [])
        if n_prod >= 5000:
            n_prod = f"{n_prod}+"
    except Exception:
        n_prod = "—"

m1, m2 = st.columns(2)
m1.metric("등록 지점", n_stores)
m2.metric("상품 건수", n_prod if n_prod is not None else "—")

with st.expander("빠른 실행 (사이드바와 동일)", expanded=False):
    p = "pages"
    c1, c2, c3 = st.columns(3)
    with c1:
        st.page_link(f"{p}/01_상품등록.py", label="상품 등록", icon="📦")
        st.page_link(f"{p}/02_POS판매.py", label="POS 판매", icon="🛒")
        st.page_link(f"{p}/03_입고.py", label="입고", icon="📥")
        st.page_link(f"{p}/04_출고.py", label="출고", icon="📤")
    with c2:
        st.page_link(f"{p}/05_재고조정.py", label="재고 조정", icon="⚖️")
        st.page_link(f"{p}/06_재고현황.py", label="재고 현황", icon="📊")
        st.page_link(f"{p}/07_주문리스트.py", label="주문 리스트", icon="📋")
        st.page_link(f"{p}/13_매입처리.py", label="매입처리", icon="🧾")
        st.page_link(f"{p}/08_정산.py", label="정산", icon="🔒")
    with c3:
        st.page_link(f"{p}/09_반품.py", label="반품", icon="↩️")
        st.page_link(f"{p}/10_매장간이동.py", label="매장 간 이동", icon="🚚")
        st.page_link(f"{p}/11_통계리포트.py", label="통계·리포트", icon="📈")
        st.page_link(f"{p}/12_판매데이터가져오기.py", label="판매 CSV 가져오기", icon="📑")
        st.page_link(f"{p}/14_본사·스태프·권한.py", label="본사·스태프·권한", icon="🧑‍💼")
        st.page_link(f"{p}/15_지점·매니저·판매사.py", label="지점·매니저·판매사", icon="👤")
        st.page_link(f"{p}/16_판매검색.py", label="판매 검색", icon="🔎")

with st.expander("테스트 순서 제안 (클릭으로 이동)", expanded=True):
    st.markdown(
        """
**A. 데모(TST01)**  
1. 아래 **데모 데이터 넣기**로 지점·상품 준비 (또는 직접 지점·상품 등록).  
2. **입고** → `TST01` 선택, 상품 `DEMO-…` 로 수량 입고.  
3. **POS판매** → 같은 지점에서 판매 저장 (판매자 코드는 통계용).  

**B. 북촌(BKC01 · No Public · 안목)**  
1. **우선 매장 · No Public** expander에서 시드 실행.  
2. **입고** → 지점·매입처 기본이 북촌·안목이면 코드만 넣고 수량 입고.  
3. **재고현황** → 「No Public만」으로 2,950 SKU 범위를 좁혀 확인.  

**공통**  
4. **통계리포트** → 기간·지점 선택 후 수치·차트·엑셀 확인.  
5. **정산** → 해당 영업일 확정 후, 같은 날 POS/입고가 막히는지 확인.  
6. (선택) **재고현황**(적정·부족 확인) → **주문리스트**(발주 CSV) · **출고** · **매장간이동** · **반품** · **재고조정**.

**실판매 파일 반영(데이터 받은 뒤)**  
- **판매 데이터 가져오기**에서 UTF-8 CSV 또는 **북촌 판매일지 xlsx** 검증 후 DB 반영(재고 차감).  
- CLI: `scripts/import_frame_ops_sales.py`(CSV) · `scripts/import_bukchon_xlsx.py`(xlsx). 상세는 `frame_ops/README.md`.
        """
    )
    l1, l2, l3 = st.columns(3)
    with l1:
        st.page_link("pages/01_상품등록.py", label="1·2 상품 등록")
        st.page_link("pages/03_입고.py", label="2 입고")
        st.page_link("pages/02_POS판매.py", label="3 POS 판매")
    with l2:
        st.page_link("pages/11_통계리포트.py", label="4 통계·리포트")
        st.page_link("pages/08_정산.py", label="5 정산")
    with l3:
        st.page_link("pages/06_재고현황.py", label="6 재고현황")
        st.page_link("pages/07_주문리스트.py", label="6 주문리스트")
        st.page_link("pages/04_출고.py", label="6 출고")
        st.page_link("pages/10_매장간이동.py", label="6 매장간이동")
        st.page_link("pages/09_반품.py", label="6 반품")
        st.page_link("pages/05_재고조정.py", label="6 재고조정")

with st.expander("스키마·개발 점검 (CLI)", expanded=False):
    st.markdown(
        "스테이징 없이 마이그레이션 누락을 잡으려면 저장소 **루트**에서 실행합니다. "
        "(권장: **Mac**에서 테스트·프리플라이트, **Windows**에서 업무용 앱만.)"
    )
    st.markdown("**Mac**")
    st.code("./run_frame_ops_tests.sh\n./run_frame_ops_tests.sh --preflight", language="bash")
    st.markdown("**Windows** (CMD, 프로젝트 루트)")
    st.code("run_frame_ops_tests.bat\nrun_frame_ops_tests.bat --preflight", language="text")
    st.caption("또는 수동: `.venv\\Scripts\\pytest …` · `scripts\\frame_ops_preflight.py`")
    st.caption("프리플라이트는 `.env`(또는 Streamlit Secrets와 동일한 환경변수)에 Supabase가 설정된 경우에만 의미 있습니다.")

with st.expander("데모 데이터 (중복 시 스킵)", expanded=False):
    st.caption("지점 TST01/TST02, 매입처, DEMO-20260401-* 상품 3개.")
    if st.button("데모 데이터 넣기"):
        try:
            for line in run_seed_demo(sb):
                st.text(line)
            st.success("완료. 새로고침하면 지점 목록이 갱신됩니다.")
            st.rerun()
        except Exception as ex:
            st.error(f"실패: {ex}")

with st.expander("우선 매장 · No Public (서울 북촌점 · 매입 안목)", expanded=False):
    st.caption(
        "지점 **BKC01** / **서울 북촌점** — 브랜드(카테고리) **No Public**, 매입처 **안목**. "
        "상품코드 **01:01-C01** ~ **10:59-C05** (각 시각 :01~:59 × C01~C05, **2,950 SKU**). "
        "신규만 insert, 기존 시드 SKU는 **가격·매입처(안목)** 를 매번 맞춥니다."
    )
    if st.button("북촌점 + No Public 상품 넣기"):
        try:
            for line in run_seed_bukchon_nopublic(sb):
                st.text(line)
            st.success("완료. 입고에서 지점 BKC01 을 선택해 테스트하세요.")
            st.rerun()
        except Exception as ex:
            st.error(f"실패: {ex}")

with st.expander("북촌점 업무 바로가기 (BKC01 · No Public · 안목)", expanded=False):
    st.caption("시드 후 지점·매입처 기본값이 북촌·안목에 맞춰집니다.")
    b1, b2, b3 = st.columns(3)
    with b1:
        st.page_link("pages/03_입고.py", label="입고")
        st.page_link("pages/02_POS판매.py", label="POS 판매")
    with b2:
        st.page_link("pages/06_재고현황.py", label="재고 현황")
        st.page_link("pages/07_주문리스트.py", label="주문·발주")
        st.page_link("pages/13_매입처리.py", label="매입처리")
        st.page_link("pages/11_통계리포트.py", label="통계·리포트")
    with b3:
        st.page_link("pages/08_정산.py", label="정산")
        st.page_link("pages/01_상품등록.py", label="상품 등록")
        st.page_link("pages/12_판매데이터가져오기.py", label="판매 CSV 가져오기")

st.divider()
st.subheader("지점 등록 · 상호·사업자 정보")
st.page_link("pages/15_지점·매니저·판매사.py", label="→ 지점 매니저·판매사 계정·권한", icon="👤")

if stores:
    disp = [
        {
            "store_code": r.get("store_code", ""),
            "상호": r.get("name", ""),
            "등록점검": store_registration_summary_label(r),
            "사업자등록번호": r.get("business_reg_no", ""),
            "주소": r.get("address", ""),
            "전화": r.get("phone", ""),
            "active": r.get("active", True),
        }
        for r in stores
    ]
    st.dataframe(disp, use_container_width=True, hide_index=True, height=min(320, 40 * (n_stores + 1)))
else:
    st.info("등록된 지점이 없습니다. 데모 데이터를 넣거나 아래에서 추가하세요.")

with st.expander("기존 지점 — 상호·사업자등록번호·주소·전화 수정", expanded=False):
    act = [s for s in stores if s.get("active", True)]
    if not act:
        st.caption("활성 지점이 없습니다.")
    else:
        lab = [f"{s['store_code']} — {s['name']}" for s in act]
        pick_u = st.selectbox("수정할 지점", lab, key="fo_store_edit_pick")
        cur = act[lab.index(pick_u)]
        sid = str(cur["id"])
        with st.form("fo_store_update"):
            u_name = st.text_input("상호(지점명)", value=str(cur.get("name") or ""))
            u_br = st.text_input("사업자등록번호", value=str(cur.get("business_reg_no") or ""))
            u_addr = st.text_area("주소", value=str(cur.get("address") or ""), height=68)
            u_phone = st.text_input("전화번호", value=str(cur.get("phone") or ""))
            if st.form_submit_button("지점 정보 저장"):
                try:
                    sb.table("fo_stores").update(
                        {
                            "name": (u_name or "").strip(),
                            "business_reg_no": (u_br or "").strip(),
                            "address": (u_addr or "").strip(),
                            "phone": (u_phone or "").strip(),
                        }
                    ).eq("id", sid).execute()
                    st.success("반영되었습니다.")
                    st.rerun()
                except Exception as ex:
                    err = str(ex)
                    if "business_reg_no" in err or "column" in err.lower():
                        try:
                            sb.table("fo_stores").update({"name": (u_name or "").strip()}).eq("id", sid).execute()
                            st.success("상호만 반영되었습니다. 사업자 필드는 DB 마이그레이션 후 입력하세요.")
                            st.rerun()
                        except Exception as ex2:
                            st.error(
                                "사업자·주소 컬럼이 없습니다. "
                                "`supabase/migrations/20260419_frame_ops_store_business_fields.sql` 실행 후 다시 시도하세요. "
                                f"({ex2})"
                            )
                    else:
                        st.error(f"저장 실패: {ex}")

with st.form("add_store", clear_on_submit=True):
    st.caption("**상호**는 지점명과 동일하게 쓰면 됩니다. 주문서 PDF 상단에 표시됩니다.")
    r1, r2 = st.columns(2)
    with r1:
        code = st.text_input("지점 코드", placeholder="예: BKC01")
    with r2:
        name = st.text_input("상호(지점명)", placeholder="예: 서울 북촌점")
    br = st.text_input("사업자등록번호", placeholder="000-00-00000")
    addr = st.text_area("주소", placeholder="도로명 주소", height=70)
    phone = st.text_input("전화번호", placeholder="02-0000-0000")
    if st.form_submit_button("지점 추가"):
        code = (code or "").strip()
        name = (name or "").strip()
        if not code or not name:
            st.warning("지점 코드와 상호(지점명)를 입력하세요.")
        else:
            payload = {
                "store_code": code,
                "name": name,
                "business_reg_no": (br or "").strip(),
                "address": (addr or "").strip(),
                "phone": (phone or "").strip(),
            }
            try:
                sb.table("fo_stores").insert(payload).execute()
                st.success("저장되었습니다.")
                st.rerun()
            except Exception as ex:
                err = str(ex)
                if "business_reg_no" in err or "column" in err.lower():
                    try:
                        sb.table("fo_stores").insert({"store_code": code, "name": name}).execute()
                        st.success("저장되었습니다. (사업자 필드는 DB 마이그레이션 후 다시 편집하세요.)")
                        st.rerun()
                    except Exception as ex2:
                        st.error(f"저장 실패: {ex2}")
                else:
                    st.error(f"저장 실패: {ex}")

st.divider()
st.caption(
    "모바일: 왼쪽 **≡** 로 이 서비스 메뉴, 오른쪽 위 **☰** 로 전체 화면·다른 서비스로 이동합니다. "
    "처음이면 **서비스 선택**에서 본사 / 대시보드 / 판매 관리를 고르세요."
)
st.page_link("pages/00_서비스선택.py", label="서비스 선택 (본사·대시보드·판매)", icon="🔀")
