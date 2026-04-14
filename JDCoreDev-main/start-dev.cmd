@echo off
cd /d "%~dp0JDCoreDev-main"
set /p dummy=<.env 2>nul
for /f "usebackq tokens=1,* delims==" %%a in (".env") do set "%%a=%%b"
npm run dev