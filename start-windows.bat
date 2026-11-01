@echo off
rem Interactive Poll - lance le quiz (double-clic).
title Interactive Poll
cd /d "%~dp0"
call npm start
echo.
echo Le serveur s'est arrete.
pause
