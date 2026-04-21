"""본사·담당별 계정 생성(Auth) 및 역할·지점 범위(fo_staff_*) 설정."""

from __future__ import annotations

import os
import re
import sys
from pathlib import Path

import pandas as pd
import streamlit as st
import streamlit.components.v1 as _st_components

_ROOT = Path(__file__).resolve().parents[1]
if str(_ROOT) not in sys.path:
    sys.path.insert(0, str(_ROOT))

st.set_page_config(
    page_title="본사·스태프·권한 — FRAME OPS",
    layout="wide",
    initial_sidebar_state="collapsed",
)

from lib.service_portal import render_frame_ops_chrome  # noqa: E402

render_frame_ops_chrome()

from lib.schema_guard import stop_if_staff_rbac_migration_missing  # noqa: E402
from lib.staff_rbac import (  # noqa: E402
    HQ_SUPER_ROLE,
    create_staff_user,
    delete_staff_user,
    insert_staff_job_title,
    insert_staff_role,
    is_configured_service_role_key,
    list_auth_users_all,
    list_staff_job_titles,
    list_staff_profiles,
    list_staff_roles,
    list_store_scopes_for_user,
    replace_store_scopes,
    staff_job_titles_table_available,
    update_staff_job_title_fields,
    update_staff_profile_fields,
    update_staff_role_fields,
    upsert_staff_profile,
    verify_hq_super,
)
from lib.streamlit_fo_stores import load_stores_with_business_fields_or_halt  # noqa: E402
from lib.supabase_client import (  # noqa: E402
    get_configured_supabase_anon_key,
    get_configured_supabase_jwt_role,
    get_configured_supabase_url,
    get_supabase,
)


def _format_phone_kr(raw: str) -> str:
    """숫자만 추출해 한국 전화번호 형식(구간 -)으로 반환합니다."""
    digits = re.sub(r"\D", "", (raw or ""))
    n = len(digits)
    if n == 9:
        # 서울 02 + 3 + 4
        if digits.startswith("02"):
            return f"{digits[:2]}-{digits[2:5]}-{digits[5:]}"
        return f"{digits[:3]}-{digits[3:6]}-{digits[6:]}"
    if n == 10:
        if digits.startswith("02"):
            return f"{digits[:2]}-{digits[2:6]}-{digits[6:]}"
        return f"{digits[:3]}-{digits[3:6]}-{digits[6:]}"
    if n == 11:
        return f"{digits[:3]}-{digits[3:7]}-{digits[7:]}"
    return raw  # 자릿수가 맞지 않으면 원본 유지


def _account_admin_key_help_markdown() -> str:
    role = get_configured_supabase_jwt_role()
    role_disp = f"**{role}**" if role else "**알 수 없음**(키 형식·환경변수를 확인하세요)"
    hint = (
        f"지금 앱 연결에 쓰인 키의 JWT `role`은 {role_disp} 입니다. "
        "계정 생성에는 **`service_role`** 이어야 합니다.\n\n"
        "가장 흔한 경우: `SUPABASE_SERVICE_ROLE_KEY`가 비어 있고 **`SUPABASE_KEY`에 anon 키만** 있을 때입니다.\n\n"
        "1. Supabase 대시보드 → **Project Settings** → **API**\n"
        "2. **Project API keys**에서 **`service_role`** 의 **`secret`** 만 복사합니다. "
        "(`anon` / `publishable` / `default` 라벨 키는 **계정 생성에 쓸 수 없습니다**.)\n"
        "3. 프로젝트 루트 **`.env`**에 추가:  \n"
        "   `SUPABASE_SERVICE_ROLE_KEY=eyJ...`  \n"
        "   Streamlit Cloud → **App settings → Secrets**에도 같은 이름으로 넣습니다. "
        "(예: `.streamlit/secrets.toml.example`)\n"
        "4. **anon은** `SUPABASE_ANON_KEY` 또는 `SUPABASE_KEY`에 그대로 두고, "
        "**서비스 롤 secret만** `SUPABASE_SERVICE_ROLE_KEY`에 넣습니다. "
        "(변수 이름을 `SUPABASE_SECRET_KEY` 등으로 바꾸면 이 앱은 읽지 못합니다.)\n"
        "5. **Streamlit/터미널을 완전히 종료 후 다시 실행**합니다. (`streamlit run`만 다시 눌러도 `.env`가 안 읽히는 경우가 있어 **프로세스 종료**를 권장합니다.)\n"
        "6. 그래도 동일하면 `.env`가 **프로젝트 루트**( `run_frame_ops.sh` 가 있는 폴더)에 있는지, "
        "띄어쓰기·따옴표 없이 `KEY=값` 한 줄인지 확인하세요."
    )
    return hint

