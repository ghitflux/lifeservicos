# Script para build APK do App Life Digital
# Configura todas as variaveis de ambiente necessarias

Write-Host "Configurando ambiente..." -ForegroundColor Cyan

# Configurar Node.js
$env:PATH = "C:\Program Files\nodejs;$env:PATH"

# Configurar JAVA_HOME
$env:JAVA_HOME = "C:\Program Files\Android\Android Studio\jbr"
$env:PATH = "$env:JAVA_HOME\bin;$env:PATH"

# Configurar ANDROID_HOME
$env:ANDROID_HOME = "$env:LOCALAPPDATA\Android\Sdk"
$env:PATH = "$env:ANDROID_HOME\platform-tools;$env:ANDROID_HOME\tools;$env:PATH"

Write-Host "Node.js: $(node --version)" -ForegroundColor Green
Write-Host "Java Home: $env:JAVA_HOME" -ForegroundColor Green
Write-Host "Android Home: $env:ANDROID_HOME" -ForegroundColor Green

# Verificar Node e Java
Write-Host "`nVerificando Node e Java..." -ForegroundColor Cyan
Write-Host "Node: $(node --version)" -ForegroundColor Green
& java -version 2>&1 | Select-Object -First 1

# Limpar builds anteriores
Write-Host "`nLimpando builds anteriores..." -ForegroundColor Cyan
Set-Location android
if (Test-Path "app\build\outputs\apk") {
    Remove-Item -Recurse -Force "app\build\outputs\apk"
}

# Limpar cache do Gradle
Write-Host "`nLimpando cache do Gradle..." -ForegroundColor Cyan
& .\gradlew clean --no-daemon

# Executar build release
Write-Host "`nIniciando build do APK (release)..." -ForegroundColor Cyan
Write-Host "Isso pode levar 5-10 minutos..." -ForegroundColor Yellow
& .\gradlew assembleRelease --no-daemon --stacktrace

# Voltar para pasta raiz
Set-Location ..

# Verificar se o APK foi gerado
Write-Host "`nVerificando APK gerado..." -ForegroundColor Cyan
$apkPath = "android\app\build\outputs\apk\release\app-release.apk"

if (Test-Path $apkPath) {
    Write-Host "========================================" -ForegroundColor Green
    Write-Host "APK GERADO COM SUCESSO!" -ForegroundColor Green
    Write-Host "========================================" -ForegroundColor Green
    Write-Host "Localizacao: $apkPath" -ForegroundColor Green

    # Informacoes do arquivo
    $apk = Get-Item $apkPath
    $sizeMB = [math]::Round($apk.Length / 1MB, 2)
    Write-Host "Tamanho: $sizeMB MB" -ForegroundColor Green
    Write-Host "Data: $($apk.LastWriteTime)" -ForegroundColor Green

    # Copiar para pasta raiz para facil acesso
    Copy-Item $apkPath "app-life-digital.apk" -Force
    Write-Host "`nAPK copiado para: app-life-digital.apk" -ForegroundColor Green

    # Exibir caminho completo
    $fullPath = (Get-Item "app-life-digital.apk").FullName
    Write-Host "Caminho completo: $fullPath" -ForegroundColor Cyan

    Write-Host "`n========================================" -ForegroundColor Green
    Write-Host "PROXIMOS PASSOS:" -ForegroundColor Yellow
    Write-Host "1. Transfira o APK para seu celular Android" -ForegroundColor White
    Write-Host "2. Habilite 'Instalar aplicativos de fontes desconhecidas'" -ForegroundColor White
    Write-Host "3. Instale o APK no dispositivo" -ForegroundColor White
    Write-Host "4. O backend (life-system) deve estar acessivel no endereco definido em EXPO_PUBLIC_API_URL" -ForegroundColor White
    Write-Host "========================================" -ForegroundColor Green
} else {
    Write-Host "========================================" -ForegroundColor Red
    Write-Host "ERRO: APK NAO FOI GERADO" -ForegroundColor Red
    Write-Host "========================================" -ForegroundColor Red
    Write-Host "Verifique os logs acima para detalhes do erro" -ForegroundColor Yellow
    Write-Host "O problema pode ser:" -ForegroundColor Yellow
    Write-Host "- Erro de compilacao no codigo" -ForegroundColor White
    Write-Host "- Problema com dependencias do Node" -ForegroundColor White
    Write-Host "- Configuracao do Android SDK" -ForegroundColor White
}

Write-Host "`nBuild finalizado!" -ForegroundColor Green
