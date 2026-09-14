@echo off
chcp 65001 > nul
cls
echo ====================================================================
echo      DESPLIEGUE AUTOMATICO A GITHUB - SERVIDOR CONTROL REMOTO
echo ====================================================================
echo.
echo Este script inicializara el repositorio Git y te ayudara a subir
echo el servidor a tu cuenta de GitHub para conectarlo con Render.com.
echo.

set /p REPO_URL="Pega la URL de tu repositorio GitHub (ej: https://github.com/usuario/mi-pos.git): "

if "%REPO_URL%"=="" (
    echo.
    echo [ERROR] No ingresaste ninguna URL. Operacion cancelada.
    pause
    exit /b
)

echo.
echo [1/4] Inicializando Git local...
git init
git branch -M main

echo.
echo [2/4] Agregando archivos del servidor...
git add .

echo.
echo [3/4] Creando commit...
git commit -m "Deploy Servidor Control Remoto LEVEL Gastrobar"

echo.
echo [4/4] Conectando y subiendo a GitHub...
git remote remove origin > nul 2>&1
git remote add origin %REPO_URL%
git push -u origin main

echo.
echo ====================================================================
echo  ¡LISTO! Repositorio subido a GitHub exitosamente.
echo  Ahora ve a Render.com y selecciona este repositorio para desplegar.
echo ====================================================================
pause
