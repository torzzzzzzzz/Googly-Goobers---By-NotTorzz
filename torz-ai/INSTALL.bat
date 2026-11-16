@echo off
setlocal EnableExtensions
title TORZ AI - Installer
cd /d "%~dp0"

echo.
echo   =============================================
echo     TORZ AI  -  private AI writing and study
echo     Installer for Windows 10 / 11
echo   =============================================
echo.

rem ---------------------------------------------------------------- 1. Python
set "PY="
call :trypy 3.12
call :trypy 3.13
call :trypy 3.11
call :trypy 3.14
call :trypy 3.10
if defined PY goto :have_python
python -c "import sys; sys.exit(0 if (3,10) <= sys.version_info[:2] <= (3,14) else 1)" >nul 2>&1
if not errorlevel 1 set "PY=python"
if defined PY goto :have_python

echo [!] Python 3.10 - 3.14 was not found on this computer.
where winget >nul 2>&1
if errorlevel 1 goto :no_python
choice /C YN /M "    Install Python 3.12 now using winget"
if errorlevel 2 goto :no_python
winget install -e --id Python.Python.3.12 --scope user --accept-package-agreements --accept-source-agreements
call :trypy 3.12
if defined PY goto :have_python
echo.
echo     Python was installed. Close this window and run INSTALL.bat again.
pause
exit /b 1

:no_python
echo.
echo     Please install Python 3.12 from https://www.python.org/downloads/
echo     During setup tick "Add python.exe to PATH", then run INSTALL.bat again.
echo.
pause
exit /b 1

:have_python
for /f "delims=" %%v in ('%PY% -c "import sys; print(sys.version.split()[0])"') do set "PYVER=%%v"
echo [1/5] Using Python %PYVER%  (%PY%)

rem ---------------------------------------------------------------- 2. virtual environment
if exist "backend\.venv\Scripts\python.exe" goto :venv_ready
echo [2/5] Creating a private Python environment in backend\.venv ...
%PY% -m venv "backend\.venv"
if errorlevel 1 goto :fail
:venv_ready
set "VPY=%~dp0backend\.venv\Scripts\python.exe"
echo [2/5] Python environment ready.

rem ---------------------------------------------------------------- 3. dependencies
echo [3/5] Installing TORZ AI dependencies (this can take a few minutes the first time) ...
"%VPY%" -m pip install --upgrade pip --disable-pip-version-check -q
"%VPY%" -m pip install -r "backend\requirements.txt" --disable-pip-version-check
if errorlevel 1 goto :fail
echo       Installing the offline OCR engine for scanned PDFs (optional) ...
"%VPY%" -m pip install -r "backend\requirements-ocr.txt" --disable-pip-version-check -q
if errorlevel 1 echo       [!] OCR could not be installed. Everything else works; scanned PDFs will not be readable.

rem ---------------------------------------------------------------- 4. frontend + self-check
if exist "frontend\dist\index.html" goto :frontend_ok
where npm >nul 2>&1
if errorlevel 1 goto :no_frontend
echo [4/5] Building the interface with Node.js ...
pushd frontend
call npm ci
call npm run build
popd
if exist "frontend\dist\index.html" goto :frontend_ok
:no_frontend
echo [!] The prebuilt interface (frontend\dist) is missing and Node.js is not installed.
goto :fail
:frontend_ok
echo [4/5] Interface ready. Checking the installation ...
pushd backend
"%VPY%" -c "import torz.main, torz.launcher; print('      Self-check passed.')"
if errorlevel 1 (
  popd
  goto :fail
)
popd

rem ---------------------------------------------------------------- 5. shortcut + optional local AI
echo [5/5] Creating a "TORZ AI" shortcut on your desktop ...
powershell -NoProfile -ExecutionPolicy Bypass -Command "$s=(New-Object -ComObject WScript.Shell).CreateShortcut([Environment]::GetFolderPath('Desktop')+'\TORZ AI.lnk'); $s.TargetPath='%~dp0START.bat'; $s.WorkingDirectory='%~dp0'; $s.IconLocation='%~dp0assets\torz.ico'; $s.Description='TORZ AI'; $s.WindowStyle=7; $s.Save()" >nul 2>&1

echo.
echo   Local AI (free, private): TORZ AI works best with Ollama.
where ollama >nul 2>&1
if not errorlevel 1 goto :have_ollama
where winget >nul 2>&1
if errorlevel 1 goto :ollama_manual
choice /C YN /M "    Install Ollama now using winget"
if errorlevel 2 goto :ollama_manual
winget install -e --id Ollama.Ollama --accept-package-agreements --accept-source-agreements
set "PATH=%PATH%;%LOCALAPPDATA%\Programs\Ollama"
where ollama >nul 2>&1
if errorlevel 1 goto :ollama_manual
:have_ollama
echo     Ollama is installed.
choice /C YN /M "    Download the recommended model llama3.2:3b now (about 2 GB)"
if errorlevel 2 goto :done
ollama pull llama3.2:3b
goto :done
:ollama_manual
echo     You can install Ollama later from https://ollama.com/download
echo     and download a model from TORZ AI - Settings - AI models.

:done
echo.
echo   =============================================
echo     TORZ AI is installed.
echo     Start it with START.bat or the desktop shortcut.
echo   =============================================
echo.
pause
exit /b 0

:fail
echo.
echo   [X] Installation failed. Scroll up for the error message.
echo       Check your internet connection and run INSTALL.bat again.
echo.
pause
exit /b 1

:trypy
if defined PY goto :eof
py -%1 -c "import sys" >nul 2>&1
if not errorlevel 1 set "PY=py -%1"
goto :eof