st.title("본사 · 스태프 · 권한")
st.caption(
    "Supabase **Auth**로 계정을 만들고, **직급**(표시용)·**권한 역할**·**허용 지점**(선택)을 `fo_staff_*`에 저장합니다. "
    "로그인 식별자는 **이메일**입니다. **아이디**는 구분·표시용으로 프로필에만 저장됩니다. "
    "다른 FRAME OPS 화면은 이 프로필을 **아직 강제하지 않습니다**."
)

try:
    sb = get_supabase()
except RuntimeError as e:
    st.error(str(e))
    st.stop()

stop_if_staff_rbac_migration_missing(sb)

jt_schema_ok = staff_job_titles_table_available(sb)
if not jt_schema_ok:
    st.warning(
        "직급 테이블(`fo_staff_job_titles`)이 아직 없습니다. 아래 SQL을 Supabase **SQL Editor**에서 "
        "실행하면 직급·전화·아이디가 프로필에 저장됩니다. **실행 전에도** 이 페이지에서 역할·지점·계정 "
        "생성(직급 제외)은 계속할 수 있습니다."
    )

can_admin = is_configured_service_role_key()
if not can_admin:
    if get_configured_supabase_jwt_role() == "anon":
        st.warning(
            "현재 연결에 쓰인 키는 **anon** 입니다. **계정 생성·삭제·Auth 전체 목록**은 "
            "**`SUPABASE_SERVICE_ROLE_KEY`**(서비스 롤 `secret`)를 **별도로** 넣어야 합니다. "
            "(`SUPABASE_KEY`에 anon만 두면 계정 저장이 되지 않습니다.)"
        )
    else:
        st.warning(
            "설정된 API 키가 **서비스 롤**이 아닙니다. **계정 생성·삭제·Auth 전체 목록**은 "
            "`SUPABASE_SERVICE_ROLE_KEY`가 필요합니다."
        )


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
    if not st.session_state.get("fo_hq_pin_ok"):
        st.info("이 페이지의 **계정·권한 변경**을 쓰려면 PIN을 입력하세요. (`FRAME_OPS_HQ_PIN` · secrets)")
        entered = st.text_input("PIN", type="password", key="fo_hq_pin_field")
        if st.button("확인"):
            if entered == _pin:
                st.session_state.fo_hq_pin_ok = True
                st.rerun()
            else:
                st.error("PIN이 일치하지 않습니다.")
        pin_ok = bool(st.session_state.get("fo_hq_pin_ok"))
    else:
        pin_ok = True
else:
    st.caption(
        "PIN 미설정: 로컬 개발에 적합합니다. **배포 시** `FRAME_OPS_HQ_PIN`을 secrets에 넣어 이 화면을 보호하세요."
    )
    pin_ok = True

stores = [s for s in load_stores_with_business_fields_or_halt(sb) if s.get("active", True)]
store_by_id = {str(s["id"]): s for s in stores}
role_rows = list_staff_roles(sb)
role_codes = [r["code"] for r in role_rows]
role_labels = {r["code"]: r["label"] for r in role_rows}
job_title_rows = list_staff_job_titles(sb, active_only=False)
jt_label_by_code = {str(r["code"]): str(r.get("label") or "") for r in job_title_rows}
jt_active_codes = [str(r["code"]) for r in job_title_rows if r.get("active", True)]

tab_roles, tab_job_titles, tab_list, tab_create, tab_edit = st.tabs(
    ["역할 안내", "직급 관리", "스태프·Auth 목록", "계정 생성", "권한·지점 범위"]
)

