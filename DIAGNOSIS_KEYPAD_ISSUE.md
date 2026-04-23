# 긴급 진단: "숫자 키패드 — 한 키마다 서버 통신·화면 리로딩" 이슈

**진단일**: 2026-04-23
**진단자**: Claude (자동 분석)
**보고된 증상**: "금액 입력기/숫자 키패드에서 숫자 하나 누를 때마다 서버 통신하고 화면 리로딩하는 것처럼 보인다"

---

## ⚠️ 전제 정정 — 진단 프레임과 실제 코드의 불일치

요청 프레임은 **Next.js (tsx/ts 파일, TASK 7 Provider fallback)** 를 가리키고 있으나, 실제 문제 코드는 **Streamlit (Python)** 입니다.

### 근거
지시받은 grep 명령 그대로 실행:
```bash
grep -rn "keypad|Keypad|numpad|NumPad|amount|Amount|결제|금액|할인" \
  --include="*.tsx" --include="*.ts" \
  app/ components/ hooks/ lib/ | grep -v node_modules
```

**결과**: `app/api/orders/route.ts:3` 의 **주석 한 줄** (`// POST: 신규 매출 등록 (POS 결제 완료 시)`) 이 유일한 매치. **키패드 컴포넌트는 `web/` 디렉토리에 존재하지 않음**.

보다 넓은 스캔으로 전체 Next.js 앱 (`web/**/*.ts(x)`) 매치 3건 중:
- `web/types/database.ts` — Supabase 자동 생성 타입의 `amount` 필드 (테이블 스키마)
- `web/types/index.ts` — `Sale.cash_amount`, `card_amount`, `discount_total` 등 타입 정의
- `web/app/api/orders/route.ts` — API Route (서버 사이드), UI 없음

즉 **Next.js 측에는 금액 입력 UI/키패드가 아예 구현되어 있지 않음**.

### 실제 키패드 위치

| 경로 | 기능 |
|---|---|
| `frame_ops/pages/02_POS판매.py:897` (`_render_amount_keypad_fragment`) | 카드/현금/할인 금액 입력 키패드 |
| `frame_ops/pages/02_POS판매.py:985` (`_stco_keypad_fragment`) | 제품번호(스타일코드/컬러) 검색 키패드 |

둘 다 **Streamlit `@st.dialog` 내부에서 `@st.fragment`로 호출**되는 구조.

---

## 📐 Streamlit 키패드 아키텍처 상기

사용자가 "매 키마다 서버 통신" 이라고 보고한 현상은 **Streamlit의 설계상 inherent 동작**입니다. 모든 Streamlit 위젯 인터랙션은:

```
[Browser] 버튼 클릭 
   ↓ WebSocket 메시지
[Server] 스크립트(또는 fragment) 재실행
   ↓ DOM diff 계산
[Server] 새 DOM 전송
   ↓ WebSocket 응답
[Browser] 렌더링 갱신
```

**≈ 클릭당 1회의 WebSocket 왕복 왕복**이 architectural하게 필연. `@st.fragment` 는 "서버에서 재실행되는 **범위**"를 줄이지만, WebSocket 왕복 자체는 없애지 못합니다.

이것이 사용자가 느끼는 "서버 통신 + 화면 리로딩" 의 정체입니다. 코드 버그가 아니라 **Streamlit 플랫폼 특성**입니다.

---

## 🔎 Anti-Pattern 체크리스트 [A–D] 적용 결과

요청받은 4개 카테고리를 Streamlit 문맥에 맞춰 검증.

### [A] 매 입력마다 서버 호출 가능성

React 문맥 예시: `useSWR(\`/api/x?q=${input}\`)`, `onChange` 내 `fetch()`, `useEffect` 에서 fetch deps 에 input.

Streamlit 동등 검증:

