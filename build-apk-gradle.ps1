# Script para build APK usando Gradle diretamente
# Configura variaveis de ambiente e executa build

Write-Host "Configurando ambiente..." -ForegroundColor Cyan

# Configurar JAVA_HOME
$env:JAVA_HOME = "C:\Program Files\Android\Android Studio\jbr"
$env:PATH = "$env:JAVA_HOME\bin;$env:PATH"

# Configurar ANDROID_HOME
$env:ANDROID_HOME = "$env:LOCALAPPDATA\Android\Sdk"
$env:PATH = "$env:ANDROID_HOME\platform-tools;$env:ANDROID_HOME\tools;$env:PATH"

Write-Host "Java Home: $env:JAVA_HOME" -ForegroundColor Green
Write-Host "Android Home: $env:ANDROID_HOME" -ForegroundColor Green

# Verificar Java
Write-Host "`nVerificando Java..." -ForegroundColor Cyan
& java -version

# Limpar builds anteriores
Write-Host "`nLimpando builds anteriores..." -ForegroundColor Cyan
Set-Location android
if (Test-Path "app\build\outputs\apk") {
    Remove-Item -Recurse -Force "app\build\outputs\apk"
}

# Limpar cache do Gradle
Write-Host "`nLimpando cache do Gradle..." -ForegroundColor Cyan
& .\gradlew clean

# Executar build release
Write-Host "`nIniciando build do APK (release)..." -ForegroundColor Cyan
Write-Host "Isso pode levar alguns minutos..." -ForegroundColor Yellow
& .\gradlew assembleRelease

# Voltar para pasta raiz
Set-Location ..

# Verificar se o APK foi gerado
Write-Host "`nVerificando APK gerado..." -ForegroundColor Cyan
$apkPath = "android\app\build\outputs\apk\release\app-release.apk"

if (Test-Path $apkPath) {
    Write-Host "APK gerado com sucesso!" -ForegroundColor Green
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
    Write-Host "Caminho completo: $fullPath" -ForegroundColor Green
} else {
    Write-Host "Erro: APK nao foi gerado" -ForegroundColor Red
    Write-Host "Verifique os logs acima para detalhes do erro" -ForegroundColor Yellow
}

Write-Host "`nBuild finalizado!" -ForegroundColor Green
