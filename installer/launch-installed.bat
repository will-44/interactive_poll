@echo off
rem Interactive Poll - lanceur de la version installee (Node.js embarque, rien d'autre a installer).
title Interactive Poll
cd /d "%~dp0"
"%~dp0node\node.exe" server\index.js
echo.
echo Le serveur s'est arrete.
pause
