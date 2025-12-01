@echo off
echo.
echo ================================================
echo   Configurando Push Notifications - Life Mobile
echo ================================================
echo.

:: Verificar se EAS CLI está instalado
where eas >nul 2>nul
if %ERRORLEVEL% NEQ 0 (
    echo [1/5] Instalando EAS CLI...
    call npm install -g eas-cli
    echo OK EAS CLI instalado
) else (
    echo OK EAS CLI ja instalado
)

echo.
echo [2/5] Fazendo login no Expo...
echo      Se nao tiver conta, crie em: https://expo.dev
call eas login

echo.
echo [3/5] Configurando projeto EAS...
call eas build:configure

echo.
echo [4/5] Seu projectId foi adicionado ao app.config.js
echo.
echo [5/5] Proximos passos:
echo.
echo 1. Execute: eas build --profile development --platform android
echo    (ou ios se preferir)
echo.
echo 2. Aguarde o build terminar no Expo
echo.
echo 3. Instale o app no dispositivo
echo.
echo 4. Push notifications estarao funcionando!
echo.
echo Para testar push: https://expo.dev/notifications
echo.
pause