with tab_roles:
    st.caption("**권한 역할**(시스템 권한 구분). 계정 생성 시 함께 지정합니다.")
    if not role_rows:
        st.warning("역할 행이 없습니다. 마이그레이션 시드가 적용됐는지 확인하세요.")
    else:
        st.dataframe(pd.DataFrame(role_rows), use_container_width=True, hide_index=True)
    st.info("역할 수정·추가는 `직급 관리` 탭에서 함께 처리합니다.")

with tab_job_titles:
    if not jt_schema_ok:
        st.info(
            "마이그레이션을 적용하면 **대표이사·관리자·회계담당** 시드와 직급 편집·계정의 직급 저장이 "
            "활성화됩니다."
        )
        st.code("supabase/migrations/20260425_frame_ops_staff_job_titles.sql", language="text")
    else:
        st.caption(
            "직급은 **조직상 직함**(대표이사·관리자 등)입니다. 표시명·정렬·사용 여부를 바꾸거나, "
            "내부 코드를 정해 **새 직급**을 추가할 수 있습니다."
        )
        if job_title_rows:
            st.dataframe(pd.DataFrame(job_title_rows), use_container_width=True, hide_index=True)
        else:
            st.warning("직급 행이 없습니다. 아래에서 추가하세요.")

        can_edit_jt = pin_ok or not _pin
        if not can_edit_jt:
            st.info("이 페이지에 PIN이 설정된 경우, **직급 수정·추가**는 PIN 확인 후 가능합니다.")
        elif job_title_rows:
            st.subheader("직급 표시명·정렬·사용 여부")
            pick_jt = st.selectbox(
                "수정할 직급",
                [str(r["code"]) for r in job_title_rows],
                format_func=lambda c: f"{c} — {jt_label_by_code.get(c, c)}",
                key="fo_jt_edit_pick",
            )
            cur_jt = next(r for r in job_title_rows if str(r["code"]) == pick_jt)
            jt_lab = st.text_input("표시명", value=str(cur_jt.get("label") or ""), key="fo_jt_edit_lab")
            jt_so = st.number_input(
                "정렬(작을수록 위)",
                min_value=0,
                value=int(cur_jt.get("sort_order") or 0),
                step=10,
                key="fo_jt_edit_so",
            )
            jt_ac = st.checkbox("사용", value=bool(cur_jt.get("active", True)), key="fo_jt_edit_ac")
            if st.button("직급 저장", key="fo_jt_edit_save"):
                try:
                    update_staff_job_title_fields(
                        sb, pick_jt, label=jt_lab, sort_order=jt_so, active=jt_ac
                    )
                    st.success("저장했습니다.")
                    st.rerun()
                except Exception as ex:
                    st.error(str(ex))

        if can_edit_jt:
            st.subheader("새 직급 추가")
            with st.form("fo_jt_add"):
                add_lab = st.text_input("표시명", placeholder="예: 인사담당")
                add_code = st.text_input(
                    "내부 코드(선택)",
                    placeholder="비우면 자동 · 직접 입력 시 영문 소문자 시작, 영문·숫자·_",
                )
                add_so = st.number_input("정렬", min_value=0, value=100, step=10, key="fo_jt_add_so")
                add_sub = st.form_submit_button("직급 추가")
            if add_sub:
                try:
                    insert_staff_job_title(
                        sb,
                        label=add_lab,
                        code=(add_code or "").strip() or None,
                        sort_order=int(add_so),
                    )
                    st.success("추가했습니다.")
                    st.rerun()
                except Exception as ex:
                    st.error(str(ex))

        st.divider()
        st.subheader("역할 안내 목록 관리")
        st.caption(
            "권한 역할의 **표시명/설명/정렬**을 수정하거나 새 역할을 추가합니다. "
            "역할 코드는 생성 후 변경할 수 없습니다."
        )
        if role_rows:
            st.dataframe(pd.DataFrame(role_rows), use_container_width=True, hide_index=True)
        else:
            st.warning("역할 행이 없습니다. 아래에서 추가하세요.")

        can_edit_role = pin_ok or not _pin
        if not can_edit_role:
            st.info("역할 수정·추가는 PIN 확인 후 가능합니다.")
        else:
            if role_rows:
                pick_role = st.selectbox(
                    "수정할 역할",
                    [str(r["code"]) for r in role_rows],
                    format_func=lambda c: f"{c} — {role_labels.get(c, c)}",
                    key="fo_role_edit_pick_in_jt",
                )
                cur_role = next(r for r in role_rows if str(r["code"]) == pick_role)
                r_lab = st.text_input(
                    "역할 표시명",
                    value=str(cur_role.get("label") or ""),
                    key="fo_role_edit_lab_in_jt",
                )
                r_desc = st.text_input(
                    "역할 설명",
                    value=str(cur_role.get("description") or ""),
                    placeholder="예: 본사 전 기능·설정 담당",
                    key="fo_role_edit_desc_in_jt",
                )
                r_so = st.number_input(
                    "역할 정렬(작을수록 위)",
                    min_value=0,
                    value=int(cur_role.get("sort_order") or 0),
                    step=10,
                    key="fo_role_edit_so_in_jt",
                )
                if st.button("역할 저장", key="fo_role_edit_save_in_jt"):
                    try:
                        update_staff_role_fields(
                            sb,
                            pick_role,
                            label=r_lab,
                            description=r_desc,
                            sort_order=int(r_so),
                        )
                        st.success("역할을 저장했습니다.")
                        st.rerun()
                    except Exception as exc:
                        st.error(str(exc))

            with st.form("fo_role_add_in_jt"):
                add_r_code = st.text_input(
                    "역할 코드 (필수)",
                    placeholder="예: hq_accounting",
                )
                add_r_lab = st.text_input(
                    "역할 표시명 (필수)",
                    placeholder="예: 본사 회계",
                )
                add_r_desc = st.text_input(
                    "역할 설명 (선택)",
                    placeholder="예: 회계·정산 전담",
                )
                add_r_so = st.number_input(
                    "역할 정렬",
                    min_value=0,
                    value=100,
                    step=10,
                    key="fo_role_add_so_in_jt",
                )
                add_r_sub = st.form_submit_button("새 역할 추가")
            if add_r_sub:
                try:
                    insert_staff_role(
                        sb,
                        code=add_r_code,
                        label=add_r_lab,
                        description=add_r_desc,
                        sort_order=int(add_r_so),
                    )
                    st.success(f"역할 `{add_r_code.strip().lower()}` 을 추가했습니다.")
                    st.rerun()
                except Exception as exc:
                    st.error(str(exc))

