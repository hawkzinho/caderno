@echo off
title Caderno Digital
cd /d "%~dp0server"
start "" cmd /c "timeout /t 2 >nul && start http://localhost:3001"
npm run dev
