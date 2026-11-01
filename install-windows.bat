@echo off
rem Interactive Poll - installation sous Windows (double-clic).
rem Lance install-windows.ps1 sans etre bloque par la strategie d'execution PowerShell.
cd /d "%~dp0"
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0install-windows.ps1"
if errorlevel 1 pause
