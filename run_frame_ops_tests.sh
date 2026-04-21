#!/usr/bin/env bash
# FRAME OPS — Mac(또는 Linux)에서 단위 테스트·프리플라이트용
set -euo pipefail
cd "$(dirname "$0")"
PY="${PWD}/.venv/bin/python"
if [[ ! -x "$PY" ]]; then
  echo "가상환경이 없습니다: python3 -m venv .venv && .venv/bin/pip install -r requirements-dev.txt"
  exit 1
fi
export MPLBACKEND="${MPLBACKEND:-Agg}"
if [[ "${1:-}" == "--preflight" ]]; then
  shift
  exec "$PY" scripts/frame_ops_preflight.py "$@"
fi
exec "$PY" -m pytest tests/ -m "not live" "$@"
