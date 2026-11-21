@echo off
chcp 65001 >nul
cd /d "%~dp0"
title Ate sem jeito - link publico
set "CF=cloudflared"
where cloudflared >nul 2>&1 || set "CF=%ProgramFiles(x86)%\cloudflared\cloudflared.exe"
echo.
echo   Subindo o caderno para a internet...
echo   (so os arquivos do caderno saem; backups e originais ficam no PC)
echo.
start "Ate sem jeito - servidor publico" /min node server.js --publico
timeout /t 2 /nobreak >nul
echo   Em alguns segundos aparece um quadro com o link (termina em .trycloudflare.com).
echo   Mande esse link pros seus amigos. O link muda cada vez que voce publica.
echo   Feche esta janela para tirar o caderno do ar.
echo.
"%CF%" tunnel --no-autoupdate --url http://127.0.0.1:8124
taskkill /fi "WINDOWTITLE eq Ate sem jeito - servidor publico*" >nul 2>&1
pause