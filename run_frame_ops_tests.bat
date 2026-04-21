@echo off
setlocal
REM FRAME OPS — Windows에서 pytest / 프리플라이트 (Mac 은 run_frame_ops_tests.sh)
cd /d "%~dp0"
chcp 65001 >nul 2>&1
set MPLBACKEND=Agg
set "PY=%CD%\.venv\Scripts\python.exe"
if not exist "%PY%" (
  echo 가상환경이 없습니다. 예:
  echo   py -3 -m venv .venv
  echo   .venv\Scripts\pip install -r requirements-dev.txt
  exit /b 1
)
if /i "%~1"=="--preflight" (
  "%PY%" scripts\frame_ops_preflight.py
  exit /b %ERRORLEVEL%
)
"%PY%" -m pytest tests\ -m "not live" %*
