# Phase 2 검증 체크리스트

**대상**: `claude/friendly-knuth-81d7db` 브랜치 / TASK 0-9 완료 상태
**전제**: Vercel Preview 또는 `npm run dev` 로컬 환경에서 실행

이 체크리스트의 모든 항목이 통과해야 Phase 2 가 매장 실전 투입 가능.

---

## 0. 사전 준비

- [ ] `web/.env.local` 에 `NEXT_PUBLIC_DEFAULT_STORE_ID=<UUID>` 가 설정됨
  - 미설정 시 `/pos` 결제 버튼이 자동 비활성화 + 안내 표시
  - `select id from fo_stores limit 1;` 결과를 사용
- [ ] DB 마이그레이션 4개 모두 적용됨:
  - `20260423_add_sale_items_and_stock.sql` (TASK 0-1)
  - `20260423_create_sale_rpc.sql` (TASK 6)
  - `20260423_search_products_rpc.sql` (TASK 6)
  - `20260423_pending_stock_rpc.sql` (TASK 6)
- [ ] `/api/sales/create`, `/api/products/search`, `/api/inventory/pending` 200 OK 응답

---

## 1. 정량 검증

### 1.1 Chrome DevTools Performance 탭 (NumberKeypad 핵심)

```
1. /pos 접속 → 제품 1개 카트 추가 → "전체 할인" 버튼 클릭
2. DevTools > Performance > Record 시작
3. 키패드에서 숫자 10개 연타 (0~9)
4. Record 중지 → 분석
```

- [ ] **FPS**: 그래프 60 FPS 유지 (드랍 없음)
- [ ] **Main thread blocking per click**: < 16ms (한 프레임)
- [ ] **Long tasks (>50ms)**: 0건

### 1.2 React DevTools Profiler — "Highlight updates"

```
1. React DevTools > Components 탭
2. 톱니 (⚙️) > "Highlight updates when components render" ON
3. 디스카운트 다이얼로그 열고 숫자 누름
```

- [ ] 노란 테두리는 **다음 영역에만** 표시:
  - `KeypadButton` (눌린 디지트)
  - `NumberKeypad` 본체 (디스플레이 갱신)
  - 직속 `<span>` LCD 영역
- [ ] 노란 테두리 **금지** 영역:
  - `PosPage` (다이얼로그 외부)
  - `CartView`, `CartItem*`
  - `PriceSummary`
  - `ProductSearch`

❌ 위 금지 영역에 노란 테두리 = TASK 2 (state 격리) 실패. 즉시 보고.

### 1.3 Chrome DevTools Rendering — Paint Flashing

```
1. DevTools > Rendering 패널 (Cmd+Shift+P → "Show Rendering")
2. "Paint flashing" 체크박스 ON
3. /pos 키패드 다이얼로그에서 디지트 입력
```

- [ ] 초록 깜빡임은 **LCD 디스플레이 영역 (~100×60 px)** 만
- [ ] 화면 절반 이상 깜빡임 = ❌ CSS 페인트 누수 (transition: all 등)

### 1.4 Network 탭

```
1. /pos 접속 → 검색창에 "01" 입력 → 1초 대기
2. 그 다음 "02" 추가 입력 → 1초 대기
3. 카트 추가 후 결제 진행
```

- [ ] 검색: 입력당이 아닌 **debounce(200ms) 후 1회** 만 요청
  - "01" 입력 → 200ms 후 1회 GET /api/products/search?q=01
  - "02" 추가 (총 "0102") → 200ms 후 1회 GET /api/products/search?q=0102
- [ ] 키패드 디지트 입력 시: **0개 네트워크 요청**
- [ ] 결제 확정: `POST /api/sales/create` 1회 (idempotency_key 포함)
- [ ] 같은 결제 재시도 (idempotency_key 동일) 시 RPC가 기존 sale 반환

### 1.5 번들 크기

```
npm run build
```

- [ ] `/pos` First Load JS ≤ 150 kB (현재 110 kB) ✅
- [ ] `/inventory/pending` First Load JS ≤ 100 kB (현재 94.4 kB) ✅
- [ ] 공유 First Load JS shared by all ≤ 90 kB (현재 87.3 kB) ✅

---

## 2. 정성 검증 (매장 환경)

