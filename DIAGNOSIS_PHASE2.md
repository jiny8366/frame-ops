# Phase 2 진단 보고서

**작성일**: 2026-04-23  
**진단자**: Claude  
**전제**: Phase 1 (TASK 1-8) + POS 최적화 3개 커밋 반영된 상태  
**목적**: Phase 2 구축 전 현 코드 상태를 사실 기반으로 기록 → 불필요한 변경 회피 + 실제 개선 지점 식별

---

## 1. POS 관련 파일 인벤토리 (Next.js `web/`)

지시받은 grep 실행 결과:
```bash
find . -type f \( -name "*.tsx" -o -name "*.ts" \) \
  -not -path "*/node_modules/*" -not -path "*/.next/*" \
  -exec grep -l -iE "keypad|numpad|amount|결제|payment|checkout|cart|장바구니|modal|dialog" {} \;
```

| 파일 | 유형 | 라인 | 역할 | state 위치 | 문제 |
|------|------|---:|------|-----------|------|
| `types/database.ts` | 자동 생성 타입 | 1312 | Supabase 스키마 | N/A | 없음 (TypeGen 산출물) |
| `types/index.ts` | 공통 타입 | 101 | `Sale.cash/card/discount_amount` 타입 | N/A | 없음 |
| `app/api/orders/route.ts` | API Route | 69 | GET 매출 목록 / POST 매출 생성 (단순 insert) | 서버 | ⚠️ 품목 저장 안 됨, 재고 차감 없음 — **TASK 7에서 `/api/sales/create` RPC로 대체 예정** |

**POS UI 컴포넌트 0건**. `app/pos/` 디렉토리 존재하지 않음 → TASK 8에서 **신규 작성**.

### 기존 라우트 전체
```
app/page.tsx              (39 lines) — 홈
app/frames/page.tsx       (61 lines) — 재고 조회
app/customers/page.tsx    (6 lines)  — 고객 페이지 (스텁)
```

### 기존 components 구조
```
components/
├── customers/    (비어 있음 추정)
├── frames/       — FrameCard.tsx (86 lines), VirtualFrameList.tsx (160 lines)
├── layout/       — Header.tsx
├── skeletons/    — (로딩용)
├── ui/           — ThemeToggle.tsx (225 lines)
└── AppShellSkeleton.tsx
```

### State 관리 현황
- **Context**: `contexts/ThemeContext.tsx` (테마 전환) — 유일한 Context 사용처
- **SWR**: `hooks/useFramesData.ts` — `useSWR` 3개 (frames, frames-by-brand, brands)
- **zustand**: `package.json` 의존성 설치돼 있으나 **사용처 0건** → POS cart를 로컬 `useState` 로 두는 work order 스펙과 일치
- **IndexedDB**: Providers 레벨에서 SWR fallback 주입 (Phase 1 TASK 7)

---

## 2. 리렌더 폭주 의심 지점

현재 코드베이스에 구축돼야 할 POS 가 아직 존재하지 않으므로, **기존 React 컴포넌트에서 TASK 2(state 격리)·TASK 3(memo) 적용 대상이 있는지** 점검.

### 🟢 Low — 이미 잘 최적화된 부분 (Phase 1 TASK 1-3 결과)

| 파일:라인 | 상태 | 근거 |
|---|---|---|
| `components/frames/FrameCard.tsx` | ✅ | `React.memo` + 커스텀 비교 (id/updated_at/status/index/onClick/onPrefetch) |
| `components/frames/VirtualFrameList.tsx:29` (`Cell`) | ✅ | 컴포넌트 외부 선언 (클로저 재생성 방지) |
| `components/frames/VirtualFrameList.tsx:85` (`handleCardClick`) | ✅ | `useCallback([router])` |
| `components/frames/VirtualFrameList.tsx:90` (`itemData`) | ✅ | `useMemo([frames, handleCardClick, prefetch])` |
| `hooks/usePrefetch.ts` | ✅ | `LRUSet(100)` 적용, `useCallback([])` 안정 참조 |
| `app/providers.tsx` | ✅ | Phase 1 TASK 7 — SWR fallback Provider 레벨 승격 |

