#!/usr/bin/env bash
# 로컬에서 CRM / FRAME OPS / pytest 를 같은 방식으로 실행하기 위한 도우미 스크립트 (Mac/Linux)
set -euo pipefail
ROOT="$(cd "$(dirname "$0")" && pwd)"
cd "$ROOT"

usage() {
  cat <<'EOF'
[run_local] 로컬 실행 도우미

  ./run_local.sh setup      — .venv 생성 + requirements.txt 설치만
  ./run_local.sh crm        — GENIUS CRM (streamlit run apps/my_crm/main.py)
  ./run_local.sh frameops   — FRAME OPS (run_frame_ops.sh 와 동일)
  ./run_local.sh test       — pytest tests/ -m "not live" (DB 불필요)

명안당 로컬뷰(지점 기본·배지): ./run_myeongandang_local.sh  (설정: config/local_views/)

사전 준비:
  cp .env.example .env  후 Supabase·API 키를 채웁니다.

Streamlit 추가 옵션 예:
  ./run_local.sh crm --server.port 8503
  ./run_local.sh frameops --server.port 9000   # 기본 8502 대신 (맨 뒤 인자가 우선)
EOF
}

ensure_venv() {
  local py="${ROOT}/.venv/bin/python"
  if [[ ! -x "$py" ]]; then
    echo "[run_local] .venv 생성 및 pip install -r requirements.txt 실행 중..."
    python3 -m venv "${ROOT}/.venv"
    "${ROOT}/.venv/bin/pip" install -U pip
    "${ROOT}/.venv/bin/pip" install -r "${ROOT}/requirements.txt"
    echo "[run_local] 가상환경 준비 완료."
  fi
}

env_hint() {
  if [[ ! -f "${ROOT}/.env" ]]; then
    echo "[run_local] 안내: .env 가 없습니다. 키를 넣으려면:" >&2
    echo "  cp .env.example .env" >&2
  fi
}

cmd="${1:-}"
case "$cmd" in
  setup)
    ensure_venv
    ;;
  crm)
    shift
    ensure_venv
    env_hint
    exec "${ROOT}/.venv/bin/python" -m streamlit run "${ROOT}/apps/my_crm/main.py" "$@"
    ;;
  frameops)
    shift
    ensure_venv
    env_hint
    exec "${ROOT}/run_frame_ops.sh" "$@"
    ;;
  test)
    shift
    ensure_venv
    if [[ -f "${ROOT}/requirements-dev.txt" ]]; then
      "${ROOT}/.venv/bin/pip" install -q -r "${ROOT}/requirements-dev.txt"
    fi
    exec "${ROOT}/.venv/bin/pytest" tests/ -m "not live" "$@"
    ;;
  help | -h | --help | "")
    usage
    ;;
  *)
    echo "[run_local] 알 수 없는 명령: $cmd" >&2
    usage
    exit 1
    ;;
esac
