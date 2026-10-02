@echo off
rem Double-click to start the Driver Drowsiness Detection system.
rem Runs start.ps1 without changing your PowerShell execution policy.
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0start.ps1" %*
if errorlevel 1 pause