### 🟡 Medium — TASK 3 cleanup 대상 1건

| 파일:라인 | 문제 | 권장 조치 |
|---|---|---|
| `components/ui/ThemeToggle.tsx:173` | `onClick={() => setTheme(opt.value)}` — 인라인 화살표 함수 | TASK 3 에서 `useCallback` 처리하거나, 만약 tradeoffs 상 그대로 두면 `// eslint-disable-next-line react/jsx-no-bind -- Phase 2-Legacy: 3-옵션 토글 UI, Phase 3에서 정리 예정` 억제 |

### 🟢 Low — 검사 결과 이슈 없음

- `on(Click|Change|KeyPress|Submit|MouseEnter)=\{\(` 패턴: ThemeToggle 외 매치 0건
- `lib/transitions.ts:40` 의 onClick 매치는 JSDoc 예시 문자열

### 리렌더 "폭주" 수준의 Critical/High 패턴

**현재 코드베이스에는 없음**. 근거:
- Phase 1 이 이미 Cell 메모이제이션 재설계(TASK 1), useContainerSize(TASK 2), LRU(TASK 3) 등을 완료
- Context 사용 1곳뿐(ThemeContext), 입력값 기반이 아니라 테마 상태만 보관 → 입력값 기반 Context re-render 폭주 없음
- SWR key 에 입력값 합성하는 패턴: `hooks/useFramesData.ts` 에서 `['frames', JSON.stringify(filters)]` 는 key 이긴 하나 **filters.search 가 바뀔 때만 새 key** — 디지트 입력마다 새 fetch 발생하는 구조 아님 (현재 `/frames` 검색창은 debounce 없이 ilike 하지만 사용자가 타이핑 중이면 SWR dedupe 처리)

**따라서 TASK 2 (state 격리) 의 실제 대상은 "기존 코드 리팩터" 가 아니라 "Phase 2 에서 새로 만드는 POS 컴포넌트들이 올바른 패턴으로 작성되도록 가이드" 성격**.

---

## 3. CSS 안티패턴

work order TASK 4 에서 지적한 각 항목의 **현재 상태**:

| 항목 | work order 지적 | 실제 상태 | 조치 필요 |
|---|---|---|---|
| `transition: all` | 🔴 페인트 유발 | **0건** | 없음 |
| `transition-all` (Tailwind) | 동일 | **0건** | 없음 |
| `backdrop-filter` 모바일 과다 | 🟠 합성 비용 | 12건, 전부 Header / globals.css 의 Apple HIG 디자인, 폴백(`@supports not`) 포함 | 모바일 조건부 비활성 검토 (TASK 4) |
| `box-shadow` 애니메이션 | 🔴 레이아웃 유발 | **0건** | 없음 |
| `touch-action: manipulation` | ✅ 필요 | **이미 있음** (`globals.css:62`, 모든 button/a/role=button) | 없음 |
| `-webkit-tap-highlight-color: transparent` | ✅ 필요 | **이미 있음** (`globals.css:38, 60`) | 없음 |
| `user-select: none` on 버튼 | ✅ 필요 | **이미 있음** (`globals.css:64`, 입력은 text 로 허용) | 없음 |
| `input { font-size: 16px }` (iOS 줌 방지) | ✅ 필요 | **누락** | **TASK 4에서 추가** |
| `.btn:active { transform: scale(...) }` | ✅ 필요 | **0건** (active 스타일 전무) | **TASK 4 또는 TASK 8에서 PressableButton과 함께 도입** |
| `will-change: transform` | ✅ 선택적 | **0건** | **TASK 4/8** |
| `overscroll-behavior` | ✅ 필요 | `.scroll-container` 에 이미 있음 (`globals.css:81`) | 없음 |
| safe-area insets | ✅ 필요 | **이미 있음** (`.safe-padding`, `.safe-top` 등) | 없음 |
| 44pt 터치 타겟 유틸 | ✅ 필요 | **이미 있음** (`.touch-target`, `.touch-target-lg`) | 없음 |

