@echo off
chcp 65001 >nul
title Luki - serwer (NIE ZAMYKAJ TEGO OKNA!)
cd /d "%~dp0"

where node >nul 2>nul
if errorlevel 1 (
	echo.
	echo   BLAD: nie znaleziono Node.js na tym komputerze.
	echo.
	echo   Zainstaluj Node.js LTS ze strony https://nodejs.org
	echo   a nastepnie uruchom ten plik ponownie.
	echo.
	pause
	exit /b 1
)

rem --- Czy serwer juz przypadkiem nie dziala? ---
netstat -ano | findstr /R /C:":3000 .*LISTENING" >nul 2>nul
if not errorlevel 1 (
	echo.
	echo   Serwer Luki juz dziala. Otwieram przegladarke...
	echo.
	start "" http://localhost:3000
	exit /b 0
)

echo ============================================================
echo    LUKI - uruchamianie aplikacji
echo ============================================================
echo.
echo   Baza danych: MongoDB Atlas (chmura) - wymaga internetu.
echo   Przegladarka otworzy sie sama za kilka sekund.
echo.
echo   Zeby ZATRZYMAC aplikacje: zamknij to okno
echo   albo nacisnij tutaj Ctrl+C.
echo.
echo ============================================================
echo.

start "" /min cmd /c "timeout /t 5 /nobreak >nul & start http://localhost:3000"

node server.js

echo.
echo   Serwer zostal zatrzymany.
echo.
pause
