#!/usr/bin/env bash
# 첫 FRAME OPS 마이그레이션 전체를 클립보드에 넣습니다 (맥).
# 다음: Supabase 웹 → SQL Editor → 붙여넣기 → Run
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
F="$ROOT/supabase/migrations/20260413_frame_ops_core.sql"
if [[ ! -f "$F" ]]; then
  echo "파일 없음: $F"
  exit 1
fi
cat "$F" | pbcopy
echo "복사 완료: 첫 마이그레이션(20260413_frame_ops_core.sql)이 클립보드에 있습니다."
echo "1) 브라우저에서 supabase.com 로그인"
echo "2) 프로젝트 선택 (URL에 tzlrtrijvmakvruucofm 이 있는지 확인)"
echo "3) 왼쪽 SQL Editor → New query → Cmd+V → Run (녹색 성공)"