**요약**: 기존 CSS 는 Apple HIG 수준으로 이미 세팅됨. Phase 2 TASK 4 의 **실제 신규 작업은 3가지만**:
1. `input, textarea, select { font-size: 16px }` 추가
2. `.pressable-btn` 또는 `.btn:active` 스케일/투명도 (GPU 합성용)
3. 필요 시 `@media (max-width: 1024px) { .modal-backdrop { backdrop-filter: none } }` (모바일 blur 비활성)

---

## 4. ESLint · 툴링 현황

| 항목 | 상태 | 조치 |
|---|---|---|
| `.eslintrc*` / `eslint.config.*` | **파일 없음** — `next lint` 기본 설정만 사용 중 | TASK 3에서 `.eslintrc.json` 신규 생성 |
| `react-hooks/exhaustive-deps` | next 기본 = warn | TASK 3 에서 `error` 로 승격 |
| `react/jsx-no-bind` | 기본 비활성 | TASK 3 에서 warn 추가. 기존 코드 발생 경고는 `-- Phase 2-Legacy: ...` 주석 억제 |
| `npm run type-check` / `types:check` | 중복 (동일 내용) | 정리 여지 있으나 범위 외 |

---

## 5. Phase 1 작업 이후 추가된 POS 최적화 3개 커밋 분석

사용자 지시: **"Phase 1 작업 후 추가된 POS 최적화 3개 커밋" 도 TASK 1 진단 대상에 포함**.

### 커밋 목록
| 커밋 | 제목 | 대상 |
|---|---|---|
| `a51cabc` | perf(pos): 상품 피커 DISTINCT를 DB로 이전 | Streamlit (`frame_ops/lib/fo_product_pick_utils.py` + SQL 뷰) |
| `0980978` | perf(supabase): Client 생성 결과 캐시 + POS dead code 제거 | Streamlit (`frame_ops/lib/supabase_client.py`, `frame_ops/pages/02_POS판매.py`) |
| `d8fbad6` | perf(instrument): POS 병목 구분용 타이밍 로그 | Streamlit (`frame_ops/lib/perf_log.py` 신규 + 계측) |

### Next.js Phase 2 에 주는 직접 영향 — **없음**
세 커밋 모두 `frame_ops/**/*.py` (Streamlit) 만 수정. Next.js `web/**` 는 건드리지 않음. 빌드 시스템(Vercel vs Railway), 런타임(React vs Streamlit), 패키지 의존성 모두 분리됨. **이 커밋들이 머지돼도 Phase 2 코드에 영향 0**.

### 그러나 Phase 2 설계에 주는 **교훈** 3가지

#### 교훈 1 — "DB 레벨 DISTINCT" 원칙 재확인 (from `a51cabc`)
Streamlit 측에서 `_cached_style_codes` 가 전체 행을 풀로드한 뒤 Python set 연산으로 DISTINCT 를 계산하던 패턴을 DB 뷰로 이전했음. **Phase 2 TASK 6 의 `search_products_fast` RPC 와 `get_pending_stock_items` RPC 도 동일 철학**: Python/JS 에서 aggregation 하지 말고 DB 에서 해결.

→ **Phase 2 구현 시**: `/pos` 페이지의 제품 검색이 (향후 카탈로그 확대 시) Python/JS 에서 필터링·정렬하지 않도록, RPC 기반 `productsApi.search` 만 쓰기. `inventoryApi.pending` 도 클라이언트에서 필터 금지.

