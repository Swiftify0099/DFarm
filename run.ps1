# DFarm Smart Dairy Management Platform Launcher
param (
    [string]$Mode = ""
)

$ErrorActionPreference = "Stop"

function Show-Header {
    Clear-Host
    Write-Host "====================================================================" -ForegroundColor Cyan
    Write-Host "               DFARM - SMART DAIRY MANAGEMENT SYSTEM                " -ForegroundColor Yellow -BackgroundColor Black
    Write-Host "====================================================================" -ForegroundColor Cyan
    Write-Host ""
}

if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
    Write-Host "[ERROR] Node.js is not installed or not in PATH!" -ForegroundColor Red
    Write-Host "Please install Node.js 22+ from https://nodejs.org/"
    exit 1
}

if ($Mode -eq "") {
    Show-Header
    Write-Host "  [1] Run All (Backend + 3 Web Portals + Customer Mobile/Web) [DEFAULT]" -ForegroundColor Green
    Write-Host "  [2] Run All Web Apps & Backend (Dairy Admin, Super Admin, Collection)" -ForegroundColor White
    Write-Host "  [3] Run Customer Android App (Expo Android)" -ForegroundColor Magenta
    Write-Host "  [4] Run Customer App in Web Browser (Expo Web :8081)" -ForegroundColor Blue
    Write-Host "  [5] Run Backend API Server Only (:4000)" -ForegroundColor Cyan
    Write-Host "  [6] Run Unified Platform Hub (:3000)" -ForegroundColor Yellow
    Write-Host "  [7] Run Full Build (Validate all packages)" -ForegroundColor Gray
    Write-Host "  [8] Run All Tests (Validate all test suites)" -ForegroundColor Gray
    Write-Host "  [0] Exit" -ForegroundColor Red
    Write-Host ""
    Write-Host "====================================================================" -ForegroundColor Cyan

    $choice = Read-Host "Enter choice [1-8, 0] (Press Enter for 1)"
    if ($choice -eq "") { $choice = "1" }
} else {
    $choice = $Mode
}

switch ($choice) {
    { $_ -in "1", "all" } {
        Write-Host "`nStarting all DFarm services..." -ForegroundColor Green
        node scripts/run-all.js all
    }
    { $_ -in "2", "web" } {
        Write-Host "`nStarting all DFarm Web Apps and Backend API..." -ForegroundColor Green
        node scripts/run-all.js web
    }
    { $_ -in "3", "android" } {
        Write-Host "`nStarting Customer Android App..." -ForegroundColor Green
        node scripts/run-all.js android
    }
    { $_ -in "4", "customer" } {
        Write-Host "`nStarting Customer App (Web / Metro)..." -ForegroundColor Green
        node scripts/run-all.js customer
    }
    { $_ -in "5", "backend" } {
        Write-Host "`nStarting Backend API Server on Port 4000..." -ForegroundColor Green
        node scripts/run-all.js backend
    }
    { $_ -in "6", "hub" } {
        Write-Host "`nStarting Unified Platform Hub on Port 3000..." -ForegroundColor Green
        node scripts/dev-server.js
    }
    { $_ -in "7", "build" } {
        Write-Host "`nBuilding all monorepo packages..." -ForegroundColor Green
        npm run build
    }
    { $_ -in "8", "test" } {
        Write-Host "`nRunning all tests..." -ForegroundColor Green
        npm test
    }
    { $_ -in "0", "exit" } {
        exit 0
    }
    default {
        Write-Host "Invalid option: $choice" -ForegroundColor Red
        exit 1
    }
}
