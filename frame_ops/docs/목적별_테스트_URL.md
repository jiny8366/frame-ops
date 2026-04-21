# FRAME OPS — 목적별 테스트 URL

로컬에서 `./run_frame_ops.sh`(또는 `run_frame_ops.bat`)로 띄웠을 때 **기본 주소**는 아래와 같습니다.

- **홈(본사 · 지점 등록)**: `http://localhost:8502/`
- **포트**가 다르면 `8502`만 실제 주소로 바꿉니다.
- **다른 PC·핸드폰**에서 접속할 때는 실행 중인 PC의 IP로 바꿉니다.  
  예: `http://192.168.0.5:8502/`
- **Streamlit Cloud** 등에 올렸다면 `https://(배포주소).streamlit.app` 형태로 같은 **경로만** 붙이면 됩니다.

한글·특수문자 파일명 페이지는 브라우저에 따라 주소가 **퍼센트 인코딩**으로 보일 수 있습니다.  
**열리지 않으면** 아래 표의 **인코딩 URL**을 복사해 사용하세요.

---

## 서비스 모드 고정 (`?mode=`)

사이드바·**☰** 메뉴 묶음을 **본사 / 본사 대시보드 / 판매 관리** 중 하나로 고정해 두고 QA·북마크할 때 사용합니다.

| 모드 | 권장 URL (로컬 8502) |
|------|----------------------|
| 본사 | `http://localhost:8502/?mode=hq` |
| 본사 대시보드 | `http://localhost:8502/11_%ED%86%B5%EA%B3%84%EB%A6%AC%ED%8F%AC%ED%8A%B8?mode=hq_dashboard` |
| 판매 관리 | `http://localhost:8502/02_POS%ED%8C%90%EB%A7%A4?mode=sales` |

---

## 목적별로 바로 열기

