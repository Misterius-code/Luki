@echo off
chcp 65001 >nul
title Luki - kopia zapasowa
cd /d "%~dp0"

where node >nul 2>nul
if errorlevel 1 (
	echo.
	echo   BLAD: nie znaleziono Node.js. Zainstaluj ze strony https://nodejs.org
	echo.
	pause
	exit /b 1
)

echo ============================================================
echo    LUKI - kopia zapasowa danych
echo ============================================================
echo.

node backup.js

echo.
echo   Kopie zapisane sa w folderze "backup" w tym projekcie.
echo   Zalecenie: raz w tygodniu skopiuj ten folder na pendrive
echo   albo do chmury (OneDrive / Dysk Google).
echo.
pause
