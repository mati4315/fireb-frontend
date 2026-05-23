@echo off
setlocal
cd /d "%~dp0"
for /f %%i in ('powershell -NoProfile -Command "Get-Date -Format yyyyMMdd_HHmmss"') do set "STAMP=%%i"
set "LOG_FILE=%~dp0log_%STAMP%.txt"
forfiles /p "%~dp0" /m log_*.txt /d -15 /c "cmd /c del /q @path" >nul 2>&1

echo ==========================================
echo   Generando APK Release...
echo ==========================================
echo.
echo Log: %LOG_FILE%
echo.

if not exist "..\android\gradlew.bat" (
  echo ERROR: No se encontro "android\gradlew.bat"
  echo [%date% %time%] ERROR: No se encontro android\gradlew.bat.>> "%LOG_FILE%"
  pause
  exit /b 1
)

call npm run android:build >> "%LOG_FILE%" 2>&1
if errorlevel 1 (
  echo.
  echo ERROR: Fallo la compilacion web/sync de Capacitor.
  echo [%date% %time%] ERROR: Fallo npm run android:build.>> "%LOG_FILE%"
  pause
  exit /b 1
)

pushd ..\android
call .\gradlew.bat assembleRelease >> "%LOG_FILE%" 2>&1
if errorlevel 1 (
  echo.
  echo ERROR: Fallo la generacion del APK release.
  echo [%date% %time%] ERROR: Fallo gradlew assembleRelease.>> "%LOG_FILE%"
  popd
  pause
  exit /b 1
)
popd

echo.
echo APK generado en:
echo %~dp0..\android\app\build\outputs\apk\release\app-release.apk
echo [%date% %time%] OK: APK release generado correctamente.>> "%LOG_FILE%"
echo.
pause
