# FRAME OPS — Windows (PowerShell). 업무 PC에서 브라우저로 앱 실행.
# 실행 정책: 필요 시  Set-ExecutionPolicy -Scope CurrentUser RemoteSigned
Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"
Set-Location $PSScriptRoot

try {
    [Console]::OutputEncoding = [System.Text.Encoding]::UTF8
    $OutputEncoding = [System.Text.Encoding]::UTF8
} catch {}

if (-not (Test-Path -LiteralPath ".env")) {
    Write-Warning "프로젝트 루트에 .env 가 없습니다. .env.example 을 참고하세요."
} elseif (-not (Select-String -Path ".env" -Pattern "^\s*SUPABASE_URL=https?://" -Quiet)) {
    Write-Warning ".env 에 SUPABASE_URL=http(s)://... 가 없을 수 있습니다."
}

$py = Join-Path $PWD ".venv\Scripts\python.exe"
if (-not (Test-Path -LiteralPath $py)) {
    Write-Host @"
가상환경이 없습니다. 예:
  py -3 -m venv .venv
  .\.venv\Scripts\pip install -r requirements.txt
"@ -ForegroundColor Yellow
    exit 1
}

$env:STREAMLIT_CLIENT__SHOW_SIDEBAR_NAVIGATION = "false"
$foPort = $env:FRAME_OPS_SERVER_PORT
if ([string]::IsNullOrWhiteSpace($foPort)) { $foPort = "8502" }
$env:FRAME_OPS_SERVER_PORT = $foPort
Write-Host "FRAME OPS — 로컬 주소: http://localhost:$foPort"
& $py -m streamlit run frame_ops/app.py --server.port $foPort @args
