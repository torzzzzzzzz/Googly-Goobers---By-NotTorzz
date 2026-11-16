@echo off
setlocal EnableExtensions
title TORZ AI - Stop
cd /d "%~dp0"
if exist "backend\.venv\Scripts\python.exe" goto :installed
echo TORZ AI is not installed.
exit /b 0
:installed
pushd backend
".venv\Scripts\python.exe" -m torz.launcher stop
popd
timeout /t 2 >nul
