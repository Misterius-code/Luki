@echo off
chcp 65001 >nul
title Luki - import zamowien z CSV
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
echo    LUKI - import zamowien z pliku CSV
echo ============================================================
echo.
echo   Ten program:
echo     1. wezmie najnowszy plik .csv z tego folderu,
echo     2. poprawi bledy eksportu z Arkuszy Google,
echo     3. dopisze zamowienia do bazy (istniejace pominie).
echo.
echo   UWAGA: przed importem zalecana kopia zapasowa
echo   (skrot "Luki - kopia zapasowa" na pulpicie).
echo.
pause

node przygotuj-csv.js
if errorlevel 1 (
	echo.
	echo   Nie udalo sie przygotowac pliku.
	pause
	exit /b 1
)

echo.
echo Importuje do bazy...
echo.

node import-csv.js import-gotowy.csv

echo.
echo Gotowe. Otworz aplikacje i sprawdz zakladke "Zamowienia".
echo.
pause