#### 교훈 2 — "Client 싱글턴" 패턴 재확인 (from `0980978`)
Streamlit 의 `get_supabase()` 가 호출마다 `create_client` 를 실행해 PostgREST/Auth/Storage 하위 클라이언트를 재생성하던 문제를 `functools.lru_cache` 로 해결. **Next.js 측은 Phase 1 TASK 4 에서 이미 HMR-safe 싱글턴** (`globalThis.__frameops_supabase`) 적용됨. Phase 2 에서 API Route 가 `getDB()` 만 사용하면 동일한 이점.

→ **Phase 2 구현 시**: 새로 만드는 API Route 3종 (`/api/products/search`, `/api/sales/create`, `/api/inventory/pending`) 은 반드시 `getDB()` 호출. 새 `createClient` 호출 금지.

#### 교훈 3 — "계측 없는 최적화는 무의미" 재확인 (from `d8fbad6`)
Streamlit 측에 `FRAME_OPS_PERF_LOG` env 플래그로 on/off 되는 타이밍 로그 도입. **Phase 2 TASK 9 는 동등한 역할을 React DevTools Profiler + Chrome DevTools Performance 탭으로 수행 예정**. 서버/클라이언트 양쪽 perf 플래그가 존재하게 되므로 사용 시점 구분 필요:
- Streamlit 측 체감 느림 보고 시 → Railway Variables `FRAME_OPS_PERF_LOG=1`
- Next.js 측 체감 느림 보고 시 → 브라우저 React Profiler (코드 수정 불필요)

→ **Phase 2 구현 시**: 서버 측 Python perf 로그를 Next.js에 포팅할 필요 **없음**. 클라이언트 perf 는 DevTools 로 충분.

### 결론
**세 커밋은 Phase 2 와 독립적이며, 배포 순서/롤백에 서로 간섭하지 않음.** PR #2 (POS 최적화 3종) 이 먼저 머지돼도 Phase 2 PR 에 영향 없고, 그 반대도 마찬가지.

---

## 6. 측정 권장 지점 (Phase 2 완료 시 검증할 위치)

work order TASK 9 에 검증 체크리스트가 있으나, 미리 추정:

### React DevTools Profiler 로 "Highlight updates when components render"
```
예상 정상: 숫자 키 누름 시 노란 테두리는 NumberKeypad > KeypadButton + 그 내부 LCD 만
예상 비정상: PosPage, CartView, ProductSearch 까지 노란 테두리 → TASK 2 state 격리 실패 신호
```

### Chrome DevTools Performance 탭
```
녹화 중 숫자 10개 연타:
- 예상 정상: 각 입력당 JS 실행 ≤ 16ms, FPS 60 유지
- 예상 비정상: 메인 스레드 블로킹 50ms+ → 상위 컴포넌트 리렌더 의심
```

### Chrome DevTools Paint Flashing
```
예상 정상: LCD 표시 영역(약 100×40 px)만 초록 깜빡임
예상 비정상: 화면 절반 이상 깜빡임 → CSS 재페인트 유발 (transition: all 등)
```

### Network 탭
```
예상 정상: 숫자 입력 4회 = 네트워크 요청 0건 (클라 state만)
         ProductSearch 검색어 입력 = debounce 후 1회 /api/products/search
         결제 버튼 = 1회 /api/sales/create (Optimistic UI라 블로킹 안 됨)
예상 비정상: 숫자 입력마다 요청 발생 → 상태가 부모에 있어 SWR key 갱신되는 케이스
```

---

## 7. Phase 2 진행 전 확정된 제약 (work order 재확인)

### 절대 추가 금지
- ❌ 영수증 출력 코드 (프린터 연동)
- ❌ Sewoo 라벨 프린터 / ESC/POS / ZPL II
- ❌ Bluetooth / USB 프린터 통신
- ❌ `stock_quantity` 기반 판매 차단 로직 (`if stock < 0 return error` 금지)