| 키패드 | 디지트 누름 시 DB/API 호출 | 비고 |
|---|---|---|
| `_render_amount_keypad_fragment` (금액) | **없음** (`_append(s)` → session_state 갱신만) | ✓ 안전 |
| `_stco_keypad_fragment` (제품번호 검색) | **있음**: line 1044 `_cached_products_by_style_prefix(url, brand_id, _draft_now)` | ⚠ 의도된 동작(검색as-you-type) + `@st.cache_data(ttl=60)` 캐시 |

금액 키패드: 디지트 클릭 → 순수 session_state 업데이트. DB/HTTP 호출 0건. 사용자의 "서버 통신" 감각은 **Streamlit WebSocket 왕복 그 자체** (fragment rerun). ⇒ **코드 측 anti-pattern 없음**.

### [B] 상위 컴포넌트 리렌더 폭주

React 문맥: 부모에 `useSWR` 있으면 자식 전부 리렌더.

Streamlit 동등 검증:
- `_render_amount_keypad_fragment` 는 **`@st.fragment` 데코레이터 적용됨** (line 897). 버튼 클릭 시 **프래그먼트 본문만 재실행**, 호출부 (`_dialog_fo_pos_card_amount`, `_render_amount_keypad`, 메인 스크립트 1616줄) 는 재실행 안 됨.
- `_stco_keypad_fragment` 도 동일하게 `@st.fragment` 적용됨 (line 985).
- 두 프래그먼트가 포함된 `@st.dialog` 함수 (`_dialog_fo_pos_card_amount` 등) 역시 인터랙션 시 다이얼로그 body 전체를 rerun 하지 않음 — 프래그먼트가 내부에 있어 scope이 그 수준에서 차단됨.

⇒ **상위 리렌더 문제 없음**.

### [C] router 오용

React 문맥: `router.push/refresh` 를 키 입력 핸들러에서 호출.

Streamlit 동등 (`st.rerun()`) 검증:

| 위치 | 호출 조건 | 분석 |
|---|---|---|
| `_render_amount_keypad_fragment:959` | "**적용**" 버튼 클릭 시만 | 디지트 입력과 무관. ✓ |
| `_stco_keypad_fragment:1069` | **상품 선택** 버튼 클릭 시만 | 디지트 입력과 무관. ✓ |
| 키패드 내부 digit/clear/backspace 핸들러 | `st.rerun()` **없음** | ✓ |

⇒ **디지트 입력 경로에서 `st.rerun()` 호출 없음**.

### [D] 렌더링 중 비동기 작업

React 문맥: 컴포넌트 본문에서 바로 `fetch()`.

Streamlit 동등 검증:
- 금액 키패드 fragment 본문: LCD 렌더(session_state 읽기), 컬럼/버튼 렌더, "적용" 버튼 핸들러. **DB/HTTP 호출 없음**.
- STCO 키패드 fragment 본문 (line 1044): `_cached_products_by_style_prefix(url, brand_id, _draft_now)` 호출. 이것은 **`@st.cache_data(ttl=60, ...)` 적용된 함수** — 캐시 hit 시 DB 안 탐. 의도된 search-as-you-type.

⇒ **금액 키패드 본문에는 비동기 작업 없음**. STCO 키패드는 의도적 검색 쿼리.

---

## 📊 심각도 평가

| 지점 | 심각도 | 판단 |
|---|---|---|
| 금액 키패드 `@st.fragment` 누락 여부 | 🟢 None | 이미 적용됨 |
| 금액 키패드 내 DB 호출 | 🟢 None | 없음 |
| STCO 키패드 내 DB 호출 | 🟡 Medium (의도됨) | 디지트마다 prefix 쿼리, TTL=60s 캐시. 카탈로그 성장 시 누적 비용 가능 |
| `st.rerun()` 디지트 경로 오용 | 🟢 None | 없음 |
| 상위 리렌더 유발 | 🟢 None | 프래그먼트 scope 정상 |
| **"서버 통신 느낌"의 진짜 원인** | **🟠 High (플랫폼)** | Streamlit 아키텍처 — 모든 위젯 클릭 = WebSocket 왕복 |

