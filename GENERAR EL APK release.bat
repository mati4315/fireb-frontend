@echo off
setlocal
rem ------------------------------------------------------------
rem   Generar APK Release (Capacitor + Android)
rem ------------------------------------------------------------
rem   1) Configura el JDK 21 instalado para la compilacion
rem   2) Compila la web y sincroniza con Capacitor
rem   3) Ejecuta Gradle para crear el bundle/apk de release
rem   4) Guarda un log con timestamp y elimina logs viejos (>15 días)
rem ------------------------------------------------------------

set "JAVA_HOME=C:\Program Files\Microsoft\jdk-21.0.11.10-hotspot"


rem Cambiamos al directorio donde está el script
cd /d "%~dp0"

rem Generamos un timestamp para el archivo de log
for /f %%i in ('powershell -NoProfile -Command "Get-Date -Format yyyyMMdd_HHmmss"') do set "STAMP=%%i"
set "LOG_FILE=%~dp0log_%STAMP%.txt"

rem Eliminamos logs antiguos (más de 15 días)
forfiles /p "%~dp0" /m log_*.txt /d -15 /c "cmd /c del /q @path" >nul 2>&1

echo ==========================================
echo   Generando APK Release...
echo ==========================================
echo.
echo Log: %LOG_FILE%
echo.

rem Verificamos que exista gradlew dentro del proyecto Android (ubicado en Frontend\android)
if not exist "android\gradlew.bat" (
    echo ERROR: No se encontro "android\\gradlew.bat"
    echo [%date% %time%] ERROR: No se encontro android\\gradlew.bat.>> "%LOG_FILE%"
    pause
    exit /b 1
)

rem Compilamos la web y sincronizamos con Capacitor
call npm run android:build >> "%LOG_FILE%" 2>&1
if errorlevel 1 (
    echo.
    echo ERROR: Fallo la compilacion web/sync de Capacitor.
    echo [%date% %time%] ERROR: Fallo npm run android:build.>> "%LOG_FILE%"
    pause
    exit /b 1
)

rem Entramos al proyecto Android y generamos el APK de release
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
