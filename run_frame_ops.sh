#!/usr/bin/env bash
# Mac/Linux — FRAME OPS 실행. Windows 업무 PC: run_frame_ops.bat 또는 run_frame_ops.ps1
set -euo pipefail
cd "$(dirname "$0")"
if [[ ! -f .env ]]; then
  echo "frame_ops: 프로젝트 루트에 .env 가 없습니다. .env.example 을 복사한 뒤 서버(Supabase) URL·키를 넣으세요." >&2
else
  if ! grep -qE '^[[:space:]]*SUPABASE_URL=https?://' .env 2>/dev/null; then
    echo "frame_ops: .env 에 SUPABASE_URL=https://... 이 없거나 주석만 있습니다. 호스팅 Supabase URL 을 설정하세요." >&2
  fi
fi
PY="${PWD}/.venv/bin/python"
if [[ ! -x "$PY" ]]; then
  echo "가상환경이 없습니다. 프로젝트 루트에서 다음을 실행하세요:"
  echo "  python3 -m venv .venv && .venv/bin/pip install -r requirements.txt"
  exit 1
fi
# 기본 pages/ 사이드 탐색 숨김 — 모드별 메뉴는 앱에서 제공 (GENIUS CRM 등 다른 streamlit 은 영향 없음)
export STREAMLIT_CLIENT__SHOW_SIDEBAR_NAVIGATION=false
# .pyc 혼동 줄이기 (소스만 수정했는데 옛 동작처럼 보일 때 진단용)
export PYTHONDONTWRITEBYTECODE=1

FO_PORT="${FRAME_OPS_SERVER_PORT:-8502}"
export FRAME_OPS_SERVER_PORT="$FO_PORT"
echo "FRAME OPS — 작업 디렉터리: $PWD"
echo "FRAME OPS — 진입: frame_ops/app.py (설정: .streamlit/config.toml)"
echo "FRAME OPS — 로컬 주소: http://localhost:${FO_PORT}"
exec "$PY" -m streamlit run frame_ops/app.py \
  --server.runOnSave=true \
  --server.fileWatcherType=poll \
  --server.port="$FO_PORT" \
  "$@"