---

## 🌐 네트워크 탭 시뮬레이션 ("1234" 입력)

### 금액 키패드 ("카드" 10,000원 입력 가정 — "1" "0" "0" "0" "0")
| 액션 | WebSocket 왕복 | HTTP/DB 쿼리 | 영향 범위 (재실행 코드량) |
|---|---:|---:|---|
| "입력" 버튼 클릭 (다이얼로그 오픈) | 1 | 0 | 전체 스크립트 1616줄 |
| "1" 클릭 | 1 | 0 | 프래그먼트 ~70줄 |
| "0" 클릭 × 4 | 4 | 0 | 프래그먼트 ~70줄 × 4 |
| "적용" 클릭 (다이얼로그 닫기) | 1 | 0 | 전체 스크립트 1616줄 |
| **합계** | **7** | **0** | — |

### STCO 키패드 ("1234" prefix 검색 가정)
| 액션 | WebSocket 왕복 | DB 쿼리 | 비고 |
|---|---:|---:|---|
| 다이얼로그 오픈 | 1 | 0 | — |
| "1" 클릭 | 1 | 1 | prefix="1" cache miss |
| "2" 클릭 | 1 | 1 | prefix="12" cache miss |
| "3" 클릭 | 1 | 1 | prefix="123" cache miss |
| "4" 클릭 | 1 | 1 | prefix="1234" cache miss |
| 상품 버튼 클릭 (선택 완료) | 1 | 0 | — |
| **합계** | **6** | **4** | 캐시 TTL 내 재입력 시 DB 0 |

**감각 해석**: 사용자가 "매 키마다 서버 통신" 이라고 보고한 것은 **금액 키패드**든 **STCO 키패드**든 **WebSocket 왕복이 디지트마다 발생**하기 때문. 이는 정상이며, 제거하려면 키패드를 서버 위젯이 아닌 **클라이언트 측 JS 컴포넌트**로 구현해야 함.

---

## 🔄 이번 세션 최적화(TASK 1–8 및 POS 단계 1–3)가 이 문제에 영향?

### TASK 7 (Provider fallback) — 보고서에 지적된 의심 후보
**결론: 무관.** 근거:
- TASK 7 수정 파일: `web/app/providers.tsx`, `web/app/layout.tsx`, `web/hooks/useFramesData.ts` — **전부 Next.js 측**.
- 이 파일들은 Streamlit POS 판매 화면(`frame_ops/pages/02_POS판매.py`) 와 **코드 연결 없음**. 빌드 시스템, 런타임, 배포 환경(Vercel vs Railway) 모두 별개.
- 사용자가 체감한 키패드 느림은 Streamlit 앱이며 TASK 7은 이 앱에 어떤 코드도 주입하지 않음.

### POS 단계 1 (`a51cabc` — 상품 피커 DISTINCT 뷰)
**결론: 무관.** 근거:
- 수정 함수: `_cached_style_codes`, `_cached_color_codes` (in `fo_product_pick_utils.py`).
- 이 함수는 `load_distinct_style_codes` / `load_distinct_color_codes` 로 호출되며, grep 결과 **키패드 flow 안에서 호출되지 않음**. (호출부: `02_POS판매.py:1137/1178` 등 — dead code로 삭제된 `_style_inline_grid` / `_color_inline_grid` 내부. 현재 활성 경로에서 미사용.)
- 오히려 DB 레벨 DISTINCT로 전송량을 줄이는 개선이라 regression 방향 아님.

### POS 단계 2 (`0980978` — Client lru_cache + dead code 제거)
**결론: 무관.** 근거:
- `_build_supabase_client` 에 `@lru_cache` 추가 — Supabase Client 재생성 비용을 감소시킴. 개선만 가능, 저하 불가.
- 제거된 dead code (`_style_inline_grid`, `_color_inline_grid`, 미사용 state 키 7개) — 호출 0건 확인 후 삭제. 실행 경로 변화 없음.

