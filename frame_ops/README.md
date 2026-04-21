# FRAME OPS

안경테 소매·재고·POS 전용 앱입니다. `apps/my_crm/main.py`(GENIUS CRM) 및 `product_items`(렌즈 상품)과 **데이터·코드가 겹치지 않습니다.**

## 서비스 구분 (본사 / 본사 대시보드 / 판매 관리)

- **시작**: 사이드바 **서비스 선택** (`pages/00_서비스선택.py`)에서 세 가지 중 하나를 고릅니다. 이후 같은 서비스 위주로 **왼쪽 사이드바**에 링크가 모입니다.
- **본사**: 홈(지점 등록)·주문·매입·판매 파일 반영·스태프·지점 계정.
- **본사 대시보드**: 통계·리포트·판매 검색(조회 중심).
- **판매 관리**: POS·상품·입출고·재고·정산·반품·매장 이동 등 매장 업무.
- **☰ 메뉴**(화면 오른쪽 위): 모바일에서 터치하기 쉽게 크게 두었으며, **전체 화면**과 **다른 서비스로 바로 이동**할 수 있습니다.
- **실행 스크립트** (`./run_frame_ops.sh`, `run_frame_ops.bat`, `run_frame_ops.ps1`)는 기본 Streamlit **페이지 탐색**을 끄고, 위 커스텀 메뉴만 쓰도록 환경변수를 설정합니다. 터미널에서 직접 `streamlit run frame_ops/app.py`만 실행하면 이중 메뉴가 보일 수 있으니, 동일하게 `STREAMLIT_CLIENT__SHOW_SIDEBAR_NAVIGATION=false` 를 설정하거나 **실행 스크립트**를 사용하세요.

### 서비스별 접속 정보 (요약)

세 서비스는 **같은 앱·같은 URL**을 쓰고, **서비스 선택**에서 모드만 바꿉니다. 상세 표·문구는 앱 **서비스 선택** 화면 하단 탭과 동일하게 `frame_ops/lib/service_access_info.py` 에 있습니다.

| 구분 | 주요 사용자 | 권장 진입 | 필수 비밀·키 |
|------|-------------|-----------|----------------|
| **본사** | 발주·매입·지점·계정·파일 반영 | 서비스 선택 → 본사 → 홈 | `SUPABASE_URL` + **`SUPABASE_SERVICE_ROLE_KEY`** · 14·15 화면은 서비스 롤 필수 · 선택 `FRAME_OPS_HQ_PIN` |
| **본사 대시보드** | 통계·조회 | 서비스 선택 → 대시보드 → 통계리포트 | 동일 (현재 조회도 서비스 롤 클라이언트) |
| **판매 관리** | 매장 POS·입출고·재고·정산 | 서비스 선택 → 판매 관리 → POS | 위 Supabase 키 + **`SUPABASE_ANON_KEY`** (POS 담당자 비번 확인) · POS 저장 시 **스태프 Auth 이메일·비밀번호** |

**접속 URL 예** · FRAME OPS 로컬 전용 **`http://localhost:8502`** (`run_frame_ops.sh` 등이 `--server.port` 로 지정). GENIUS CRM `main.py` 는 기본 **8501**. 다른 기기에서는 실행 PC의 IP와 포트로 접속(사내망·방화벽은 운영 정책에 따름). Streamlit Cloud 배포 시에는 발급된 **앱 URL**을 각 업무에 공유하면 됩니다.

**목적별로 주소 복사해 테스트** · [`apps/frame_ops/frame_ops/docs/목적별_테스트_URL.md`](docs/목적별_테스트_URL.md) 에 화면별 **인코딩 URL** 표가 있습니다. 터미널에서  
`.venv/bin/python scripts/print_frame_ops_urls.py --base http://localhost:8502`  
로 같은 목록을 출력할 수 있습니다(베이스 URL만 바꿔 배포 주소에 맞추면 됩니다).

## 상품코드가 필요한 시점 · 권장 진행 순서

| 단계 | 내용 | 상품코드 |
|------|------|----------|
| 0 | Supabase 마이그레이션 전부 적용, `.env`·프리플라이트 | 불필요 |
| 1 | 지점(홈) — 데모 또는 실제 지점코드 | 불필요 |
| 2 | **상품 마스터** — 데모 `DEMO-…` 또는 **상품 등록**에서 실코드·제안코드 | **여기서 필요** |
| 3 | 입고 → POS → 통계 → 정산 … | 이미 등록된 `product_code` / `barcode`로 조회 |

