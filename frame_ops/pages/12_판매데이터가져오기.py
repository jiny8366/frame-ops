"""외부 실판매 CSV → fo_sales / fo_sale_lines (재고 차감)."""

from __future__ import annotations

import sys
from pathlib import Path

import pandas as pd
import streamlit as st

_ROOT = Path(__file__).resolve().parents[1]
if str(_ROOT) not in sys.path:
    sys.path.insert(0, str(_ROOT))

st.set_page_config(
    page_title="판매 데이터 가져오기 — FRAME OPS",
    layout="wide",
    initial_sidebar_state="collapsed",
)

from lib.service_portal import render_frame_ops_chrome  # noqa: E402

render_frame_ops_chrome()

from lib.bukchon_sales_xlsx import (  # noqa: E402
    bukchon_sales_xlsx_all_mmdd_bytes_to_csv_text,
    bukchon_sales_xlsx_bytes_to_csv_text,
    list_mmdd_sheet_names_from_bytes,
)
from lib.sales_import import (  # noqa: E402
    apply_sale_drafts,
    parse_sales_import_csv,
    validate_sale_drafts,
)
from lib.supabase_client import get_supabase  # noqa: E402

st.title("판매 데이터 가져오기")
st.caption(
    "표준 **CSV** 또는 북촌 **판매일지 xlsx** 를 POS와 동일 규칙으로 넣습니다. "
    "검증 통과 후에만 DB에 반영하세요. 재고는 **차감**되며, 정산된 날·적재 시작일 이전 날은 거절됩니다."
)
st.page_link("pages/02_POS판매.py", label="→ POS 판매(수동 입력)")
st.page_link("pages/11_통계리포트.py", label="→ 통계·리포트")

with st.expander("CSV 필수 컬럼 안내", expanded=False):
    st.markdown(
        """
| 컬럼 | 설명 |
|------|------|
| `receipt_key` | 한 전표를 묶는 키(파일 내 고유 권장) |
| `store_code` | `fo_stores.store_code` (예: BKC01) |
| `sold_at` | ISO 시각(타임존 포함 권장). 예: `2026-04-10T14:30:00+09:00` |
| `product_code` 또는 `barcode` | 상품 매칭 (`fo_products`) |
| `quantity` | 수량 |
| `unit_price` | 라인 단가(원, 정수) |
| `cash_amount`, `card_amount` | **첫 행**에 전표 합계와 맞출 것 |
| `discount_total` | 전표 할인 합(없으면 0) |

**검증식:** `sum(단가×수량 − 행할인) − discount_total = 현금 + 카드`  
(소수 수량은 금액을 반올림해 합산합니다.)

선택: `line_discount`, `cost_price_at_sale`, `discount_type_code`, `seller_code`, `clerk_note`, `idempotency_key`
        """
    )

try:
    sb = get_supabase()
except RuntimeError as e:
    st.error(str(e))
    st.stop()


def _run_parse_validate(csv_text: str) -> None:
    st.session_state["fo_imp_text"] = csv_text
    st.session_state.pop("fo_imp_err", None)
    st.session_state.pop("fo_imp_warn", None)
    st.session_state.pop("fo_imp_drafts", None)
    drafts = parse_sales_import_csv(csv_text)
    err, warn = validate_sale_drafts(sb, drafts)
    st.session_state["fo_imp_drafts"] = drafts
    st.session_state["fo_imp_err"] = err
    st.session_state["fo_imp_warn"] = warn


