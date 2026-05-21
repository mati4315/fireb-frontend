@echo off
setlocal
cd /d "%~dp0"
set "REPO_DIR=%~dp0.."
set "EXIT_CODE=0"
set "LOG_FILE=%~dp0log.txt"

echo ==========================================
echo   Subir cambios a Git (sin dist)
echo ==========================================
echo.
echo Repo: %REPO_DIR%
echo.

if not exist "%REPO_DIR%\.git" (
  echo ERROR: No se encontro la carpeta .git en "%REPO_DIR%".
  echo [%date% %time%] ERROR: .git no encontrado en "%REPO_DIR%".>> "%LOG_FILE%"
  set "EXIT_CODE=1"
  goto :END
)

cd /d "%REPO_DIR%"

where git >nul 2>&1
if errorlevel 1 (
  echo ERROR: Git no esta disponible en PATH.
  echo [%date% %time%] ERROR: Git no esta disponible en PATH.>> "%LOG_FILE%"
  set "EXIT_CODE=1"
  goto :END
)

set /p COMMIT_MSG=Escribe el mensaje del commit: 
if "%COMMIT_MSG%"=="" (
  echo ERROR: El mensaje no puede estar vacio.
  echo [%date% %time%] ERROR: Mensaje de commit vacio.>> "%LOG_FILE%"
  set "EXIT_CODE=1"
  goto :END
)

echo.
echo Agregando cambios (src + archivos raiz utiles)...
git -c safe.directory="%REPO_DIR%" add src package.json package-lock.json capacitor.config.ts >> "%LOG_FILE%" 2>&1
if errorlevel 1 (
  echo ERROR: Fallo git add.
  echo [%date% %time%] ERROR: Fallo git add.>> "%LOG_FILE%"
  set "EXIT_CODE=1"
  goto :END
)

echo.
echo Creando commit...
git -c safe.directory="%REPO_DIR%" commit -m "%COMMIT_MSG%" >> "%LOG_FILE%" 2>&1
if errorlevel 1 (
  echo ERROR: No se pudo crear commit (quizas no habia cambios).
  echo [%date% %time%] ERROR: Fallo git commit.>> "%LOG_FILE%"
  set "EXIT_CODE=1"
  goto :END
)

echo.
echo Subiendo a origin/main...
git -c safe.directory="%REPO_DIR%" push origin main >> "%LOG_FILE%" 2>&1
if errorlevel 1 (
  echo ERROR: Fallo git push.
  echo [%date% %time%] ERROR: Fallo git push.>> "%LOG_FILE%"
  set "EXIT_CODE=1"
  goto :END
)

echo.
echo Listo: cambios subidos a origin/main

:END
echo.
if "%EXIT_CODE%"=="0" (
  echo Finalizo correctamente.
  echo [%date% %time%] OK: SUBIR CAMBIOS A GIT finalizo correctamente.>> "%LOG_FILE%"
) else (
  echo Finalizo con errores. Revisa los mensajes de arriba.
  echo [%date% %time%] ERROR: SUBIR CAMBIOS A GIT finalizo con errores.>> "%LOG_FILE%"
)
pause
exit /b %EXIT_CODE%