profiles = list_staff_profiles(sb)
auth_by_id: dict[str, object] = {}
if can_admin:
    try:
        for u in list_auth_users_all(sb):
            auth_by_id[str(u.id)] = u
    except Exception as ex:
        st.error(f"Auth 사용자 목록을 불러오지 못했습니다: {ex}")

_K_OP_UID  = "fo_hq_op_uid"
_K_OP_NAME = "fo_hq_op_name"
_K_OP_ROLE = "fo_hq_op_role"

with tab_list:
    op_uid  = st.session_state.get(_K_OP_UID)
    op_role = st.session_state.get(_K_OP_ROLE, "")

    # ── 본사총괄 로그인 게이트 ─────────────────────────────────────
    # 초기 설정(프로필 0건)이면 인증 없이 열람 허용
    _list_allowed = (not profiles) or (op_uid and op_role == HQ_SUPER_ROLE)

    if not _list_allowed:
        st.info(
            "스태프 목록은 **본사 총괄(`hq_super`)** 권한의 담당자만 볼 수 있습니다. "
            "이메일·비밀번호로 확인하세요."
        )
        with st.form("fo_hq_op_verify"):
            vf_em = st.text_input("이메일", placeholder="example@company.com", autocomplete="email")
            vf_pw = st.text_input("비밀번호", type="password", autocomplete="current-password")
            vf_sub = st.form_submit_button("확인", use_container_width=True)
        if vf_sub:
            try:
                v_uid, v_name, v_role = verify_hq_super(sb, email=vf_em, password=vf_pw)
                st.session_state[_K_OP_UID]  = v_uid
                st.session_state[_K_OP_NAME] = v_name
                st.session_state[_K_OP_ROLE] = v_role
                st.rerun()
            except Exception as exc:
                st.error(str(exc))

    elif op_uid:
        # 인증된 담당자 정보 + 로그아웃
        op_name = st.session_state.get(_K_OP_NAME, "")
        hdr_l, hdr_r = st.columns([5, 1])
        with hdr_l:
            st.caption(f"열람 담당자: **{op_name}** — 본사 총괄")
        with hdr_r:
            if st.button("로그아웃", key="fo_hq_op_logout"):
                for _ok in (_K_OP_UID, _K_OP_NAME, _K_OP_ROLE):
                    st.session_state.pop(_ok, None)
                st.rerun()

    if _list_allowed:
        # ── 스태프 목록 ────────────────────────────────────────────
        rows_out: list[dict[str, object]] = []
        for p in profiles:
            uid = str(p["user_id"])
            au = auth_by_id.get(uid)
            email_auth = getattr(au, "email", None) if au else None
            jtc = p.get("job_title_code")
            rows_out.append(
                {
                    "user_id": uid,
                    "email_auth": email_auth or "",
                    "email_profile": p.get("email") or "",
                    "display_name": p.get("display_name") or "",
                    "login_id": p.get("login_id") or "",
                    "phone": p.get("phone") or "",
                    "job_title": jt_label_by_code.get(str(jtc), "") if jtc else "",
                    "role_code": p.get("role_code"),
                    "role_label": role_labels.get(str(p.get("role_code")), ""),
                    "active": p.get("active"),
                    "scopes": ", ".join(
                        store_by_id[sid]["store_code"]
                        for sid in list_store_scopes_for_user(sb, uid)
                        if sid in store_by_id
                    )
                    or "(전 지점)",
                }
            )
        if rows_out:
            st.dataframe(pd.DataFrame(rows_out), use_container_width=True, hide_index=True)
        else:
            st.info("등록된 스태프 프로필이 없습니다. **계정 생성**에서 추가하세요.")
        prof_ids = {str(p["user_id"]) for p in profiles}
        orphan_auth = [u for uid, u in auth_by_id.items() if uid not in prof_ids]
        if orphan_auth:
            st.subheader("프로필 없는 Auth 사용자")
            st.caption("아래 사용자는 로그인은 가능하나 `fo_staff_profiles` 행이 없어 역할이 비어 있습니다.")
            st.dataframe(
                pd.DataFrame([{"id": str(u.id), "email": u.email or ""} for u in orphan_auth]),
                use_container_width=True,
                hide_index=True,
            )

