"""서비스(본사 / 본사 대시보드 / 판매 관리)별 접속·자격 안내 문구."""

from __future__ import annotations

from lib.local_server import frame_ops_local_base_url

# FRAME OPS 로컬 전용 포트(기본 8502) — GENIUS CRM 은 8501 (`streamlit run main.py`)
DEFAULT_LOCAL_URL = frame_ops_local_base_url()

ACCESS_MARKDOWN_HQ = f"""
**누가 쓰나** · 본사 운영, 발주·매입, 지점 등록, 스태프·계정, 외부 판매 파일 반영 담당  

**어떻게 들어가나**  
1. **서비스 선택**에서 **본사 업무 시작** → **홈 · 지점 등록**  
2. 또는 북마크: **`{DEFAULT_LOCAL_URL}/?mode=hq`** — 본사 모드로 사이드바가 고정됩니다.  

**접속 주소(예시)**  
- 같은 PC: `{DEFAULT_LOCAL_URL}` · 본사 모드: `{DEFAULT_LOCAL_URL}/?mode=hq`  
- 다른 PC·모바일: 실행 중인 PC의 IP와 포트 (예: `http://192.168.0.10:8502`) — 방화벽·보안은 운영 정책에 맞게 설정  

**필요한 설정(비밀번호·키)**  
| 항목 | 설명 |
|------|------|
| Supabase | `SUPABASE_URL`, **`SUPABASE_SERVICE_ROLE_KEY`** — 대부분의 DB 저장에 사용 |
| 본사·스태프·지점 계정 | 화면 **14·15** 는 **반드시 서비스 롤 키** 필요 |
| 선택 | `FRAME_OPS_HQ_PIN` — 계정·권한 화면을 PIN으로 잠글 때 (secrets 또는 환경변수) |

**참고** · 앱 로그인 계정과 별개로, 브라우저가 열리기만 하면 위 키가 설정된 Streamlit 프로세스가 DB에 붙습니다. 배포 시 Streamlit Cloud **Secrets**에 동일 키를 넣습니다.
""".strip()

ACCESS_MARKDOWN_HQ_DASH = f"""
**누가 쓰나** · 경영·분석, 매출·판매 **조회** 위주 (통계·리포트, 판매 검색)  

**어떻게 들어가나**  
1. **서비스 선택** → **대시보드 시작** → **통계·리포트**  
2. 북마크: **`{DEFAULT_LOCAL_URL}/11_%ED%86%B5%EA%B3%84%EB%A6%AC%ED%8F%AC%ED%8A%B8?mode=hq_dashboard`** (통계 페이지 + 대시보드 모드)  

**접속 주소(예시)**  
- 앱 루트: `{DEFAULT_LOCAL_URL}` — **대시보드 모드만** 쓰려면 주소에 **`?mode=hq_dashboard`** 를 붙인 뒤 통계 페이지로 이동하거나, 위 북마크를 사용합니다.  

**필요한 설정(비밀번호·키)**  
| 항목 | 설명 |
|------|------|
| Supabase | `SUPABASE_URL`, **`SUPABASE_SERVICE_ROLE_KEY`** — 현재 앱은 조회도 동일 클라이언트로 접속합니다. |
| 읽기 전용 DB 키 | 별도로 두지 않았습니다. 향후 RLS·JWT 도입 시 구분할 수 있습니다. |

**참고** · 민감한 지표만 공유해야 하면 Streamlit 배포 URL 접근 제한(Cloud 팀·VPN 등)을 함께 검토하세요.
""".strip()

ACCESS_MARKDOWN_SALES = f"""
**누가 쓰나** · 매장 매니저·판매사, 입출고·재고·정산·반품 등 **매장 일상 업무**  

**어떻게 들어가나**  
1. **서비스 선택** → **판매 관리 시작** → **POS 판매**  
2. 북마크: **`{DEFAULT_LOCAL_URL}/02_POS%ED%8C%90%EB%A7%A4?mode=sales`**  
3. 태블릿·스마트폰: 같은 Wi-Fi에서 PC IP·포트로 접속 (예: `http://192.168.x.x:8502/02_POS%ED%8C%90%EB%A7%A4?mode=sales`)  

**접속 주소(예시)**  
- `{DEFAULT_LOCAL_URL}` (로컬) · 판매 관리 모드 POS: `{DEFAULT_LOCAL_URL}/02_POS%ED%8C%90%EB%A7%A4?mode=sales`  

**필요한 설정(비밀번호·키)**  
| 항목 | 설명 |
|------|------|
| Supabase | `SUPABASE_URL`, **`SUPABASE_SERVICE_ROLE_KEY`** — 입고·재고 등 화면 저장 |
| **반드시 추가** | **`SUPABASE_ANON_KEY`** (또는 anon `SUPABASE_KEY`) — **POS 판매 저장 시 담당자 이메일·비밀번호** 확인에 사용 |
| 담당자 계정 | Supabase **Auth** 사용자 — 「**지점·매니저·판매사**」에서 만든 **이메일·비밀번호**로 POS 저장 시 본인 확인 |
| 실행 | `./run_frame_ops.sh` 등 **제공 스크립트** 사용 권장 (사이드 메뉴 이중 표시 방지) |

**참고** · POS에서 쓰는 비밀번호는 **스태프 개인 계정**입니다. 서비스 롤 키는 절대 매장에 공유하지 마세요.
""".strip()
