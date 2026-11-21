@echo off
setlocal enabledelayedexpansion
title DFarm Smart Dairy Management Platform

:: Check Node.js
where node >nul 2>nul
if %errorlevel% neq 0 (
    echo [ERROR] Node.js is not installed or not in PATH!
    echo Please install Node.js 22+ from https://nodejs.org/
    pause
    exit /b 1
)

:: If argument provided directly, run it
if not "%~1"=="" (
    if /i "%~1"=="all" goto RUN_ALL
    if /i "%~1"=="web" goto RUN_WEB
    if /i "%~1"=="android" goto RUN_ANDROID
    if /i "%~1"=="customer" goto RUN_CUSTOMER
    if /i "%~1"=="backend" goto RUN_BACKEND
    if /i "%~1"=="hub" goto RUN_HUB
    if /i "%~1"=="build" goto RUN_BUILD
    if /i "%~1"=="test" goto RUN_TEST
)

:MENU
cls
echo ====================================================================
echo               DFARM - SMART DAIRY MANAGEMENT SYSTEM
echo ====================================================================
echo.
echo   [1] Run All (Backend + 3 Web Portals + Customer Mobile/Web) [DEFAULT]
echo   [2] Run All Web Apps & Backend (Dairy Admin, Super Admin, Collection)
echo   [3] Run Customer Android App (Expo Android)
echo   [4] Run Customer App in Web Browser (Expo Web :8081)
echo   [5] Run Backend API Server Only (:4000)
echo   [6] Run Unified Platform Hub (:3000)
echo   [7] Run Full Build (Validate all packages)
echo   [8] Run All Tests (Validate all test suites)
echo   [0] Exit
echo.
echo ====================================================================
set /p choice="Enter choice [1-8, 0] (Press Enter for 1): "

if "%choice%"=="" goto RUN_ALL
if "%choice%"=="1" goto RUN_ALL
if "%choice%"=="2" goto RUN_WEB
if "%choice%"=="3" goto RUN_ANDROID
if "%choice%"=="4" goto RUN_CUSTOMER
if "%choice%"=="5" goto RUN_BACKEND
if "%choice%"=="6" goto RUN_HUB
if "%choice%"=="7" goto RUN_BUILD
if "%choice%"=="8" goto RUN_TEST
if "%choice%"=="0" exit /b 0

echo Invalid selection. Please choose a valid option.
timeout /t 2 >nul
goto MENU

:RUN_ALL
echo.
echo Starting all DFarm services...
node scripts/run-all.js all
goto END

:RUN_WEB
echo.
echo Starting all DFarm Web Apps and Backend API...
node scripts/run-all.js web
goto END

:RUN_ANDROID
echo.
echo Starting Customer Android App (Expo Android)...
node scripts/run-all.js android
goto END

:RUN_CUSTOMER
echo.
echo Starting Customer App (Web / Metro)...
node scripts/run-all.js customer
goto END

:RUN_BACKEND
echo.
echo Starting Backend API Server on Port 4000...
node scripts/run-all.js backend
goto END

:RUN_HUB
echo.
echo Starting Unified Platform Hub on Port 3000...
node scripts/dev-server.js
goto END

:RUN_BUILD
echo.
echo Building all monorepo packages and apps...
npm run build
pause
goto MENU

:RUN_TEST
echo.
echo Running all test suites...
npm test
pause
goto MENU

:END
echo.
echo DFarm services terminated.
pause