- **실제 상품코드로 시험**하려면: 2단계에서 직접 입력하거나, **상품 등록**의 「미중복 코드 넣기」로 `접두어-YYYYMMDD-임의8자` 형태를 채운 뒤 저장하면 됩니다(운영 연번 규칙과 다를 수 있음).
- **우선 매장(북촌) + No Public 대량 시드**: 홈 expander에서 **BKC01 서울 북촌점**·브랜드 **No Public**·매입처 **안목**과 `01:01-C01`~`10:59-C05`(2,950 SKU)를 넣습니다. 재실행 시 **가격·매입처(안목)** 를 시드 값으로 동기화합니다.
- **지점 기본 선택**: `BKC01` 이 있으면 입고·POS·정산·재고 등 대부분 화면에서 지점 콤보 기본값이 북촌점입니다. 통계는 기본이 **북촌 단일 지점**(「전체」로 바꿀 수 있음).
- **매입처 기본**: 입고·상품 등록에서 매입처 목록에 **안목**이 있으면 기본 선택됩니다. 홈 **북촌점 업무 바로가기**에서 입고·POS·재고·통계 등으로 이동할 수 있습니다.
- **재고 필터**: 재고 현황에서 **No Public만** 버튼으로 북촌 시드 카테고리만 빠르게 조회합니다.
- **바코드 스캔/카메라** 테스트: 같은 화면에서 `바코드` 칸에 실제 GTIN 등을 넣고 저장한 뒤 POS에서 조회합니다.

## 실판매 CSV 가져오기 (외부 POS·엑셀)

- 앱: 사이드바 **판매 데이터 가져오기** (`12_판매데이터가져오기.py`) — 파일 업로드 또는 붙여넣기 → **파싱·검증** → 오류 없을 때만 **DB에 반영**.
- CLI (프로젝트 루트):  
  `.venv/bin/python scripts/import_frame_ops_sales.py --file 경로.csv --dry-run`  
  적재: 동일 명령에서 `--dry-run` 제거.  
  북촌 xlsx: `.venv/bin/python scripts/import_bukchon_xlsx.py --file 일지.xlsx --sheet 0410 --dry-run` 또는 `--all-mmdd`.
- 형식·검증 규칙: `frame_ops/lib/sales_import.py` 모듈 상단 독스트링. `receipt_key`로 전표를 묶고, `sum(단가×수량−행할인) − discount_total = 현금+카드` 가 맞아야 합니다. **재고는 차감**됩니다(사전 입고 없으면 음수 가능). 정산된 영업일·`FRAME_OPS_DATA_START_DATE` 이전은 거절합니다.
- 단위 테스트: `pytest tests/test_sales_import.py -m "not live"` (DB 불필요). 실제 반영 전에는 반드시 `--dry-run` 또는 앱 검증으로 한 번 확인하세요.

### 북촌 판매일지 xlsx (`판매일지_북촌_…xlsx`)

- 앱 **판매 데이터 가져오기** 상단 expander에서 xlsx 업로드 → 시트 **0410**(4월 10일) 등 선택 → **xlsx → 파싱·검증**. 여러 날짜는 **MMDD 시트 전부** 체크.
- A~E열만 사용: **모델번호 · 컬러번호 · 금액(실판매가) · 결제방법(현금/카드)**. 앞열 번호·매입처(안목)·F열 이후는 무시.
- 시간형 모델+컬러 → 상품코드 `HH:MM-Cxx`(예: `01:01`+`C1` → `01:01-C01`). **모델은 항상 텍스트 조각으로 취급**하며, 엑셀 시각 서식(`time`/내부 소수)으로 읽혀도 동일 문자열로 환원합니다. `CX2197`+`C17` → `CX2197-C17`(DB에 해당 코드가 있어야 함).
- 변환 로직: `frame_ops/lib/bukchon_sales_xlsx.py`.  
  테스트: `pytest tests/test_bukchon_sales_xlsx.py` (실제 일지와 동일한 4건·다중 시트 픽스처는 `tests/bukchon_sample_workbook.py`).

## 플랫폼 역할 (권장)

| 구분 | 용도 |
|------|------|
| **Windows** | 일상 업무 — POS·입고·재고 등 브라우저로 사용 |
| **Mac** | `pytest`·프리플라이트 등 **테스트·검증** (동일 저장소·동일 Supabase 원격 DB) |