with tab_create:
    if not pin_ok:
        st.info(
            "이 페이지에 PIN이 설정되어 있습니다. **계정 생성**을 포함한 변경은 페이지 상단에서 "
            "**PIN 확인** 후 이용할 수 있습니다."
        )
    else:
        if not can_admin:
            st.warning(
                "**실제로 계정을 만들려면** `SUPABASE_SERVICE_ROLE_KEY`(서비스 롤)가 필요합니다. "
                "아래 폼은 입력·검토용이며, 키를 넣고 앱을 **재시작**하기 전까지는 저장되지 않습니다."
            )
        if jt_schema_ok and not jt_active_codes:
            st.warning("사용 중인 직급이 없습니다. **직급 관리**에서 직급을 추가하거나 사용을 켜 주세요.")
        elif not jt_schema_ok:
            st.caption(
                "마이그레이션 전에는 **직급**을 고를 수 없습니다. "
                "전화·아이디는 Auth **user_metadata**에만 들어갑니다."
            )

        # ── 폼 리셋 카운터: 성공 저장 후 증가 → 위젯 키가 바뀌어 자동 초기화 ──
        st.session_state.setdefault("fo_c_rev", 0)
        _R = st.session_state["fo_c_rev"]
        _K = {
            "jt":     f"fo_c_jt_{_R}",
            "dn":     f"fo_c_dn_{_R}",
            "ph":     f"fo_c_ph_{_R}",
            "em":     f"fo_c_em_{_R}",
            "lid":    f"fo_c_lid_{_R}",
            "pw":     f"fo_c_pw_{_R}",
            "rc":     f"fo_c_rc_{_R}",
            "stores": f"fo_c_stores_{_R}",
        }

        def _on_ph_format() -> None:
            st.session_state[_K["ph"]] = _format_phone_kr(
                st.session_state.get(_K["ph"], "")
            )

        # ── 입력 필드 (st.form 없이 — on_change 즉시 동작) ────────────
        # 직급
        jt_pick: str | None = None
        if jt_schema_ok and jt_active_codes:
            jt_pick = st.selectbox(
                "직급",
                jt_active_codes,
                format_func=lambda c: jt_label_by_code.get(c, c),
                key=_K["jt"],
            )
        elif jt_schema_ok:
            st.caption("직급을 추가한 뒤 이 폼에서 선택할 수 있습니다.")

        # 이름 — 한글
        st.text_input(
            "이름",
            key=_K["dn"],
            placeholder="홍길동",
            help="한글 이름을 입력합니다.",
        )

        # 전화번호 — 숫자 입력 → 다음 필드 이동 시 자동 포맷
        st.text_input(
            "전화번호",
            key=_K["ph"],
            placeholder="01012341234",
            on_change=_on_ph_format,
            help="숫자만 입력 후 다른 항목을 클릭하면 010-1234-5678 형식으로 자동 변환됩니다.",
        )

        # 이메일 — 영문 전용 (한글 조합 차단 + inputmode=email)
        st.text_input(
            "이메일 (로그인 ID)",
            key=_K["em"],
            placeholder="example@company.com",
            autocomplete="email",
            help="영문·숫자·@·점(.)만 입력됩니다. 한글을 입력하면 자동으로 제거됩니다.",
        )
        # JavaScript 주입:
        #  1) inputmode="email", lang="en" → 모바일 영문 키보드
        #  2) compositionend / input 이벤트로 한글 문자 감지 즉시 제거
        #     → React 상태도 native value setter + bubbling input event로 동기화
        _st_components.html(
            """
<script>
(function () {
  var KO_RE = /[ㄱ-ㅎㅏ-ㅣ가-힣]/g;

  function cleanKorean(inp) {
    var val = inp.value;
    var cleaned = val.replace(KO_RE, '');
    if (cleaned === val) return;
    // React의 내부 value를 강제 갱신
    var setter = Object.getOwnPropertyDescriptor(
      window.HTMLInputElement.prototype, 'value'
    ).set;
    setter.call(inp, cleaned);
    inp.dispatchEvent(new Event('input', { bubbles: true }));
  }

  function attachGuard(inp) {
    if (inp._koGuarded) return;
    inp._koGuarded = true;
    inp.setAttribute('inputmode', 'email');
    inp.setAttribute('lang', 'en');
    inp.setAttribute('spellcheck', 'false');
    // 조합 완료(한글 확정) 시 제거
    inp.addEventListener('compositionend', function () {
      cleanKorean(inp);
    });
    // 조합 없이 붙여넣기 등으로 한글 들어올 때
    inp.addEventListener('input', function (e) {
      if (!e.isComposing) cleanKorean(inp);
    });
  }

  function findAndGuard() {
    try {
      var doc = window.parent.document;
      doc.querySelectorAll('[data-testid="stTextInput"]').forEach(function (w) {
        var lbl = w.querySelector('label');
        if (lbl && lbl.textContent.includes('이메일')) {
          var inp = w.querySelector('input');
          if (inp) attachGuard(inp);
        }
      });
    } catch (e) {}
  }

  findAndGuard();
  setTimeout(findAndGuard, 400);
  setTimeout(findAndGuard, 1500);
})();
</script>
""",
            height=0,
        )

        # 아이디 — 영문·숫자
        st.text_input(
            "아이디 (표시·구분용)",
            key=_K["lid"],
            placeholder="hong_gd",
            autocomplete="username",
            help="영문 소문자, 숫자, 밑줄(_)만 사용합니다.",
        )

        # 비밀번호 — 영문·숫자
        st.text_input(
            "비밀번호",
            key=_K["pw"],
            type="password",
            autocomplete="new-password",
            help="6자 이상, 영문+숫자 조합을 권장합니다.",
        )

        st.divider()

        # 권한 역할
        rc_opts = role_codes
        st.selectbox(
            "권한 역할",
            rc_opts,
            format_func=lambda c: f"{c} — {role_labels.get(c, c)}",
            key=_K["rc"],
        )

        # 허용 지점 — 기본값 비움 = 전 지점
        st.caption(
            "선택하지 않으면 **모든 지점에 접근** 가능합니다. "
            "특정 지점만 허용할 때만 골라 주세요."
        )
        st.multiselect(
            "허용 지점 (비우면 전 지점)",
            options=[str(s["id"]) for s in stores],
            default=[],
            format_func=lambda i: f"{store_by_id[i]['store_code']} — {store_by_id[i]['name']}",
            key=_K["stores"],
        )

        st.divider()
        if st.button("계정 만들기", type="primary", use_container_width=True, key="fo_c_submit"):
            dn  = st.session_state.get(_K["dn"], "").strip()
            ph  = st.session_state.get(_K["ph"], "").strip()
            em  = st.session_state.get(_K["em"], "").strip()
            lid = st.session_state.get(_K["lid"], "").strip()
            pw  = st.session_state.get(_K["pw"], "")
            rc  = st.session_state.get(_K["rc"], role_codes[0] if role_codes else "")
            pick = st.session_state.get(_K["stores"], [])

            if not can_admin:
                st.error("저장할 수 없습니다. 서비스 롤 키가 설정되어 있지 않습니다.")
                st.markdown(_account_admin_key_help_markdown())
            elif not em:
                st.error("이메일은 필수입니다.")
            elif not pw:
                st.error("비밀번호는 필수입니다.")
            elif jt_schema_ok and not jt_active_codes:
                st.error("직급을 먼저 등록하세요.")
            else:
                try:
                    sid_list = pick if pick else None
                    uid = create_staff_user(
                        sb,
                        email=em,
                        password=pw,
                        display_name=dn,
                        role_code=rc,
                        store_ids=sid_list,
                        job_title_code=jt_pick if jt_schema_ok else None,
                        phone=ph,
                        login_id=lid,
                    )
                    # 카운터 증가 → 다음 렌더링 시 위젯 키가 바뀌어 빈 폼으로 초기화
                    st.session_state["fo_c_rev"] = _R + 1
                    st.success(f"생성 완료. user_id=`{uid}`")
                    st.rerun()
                except Exception as ex:
                    st.error(str(ex))

