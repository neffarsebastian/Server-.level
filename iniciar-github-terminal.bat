@echo off
chcp 65001 > nul
title SUBIR SERVIDOR A GITHUB - LEVEL GASTROBAR
color 0b
cls
echo =====================================================================
echo       🚀 SUBIR CARPETA SERVIDOR A GITHUB - LEVEL GASTROBAR
echo =====================================================================
echo.
echo  Carpeta actual: %~dp0
echo.
cd /d "%~dp0"

echo [1] Verificando estado de Git local...
git status
echo.

echo =====================================================================
echo  ¿Cómo deseas conectar tu cuenta de GitHub?
echo =====================================================================
echo  [1] Iniciar sesión con GitHub CLI (gh auth login) y crear repositorio automático
echo  [2] Pegar la URL de un repositorio ya creado (https://github.com/...)
echo.
set /p OPCION="Elige una opción (1 o 2): "

if "%OPCION%"=="1" (
    echo.
    echo Iniciando autenticación con GitHub CLI...
    gh auth login
    echo.
    set /p REPO_NAME="Nombre para el nuevo repositorio en GitHub [level-pos-remote]: "
    if "%REPO_NAME%"=="" set REPO_NAME=level-pos-remote
    echo.
    echo Creando y subiendo repositorio %REPO_NAME%...
    gh repo create %REPO_NAME% --public --source=. --remote=origin --push
    echo.
    echo =====================================================================
    echo  🎉 ¡REPOSITORIO CREADO Y SUBIDO CON ÉXITO A GITHUB!
    echo =====================================================================
    pause
    exit /b
)

if "%OPCION%"=="2" (
    echo.
    set /p REPO_URL="Pega la URL de tu repositorio de GitHub: "
    if "%REPO_URL%"=="" (
        echo [ERROR] No ingresaste ninguna URL.
        pause
        exit /b
    )
    git remote remove origin 2>nul
    git remote add origin %REPO_URL%
    git push -u origin main
    echo.
    echo =====================================================================
    echo  🎉 ¡SUBIDA COMPLETADA CON ÉXITO!
    echo =====================================================================
    pause
    exit /b
)

echo Opción no válida.
pause