- **Windows에서 앱 실행** (프로젝트 루트): `run_frame_ops.bat` 더블클릭 또는 CMD에서 실행. PowerShell 선호 시 `.\run_frame_ops.ps1`  
  - 콘솔 한글: 배치에서 `chcp 65001` 적용. 브라우저 UI는 UTF-8로 동작.
- **Mac에서 테스트**: `./run_frame_ops_tests.sh` → `pytest tests/ -m "not live"`  
  - DB 스키마 점검: `./run_frame_ops_tests.sh --preflight` (`.env` 필요)
- **Windows에서 테스트**(선택): `run_frame_ops_tests.bat` 또는 `run_frame_ops_tests.bat --preflight`
- **Mac에서 앱만 띄울 때**: `./run_frame_ops.sh` (기존과 동일)
- **명안당 로컬뷰**(기본 지점·사이드바 배지): 프로젝트 루트에서 `./run_myeongandang_local.sh` — `config/local_views/myeongandang.env.example` 을 `myeongandang.env` 로 복사한 뒤 `FRAME_OPS_PREFERRED_STORE_CODE` 를 실제 `fo_stores.store_code` 로 맞춥니다.

- DB 테이블 접두사: `fo_*`
- 전표·판매일: 기본적으로 **2026-04-01** 이후 날만 선택 가능 (`FRAME_OPS_DATA_START_DATE`로 변경)
- **Streamlit Cloud·서버 배포**: Supabase URL/키는 `.streamlit/secrets.toml`(로컬) 또는 호스팅 콘솔 **Secrets**에 설정. 예시는 `.streamlit/secrets.toml.example` 참고. 앱 진입점은 `frame_ops/app.py` 로 지정.
- **테스트 환경 전 프리플라이트**: Mac 등에서 `./run_frame_ops_tests.sh --preflight` 또는  
  `.venv/bin/python scripts/frame_ops_preflight.py` / Windows: `.venv\Scripts\python.exe scripts\frame_ops_preflight.py`  
  → `fo_*` 테이블·`seller_code` 컬럼 존재 여부 확인 (마이그레이션 누락 탐지).
- **단위 테스트 (DB 불필요)**: Mac: `./run_frame_ops_tests.sh` 또는 `pytest tests/ -m "not live"`.  
  Windows에서도 동일: `.venv\Scripts\pip install -r requirements-dev.txt` 후 `.venv\Scripts\pytest tests\ -m "not live"`.  
  `tests/conftest.py`에서 Matplotlib **Agg** 백엔드를 켜 두어 macOS/Windows/CI에서 PDF 테스트 시 GUI 충돌을 막습니다.  
  실 DB 연동 스모크: 자격 증명이 잡힌 셸에서 `pytest tests/test_live_preflight.py -m live`.
- **권장 검증 순서 (개발·배포 전)**  
  1. `pytest tests/ -m "not live"` — 단위·CLI `--help`·북촌/CSV 변환 포함 (`tests/test_cli_entrypoints.py` 등).  
  2. Supabase 마이그레이션 적용 후 `./run_frame_ops_tests.sh --preflight` (또는 `scripts/frame_ops_preflight.py`).  
  3. (선택) `pytest tests/test_live_preflight.py -m live` — 원격 DB 연결 스모크.  
  4. 실데이터 적재 전: `scripts/import_bukchon_xlsx.py … --dry-run` 또는 앱 **판매 데이터 가져오기**에서 검증만.
- 홈 화면: **데모 데이터 넣기**, 테스트 순서 안내, **빠른 실행** 링크
- 사이드바 페이지명: 한글 파일명(`01_상품등록.py` 등)으로 표시  
  (처음 한 번 — Mac/Linux: `python3 -m venv .venv && .venv/bin/pip install -r requirements.txt` · Windows: `py -3 -m venv .venv` 후 `.venv\Scripts\pip install -r requirements.txt`)  
  직접 실행 시: Mac `.venv/bin/python -m streamlit run frame_ops/app.py` · Windows `.venv\Scripts\python.exe -m streamlit run frame_ops/app.py`
