@echo off
cd /d "%~dp0"
where py >nul 2>nul
if %errorlevel% equ 0 (
  py -3 start.py
) else (
  where node >nul 2>nul
  if %errorlevel% equ 0 (
    node serve.mjs
  ) else (
    echo Canopy needs Python 3 or Node.js 18 or later. See README.md.
    pause
  )
)
