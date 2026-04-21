#!/bin/bash
set -e
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../../../" && pwd)"
cd "$PROJECT_ROOT"
echo "=== GENIUS OPTICAL Edge Function 배포 시작 ==="
supabase functions deploy claude-proxy
echo "=== 배포 완료 ==="
echo "Supabase 대시보드에서 확인: https://supabase.com/dashboard"

