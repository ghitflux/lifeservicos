#!/bin/bash

echo "🚀 Configurando Push Notifications para Life Mobile"
echo "=================================================="
echo ""

# Verificar se está na pasta correta
if [ ! -f "app.config.js" ]; then
    echo "❌ Erro: Execute este script na pasta life-mobile"
    exit 1
fi

# Verificar se EAS CLI está instalado
if ! command -v eas &> /dev/null; then
    echo "📦 Instalando EAS CLI..."
    npm install -g eas-cli
    echo "✅ EAS CLI instalado"
else
    echo "✅ EAS CLI já instalado"
fi

echo ""
echo "🔐 Fazendo login no Expo..."
echo "   (Se não tiver conta, crie em: https://expo.dev)"
eas login

echo ""
echo "🔧 Configurando projeto EAS..."
eas build:configure

echo ""
echo "📱 Criando desenvolvimento build..."
echo "   Escolha: [1] Android ou [2] iOS"
read -p "Plataforma (1/2): " platform

if [ "$platform" == "1" ]; then
    echo "🤖 Configurando build Android..."
    eas build --profile development --platform android
else
    echo "🍎 Configurando build iOS..."
    eas build --profile development --platform ios
fi

echo ""
echo "✅ Configuração concluída!"
echo ""
echo "📝 Próximos passos:"
echo "1. O projectId foi adicionado ao app.config.js automaticamente"
echo "2. Aguarde o build terminar no Expo"
echo "3. Instale o app no dispositivo"
echo "4. Push notifications estarão funcionando!"
echo ""
echo "🔔 Para testar:"
echo "   Use a ferramenta: https://expo.dev/notifications"