### 2.1 iPad 실측

- [ ] 숫자 누를 때 **즉각** 반응 (체감 < 100ms)
- [ ] 결제 확정 → 홈으로 복귀까지 < 500ms
- [ ] 키패드 다이얼로그 열림/닫힘 부드러움 (애니메이션 끊김 없음)
- [ ] 가로/세로 회전 시 레이아웃 깨짐 없음

### 2.2 결제 흐름

- [ ] 카트에 제품 1개 추가 → 결제 → toast "판매 완료" + 홈 이동
- [ ] DB 확인: `fo_sales` 1행 + `fo_sale_items` 1행 추가
- [ ] DB 확인: `fo_products.stock_quantity` 가 차감됨 (NULL이 아니었던 제품)
- [ ] 같은 idempotency_key 재호출 시 기존 sale 반환 (DB 중복 안 생김)

### 2.3 오프라인 폴백

```
1. 카트에 제품 추가
2. DevTools > Network > Offline 체크
3. 결제 진행
```

- [ ] toast: "판매 완료" + "네트워크 복구 시 자동 전송됩니다"
- [ ] DevTools > Application > IndexedDB > frameops_db > sync_queue
  - status: 'pending', table: 'sales'
  - payload: SaleInput shape 그대로
- [ ] Network Online 복귀 → 자동 flush → sync_queue 비워짐 → DB 에 sale 저장 확인
- [ ] 3회 재시도 실패 시 status='dead' + sonner toast "동기화 실패"

### 2.4 발주 대기

```
1. SQL Editor: update fo_products set stock_quantity = -3 where id = '<some_id>';
2. /inventory/pending 접속
```

- [ ] 해당 제품이 매입대기 3개로 표시
- [ ] 30초 자동 새로고침 (refreshInterval)
- [ ] stock_quantity < 0 인 제품 부족분 큰 순서로 정렬

### 2.5 회귀 (기존 페이지)

- [ ] `/frames` 정상 동작 (Phase 1 영향 없음)
- [ ] `/customers` 정상 (스텁이므로 빈 페이지 OK)
- [ ] 테마 토글 (light/dark/system) 정상
- [ ] 네비게이션 활성 상태 표시 정확 (현재 라우트 highlight)
- [ ] 모바일 하단 탭바: POS / 재고 / 발주 3개 표시

---

## 3. 안티패턴 금지 (Phase 2 철학 준수)

- [ ] 영수증 출력 코드 없음 — `grep -ri "receipt\|printer\|ESC/POS\|sewoo" web/`
- [ ] 재고 기반 판매 차단 없음 — `grep -ri "stock_quantity.*[<>]" web/app web/components` 결과에 차단 로직 없음 (정보용 표시만)
- [ ] 인라인 함수 prop 신규 발생 0건 — `npm run lint` 경고 없음

---

## 4. 측정 자동화 (보조)

work order TASK 9-B 의 `tools/measure-keypad.ts` 는 Playwright 의존성이 없어 **추가하지 않음**. 위 1번 항목들은 Chrome DevTools 로 수동 검증.

향후 Playwright 도입 시:
```bash
npm install -D @playwright/test
npx playwright install chromium
```
후 `tools/measure-keypad.ts` 작성. Phase 3 후보.

---

## 5. 롤백 절차

전체 롤백:
```bash
git revert 8f241c2  # POS 화면 + 발주 대기 (TASK 8)
git revert 22d6ecd  # API Route + RPC 연동 (TASK 7)
# Headers는 의미 변경 없음 (TASK 9 navigation 만 추가)
```

DB 롤백 (선택, 음수 재고 데이터 손실):
```sql
drop function if exists create_sale_with_items;
drop function if exists search_products_fast;
drop function if exists get_pending_stock_items;
drop index if exists idx_fo_products_style_code_trgm;
-- fo_sale_items / stock_quantity 는 유지 권장 (이미 데이터 존재 가능)
```

---

## 6. 합격선

위 1번(정량) 모든 ✅, 2번(정성) 회귀 0건 + 결제 정상 작동 + 오프라인 폴백 1회 성공 시 **Phase 2 매장 투입 가능**.

미달 시 해당 항목 보고 → 우선순위에 따라 수정 PR.
