@echo off
cd /d "%~dp0"
title Contratos Metagal

echo.
echo  Contratos Metagal
echo  Identificando usuario do Windows: %USERNAME%
echo.

where node >nul 2>&1
if errorlevel 1 (
    echo  Node.js nao encontrado. Abrindo o painel sem servidor local.
    echo window.USUARIO_WINDOWS = "%USERNAME%";> usuario-windows.js
    echo window.USUARIO_WINDOWS_DOMINIO = "%USERDOMAIN%";>> usuario-windows.js
    start "" "%~dp0index.html"
    goto :eof
)

echo  Iniciando o painel. Nao feche esta janela.
echo.
node servir.js