- DB: **호스팅 Supabase**(클라우드 Postgres, `*.supabase.co`)만 사용합니다. 로컬 SQLite 등은 없습니다. 프로젝트 루트 `.env`에 `SUPABASE_URL`·`SUPABASE_SERVICE_ROLE_KEY`를 넣습니다. 배포 시 로컬 URL 차단: `FRAME_OPS_REQUIRE_HOSTED_SUPABASE=1`
- 마이그레이션: Supabase에 아래 SQL을 **순서대로** 적용 후 사용  
  - **`fo_stores` 테이블 없음(PGRST205, 힌트에 `stores`만 있음)** → FRAME OPS 마이그레이션 미적용입니다. `stores`는 GENIUS CRM용이며, FRAME OPS는 **`fo_*`** 만 씁니다. 먼저 `20260413_frame_ops_core.sql` 전체를 SQL Editor에서 실행하세요.  
  - `20260413_frame_ops_core.sql`  
  - `20260414_frame_ops_inventory.sql`  
  - `20260415_frame_ops_settlement.sql` (일자 정산·잠금)  
  - `20260416_frame_ops_returns_interstore.sql` (반품·정산 지출·매장 간 이동)  
  - `20260417_frame_ops_analytics.sql` (POS 판매자 코드 `seller_code` — 통계용)  
  - `20260418_frame_ops_purchase_orders.sql` (판매 기반 주문서·매입/보류 라인)  
  - `20260419_frame_ops_store_business_fields.sql` (지점 사업자등록번호·주소·전화 — 주문서 헤더)  
  - `20260420_frame_ops_staff_rbac.sql` (본사·지점 **역할** `fo_staff_roles`, **프로필** `fo_staff_profiles`, **지점 범위** `fo_staff_store_scopes` + Auth `user_id` 연동)  
  - `20260421_frame_ops_store_salesperson_role.sql` (**지점 판매사** 역할 `store_salesperson`)  
  - `20260422_frame_ops_sales_seller_identity.sql` (POS **판매담당자** `seller_user_id`, `seller_label` — 비밀번호 확인 후 저장)
  - `20260423_frame_ops_brands.sql` (**브랜드** `fo_brands`, 상품에 `brand_id`·`style_code`·`color_code`)
  - `20260424_frame_ops_product_line_categories.sql` (**FRM/SUN** `product_line`, **카테고리** `fo_product_categories`)

### POS 판매 · 담당자 확인

- **POS 판매** (`02_POS판매.py`) 저장 시 **담당자 이메일·비밀번호** 필수 — Supabase Auth로 본인 확인 후 `fo_sales`에 `seller_user_id`·`seller_label`·`seller_code`가 기록됩니다.
- 담당자는 `fo_staff_profiles`에 있어야 하며 역할이 **매니저·판매사·지점 스태프**(`store_manager` / `store_salesperson` / `store_staff`)이고, **선택한 지점**이 `fo_staff_store_scopes`에 허용되어 있어야 합니다(범위가 비어 있으면 전 지점 허용).
- 비밀번호 확인에는 **anon public API 키**가 필요합니다. `.env` / secrets 에 `SUPABASE_ANON_KEY`를 넣으세요(서비스 롤 키와 별도). `SUPABASE_KEY`에 anon만 넣는 개발 방식도 지원합니다(그 값이 service_role이 아닐 때).
- **판매 검색** (`16_판매검색.py`) — 판매일(KST)·상품코드(부분 일치)·지점으로 조회하고 **판매담당자** 열을 표시합니다.

### 본사·담당별 계정·권한

- 앱: 사이드바 **본사·스태프·권한** (`14_본사·스태프·권한.py`) — Supabase **Auth**로 사용자 생성·삭제( **서비스 롤 키** 필요), 역할·허용 지점을 DB에 저장합니다.
- 앱: **지점·매니저·판매사** (`15_지점·매니저·판매사.py`) — 홈의 **등록점검**과 연계해 지점별 **매니저**(`store_manager`)·**판매사**(`store_salesperson`) 계정·비밀번호·역할을 설정합니다. 지점은 `fo_staff_store_scopes`에 **해당 지점만** 연결됩니다.
- 배포 시 Streamlit secrets(또는 환경변수)에 **`FRAME_OPS_HQ_PIN`** 을 두면 계정·권한 탭 사용 전 PIN 확인이 붙습니다.
- 현재 POS·입고 등 나머지 화면은 이 프로필로 **접근을 막지 않습니다**. 앱은 기존과 같이 서비스 롤로 DB에 붙으며, 본 기능은 **계정 메타데이터·향후 로그인/RLS** 를 위한 준비 단계입니다.
