@echo off
title Gestao de Trabalho
echo ============================================
echo   GESTAO DE TRABALHO - Iniciando...
echo ============================================
echo.

:: Verificar se Docker esta rodando
docker info >nul 2>&1
if errorlevel 1 (
    echo [!] Docker Desktop nao esta rodando.
    echo [!] Inicie o Docker Desktop e tente novamente.
    pause
    exit /b 1
)

:: Subir container WAHA
echo [1/3] Iniciando WAHA (WhatsApp)...
docker compose -f "%~dp0docker-compose.yml" up -d
echo.

:: Iniciar servidor Node.js em background
echo [2/3] Iniciando servidor...
start /b node "%~dp0server.js"
timeout /t 3 >nul

:: Iniciar Cloudflare Quick Tunnel
echo [3/3] Criando tunnel publico...
echo.
echo Aguarde o link aparecer abaixo...
echo ============================================
"%USERPROFILE%\Downloads\cloudflared.exe" tunnel --url http://localhost:3000
