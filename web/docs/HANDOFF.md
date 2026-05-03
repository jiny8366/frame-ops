# Frame Ops — 멀티 PC 핸드오프

작성일: 2026-05-03 (직전 갱신: 2026-04-28)
운영 PC: Mac (jiny8366) — 메인 / 보조 Mac / Windows
프로덕션: https://frame-ops.vercel.app
리포: https://github.com/jiny8366/frame-ops.git
기준 브랜치: `main` (이 문서 작성 시점 HEAD: `172cff6`)

---

## 0. 이 문서의 위치

- 표준 위치 (canonical): `web/docs/HANDOFF.md` — git 으로 동기화
- 새 PC 셋업용 사본: `iCloudDrive/frame_ops_handoff/HANDOFF.md` — 리포 클론 전에 읽는 진입점
- 두 파일은 같은 내용을 유지. 갱신 시 양쪽 모두 수정.

---

## 1. 현재 상태 (main 기준)

### 1-1. 최근 머지 흐름 (#101 → #123)

- **계정/권한 분리 완결** (#105): 본사·지점 계정관리 API/UI 분리 + `hq_store_accounts` 권한 도입
- **POS UX 강화** (#106~#114): 점간이동 메뉴 분리, 자판/키패드 안내, 데스크톱 하드웨어 키보드, 전시상품(재고≤1) 10% 자동 할인, 매입가 본사 전용 노출
- **환불 흐름 재설계** (#110, #113~#118): `fo_returns`/`fo_return_lines` 별도 테이블 도입, 매출/대시보드/통계 전반에 환불(-) 반영
- **정산 분리** (#119): 지출내역 현금/카드 분리, 시재 연산 차등
- **운영 자동화** (#120~#121): `/api/health` + GitHub Actions 5분 워머로 cold-start 차단
- **본사 송신 매장 UX** (#122): 첫 매장 자동 선택 제거, '선택' 기본값
- **상품 라인 확장** (#123): 안경테/선글라스/무테(RLS)/고글(GGL) 4종

### 1-2. 운영 자동화

- 워머: `.github/workflows/keep-warm.yml` 가 5분마다 `/api/health` 호출 → Vercel cold-start 방지
- 헬스체크: `/api/health` 는 미들웨어 인증 우회 화이트리스트 (PR #121)
- 자동 배포: main push → Vercel production 빌드 (1~3분)

---

## 2. 즉시 처리 필요 — 열린 PR 3건

세 PR 모두 작성: 2026-04-27, Vercel preview SUCCESS, 사용자 검토 대기.

### #104 — `fix(sales): seller_user_id FK auth.users → fo_staff_profiles 재정렬 (Phase 1)`
- 브랜치: `fix/sales-seller-fk-staff-profiles`
- DB FK 정합성 단독 PR. `fo_sales.seller_user_id` 가 `fo_staff_profiles.user_id` 를 참조하도록 재정렬.
- **원격 Supabase 에는 이미 적용 완료** — 코드 PR 만 남음
- 우선순위: **최상**. PR #105 (Phase 2/3) 가 먼저 머지된 비대칭 상태이므로 정렬 필요.

### #102 — `fix(sync+sales): zombie 회복 + seller_user_id graceful degradation`
- 브랜치: `fix/sync-self-healing`
- `flushSyncQueue` 자가 회복 + RPC graceful NULL. PR #104 의 응급 처치 + 클라이언트 자가 회복 로직.
- 머지 순서: **#104 머지 후 rebase → 머지** 권장.

### #103 — `feat(products): 카테고리(소재) [+] 토글 시 선택값 prefill + [수정]/[생성] 분리`
- 브랜치: `feat/product-category-edit-create`
- 카테고리 인라인 편집 UX. 신규 엔드포인트 `PUT /api/admin/categories/[id]`.
- 우선순위: 중. 기능 PR — 검증 후 단독 머지.

---

## 3. 새 PC 셋업 (한 번만)

### 3-1. Mac
```bash
bash ~/Library/Mobile\ Documents/com~apple~CloudDocs/frame_ops_handoff/mac-setup.sh
```
스크립트가 처리: Homebrew/git/node/Claude Code CLI 설치, 리포 클론(`~/dev/frame_ops`), `.env.local` 템플릿 복사, `npm install`.

추가 권장: `brew install gh` 후 `gh auth login` (PR 작업), `brew install --cask cursor` (편집기).

### 3-2. Windows
`iCloudDrive\frame_ops_handoff\windows-setup.ps1` 참조. 핵심:
1. Git for Windows + Node.js LTS + Cursor/VS Code
2. `npm i -g @anthropic-ai/claude-code` → `claude login`
3. `git clone https://github.com/jiny8366/frame-ops.git ~\dev\frame_ops`
4. `web/.env.local` 값 채우기 (안전 채널로 가져오기)
5. `cd ~\dev\frame_ops\web && npm install && npm run dev`

### 3-3. 환경변수 (`web/.env.local`)
- 키 목록: `iCloudDrive/frame_ops_handoff/.env.local.template` 참고
- 실제 값은 1Password / iMessage / 암호화 USB 등 안전 채널로만 옮기기
- iCloud 템플릿에 실제 값이 들어있으면 `mac-setup.sh` 가 자동 복사

---

## 4. 일상 작업 흐름

### 4-1. 작업 시작
```bash
cd ~/dev/frame_ops
git checkout main
git pull --ff-only origin main
cd web
npm install   # 의존성 변경 시
npm run dev   # http://localhost:3000
```

### 4-2. 변경 → PR
```bash
git checkout -b feat/<short-name>   # 또는 fix/, chore/
# 수정 작업
cd web && npx tsc --noEmit          # 통과 필수
git add <변경파일>
git commit -m "..."
git push -u origin feat/<short-name>
gh pr create --title "..." --body "..."
```

### 4-3. PR → 머지 → 배포
1. PR 생성 직후 Vercel 가 preview 빌드 (1~3분)
2. preview SUCCESS 확인 후 머지 (`gh pr merge <#> --squash --delete-branch`)
3. main push → Vercel production 빌드 자동 트리거
4. 1~3분 후 https://frame-ops.vercel.app 반영

### 4-4. 멀티 PC 동시 작업 충돌 방지
- 같은 파일을 두 PC 에서 동시 수정 금지
- 한 PC 에서 commit/push 후 다른 PC 에서 `git pull --ff-only`
- 동일 브랜치 양쪽 체크아웃은 OK. 단 push 전에 fetch + rebase 권장
- worktree (`.claude/worktrees/...`) 는 git 이 자동 관리 — PC 마다 따로 둠

---

## 5. 작업 규칙 (메인 Mac 기준 — 모든 PC 공통)

- **main 직접 푸시 금지** — 항상 새 브랜치 → PR
- 커밋 전 `npx tsc --noEmit` (web/) 통과 확인
- PR 본문에 Test plan 포함, Vercel preview SUCCESS 후 머지
- 코드 변경 시 commit message 끝에 `Co-Authored-By: Claude` 줄 추가
- **DELETE / DROP 등 데이터 파괴 작업은 사용자 명시 확인 없이 실행 금지**
- 모든 응답/문서/커밋 메시지는 한국어
- 도구 호출은 병렬 가능하면 병렬

---

## 6. 트러블슈팅

### "권한/메뉴 변경이 반영 안 됨"
1. 로그아웃 → 재로그인 (JWT 새 권한 키 반영)
2. DevTools → Application → Service Workers → Unregister
3. Cmd+Shift+R / Ctrl+Shift+R 하드 리로드

### "미동기화 큐가 안 풀림" (POS)
- 모달 자동 진단 (PR #102 머지 후 자동) — 30초 대기
- 안 풀리면 `/admin/sales-search` 에서 누락 판매 직접 확인
- FK 위반 (4건+) → PR #104 머지가 근본 해결

### Node 버전 충돌
- 메인 Mac: v25.x — Windows LTS v20/v22 라도 보통 빌드 OK
- 실패 시 `rm -rf node_modules package-lock.json && npm install`

### `.env.local` 누락 / placeholder 의심
```bash
grep -c "your-" ~/dev/frame_ops/web/.env.local
# 0 이면 실제 값. 1+ 이면 템플릿 — 안전 채널로 진짜 값 받아 채우기
```

### Claude Code 메모리는 PC 별 로컬
- `~/.claude/memory/` 는 동기화되지 않음
- 영구 컨텍스트는 이 `HANDOFF.md` 또는 `web/CLAUDE.md` 에 작성

---

## 7. 정리 대상 (alert)

- 원격 브랜치 `feat/staff-hq-store-separation` — 사실상 stale. 핵심 작업은 PR #105 로 main 에 머지됨. 폐기 권장:
  ```bash
  gh api -X DELETE repos/jiny8366/frame-ops/git/refs/heads/feat/staff-hq-store-separation
  ```
  (현재 9개 미머지 커밋이 있으나 모두 main 의 다른 PR 로 대체됨 — `git diff origin/main..origin/feat/staff-hq-store-separation` 로 0 신규 파일 확인)

---

## 8. 다음 PC 에서 첫 메시지 예시

```
@docs/HANDOFF.md 읽고 이어서 작업할게.
현재 main 기준 상태 확인하고, 우선 #104 → #102 → #103 순서로
열린 PR 검토부터 도와줘.
```