with tab_edit:
    if not pin_ok:
        st.info("PIN 확인 후 이용할 수 있습니다.")
    elif not profiles:
        st.info("수정할 프로필이 없습니다.")
    else:
        choices = {f"{p.get('display_name') or p.get('email') or p['user_id'][:8]}… ({p['user_id']})": str(p["user_id"]) for p in profiles}
        label = st.selectbox("스태프 선택", list(choices.keys()))
        uid = choices[label]
        cur = next(p for p in profiles if str(p["user_id"]) == uid)
        c1, c2 = st.columns(2)
        cur_jc = str(cur.get("job_title_code") or "")
        jt_edit_opts = [""] + jt_active_codes
        jt_idx = jt_edit_opts.index(cur_jc) if cur_jc in jt_edit_opts else 0
        with c1:
            new_dn = st.text_input("이름", value=cur.get("display_name") or "", key="fo_ed_dn")
            if jt_schema_ok:
                new_phone = st.text_input("전화번호", value=cur.get("phone") or "", key="fo_ed_ph")
                new_lid = st.text_input("아이디(표시용)", value=cur.get("login_id") or "", key="fo_ed_lid")
                new_jt = st.selectbox(
                    "직급",
                    jt_edit_opts,
                    index=jt_idx,
                    format_func=lambda c: "(없음)" if not c else jt_label_by_code.get(c, c),
                    key="fo_ed_jt",
                )
            else:
                new_phone = str(cur.get("phone") or "")
                new_lid = str(cur.get("login_id") or "")
                new_jt = ""
                st.caption("전화·아이디·직급 편집은 직급 마이그레이션 적용 후 가능합니다.")
            new_rc = st.selectbox(
                "권한 역할",
                role_codes,
                index=role_codes.index(cur["role_code"]) if cur.get("role_code") in role_codes else 0,
                format_func=lambda c: f"{c} — {role_labels.get(c, c)}",
                key="fo_ed_rc",
            )
            new_active = st.checkbox("활성", value=bool(cur.get("active", True)), key="fo_ed_ac")
        current_scope = list_store_scopes_for_user(sb, uid)
        with c2:
            new_scopes = st.multiselect(
                "허용 지점(비우면 전 지점)",
                [str(s["id"]) for s in stores],
                default=[s for s in current_scope if s in store_by_id],
                format_func=lambda i: f"{store_by_id[i]['store_code']} — {store_by_id[i]['name']}",
                key="fo_ed_sc",
            )
        if st.button("프로필·지점 범위 저장"):
            try:
                update_staff_profile_fields(
                    sb,
                    uid,
                    display_name=new_dn,
                    role_code=new_rc,
                    active=new_active,
                    **(
                        {
                            "job_title_code": new_jt or None,
                            "phone": new_phone,
                            "login_id": new_lid,
                        }
                        if jt_schema_ok
                        else {}
                    ),
                )
                replace_store_scopes(sb, uid, new_scopes)
                st.success("저장했습니다.")
                st.rerun()
            except Exception as ex:
                st.error(str(ex))

        if can_admin:
            st.divider()
            st.subheader("프로필만 수동 연결")
            st.caption("이미 Auth에만 있는 사용자에게 `fo_staff_profiles` 행을 붙입니다.")
            orphan_opts = [u for u in auth_by_id.values() if str(u.id) not in {str(p["user_id"]) for p in profiles}]
            if not orphan_opts:
                st.caption("프로필 없는 Auth 사용자가 없습니다.")
            else:
                link_labels = [f"{u.email or u.id} ({u.id})" for u in orphan_opts]
                olab = st.selectbox("Auth 사용자", link_labels, key="fo_link_u")
                oid = orphan_opts[link_labels.index(olab)]
                l_dn = st.text_input("이름(연결)", key="fo_link_dn")
                if jt_schema_ok:
                    l_ph = st.text_input("전화번호(연결)", key="fo_link_ph")
                    l_lid = st.text_input("아이디(연결)", key="fo_link_lid")
                    l_jt_opts = [""] + jt_active_codes
                    l_jt = st.selectbox(
                        "직급(연결)",
                        l_jt_opts,
                        format_func=lambda c: "(없음)" if not c else jt_label_by_code.get(c, c),
                        key="fo_link_jt",
                    )
                else:
                    l_ph = ""
                    l_lid = ""
                    l_jt = ""
                    st.caption("전화·아이디·직급은 마이그레이션 적용 후 연결 폼에서 입력할 수 있습니다.")
                l_rc = st.selectbox(
                    "권한 역할(연결)",
                    role_codes,
                    format_func=lambda c: f"{c} — {role_labels.get(c, c)}",
                    key="fo_link_rc",
                )
                if st.button("프로필 행 추가"):
                    try:
                        upsert_staff_profile(
                            sb,
                            user_id=str(oid.id),
                            email=oid.email,
                            display_name=l_dn,
                            role_code=l_rc,
                            active=True,
                            job_title_code=(l_jt or None) if jt_schema_ok else None,
                            phone=l_ph if jt_schema_ok else None,
                            login_id=l_lid if jt_schema_ok else None,
                        )
                        st.success("연결했습니다.")
                        st.rerun()
                    except Exception as ex:
                        st.error(str(ex))

            st.divider()
            st.subheader("Auth 사용자 삭제")
            st.caption("`fo_staff_*` 행은 DB FK로 함께 삭제됩니다. 되돌릴 수 없습니다.")
            del_pick = st.selectbox(
                "삭제 대상",
                [f"{u.email or '이메일없음'} ({u.id})" for u in auth_by_id.values()],
                key="fo_del_u",
            )
            confirm = st.text_input('확인용으로 "DELETE" 입력', key="fo_del_c")
            if st.button("사용자 삭제", type="primary"):
                if confirm != "DELETE":
                    st.error('확인 문구를 정확히 입력하세요.')
                else:
                    to_del = next(
                        u for u in auth_by_id.values() if f"{u.email or '이메일없음'} ({u.id})" == del_pick
                    )
                    try:
                        delete_staff_user(sb, str(to_del.id))
                        st.success("삭제했습니다.")
                        st.rerun()
                    except Exception as ex:
                        st.error(str(ex))

st.page_link("pages/90_admin_portal.py", label="← 홈")
st.page_link("pages/15_지점·매니저·판매사.py", label="지점·매니저·판매사")
