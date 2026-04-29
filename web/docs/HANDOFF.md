# Frame Ops — Mac → Windows 핸드오프

작성일: 2026-04-28
원본 PC: Mac (jiny8366)
대상 PC: Windows

## 0. 이 문서의 위치
- iCloud Drive: `iCloudDrive\frame_ops_handoff\HANDOFF.md`
- Git 리포: `docs/HANDOFF.md` (브랜치 `feat/staff-hq-store-separation`)

윈도우에서 iCloud for Windows 설치 후 자동 동기화되거나, `git pull`로 받아도 됨.

---

## 1. 현재 작업 요약

### 진행 중인 브랜치
- 리포: `https://github.com/jiny8366/frame-ops.git`
- 브랜치: `feat/staff-hq-store-separation`

### 완료된 변경사항
1. **본사/지점 계정관리 분리**
   - 본사 메뉴: `계정설정` (`/hq/staff`) — HQ 계정 + 지점 매니저만 다룸
   - 본사 메뉴: `매장 계정` (`/hq/store-accounts`) — 새로 추가, 판매사/직원 통합 관리
   - 지점 메뉴: `매장 계정` (`/admin/staff`) — 본인 매장 판매사/직원만
2. **권한 키 추가**: `hq_store_accounts` (lib/auth/permissions.ts)
3. **API 게이팅**: `/api/hq/staff` (HQ + manager만), `/api/admin/staff` (store_salesperson/staff만), `/api/hq/store-accounts` (HQ + 권한 필요)
4. **헤더/메뉴 표시**: 본사 계정은 매장명 대신 "전체 매장"으로 표시
5. **카테고리 수정/삭제 기능 추가**
   - `PATCH /api/admin/categories/[id]` (label/code 수정)
   - `DELETE /api/admin/categories/[id]` (사용 중이면 409 차단)
   - 상품 등록/편집 모달의 카테고리 셀렉터 옆 ✎ 버튼

### 변경된 파일
- `web/lib/auth/permissions.ts`
- `web/app/admin/staff/page.tsx`
- `web/app/api/admin/staff/route.ts`
- `web/app/api/admin/staff/[id]/route.ts`
- `web/app/api/hq/staff/route.ts`
- `web/app/hq/staff/page.tsx`
- `web/components/layout/Header.tsx`
- `web/components/layout/UserMenu.tsx`
- `web/app/admin/products/ProductFormDialog.tsx`
- 신규: `web/app/api/admin/categories/[id]/route.ts`
- 신규: `web/app/api/hq/store-accounts/` (route.ts + [id]/route.ts)
- 신규: `web/app/hq/store-accounts/page.tsx`

---

## 2. 미테스트 / 다음 할 일

- [ ] 브라우저에서 동작 확인 (재로그인 + 서비스워커 제거 후)
  - 본사 계정으로 로그인 → 헤더에 "전체 매장" 표시되는지
  - UserMenu에 `계정설정`(본사)과 `매장 계정`(본사) 둘 다 보이는지
  - `/hq/store-accounts` 페이지 정상 렌더링
  - 상품 등록 모달에서 카테고리 옆 ✎ 클릭 → 수정/삭제 동작
- [ ] 지점 매니저 계정으로 로그인 → `/admin/staff` 만 보이는지, `/hq/*` 는 차단되는지
- [ ] 사용 중인 카테고리 삭제 시도 → 409 에러 메시지 표시 확인
- [ ] (옵션) `/api/hq/staff/[id]` PATCH 가드 강화 — 현재 row가 HQ/매니저인지 검증

---

## 3. Windows PC 셋업 (한 번만)

### 3-1. 필수 설치
1. **Git for Windows**: https://git-scm.com/download/win
2. **Node.js LTS**: https://nodejs.org (Mac은 v25.8.1 사용 중)
3. **Cursor 또는 VS Code**
4. **Claude Code**: PowerShell에서
   ```powershell
   npm install -g @anthropic-ai/claude-code
   claude login
   ```
5. **(선택) iCloud for Windows**: Microsoft Store에서 설치 → Apple ID 로그인 → iCloud Drive 동기화 켜기. 이 폴더가 `C:\Users\<user>\iCloudDrive\frame_ops_handoff\` 에 자동으로 나타남.

### 3-2. 리포 클론
PowerShell에서:
```powershell
cd ~\Desktop
git clone https://github.com/jiny8366/frame-ops.git frame_ops
cd frame_ops
git checkout feat/staff-hq-store-separation
git pull
```

### 3-3. 환경변수 설정
1. Mac에서 `web/.env.local` 의 값을 안전한 채널로 가져오기 (1Password / Bitwarden / 본인 이메일 / iMessage 등)
2. Windows에서:
   ```powershell
   cd ~\Desktop\frame_ops\web
   notepad .env.local
   ```
   - 키 목록은 `.env.local.template` 참고 (이 폴더에 함께 있음)

### 3-4. 의존성 설치 + 실행
```powershell
cd ~\Desktop\frame_ops\web
npm install
npm run dev
```
브라우저: http://localhost:3000

### 3-5. Claude Code 실행
```powershell
cd ~\Desktop\frame_ops\web\.claude\worktrees\friendly-knuth-81d7db\web
# 또는 그냥 ~\Desktop\frame_ops\web 에서
claude
```
Claude Code 첫 메시지로:
```
@docs/HANDOFF.md 읽고 이어서 작업할게. 현재 브랜치 상태 확인하고 미테스트 항목부터 점검해줘.
```

---

## 4. 다음에 작업 이어가는 흐름

### 작업 종료 시 (현재 PC)
```powershell
git add -A
git commit -m "wip: <간단 메시지>"
git push
```

### 작업 시작 시 (반대편 PC)
```powershell
cd ~\Desktop\frame_ops
git pull
cd web
npm install   # 의존성 변경 시만
npm run dev
```

### 동시 작업 시 충돌 방지
- 같은 파일을 양쪽에서 동시 수정 금지
- 한 PC에서 commit/push 후 다른 PC에서 pull
- worktree(`.claude/worktrees/friendly-knuth-81d7db/`)는 git이 자동 관리 — 같은 브랜치를 양쪽 PC에서 따로 체크아웃해도 됨

---

## 5. 트러블슈팅

### "수정한 내용이 반영 안 됨"
1. 로그아웃 → 재로그인 (JWT에 새 권한 키 반영)
2. DevTools → Application → Service Workers → Unregister
3. Cmd+Shift+R (Mac) / Ctrl+Shift+R (Windows) 하드 리로드

### Node 버전 차이로 빌드 에러
- Mac: v25.8.1 / Windows: v20.x LTS 등 — 주요 버전이 달라도 보통 OK
- 실패 시 Windows에서도 v25.x 로 맞추거나 `node_modules` 삭제 후 재설치

### Claude Code 메모리는 PC별 로컬
- `~/.claude/memory/` (Windows: `%USERPROFILE%\.claude\memory\`) 는 동기화 안 됨
- 영구 컨텍스트는 리포의 `CLAUDE.md` 또는 이 `HANDOFF.md` 에 작성
