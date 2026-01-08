# Deploy Life Mobile v1.0.2 - Checklist

## 📋 Resumo das Mudanças

### Versão 1.0.2
- ✅ Nova tela de login com design moderno
- ✅ Logo Life Digital centralizado
- ✅ Background personalizado sem overlay
- ✅ Histórico exibindo valor líquido liberado (net_amount)
- ✅ Tagline destacada em cyan
- ✅ Botão "Criar Conta" transparente com borda

## 🔧 Preparação para Build de Produção

### 1. Atualizar Versão no app.json

```bash
cd D:\apps\lifeservicos\life-mobile
```

Editar `app.json`:
```json
{
  "expo": {
    "version": "1.0.2",
    "android": {
      "versionCode": 3  // Incrementar de 2 para 3
    },
    "ios": {
      "buildNumber": "1.0.2"
    }
  }
}
```

### 2. Configurar API para Produção

Editar `.env` para apontar para API real:

```bash
# API - Produção
EXPO_PUBLIC_API_URL="https://api.lifeservicos.com"
API_URL="https://api.lifeservicos.com"
```

**IMPORTANTE**: Certifique-se de que a API de produção está rodando e acessível!

### 3. Limpar Cache e Reinstalar Dependências

```bash
# Limpar cache do Expo
npx expo start --clear

# Ou limpar tudo
rm -rf node_modules
rm -rf .expo
npm cache clean --force
pnpm install
```

### 4. Testar em Desenvolvimento

```bash
# Testar com API de produção antes do build
pnpm start

# Testar especificamente no Android
pnpm android
```

Validar:
- ✅ Login funciona com API de produção
- ✅ Histórico carrega corretamente
- ✅ Imagens (logo + background) aparecem
- ✅ Navegação entre telas funciona
- ✅ Dados são salvos no SecureStore

### 5. Build do APK/AAB para Produção

#### Opção A: Build Local (via EAS)

```bash
# Instalar EAS CLI (se ainda não tem)
npm install -g eas-cli

# Login no Expo
eas login

# Configurar projeto (primeira vez)
eas build:configure

# Build do AAB para Play Store
eas build --platform android --profile production

# Build do APK para teste
eas build --platform android --profile preview
```

#### Opção B: Build Manual (sem EAS)

```bash
# Gerar bundle JavaScript
npx expo export

# Build com Gradle
cd android
./gradlew assembleRelease  # Para APK
./gradlew bundleRelease    # Para AAB
```

### 6. Localização dos Arquivos

Após o build:

**AAB (Play Store)**:
```
android/app/build/outputs/bundle/release/app-release.aab
```

**APK (Instalação direta)**:
```
android/app/build/outputs/apk/release/app-release.apk
```

### 7. Assinatura do App (Keystore)

Certifique-se de que o arquivo `release.keystore` está configurado:

```bash
# Localização do keystore
android/app/release.keystore

# Verificar configuração no gradle
cat android/app/build.gradle | grep -A10 "signingConfigs"
```

**IMPORTANTE**: NUNCA commitar o keystore no Git!

### 8. Upload para Play Store

1. Acesse: https://play.google.com/console
2. Selecione o app "Life Digital" ou "Life Calling"
3. Vá em **Produção** → **Criar nova versão**
4. Upload do arquivo `.aab`:
   - Tamanho máximo: 150MB
   - Formato: Android App Bundle (.aab)
5. Preencha:
   - Notas da versão (em português)
   - Changelog (o que mudou na v1.0.2)
6. Enviar para revisão

**Notas da versão sugeridas**:
```
Versão 1.0.2 - Melhorias Visuais

✨ Nova tela de login com design moderno
📊 Histórico agora exibe o valor líquido liberado
🎨 Interface mais intuitiva e profissional
🐛 Correções de bugs e melhorias de performance
```

### 9. Testar o APK antes de Publicar

```bash
# Instalar o APK em um dispositivo físico
adb install android/app/build/outputs/apk/release/app-release.apk

# Ou via drag-and-drop no emulador
```

Fazer testes completos:
- Login com usuários reais
- Navegação entre telas
- Simulações
- Histórico
- Logout

### 10. Rollback (se necessário)

Se houver problemas após o deploy:

```bash
# Reverter para versão anterior no Git
git checkout d37f2c1  # commit anterior

# Rebuild com versão estável
eas build --platform android --profile production
```

## 📝 Checklist Pré-Deploy

- [ ] Versão atualizada em `app.json` (1.0.2, versionCode: 3)
- [ ] `.env` apontando para API de produção
- [ ] Cache limpo e dependências reinstaladas
- [ ] Testes funcionais completos
- [ ] Imagens (login.png, life-logo.png) verificadas
- [ ] API de produção rodando e acessível
- [ ] Keystore configurado e seguro
- [ ] Build AAB gerado com sucesso
- [ ] Notas da versão escritas
- [ ] Testes no APK em dispositivo real
- [ ] Backup da versão anterior disponível

## 🚀 Comandos Rápidos

```bash
# 1. Atualizar versão
# Editar app.json manualmente

# 2. Configurar produção
# Editar .env manualmente

# 3. Limpar e rebuild
pnpm install && npx expo start --clear

# 4. Build AAB
eas build --platform android --profile production

# 5. Aguardar build (5-10 minutos)
# Download do AAB quando pronto

# 6. Upload para Play Store
# Via console web: https://play.google.com/console
```

## 📚 Referências

- [Expo EAS Build](https://docs.expo.dev/build/introduction/)
- [Android App Bundle](https://developer.android.com/guide/app-bundle)
- [Play Console](https://play.google.com/console)
- [Expo Publishing](https://docs.expo.dev/distribution/introduction/)

## 🔐 Segurança

**NUNCA commitar**:
- `release.keystore`
- Senhas do keystore
- Credenciais de produção
- Tokens de API

**Manter seguro**:
- Backup do keystore em local seguro
- Senhas em gerenciador de senhas
- Acesso ao Play Console restrito

## 📞 Suporte

Em caso de problemas:
1. Verificar logs: `npx expo start --clear`
2. Checar console do Expo: https://expo.dev
3. Verificar status da API: https://api.lifeservicos.com/docs
4. Revisar este documento
5. Contactar equipe de desenvolvimento

---

**Última atualização**: 2026-01-08
**Versão anterior**: 1.0.1
**Nova versão**: 1.0.2
**Branch**: life-mobile
**Commit**: c082ccf