| 테스트 목적 | 권장 URL |
|-------------|----------|
| 처음부터 · 서비스(본사/대시보드/판매) 고르기 | [서비스 선택 (UTF-8)](http://localhost:8502/00_서비스선택) · [인코딩](http://localhost:8502/00_%EC%84%9C%EB%B9%84%EC%8A%A4%EC%84%A0%ED%83%9D) |
| 본사 홈 · 지점 등록·데모 | `http://localhost:8502/` |
| 주문·발주 | [주문 리스트](http://localhost:8502/07_%EC%A3%BC%EB%AC%B8%EB%A6%AC%EC%8A%A4%ED%8A%B8) |
| 매입 처리 | [매입처리](http://localhost:8502/13_%EB%A7%A4%EC%9E%85%EC%B2%98%EB%A6%AC) |
| 판매 CSV/xlsx 반영 | [판매 데이터 가져오기](http://localhost:8502/12_%ED%8C%90%EB%A7%A4%EB%8D%B0%EC%9D%B4%ED%84%B0%EA%B0%80%EC%A0%B8%EC%98%A4%EA%B8%B0) |
| 본사 스태프·권한 | [본사·스태프·권한](http://localhost:8502/14_%EB%B3%B8%EC%82%AC%C2%B7%EC%8A%A4%ED%83%9C%ED%94%84%C2%B7%EA%B6%8C%ED%95%9C) |
| 지점 매니저·판매사 계정 | [지점·매니저·판매사](http://localhost:8502/15_%EC%A7%80%EC%A0%90%C2%B7%EB%A7%A4%EB%8B%88%EC%A0%80%C2%B7%ED%8C%90%EB%A7%A4%EC%82%AC) |
| 통계·리포트(대시보드) | [통계·리포트](http://localhost:8502/11_%ED%86%B5%EA%B3%84%EB%A6%AC%ED%8F%AC%ED%8A%B8) |
| 판매 검색 | [판매 검색](http://localhost:8502/16_%ED%8C%90%EB%A7%A4%EA%B2%80%EC%83%89) |
| POS 판매 | [POS 판매](http://localhost:8502/02_POS%ED%8C%90%EB%A7%A4) |
| 상품 등록 | [상품 등록](http://localhost:8502/01_%EC%83%81%ED%92%88%EB%93%B1%EB%A1%9D) |
| 입고 / 출고 | [입고](http://localhost:8502/03_%EC%9E%85%EA%B3%A0) · [출고](http://localhost:8502/04_%EC%B6%9C%EA%B3%A0) |
| 재고 | [재고 현황](http://localhost:8502/06_%EC%9E%AC%EA%B3%A0%ED%98%84%ED%99%A9) · [재고 조정](http://localhost:8502/05_%EC%9E%AC%EA%B3%A0%EC%A1%B0%EC%A0%95) |
| 정산 | [정산](http://localhost:8502/08_%EC%A0%95%EC%82%B0) |
| 반품 / 매장 이동 | [반품](http://localhost:8502/09_%EB%B0%98%ED%92%88) · [매장 간 이동](http://localhost:8502/10_%EB%A7%A4%EC%9E%A5%EA%B0%84%EC%9D%B4%EB%8F%99) |

---

## 전체 페이지 (파일명 → 인코딩 URL, 로컬 8502)

| 페이지 파일 | 복사용 URL |
|-------------|------------|
| `00_서비스선택.py` | `http://localhost:8502/00_%EC%84%9C%EB%B9%84%EC%8A%A4%EC%84%A0%ED%83%9D` |
| `01_상품등록.py` | `http://localhost:8502/01_%EC%83%81%ED%92%88%EB%93%B1%EB%A1%9D` |
| `02_POS판매.py` | `http://localhost:8502/02_POS%ED%8C%90%EB%A7%A4` |
| `03_입고.py` | `http://localhost:8502/03_%EC%9E%85%EA%B3%A0` |
| `04_출고.py` | `http://localhost:8502/04_%EC%B6%9C%EA%B3%A0` |
| `05_재고조정.py` | `http://localhost:8502/05_%EC%9E%AC%EA%B3%A0%EC%A1%B0%EC%A0%95` |
| `06_재고현황.py` | `http://localhost:8502/06_%EC%9E%AC%EA%B3%A0%ED%98%84%ED%99%A9` |
| `07_주문리스트.py` | `http://localhost:8502/07_%EC%A3%BC%EB%AC%B8%EB%A6%AC%EC%8A%A4%ED%8A%B8` |
| `08_정산.py` | `http://localhost:8502/08_%EC%A0%95%EC%82%B0` |
| `09_반품.py` | `http://localhost:8502/09_%EB%B0%98%ED%92%88` |
| `10_매장간이동.py` | `http://localhost:8502/10_%EB%A7%A4%EC%9E%A5%EA%B0%84%EC%9D%B4%EB%8F%99` |
| `11_통계리포트.py` | `http://localhost:8502/11_%ED%86%B5%EA%B3%84%EB%A6%AC%ED%8F%AC%ED%8A%B8` |
| `12_판매데이터가져오기.py` | `http://localhost:8502/12_%ED%8C%90%EB%A7%A4%EB%8D%B0%EC%9D%B4%ED%84%B0%EA%B0%80%EC%A0%B8%EC%98%A4%EA%B8%B0` |
| `13_매입처리.py` | `http://localhost:8502/13_%EB%A7%A4%EC%9E%85%EC%B2%98%EB%A6%AC` |
| `14_본사·스태프·권한.py` | `http://localhost:8502/14_%EB%B3%B8%EC%82%AC%C2%B7%EC%8A%A4%ED%83%9C%ED%94%84%C2%B7%EA%B6%8C%ED%95%9C` |
| `15_지점·매니저·판매사.py` | `http://localhost:8502/15_%EC%A7%80%EC%A0%90%C2%B7%EB%A7%A4%EB%8B%88%EC%A0%80%C2%B7%ED%8C%90%EB%A7%A4%EC%82%AC` |
| `16_판매검색.py` | `http://localhost:8502/16_%ED%8C%90%EB%A7%A4%EA%B2%80%EC%83%89` |

---

## 스크립트로 다시 출력하기

프로젝트 루트에서:

```bash
.venv/bin/python scripts/print_frame_ops_urls.py
.venv/bin/python scripts/print_frame_ops_urls.py --base http://192.168.0.5:8502
```

배포 URL이 정해지면 `--base`만 바꿔 목록을 다시 뽑을 수 있습니다.
