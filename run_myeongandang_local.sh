#!/usr/bin/env bash
# 명안당 매장 로컬 시연 — FRAME OPS + 기본 지점·로컬뷰 배지
set -euo pipefail
ROOT="$(cd "$(dirname "$0")" && pwd)"
PRESET="${ROOT}/config/local_views/myeongandang.env"

export FRAME_OPS_LOCAL_VIEW_LABEL="${FRAME_OPS_LOCAL_VIEW_LABEL:-명안당}"

if [[ -f "$PRESET" ]]; then
  set -a
  # shellcheck disable=SC1090
  source "$PRESET"
  set +a
else
  echo "[명안당 로컬뷰] ${PRESET} 없음 — 북촌(BKC01) 기본으로 진행합니다." >&2
  echo "  지점 코드를 바꾸려면: cp config/local_views/myeongandang.env.example config/local_views/myeongandang.env" >&2
fi

exec "${ROOT}/run_local.sh" frameops "$@"
