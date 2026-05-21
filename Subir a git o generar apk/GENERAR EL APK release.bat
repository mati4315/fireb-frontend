@echo off
setlocal
cd /d "%~dp0"
set "LOG_FILE=%~dp0log.txt"

echo ==========================================
echo   Generando APK Release...
echo ==========================================
echo.

if not exist "android\gradlew.bat" (
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

pushd android
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
echo %~dp0android\app\build\outputs\apk\release\app-release.apk
echo [%date% %time%] OK: APK release generado correctamente.>> "%LOG_FILE%"
echo.
pause
