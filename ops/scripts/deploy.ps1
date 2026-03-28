# SeedWorld Deployment Script for Windows
param(
    [switch]$Force,
    [switch]$EnableSSL
)

Write-Host "🚀 Deploying SeedWorld Application..." -ForegroundColor Green
$ScriptDir = Split-Path -Parent $PSCommandPath
$RootDir = Resolve-Path (Join-Path $ScriptDir "..\..")
$ComposeFile = Join-Path $RootDir "ops\docker\docker-compose.yml"

# Check if Docker is installed
try {
    docker version | Out-Null
    Write-Host "✅ Docker is installed" -ForegroundColor Green
} catch {
    Write-Host "❌ Docker is not installed. Please install Docker Desktop first." -ForegroundColor Red
    exit 1
}

# Check if Docker Compose is installed
try {
    docker-compose version | Out-Null
    Write-Host "✅ Docker Compose is installed" -ForegroundColor Green
} catch {
    Write-Host "❌ Docker Compose is not installed. Please install Docker Compose first." -ForegroundColor Red
    exit 1
}

# Stop existing containers if Force switch is used
if ($Force) {
    Write-Host "🔄 Stopping existing containers..." -ForegroundColor Yellow
    docker compose -f $ComposeFile down -v
}

# Build and start the application
Write-Host "📦 Building Docker image..." -ForegroundColor Yellow
docker compose -f $ComposeFile build

Write-Host "🔄 Starting application..." -ForegroundColor Yellow
docker compose -f $ComposeFile up -d

Write-Host "⏳ Waiting for application to be healthy..." -ForegroundColor Yellow
Start-Sleep -Seconds 10

# Check if application is running
$containerStatus = docker compose -f $ComposeFile ps
if ($containerStatus -match "Up") {
    Write-Host "✅ Application deployed successfully!" -ForegroundColor Green
    Write-Host "🌐 Application is available at: http://localhost:3000" -ForegroundColor Cyan
    Write-Host "🔧 WebSocket endpoint: ws://localhost:8080" -ForegroundColor Cyan
    
    if ($EnableSSL) {
        Write-Host "🔒 SSL enabled. Configure your domain in ops/docker/docker-compose.yml" -ForegroundColor Cyan
    }
} else {
    Write-Host "❌ Application failed to start. Check logs with: docker compose -f $ComposeFile logs" -ForegroundColor Red
    exit 1
}

Write-Host "📝 Useful commands:" -ForegroundColor Cyan
Write-Host "  View logs: docker compose -f $ComposeFile logs -f" -ForegroundColor White
Write-Host "  Stop app: docker compose -f $ComposeFile down" -ForegroundColor White
Write-Host "  Restart app: docker compose -f $ComposeFile restart" -ForegroundColor White