### POS 단계 3 (`d8fbad6` — perf 계측)
**결론: 무관 (env 플래그 OFF 상태).** 근거:
- `@perf_timed` 는 `PERF_LOG_ENABLED=False` 일 때 `if not PERF_LOG_ENABLED: return fn` 으로 **원본 함수를 그대로 반환** — 데코레이터 no-op.
- 스크립트 최상단/최하단 마커도 `if _PERF_ON:` 로 gating. 비활성 시 실행 안 됨.
- `FRAME_OPS_PERF_LOG=1` 이 Railway 환경변수에 명시적으로 설정되어야 영향 발생.

⇒ **이번 세션의 모든 변경은 키패드 느림에 기여 불가**. 사용자가 체감한 증상은 **Streamlit 아키텍처의 기저적 특성**이며, 커밋 전후 동일해야 함.

---

## 🎯 해결 경로 (참고용 — 수정은 수행 안 함)

### 단기 (코드 변경 없이)
- **네트워크**: Railway 리전이 사용자와 가까운지 (서울 사용자 → Seoul Region) 확인. WebSocket RTT 측정.
- **Cold start**: Railway 컨테이너가 idle 상태면 첫 클릭이 특히 느림. Always-on 설정 고려.
- **브라우저 측**: DevTools Network 탭에서 WebSocket 프레임 크기·RTT 실측. DevTools Performance 탭에서 렌더 flamegraph.

### 중기 (Streamlit 범위 내)
- **Debounce**: STCO 키패드의 `_cached_products_by_style_prefix` 호출을 "마지막 입력 후 200ms" 기다렸다가 실행하도록 처리 → 연타 시 쿼리 감소. Streamlit 기본 지원 없음, 커스텀 구현 필요.
- **Keypad scope 최소화**: 프래그먼트 내부 DOM을 더 작게 — LCD만 renderer로 분리, 버튼 그리드는 정적화.

### 장기 (근본 해결 — 필요 시)
- **클라이언트 측 키패드 커스텀 컴포넌트**: Streamlit Components API 로 React/Svelte 키패드 작성. 디지트 입력 = **0 서버 왕복**, "적용" 시만 1회 제출.
- **POS 화면을 Next.js 로 이관**: 웹 측(이번 세션에서 이미 인프라 깔림)에 POS UI 구현. 키패드는 완전한 클라이언트 상태 + form 제출.

---

## ✅ 진단 결론 요약

1. **요청 프레임이 잘못됨**: "Next.js tsx/TASK 7 Provider fallback" 은 해당 없음. 키패드는 Streamlit (`frame_ops/pages/02_POS판매.py`).
2. **코드 측 anti-pattern 없음**: 금액 키패드와 STCO 키패드 모두 `@st.fragment` 로 정상 scope 분리, 디지트 입력 경로에 `st.rerun()` 남용·불필요한 DB 호출 모두 없음.
3. **증상의 실제 원인**: Streamlit 의 WebSocket-기반 위젯 아키텍처. 모든 위젯 클릭이 서버 왕복을 요구. 이것은 **플랫폼 특성**이며 코드로 완전히 제거 불가.
4. **이번 세션 변경의 영향 = 0**: TASK 1–8 (Next.js)은 Streamlit 파일을 건드리지 않음. POS 단계 1–3 은 개선 또는 no-op 디폴트라 regression 불가.
5. **의미 있는 개선**: 단기는 네트워크·인프라 점검, 장기는 키패드를 클라이언트 컴포넌트로 이관.

**요약 한 문장**: 사용자 피드백은 **정확한 관찰** 이지만 지적하는 대상은 **버그가 아닌 Streamlit 플랫폼 특성** 이며, 이번 세션 최적화는 이 현상의 원인도 악화 요인도 아닙니다.
