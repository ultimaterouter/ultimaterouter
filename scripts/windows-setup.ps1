$ErrorActionPreference = "Stop"
Write-Host "Ultimate Router local setup" -ForegroundColor Cyan

if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
  throw "Node.js is not installed. Install Node.js 20 LTS or newer first."
}
if (-not (Get-Command npm -ErrorAction SilentlyContinue)) {
  throw "npm is not available in PATH."
}
if (-not (Get-Command docker -ErrorAction SilentlyContinue)) {
  throw "Docker Desktop is required for the local PostgreSQL service."
}

if (-not (Test-Path ".env")) {
  Copy-Item ".env.example" ".env"
  Write-Host "Created .env from .env.example. Change the local database password if needed."
}

docker compose up -d postgres
npm install
npm run db:migrate
Write-Host "Setup complete. Run: npm run dev" -ForegroundColor Green