with st.expander("북촌 판매일지 (.xlsx)", expanded=True):
    st.caption(
        "시트 **0410** = 4월 10일. A~E열: 번호·**모델번호**·**컬러번호**·**금액(실판매가)**·**결제방법**(현금/카드). "
        "모델 `01:01` 등은 **표시만 시각처럼 보일 뿐 상품코드 조각은 텍스트**이며, 엑셀이 셀을 「시간」으로 저장해도 `01:01-C01` 형태로 맞춥니다."
    )
    bx = st.file_uploader("판매일지 xlsx", type=["xlsx"], key="fo_buk_xlsx")
    mmdd: list[str] = []
    if bx is not None:
        try:
            mmdd = list_mmdd_sheet_names_from_bytes(bx.getvalue())
        except Exception as ex:
            st.warning(f"시트 목록 읽기 실패: {ex}")
    c1, c2 = st.columns(2)
    with c1:
        all_mmdd = st.checkbox("MMDD 시트 전부(0410·0411·…)", value=False, key="fo_buk_all")
    with c2:
        sheet_pick = st.selectbox(
            "시트(단일)",
            mmdd if mmdd else ["(xlsx 먼저 선택)"],
            index=0,
            disabled=not mmdd or all_mmdd,
            key="fo_buk_sheet",
        )
    if bx is not None and st.button("xlsx → 파싱·검증", type="primary", key="fo_buk_go"):
        try:
            raw = bx.getvalue()
            if all_mmdd:
                csv_text = bukchon_sales_xlsx_all_mmdd_bytes_to_csv_text(raw)
            else:
                if not mmdd or sheet_pick == "(xlsx 먼저 선택)":
                    st.error("시트를 선택하세요.")
                    st.stop()
                _biz, csv_text = bukchon_sales_xlsx_bytes_to_csv_text(raw, sheet_pick)
            _run_parse_validate(csv_text)
            st.rerun()
        except Exception as ex:
            st.error(f"xlsx 처리 실패: {ex}")

st.divider()
up = st.file_uploader("CSV 파일", type=["csv"])
paste = st.text_area("또는 CSV 내용 붙여넣기", height=160, placeholder="헤더 포함 전체 CSV…")

text = ""
if up is not None:
    text = up.getvalue().decode("utf-8-sig", errors="replace")
elif (paste or "").strip():
    text = paste.strip()
elif st.session_state.get("fo_imp_text"):
    text = st.session_state["fo_imp_text"]

if not text:
    st.info("북촌 **xlsx** 를 변환하거나, CSV를 올리거나 붙여 넣은 뒤 **파싱·검증**을 누르세요.")
    st.stop()

if st.button("파싱·검증", type="primary"):
    try:
        _run_parse_validate(text)
    except Exception as ex:
        st.error(f"파싱 실패: {ex}")
        st.stop()
    st.rerun()

drafts = st.session_state.get("fo_imp_drafts")
if not drafts:
    st.info("**파싱·검증** 버튼을 눌러 형식·지점·상품·결제 금액·정산 여부를 확인하세요.")
    st.stop()

errs = st.session_state.get("fo_imp_err") or []
warns = st.session_state.get("fo_imp_warn") or []

st.success(f"파싱됨: **{len(drafts)}**건의 판매 전표 · 라인 합계 **{sum(len(s.lines) for s in drafts)}**행")
preview = []
for s in drafts:
    preview.append(
        {
            "receipt_key": s.receipt_key,
            "store_code": s.store_code,
            "sold_at": s.sold_at.isoformat(),
            "lines": len(s.lines),
            "cash": s.cash_amount,
            "card": s.card_amount,
            "discount": s.discount_total,
        }
    )
st.dataframe(pd.DataFrame(preview), hide_index=True, use_container_width=True)

for w in warns:
    st.warning(w)
for e in errs:
    st.error(e)

if errs:
    st.stop()

st.checkbox("검증 결과를 확인했으며, 재고 차감·판매 반영에 동의합니다.", key="fo_imp_ok")

if st.button("DB에 반영", type="primary", disabled=not st.session_state.get("fo_imp_ok")):
    text2 = st.session_state.get("fo_imp_text") or text
    try:
        drafts2 = parse_sales_import_csv(text2)
    except Exception as ex:
        st.error(f"파싱 실패: {ex}")
        st.stop()
    err2, _w2 = validate_sale_drafts(sb, drafts2)
    if err2:
        for e in err2:
            st.error(e)
        st.error("재검증에서 오류가 있어 중단했습니다. 데이터를 수정한 뒤 다시 진행하세요.")
        st.stop()
    try:
        log = apply_sale_drafts(sb, drafts2)
    except Exception as ex:
        st.error(f"적재 중 오류(일부만 반영되었을 수 있음): {ex}")
        st.stop()
    for line in log:
        st.text(line)
    st.success("반영 완료")
    st.session_state.pop("fo_imp_drafts", None)
    st.session_state.pop("fo_imp_err", None)
    st.session_state.pop("fo_imp_warn", None)
    st.session_state.pop("fo_imp_text", None)
    st.session_state.pop("fo_imp_ok", None)
    st.balloons()
