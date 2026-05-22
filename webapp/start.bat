@echo off
echo Starting WhatsApp Web Automator...
echo.
cd /d "%~dp0"
if not exist node_modules (
    echo Installing dependencies for the first time. This may take a moment...
    npm install
)
start http://localhost:3000
npm start
pause