### 필수 준수
- ✅ `stock_quantity` 는 정보용 (음수 허용)
- ✅ 결제 RPC 는 **idempotency_key 필수**
- ✅ 결제 성공 시 즉시 홈 복귀 + 토스트 (Optimistic UI)
- ✅ 오프라인 판매는 `sync_queue` 로 폴백 (Phase 1 TASK 8 의 DLQ 재활용)
- ✅ 한국어 주석 유지

### 현재 상태 관점 - 이미 인프라 있음
- Phase 1 TASK 7: SWR fallback + AppShellSkeleton → Phase 2 Optimistic UI 토대
- Phase 1 TASK 8: DLQ (`enqueueSync`, `retryDeadLetter`, `discardDeadLetter`) → 결제 실패 폴백
- Phase 1 TASK 4: `Database` 제네릭 + HMR-safe 싱글턴 → 신규 API Route 에 그대로 사용 가능

---

## 8. 진단 결론

### 좋은 소식
1. **CSS 는 이미 Apple HIG 수준**. work order TASK 4 의 실질 작업은 3건만 (font-size 16px, active scale, modal backdrop 모바일 비활성).
2. **기존 React 컴포넌트는 건강**. ThemeToggle 인라인 함수 1건이 전부 — TASK 3 에서 1분 안에 처리.
3. **Phase 2 는 사실상 greenfield**. `/pos`, `/inventory/pending`, NumberKeypad, CartView, PaymentDialog 모두 신규. 기존 코드와 충돌 없이 작성 가능.
4. **인프라는 이미 Phase 1 이 깔았음**. DLQ · SWR fallback · Database 제네릭 · useContainerSize · LRU prefetch 전부 그대로 재활용 가능.
5. **Streamlit 측 3 커밋 무간섭**. Phase 2 와 독립적으로 병행 진행 가능.

### 주의할 것
1. ESLint 설정 파일이 아예 없음 → TASK 3 에서 `.eslintrc.json` 신규 생성 (next/core-web-vitals 확장 기준).
2. `/api/orders` 의 POST 는 현재 품목 저장·재고 차감 모두 안 함 → TASK 7 의 `/api/sales/create` 로 대체 후 old endpoint는 deprecate 처리 (즉시 삭제는 하지 않음, 기존 `writeWithSync` 경로 호환).
3. `types/index.ts` 의 `Product.image_url`, `CartItem`, `PosState` 는 DB 스키마에 없거나 아직 쓰이지 않음 → Phase 2 에서 `CartItem` 은 새로 `useCart` 훅이 정의하므로 `types/index.ts` 것과 shape 일치 여부 확인 필요.

### 권장 진행 순서
work order 기본 순서(TASK 2 → 3 → 4 → 5 → 6 → 7 → 8 → 9) 그대로 진행해도 무방. 단, **TASK 2·3 은 "기존 코드 리팩터" 가 아니라 "Phase 2 에서 작성할 신규 컴포넌트의 패턴 가이드"** 로 접근하는 것이 현실.

구체적으로:
- TASK 2: 신규 컴포넌트(`NumberKeypad`, `PaymentDialog`, `DiscountDialog`, `QuantityDialog`, `ProductSearch`) 가 state 격리 패턴 따르도록 설계 문서화. 기존 코드는 ThemeToggle 1건만 손댐(선택).
- TASK 3: ESLint 설정 신규 생성. 기존 `ThemeToggle.tsx:173` 에는 `eslint-disable-next-line` + Phase 2-Legacy 주석 또는 useCallback 적용.
- TASK 4: 위 3가지 CSS 작업만.
- TASK 5~9: work order 그대로.

---

## 9. 코드 수정 0건 확인

본 문서 작성 중 **소스 코드 변경 없음**. `git status` 는 `DIAGNOSIS_PHASE2.md` 만 untracked 로 표시해야 함. 진단만 수행.
