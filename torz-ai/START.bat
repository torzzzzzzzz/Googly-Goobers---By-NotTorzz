@echo off
setlocal EnableExtensions
title TORZ AI
cd /d "%~dp0"
if exist "backend\.venv\Scripts\python.exe" goto :installed
echo TORZ AI is not installed yet. Run INSTALL.bat first.
pause
exit /b 1

:installed
rem Start Ollama if it is installed but not running (it normally starts with Windows).
where ollama >nul 2>&1
if errorlevel 1 goto :launch
curl -s -o nul --max-time 2 http://127.0.0.1:11434/api/version >nul 2>&1
if not errorlevel 1 goto :launch
start "" /min ollama serve

:launch
pushd backend
".venv\Scripts\python.exe" -m torz.launcher start %*
set "RC=%ERRORLEVEL%"
popd
if "%RC%"=="0" exit /b 0
echo.
echo TORZ AI could not start. See the message above, or the log in:
echo   %LOCALAPPDATA%\TORZ AI\logs\server-output.log
pause
exit /b %RC%
