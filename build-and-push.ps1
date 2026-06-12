# ============================================================================
# Docker Build & Push Script for PFE Application (PowerShell)
# Author: ousssama
# Description: Automated script to build and push Docker images to Docker Hub
# Usage: .\build-and-push.ps1 [version]
# ============================================================================

param(
    [string]$Version = "latest"
)

# Configuration
$DockerRegistry = "docker.io"
$DockerUsername = "ousssama"
$Namespace = $DockerUsername
$AppName = "PFE-SAAS"

# Image names
$BackendImage = "${Namespace}/${AppName}-backend:${Version}"
$FrontendImage = "${Namespace}/${AppName}-frontend:${Version}"
$BackendImageLatest = "${Namespace}/${AppName}-backend:latest"
$FrontendImageLatest = "${Namespace}/${AppName}-frontend:latest"

Write-Host "==========================================================================" -ForegroundColor Cyan
Write-Host "PFE Docker Build & Push Script" -ForegroundColor Cyan
Write-Host "==========================================================================" -ForegroundColor Cyan
Write-Host "Docker Username: $DockerUsername" -ForegroundColor Green
Write-Host "App Name: $AppName" -ForegroundColor Green
Write-Host "Version: $Version" -ForegroundColor Green
Write-Host "==========================================================================" -ForegroundColor Cyan

# Check if Docker is running
try {
    docker ps -q | Out-Null
} catch {
    Write-Host "❌ Docker is not running. Please start Docker Desktop." -ForegroundColor Red
    exit 1
}
Write-Host "✅ Docker is running" -ForegroundColor Green

# Build Backend Image
Write-Host ""
Write-Host "==========================================================================" -ForegroundColor Cyan
Write-Host "Building Backend Image: $BackendImage" -ForegroundColor Cyan
Write-Host "==========================================================================" -ForegroundColor Cyan

docker build `
  --tag $BackendImage `
  --tag $BackendImageLatest `
  --file PFE-BACKEND/Dockerfile `
  PFE-BACKEND/

if ($LASTEXITCODE -eq 0) {
    Write-Host "✅ Backend image built successfully" -ForegroundColor Green
} else {
    Write-Host "❌ Failed to build backend image" -ForegroundColor Red
    exit 1
}

# Build Frontend Image
Write-Host ""
Write-Host "==========================================================================" -ForegroundColor Cyan
Write-Host "Building Frontend Image: $FrontendImage" -ForegroundColor Cyan
Write-Host "==========================================================================" -ForegroundColor Cyan

docker build `
  --tag $FrontendImage `
  --tag $FrontendImageLatest `
  --file PFE-FRONTEND/Dockerfile `
  PFE-FRONTEND/

if ($LASTEXITCODE -eq 0) {
    Write-Host "✅ Frontend image built successfully" -ForegroundColor Green
} else {
    Write-Host "❌ Failed to build frontend image" -ForegroundColor Red
    exit 1
}

# Check image sizes
Write-Host ""
Write-Host "==========================================================================" -ForegroundColor Cyan
Write-Host "Image Sizes:" -ForegroundColor Cyan
Write-Host "==========================================================================" -ForegroundColor Cyan
docker images | Select-String $AppName

# Login check
Write-Host ""
Write-Host "Checking Docker login..." -ForegroundColor Yellow
$DockerConfig = Get-Content -Path "$env:USERPROFILE\.docker\config.json" -ErrorAction SilentlyContinue
if (-not $DockerConfig -or $DockerConfig -notmatch '"auths"') {
    Write-Host "❌ Not logged in to Docker. Please run: docker login" -ForegroundColor Red
    exit 1
}
Write-Host "✅ Docker login verified" -ForegroundColor Green

# Push Backend Image
Write-Host ""
Write-Host "==========================================================================" -ForegroundColor Cyan
Write-Host "Pushing Backend Image to Docker Hub: $BackendImage" -ForegroundColor Cyan
Write-Host "==========================================================================" -ForegroundColor Cyan

docker push $BackendImage
docker push $BackendImageLatest

if ($LASTEXITCODE -eq 0) {
    Write-Host "✅ Backend image pushed successfully" -ForegroundColor Green
} else {
    Write-Host "❌ Failed to push backend image" -ForegroundColor Red
    exit 1
}

# Push Frontend Image
Write-Host ""
Write-Host "==========================================================================" -ForegroundColor Cyan
Write-Host "Pushing Frontend Image to Docker Hub: $FrontendImage" -ForegroundColor Cyan
Write-Host "==========================================================================" -ForegroundColor Cyan

docker push $FrontendImage
docker push $FrontendImageLatest

if ($LASTEXITCODE -eq 0) {
    Write-Host "✅ Frontend image pushed successfully" -ForegroundColor Green
} else {
    Write-Host "❌ Failed to push frontend image" -ForegroundColor Red
    exit 1
}

Write-Host ""
Write-Host "==========================================================================" -ForegroundColor Green
Write-Host "✅ All images built and pushed successfully!" -ForegroundColor Green
Write-Host "==========================================================================" -ForegroundColor Green
Write-Host ""
Write-Host "Images available at Docker Hub:" -ForegroundColor Green
Write-Host "  - $BackendImage" -ForegroundColor Cyan
Write-Host "  - $BackendImageLatest" -ForegroundColor Cyan
Write-Host "  - $FrontendImage" -ForegroundColor Cyan
Write-Host "  - $FrontendImageLatest" -ForegroundColor Cyan
Write-Host ""
Write-Host "To pull and run:" -ForegroundColor Green
Write-Host "  docker pull $BackendImage" -ForegroundColor Cyan
Write-Host "  docker pull $FrontendImage" -ForegroundColor Cyan
Write-Host ""
Write-Host "For Kubernetes deployment, use:" -ForegroundColor Green
Write-Host "  $BackendImage" -ForegroundColor Cyan
Write-Host "  $FrontendImage" -ForegroundColor Cyan
Write-Host "==========================================================================" -ForegroundColor Green
