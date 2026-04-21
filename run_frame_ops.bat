@echo off
setlocal
REM FRAME OPS — Windows 업무 PC용 (Mac 에서는 run_frame_ops.sh 또는 run_frame_ops_tests.sh 권장)
cd /d "%~dp0"

REM 한글 페이지명·메시지 깨짐 방지: 콘솔 UTF-8
chcp 65001 >nul 2>&1

if not exist ".env" (
  echo frame_ops: 프로젝트 루트에 .env 가 없습니다. .env.example 을 복사한 뒤 Supabase URL·키를 넣으세요. 1>&2
) else (
  findstr /I /C:"SUPABASE_URL=https" .env >nul 2>&1
  if errorlevel 1 (
    findstr /I /C:"SUPABASE_URL=http" .env >nul 2>&1
    if errorlevel 1 (
      echo frame_ops: .env 에 SUPABASE_URL=http(s)://... 줄이 보이지 않습니다. 호스팅 URL 을 확인하세요. 1>&2
    )
  )
)

set "PY=%CD%\.venv\Scripts\python.exe"
if not exist "%PY%" (
  echo 가상환경이 없습니다. 프로젝트 루트에서 예:
  echo   py -3 -m venv .venv
  echo   .venv\Scripts\pip install -r requirements.txt
  exit /b 1
)

set "STREAMLIT_CLIENT__SHOW_SIDEBAR_NAVIGATION=false"
if "%FRAME_OPS_SERVER_PORT%"=="" set "FRAME_OPS_SERVER_PORT=8502"
echo FRAME OPS — 로컬 주소: http://localhost:%FRAME_OPS_SERVER_PORT%
"%PY%" -m streamlit run frame_ops/app.py --server.port %FRAME_OPS_SERVER_PORT% %*
