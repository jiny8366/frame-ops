"""
FRAME OPS · POS 판매 UI — Apple HIG 디자인 토큰 CSS
══════════════════════════════════════════════════════════════════
정책 원칙:
  1. 모든 크기·간격은 CSS 변수(토큰)로만 정의
  2. :root  → iPadOS 기본값 (641px+, 태블릿/PC)
  3. @media (max-width:640px) :root → iOS 토큰 재정의만
  4. 컴포넌트 규칙은 var(--fo-*) 참조 → 미디어쿼리 없이 자동 적응
  5. 레이아웃(flex-wrap/쌓기) 변경만 미디어쿼리로 처리

토큰 체계 (Apple HIG 기반):
  --fo-t-*       Dynamic Type 타이포그래피
  --fo-touch-*   터치 타깃 높이 (HIG 최소 44pt)
  --fo-key-*     숫자 키패드 키 크기
  --fo-sp-*      8pt 그리드 간격
  --fo-r-*       모서리 반경
  --fo-surface-* 표면·배경색
══════════════════════════════════════════════════════════════════
"""

FO_POS_CSS = """
<style>

/* ═══════════════════════════════════════════════════════════════
   § 1.  DESIGN TOKENS
   ─────────────────────────────────────────────────────────────
   :root = iPadOS / PC 기본값
   개발자는 토큰만 참조; 값 변경은 이 블록만 수정
   ═══════════════════════════════════════════════════════════════ */
:root {

  /* ── 타이포그래피 (Apple Dynamic Type · pt ≈ px) ── */
  --fo-t-caption2:    11px;   /* Caption2  */
  --fo-t-caption1:    12px;   /* Caption1  */
  --fo-t-footnote:    13px;   /* Footnote  */
  --fo-t-subhead:     15px;   /* Subheadline */
  --fo-t-callout:     16px;   /* Callout   */
  --fo-t-body:        17px;   /* Body      */
  --fo-t-headline:    17px;   /* Headline (semibold) */
  --fo-t-title3:      20px;   /* Title 3   */
  --fo-t-title2:      22px;   /* Title 2   */
  --fo-t-title1:      28px;   /* Title 1   */
  --fo-t-largetitle:  34px;   /* Large Title */

  /* ── 터치 타깃 높이 (iPadOS / PC) ── */
  /* Apple HIG: 최소 44×44pt, iPad는 마우스 병행이므로 컴팩트 허용 */
  --fo-touch-xs:      36px;   /* 헤더 보조 (마우스 전용) */
  --fo-touch-min:     44px;   /* HIG 최소 — 모든 인터랙티브 요소 하한 */
  --fo-touch-md:      44px;   /* 일반 버튼 (toolbar/nav) */
  --fo-touch-lg:      48px;   /* 강조 버튼 (product-sel/pay-quick) */
  --fo-touch-xl:      52px;   /* 주요 버튼 (add-to-cart) */
  --fo-touch-hero:    56px;   /* CTA 버튼 (저장/완료) */

  /* ── 숫자 키패드 키 크기 (정사각형) ── */
  --fo-key-pin:    52px;   /* PIN 4자리 소형 키패드 */
  --fo-key-stco:   58px;   /* 제품번호 검색 키패드 */
  --fo-key-amt:    68px;   /* 금액 입력 대형 키패드 */

  /* ── 8pt 그리드 간격 ── */
  --fo-sp-1:   4px;   /* 0.5 unit */
  --fo-sp-2:   8px;   /* 1 unit   */
  --fo-sp-3:  12px;   /* 1.5 unit */
  --fo-sp-4:  16px;   /* 2 unit   */
  --fo-sp-5:  20px;   /* 2.5 unit */
  --fo-sp-6:  24px;   /* 3 unit   */
  --fo-sp-8:  32px;   /* 4 unit   */

  /* ── 모서리 반경 (iOS 레이어 기반) ── */
  --fo-r-xs:    6px;   /* 소형 칩/태그 */
  --fo-r-sm:    8px;   /* 인라인 컨테이너 */
  --fo-r-md:   10px;   /* 카드·다이얼로그 default */
  --fo-r-lg:   14px;   /* 대형 패널 */
  --fo-r-xl:   20px;   /* 시트·모달 */
  --fo-r-full: 9999px; /* 캡슐형 */

  /* ── 별칭 (기존 코드 호환) ── */
  --fo-radius:   var(--fo-r-sm);

  /* ── 표면·경계 ── */
  --fo-surface:         rgba(0, 0, 0, 0.35);
  --fo-surface-raised:  rgba(255, 255, 255, 0.05);
  --fo-border:          rgba(255, 255, 255, 0.12);
  --fo-border-strong:   rgba(255, 255, 255, 0.22);
  --fo-tint:            rgba(255, 255, 255, 0.07);  /* hover/active 틴트 */
}

/* ═══════════════════════════════════════════════════════════════
   § 2.  iOS 토큰 재정의 (≤640px)
   ─────────────────────────────────────────────────────────────
   컴포넌트 CSS는 수정 없음 — 토큰 값만 교체 → 자동으로 커짐
   iOS HIG: 손가락 터치 최소 44pt, 주요 CTA는 50~60pt 권장
   ═══════════════════════════════════════════════════════════════ */
@media screen and (max-width: 640px) {
  :root {
    /* 터치 타깃 — 스마트폰 한 손 조작 최적화 */
    --fo-touch-xs:    44px;   /* 최소 기준 올림 */
    --fo-touch-min:   44px;
    --fo-touch-md:    52px;
    --fo-touch-lg:    60px;
    --fo-touch-xl:    64px;
    --fo-touch-hero:  76px;   /* 저장 등 엄지 CTA */

    /* 키패드 키 — 터치 오차 감안해 확대 */
    --fo-key-pin:    56px;
    --fo-key-stco:   60px;
    --fo-key-amt:    64px;
  }
}

/* ═══════════════════════════════════════════════════════════════
   § 3.  전역 구조 제어 (Streamlit 기본 오버라이드)
   ═══════════════════════════════════════════════════════════════ */

/* Streamlit 툴바 숨김 */
[data-testid="stHeader"] {
  height: 0 !important; min-height: 0 !important;
  overflow: hidden !important; display: none !important;
}
/* 최상단 여백 20px */
[data-testid="stMainBlockContainer"], .block-container {
  padding-top: 20px !important;
}

/* ═══════════════════════════════════════════════════════════════
   § 4.  COMPONENT TOKENS  (플랫폼 무관 — 토큰 참조)
   ═══════════════════════════════════════════════════════════════ */

/* ── LCD 디스플레이 (키패드 입력 표시) ── */
.fo-pos-keypad-lcd {
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
  font-size: var(--fo-t-title2);
  font-weight: 700;
  text-align: right;
  padding: var(--fo-sp-2) var(--fo-sp-3);
  border-radius: var(--fo-r-md);
  background: rgba(0, 0, 0, 0.42);
  border: 1px solid var(--fo-border-strong);
  color: #f5f5f7;
}
.fo-pos-keypad-lcd-wrap { margin-bottom: var(--fo-sp-2); }
.fo-pos-keypad-lcd-won  { margin-left: var(--fo-sp-1); font-size: 0.85em; opacity: 0.85; }

/* ── PIN LCD ── */
.fo-pos-pin-lcd {
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
  font-size: var(--fo-t-title2);
  font-weight: 700;
  text-align: center;
  letter-spacing: 0.6rem;
  padding: var(--fo-sp-3) var(--fo-sp-4);
  border-radius: var(--fo-r-md);
  background: rgba(0, 0, 0, 0.42);
  border: 1px solid var(--fo-border-strong);
  color: #f5f5f7;
  margin-bottom: var(--fo-sp-2);
  min-height: 3rem;
}

/* ── POS 판매 타이틀 ── */
.fo-pos-title {
  font-size: var(--fo-t-title2) !important;
  font-weight: 700 !important;
  margin: 0 !important;
  line-height: 1.2 !important;
  white-space: nowrap;
}

/* ── 수량 표시 ── */
.fo-pos-qty-display {
  text-align: center;
  font-size: var(--fo-t-title2);
  font-weight: 700;
  padding: var(--fo-sp-2) 0;
  letter-spacing: 0.04em;
  background: var(--fo-surface);
  border: 1px solid var(--fo-border);
  border-radius: var(--fo-r-sm);
}

/* ── 합계 Metric ── */
[class*="st-key-fo_pos_main_wrap"] [data-testid="stMetric"] {
  background: var(--fo-surface);
  border: 1px solid var(--fo-border);
  border-radius: var(--fo-r-sm);
  padding: var(--fo-sp-2) var(--fo-sp-3);
}
[class*="st-key-fo_pos_main_wrap"] [data-testid="stMetricValue"] {
  font-size: var(--fo-t-title2) !important;
  font-weight: 700 !important;
}

/* ── 금액 입력창 우정렬 ── */
[class*="st-key-fo_pos_pay_amounts"] .stTextInput input,
[class*="st-key-fo_pos_disc_row"]    .stTextInput input {
  text-align: right;
  font-weight: 600;
  font-size: var(--fo-t-callout);
}

/* ── 섹션 h5 간격 ── */
[class*="st-key-fo_pos_main_wrap"] h5 {
  margin-top: var(--fo-sp-3) !important;
  margin-bottom: var(--fo-sp-1) !important;
}

/* ── 인라인 그리드 컨테이너 ── */
[class*="st-key-fo_pos_br_inline_wrap"],
[class*="st-key-fo_pos_st_inline_wrap"],
[class*="st-key-fo_pos_co_inline_wrap"] {
  background: var(--fo-surface-raised);
  border: 1px solid var(--fo-border);
  border-radius: var(--fo-r-sm);
  padding: var(--fo-sp-2);
  margin: var(--fo-sp-1) 0;
}

/* ── 헤더 세로 중앙 정렬 ── */
[class*="st-key-fo_pos_header"] > div > [data-testid="stHorizontalBlock"] {
  align-items: center !important;
}

/* ═══════════════════════════════════════════════════════════════
   § 5.  BUTTON SIZES  (토큰 참조 — 플랫폼별 자동 변경)
   ─────────────────────────────────────────────────────────────
   이 섹션은 절대 수정 금지 — 토큰(§1,§2)만 조정
   ═══════════════════════════════════════════════════════════════ */

/* 헤더 버튼 */
[class*="st-key-fo_pos_header"] .stButton > button {
  min-height: var(--fo-touch-xs) !important;
  font-size: var(--fo-t-callout) !important;
}
[class*="st-key-fo_pos_header"] .stTextInput input,
[class*="st-key-fo_pos_header"] [data-testid="stDateInput"] input {
  font-size: var(--fo-t-subhead) !important;
}

/* 메인 패널 기본 버튼 */
[class*="st-key-fo_pos_main_wrap"] .stButton > button {
  min-height: var(--fo-touch-md) !important;
  font-size: var(--fo-t-callout) !important;
}

/* 브랜드·제품번호/칼라 선택 */
[class*="st-key-fo_pos_product_sel"] .stButton > button {
  min-height: var(--fo-touch-lg) !important;
  font-size: var(--fo-t-body) !important;
  font-weight: 600 !important;
  white-space: nowrap !important;
  overflow: hidden !important;
  text-overflow: ellipsis !important;
}

/* 수량 +/- */
[class*="st-key-fo_pos_qty_row"] .stButton > button {
  min-height: var(--fo-touch-md) !important;
  font-size: var(--fo-t-title3) !important;
  font-weight: 700 !important;
}

/* 장바구니 담기 */
[class*="st-key-fo_pos_add_btn"] .stButton > button {
  min-height: var(--fo-touch-xl) !important;
  font-size: var(--fo-t-headline) !important;
  font-weight: 700 !important;
}

/* 결제 빠른버튼 */
[class*="st-key-fo_pos_pay_quick"] .stButton > button {
  min-height: var(--fo-touch-lg) !important;
  font-size: var(--fo-t-callout) !important;
  font-weight: 600 !important;
}

/* 금액 '입력' 팝업 버튼 */
[class*="st-key-fo_pos_amt_pop_"] .stButton > button {
  min-height: var(--fo-touch-md) !important;
  font-size: var(--fo-t-subhead) !important;
}

/* 저장 버튼 (Hero CTA) */
[class*="st-key-fo_pos_save_btn"] .stButton > button {
  min-height: var(--fo-touch-hero) !important;
  font-size: var(--fo-t-title3) !important;
  font-weight: 700 !important;
  letter-spacing: 0.05em !important;
}

/* 장바구니 삭제 */
[class*="st-key-fo_pos_cart_wrap"] .stButton > button {
  min-height: var(--fo-touch-min) !important;
  min-width:  var(--fo-touch-min) !important;
  font-size: var(--fo-t-footnote) !important;
  padding: var(--fo-sp-1) var(--fo-sp-2) !important;
}

/* 인라인 그리드 버튼 */
[class*="st-key-fo_pos_br_inline_wrap"] .stButton > button,
[class*="st-key-fo_pos_st_inline_wrap"] .stButton > button,
[class*="st-key-fo_pos_co_inline_wrap"] .stButton > button {
  min-height: var(--fo-touch-xs) !important;
  font-size: var(--fo-t-footnote) !important;
  padding: var(--fo-sp-1) var(--fo-sp-2) !important;
  white-space: nowrap !important;
  overflow: hidden !important;
  text-overflow: ellipsis !important;
}

/* ── 전역 입력 필드 ── */
.stTextInput input, .stNumberInput input {
  font-size: var(--fo-t-callout) !important;
}

/* ═══════════════════════════════════════════════════════════════
   § 6.  KEYPAD SCOPES  (PIN / STCO / Amount)
   ─────────────────────────────────────────────────────────────
   키 크기는 --fo-key-* 토큰으로 제어 → § 1,2에서 변경
   ═══════════════════════════════════════════════════════════════ */

/* ── 공통 키패드 열 고정 믹스인 ── */
[class*="st-key-fo_pos_stco_kpd_scope"] [data-testid="stHorizontalBlock"],
[class*="st-key-fo_pos_pin_kpd_scope"]  [data-testid="stHorizontalBlock"],
[class*="st-key-fo_pos_amt_keypad_scope_"] [data-testid="stHorizontalBlock"] {
  flex-wrap: nowrap !important;
  gap: var(--fo-sp-1) !important;
}
[class*="st-key-fo_pos_stco_kpd_scope"] [data-testid="stHorizontalBlock"] > [data-testid="column"],
[class*="st-key-fo_pos_pin_kpd_scope"]  [data-testid="stHorizontalBlock"] > [data-testid="column"],
[class*="st-key-fo_pos_amt_keypad_scope_"] [data-testid="stHorizontalBlock"] > [data-testid="column"] {
  flex: 1 1 0 !important;
  min-width: 0 !important;
  padding: 0 var(--fo-sp-1) !important;
}

/* ── STCO 키패드 ── */
[class*="st-key-fo_pos_stco_kpd_scope"] {
  width: 210px; min-width: 210px; max-width: 210px;
  margin-left: 0; margin-right: auto;
  border: 2px solid var(--fo-border-strong);
  border-radius: var(--fo-r-md);
  padding: var(--fo-sp-3) var(--fo-sp-2);
  box-sizing: border-box;
}
[class*="st-key-fo_pos_stco_kpd_scope"] [data-testid="stButton"] > button {
  width: 100% !important;
  height: var(--fo-key-stco) !important;
  min-height: var(--fo-key-stco) !important;
  max-height: var(--fo-key-stco) !important;
  aspect-ratio: 1 / 1 !important;
  font-size: var(--fo-t-title3) !important;
  font-weight: 650 !important;
  padding: 0 !important;
  line-height: 1 !important;
  display: inline-flex !important;
  align-items: center !important;
  justify-content: center !important;
}

/* ── PIN 키패드 ── */
[class*="st-key-fo_pos_pin_kpd_scope"] {
  width: 220px; min-width: 220px; max-width: 220px;
  margin-left: auto; margin-right: auto;
  border: 2px solid var(--fo-border-strong);
  border-radius: var(--fo-r-md);
  padding: var(--fo-sp-2);
  box-sizing: border-box;
}
[class*="st-key-fo_pos_pin_kpd_scope"] [data-testid="stButton"] > button {
  width: 100% !important;
  height: var(--fo-key-pin) !important;
  min-height: var(--fo-key-pin) !important;
  max-height: var(--fo-key-pin) !important;
  aspect-ratio: 1 / 1 !important;
  font-size: var(--fo-t-title3) !important;
  font-weight: 650 !important;
  padding: 0 !important;
  line-height: 1 !important;
  display: inline-flex !important;
  align-items: center !important;
  justify-content: center !important;
}

/* ── 금액 키패드 ── */
[class*="st-key-fo_pos_amt_keypad_scope_"] {
  width: 236px; min-width: 236px; max-width: 236px;
  margin-left: auto; margin-right: auto;
  border: 2px solid var(--fo-border-strong);
  border-radius: var(--fo-r-md);
  padding: var(--fo-sp-2);
  box-sizing: border-box;
}
[class*="st-key-fo_pos_amt_keypad_scope_"] [data-testid="stButton"] > button {
  width: 100% !important;
  height: var(--fo-key-amt) !important;
  min-height: var(--fo-key-amt) !important;
  max-height: var(--fo-key-amt) !important;
  aspect-ratio: 1 / 1 !important;
  font-size: var(--fo-t-title2) !important;
  font-weight: 700 !important;
  padding: 0 !important;
  line-height: 1 !important;
  display: inline-flex !important;
  align-items: center !important;
  justify-content: center !important;
}

/* ─ 금액 키패드 다이얼로그 위치 고정 ─ */
[data-baseweb="modal"]:has([class*="st-key-fo_pos_amt_keypad_scope_"]) [role="dialog"] {
  margin-top: 0 !important;
  margin-bottom: 0 !important;
  padding-top: 0 !important;
  padding-bottom: 0 !important;
}

/* ─ PIN 키패드 다이얼로그 화면 중앙 ─ */
div[data-testid="stDialog"]:has([class*="st-key-fo_pos_pin_kpd_scope"]) {
  position: fixed !important;
  top: 50% !important; left: 50% !important;
  right: auto !important; bottom: auto !important;
  transform: translate(-50%, -50%) !important;
  width: 300px !important; min-width: 300px !important; max-width: 300px !important;
  margin: 0 !important;
}
div[data-testid="stDialog"]:has([class*="st-key-fo_pos_pin_kpd_scope"]) [role="dialog"],
div[data-testid="stDialog"]:has([class*="st-key-fo_pos_pin_kpd_scope"]) [role="document"] {
  padding: var(--fo-sp-2) !important;
  overflow: visible !important;
  margin: 0 !important;
}

/* ═══════════════════════════════════════════════════════════════
   § 7.  DIALOG COMPONENTS
   ═══════════════════════════════════════════════════════════════ */

/* ── 제품번호/칼라 선택 다이얼로그 ── */
[data-baseweb="modal"]:has([class*="st-key-fo_pos_stco_kpd_scope"]) [role="dialog"] {
  width: 640px !important; min-width: 640px !important; max-width: 640px !important;
  max-height: 720px !important;
  overflow-y: auto !important;
}

/* ── STCO 검색 결과 리스트 ── */
[class*="st-key-fo_pos_stco_results"] {
  border: 1px solid var(--fo-border);
  border-radius: var(--fo-r-sm);
  overflow: hidden;
}
[class*="st-key-fo_pos_stco_results"] [data-testid="stButton"] {
  margin: 0 !important;
  padding: 0 !important;
}
[class*="st-key-fo_pos_stco_results"] [data-testid="stButton"] > button {
  background: transparent !important;
  border: none !important;
  border-bottom: 1px solid var(--fo-border) !important;
  border-radius: 0 !important;
  box-shadow: none !important;
  text-align: left !important;
  font-size: var(--fo-t-subhead) !important;
  min-height: var(--fo-touch-md) !important;
  padding: var(--fo-sp-2) var(--fo-sp-4) !important;
  white-space: nowrap !important;
  overflow: hidden !important;
  text-overflow: ellipsis !important;
  color: inherit !important;
  width: 100% !important;
}
[class*="st-key-fo_pos_stco_results"] [data-testid="stButton"] > button:hover {
  background: var(--fo-tint) !important;
}
[class*="st-key-fo_pos_stco_results"] [data-testid="stButton"]:last-child > button {
  border-bottom: none !important;
}

/* ── 브랜드 선택 다이얼로그 600×700px ── */
[data-baseweb="modal"]:has([class*="st-key-fo_pos_brand_dlg_scope"]) [role="dialog"] {
  width: 620px !important; min-width: 620px !important; max-width: 620px !important;
  max-height: 700px !important;
  overflow-y: auto !important;
}
[class*="st-key-fo_pos_brand_dlg_scope"] [data-testid="stHorizontalBlock"] {
  flex-wrap: nowrap !important;
  gap: var(--fo-sp-1) !important;
}
[class*="st-key-fo_pos_brand_dlg_scope"] [data-testid="stButton"] > button {
  height: 50px !important;
  min-height: 50px !important; max-height: 50px !important;
  font-size: var(--fo-t-subhead) !important;
  white-space: nowrap !important;
  overflow: hidden !important;
  text-overflow: ellipsis !important;
  padding: 0 var(--fo-sp-2) !important;
}

/* ═══════════════════════════════════════════════════════════════
   § 8.  iPadOS LAYOUT OVERRIDES (≥641px)
   ─────────────────────────────────────────────────────────────
   크기는 토큰이 처리 — 여기서는 레이아웃·밀도만 조정
   ═══════════════════════════════════════════════════════════════ */
@media screen and (min-width: 641px) {
  /* 금액 입력 팝업 열 하단 정렬 */
  [class*="st-key-fo_pos_amt_pop_"] {
    display: flex !important;
    flex-direction: column !important;
    justify-content: flex-end !important;
  }
}

/* ═══════════════════════════════════════════════════════════════
   § 9.  iOS LAYOUT OVERRIDES (≤640px)
   ─────────────────────────────────────────────────────────────
   크기 변경은 § 2 토큰이 처리 — 여기서는 쌓기/래핑만
   ═══════════════════════════════════════════════════════════════ */
@media screen and (max-width: 640px) {

  /* 메인 상품/결제 컬럼 → 세로 쌓기 */
  [class*="st-key-fo_pos_main_wrap"] > div > [data-testid="stHorizontalBlock"] {
    flex-wrap: wrap !important;
  }
  [class*="st-key-fo_pos_main_wrap"] > div > [data-testid="stHorizontalBlock"] > [data-testid="column"] {
    width: 100% !important; flex: 0 0 100% !important; min-width: 100% !important;
  }

  /* 헤더 → 2×2 그리드 (타이틀+검색 / 지점명+날짜) */
  [class*="st-key-fo_pos_header"] > div > [data-testid="stHorizontalBlock"] {
    flex-wrap: wrap !important;
    align-items: center !important;
    gap: var(--fo-sp-1) 0 !important;
  }
  [class*="st-key-fo_pos_header"] > div > [data-testid="stHorizontalBlock"] > [data-testid="column"]:nth-child(1),
  [class*="st-key-fo_pos_header"] > div > [data-testid="stHorizontalBlock"] > [data-testid="column"]:nth-child(4) {
    flex: 0 0 50% !important; width: 50% !important; min-width: 0 !important;
  }
  [class*="st-key-fo_pos_header"] > div > [data-testid="stHorizontalBlock"] > [data-testid="column"]:nth-child(2),
  [class*="st-key-fo_pos_header"] > div > [data-testid="stHorizontalBlock"] > [data-testid="column"]:nth-child(3) {
    flex: 0 0 50% !important; width: 50% !important; min-width: 0 !important;
  }

  /* 카드·현금 입력 → 세로 쌓기 */
  [class*="st-key-fo_pos_pay_amounts"] [data-testid="stHorizontalBlock"],
  [class*="st-key-fo_pos_disc_row"]    [data-testid="stHorizontalBlock"] {
    flex-wrap: wrap !important;
  }
  [class*="st-key-fo_pos_pay_amounts"] [data-testid="stHorizontalBlock"] > [data-testid="column"],
  [class*="st-key-fo_pos_disc_row"]    [data-testid="stHorizontalBlock"] > [data-testid="column"] {
    width: 100% !important; flex: 0 0 100% !important; min-width: 100% !important;
  }

  /* 금액 입력 팝업 — 세로 하단 정렬 */
  [class*="st-key-fo_pos_amt_pop_"] {
    display: flex !important;
    flex-direction: column !important;
    justify-content: flex-end !important;
    padding-bottom: var(--fo-sp-1) !important;
  }

  /* 금액 키패드 다이얼로그 — 모바일 화면 중앙 */
  div[data-testid="stDialog"]:has([class*="st-key-fo_pos_amt_keypad_scope_"]) {
    position: fixed !important;
    top: 50% !important; left: 50% !important;
    right: auto !important; bottom: auto !important;
    transform: translate(-50%, -50%) !important;
    width: 290px !important; min-width: 290px !important; max-width: 290px !important;
    margin: 0 !important;
  }
  div[data-testid="stDialog"]:has([class*="st-key-fo_pos_amt_keypad_scope_"]) > div,
  div[data-testid="stDialog"]:has([class*="st-key-fo_pos_amt_keypad_scope_"]) [role="dialog"],
  div[data-testid="stDialog"]:has([class*="st-key-fo_pos_amt_keypad_scope_"]) [role="document"] {
    padding: var(--fo-sp-2) !important;
    overflow: visible !important;
    margin: 0 !important;
  }

  /* 인라인 그리드 — 모바일 열 고정 */
  [class*="st-key-fo_pos_br_inline_wrap"] [data-testid="stHorizontalBlock"],
  [class*="st-key-fo_pos_st_inline_wrap"] [data-testid="stHorizontalBlock"],
  [class*="st-key-fo_pos_co_inline_wrap"] [data-testid="stHorizontalBlock"] {
    flex-wrap: nowrap !important;
    gap: var(--fo-sp-1) !important;
  }
  [class*="st-key-fo_pos_br_inline_wrap"] [data-testid="stHorizontalBlock"] > [data-testid="column"],
  [class*="st-key-fo_pos_st_inline_wrap"] [data-testid="stHorizontalBlock"] > [data-testid="column"],
  [class*="st-key-fo_pos_co_inline_wrap"] [data-testid="stHorizontalBlock"] > [data-testid="column"] {
    flex: 1 1 0 !important; min-width: 0 !important; padding: 0 var(--fo-sp-1) !important;
  }

}

/* ═══════════════════════════════════════════════════════════════
   § 10. PLACEHOLDER — FO_POS_KPD_DLG 위치 변수
   ═══════════════════════════════════════════════════════════════ */
[data-baseweb="modal"]:has([class*="st-key-fo_pos_amt_keypad_scope_"]) [role="dialog"],
[data-baseweb="modal"]:has([class*="st-key-fo_pos_amt_keypad_scope_"]) [role="document"] {
  margin-top: 0 !important;
  margin-bottom: 0 !important;
  padding-top: 0 !important;
  padding-bottom: 0 !important;
}

</style>
"""
