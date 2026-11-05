@echo off
title Gloves Packing Execution System (GPES)
cd /d "%~dp0"
echo ========================================================
echo Starting Gloves Packing Execution System...
echo ========================================================
node src/server.js
pause
