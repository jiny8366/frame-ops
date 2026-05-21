# Frame Ops 문서

## 권한 / 계정 시스템 응용 가이드

같은 내용을 **세 가지 포맷**으로 제공합니다. 수신자/용도에 따라 적합한 형식을 선택하세요.

| 파일 | 포맷 | 추천 사용처 |
|---|---|---|
| [`AUTH_PERMISSION_GUIDE.md`](./AUTH_PERMISSION_GUIDE.md) | Markdown | GitHub 에서 바로 읽기, PR 리뷰, IDE 에서 편집 |
| [`AUTH_PERMISSION_GUIDE.html`](./AUTH_PERMISSION_GUIDE.html) | HTML (self-contained) | 이메일/메신저 첨부, 브라우저로 바로 열기, 인쇄/PDF 변환 |
| [`AUTH_PERMISSION_GUIDE.json`](./AUTH_PERMISSION_GUIDE.json) | JSON (구조화) | 다른 도구 (AI 에이전트, 검색 인덱스, doc generator) import |

### 각 포맷 특징

- **Markdown** — git diff 가 잘 보이고 GitHub UI 에서 즉시 렌더링. PR 로 변경 추적하기 쉬움.
- **HTML** — 외부 자산 없는 단일 파일. 다크 모드 자동 지원, 인쇄 최적화, 모바일 친화적. 비개발자 동료에게 첨부 전달 시 최적.
- **JSON** — 섹션·코드 블록·표·리스트가 명확한 스키마로 구조화. 자동 처리 / AI 가 파싱 / 검색 인덱스 빌드 등에 적합.

### 동기화 규칙

세 파일은 같은 정보를 담습니다. 내용 변경 시 **세 파일 모두 갱신**해야 일관성이 유지됩니다.
- Markdown 을 source of truth 로 가정하고 HTML/JSON 을 함께 업데이트
- 또는 별도 빌드 스크립트로 MD → HTML/JSON 자동 생성 (향후 개선 가능)

### 빠른 공유

```bash
# 동료에게 HTML 전달
open docs/AUTH_PERMISSION_GUIDE.html

# GitHub raw 링크 (markdown)
https://github.com/jiny8366/frame-ops/blob/main/web/docs/AUTH_PERMISSION_GUIDE.md

# JSON 다운로드 (curl)
curl -O https://raw.githubusercontent.com/jiny8366/frame-ops/main/web/docs/AUTH_PERMISSION_GUIDE.json
```

---

## 기타 문서

- [`HANDOFF.md`](./HANDOFF.md) — 다른 머신/세션으로 작업 인계 안내
