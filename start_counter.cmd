@echo off
setlocal
cd /d "%~dp0"
where py >nul 2>&1
if errorlevel 1 (
    python -m app %*
) else (
    py -3 -m app %*
)
if errorlevel 1 pause
