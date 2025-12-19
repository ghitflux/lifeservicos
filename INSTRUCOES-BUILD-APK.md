# Instruções para Build do APK - Digital

## Status da Configuração

### ✅ Configurações Validadas

1. **Backend API (life-system)**: Configurado e rodando corretamente
   - Produção: `https://api.lifeservicos.com`
   - Status: ✅ Acessível
   - Endpoints: Validados e funcionando

2. **Variáveis de Ambiente** (`.env` / EAS):
   - Padrão (produção): `https://api.lifeservicos.com`
   - Para desenvolvimento (API local/rede), defina:
     - `EXPO_PUBLIC_API_URL="http://SEU_IP:8000"`
     - `API_URL="http://SEU_IP:8000"`
   - EAS Build: perfis em `eas.json` já apontam para produção

3. **Android SDK**:
   - Localização: `C:\Users\helciovenancio\AppData\Local\Android\Sdk`
   - Status: ✅ Instalado e configurado
   - Arquivo `local.properties` criado

4. **Dependências**:
   - Node.js: v22.16.0 ✅
   - Expo: 54.0.27 ✅
   - React Native: 0.81.5 ✅
   - npm packages: Instalados ✅

### ⚠️ Problema Encontrado

O build do Gradle está falhando com erro de sintaxe de caminho de arquivo:
```
A sintaxe do nome do arquivo, do nome do diretório ou do rótulo do volume está incorreta
```

**Possíveis causas**:
1. Caractere especial "ç" no caminho `D:\apps\lifeservicos`
2. Incompatibilidade entre Windows PowerShell e comandos Node.js no Gradle
3. Configuração do React Native Gradle Plugin

---

## 📱 Opções para Gerar o APK

### Opção 1: Usando Android Studio (RECOMENDADO)

1. **Abrir o projeto no Android Studio**:
   ```
   D:\apps\lifeservicos\life-mobile\android
   ```

2. **Aguardar a sincronização do Gradle** (primeira vez pode demorar)

3. **Build → Build Bundle(s) / APK(s) → Build APK(s)**

4. **Localizar o APK gerado**:
   ```
   D:\apps\lifeservicos\life-mobile\android\app\build\outputs\apk\release\app-release.apk
   ```

5. **Instalar no dispositivo Android**

### Opção 2: Expo EAS Build (Nuvem)

1. **Configurar projeto Expo** (primeira vez):
   ```bash
   cd D:\apps\lifeservicos\life-mobile
   npx eas-cli build:configure
   ```

2. **Fazer login no Expo**:
   ```bash
   npx eas-cli login
   ```

3. **Criar build APK**:
   ```bash
   npx eas-cli build --platform android --profile apk
   ```

4. **Aguardar build na nuvem** (10-15 minutos)

5. **Download do APK** quando terminar

**Observação**: Requer conta Expo (gratuita)

### Opção 3: Mover Projeto para Caminho Sem Caracteres Especiais

O problema pode ser o caractere "ç" em "lifeservicos". Tente:

1. **Copiar projeto para novo local**:
   ```bash
   xcopy /E /I D:\apps\lifeservicos\life-mobile D:\apps\life-services\life-mobile
   ```

2. **Navegar para nova pasta**:
   ```bash
   cd D:\apps\life-services\life-mobile
   ```

3. **Atualizar .env** se necessário

4. **Executar script de build**:
   ```powershell
   powershell -ExecutionPolicy Bypass -File build-apk-final.ps1
   ```

### Opção 4: Build Debug (Mais Simples)

Para testes rápidos, você pode usar uma versão debug (menos otimizada):

1. **Abrir Android Studio**

2. **Selecionar dispositivo ou emulador**

3. **Run → Run 'app'** (Shift + F10)

4. **O APK debug será instalado automaticamente**

5. **Localizar APK debug** (se necessário):
   ```
   D:\apps\lifeservicos\life-mobile\android\app\build\outputs\apk\debug\app-debug.apk
   ```

---

## 📋 Informações Importantes

### Endpoints da API

O app mobile está configurado para se conectar aos seguintes endpoints do backend:

**Autenticação:**
- `POST /auth/login` - Login
- `GET /auth/me` - Usuário atual
- `POST /auth/logout` - Logout
- `POST /mobile/register` - Registro

**Funcionalidades:**
- `GET /mobile/simulations` - Simulações
- `GET /mobile/margins/current` - Margem atual
- `GET /mobile/contracts` - Contratos
- `GET /mobile/documents` - Documentos
- `GET /notifications` - Notificações
- `POST /mobile/simulations/upload` - Upload de documentos

### Testando a Conexão

Antes de instalar o APK no dispositivo, verifique:

1. **Backend está acessível** (API do life-system):
   ```bash
   # Produção
   curl https://api.lifeservicos.com/openapi.json
   #
   # Desenvolvimento (API local/rede)
   curl http://SEU_IP:8000/openapi.json
   ```

2. **(Somente dev local)** Dispositivo está na mesma rede:
   - Celular conectado ao mesmo Wi-Fi que o computador
   - IP configurado em `EXPO_PUBLIC_API_URL` deve ser acessível pelo celular

3. **(Somente dev local)** Testar no navegador do celular:
   - Abrir: `http://SEU_IP:8000/openapi.json`
   - Se não funcionar, o dispositivo não consegue acessar o backend

### Alterando o IP do Backend

Se o IP da rede mudar, edite o arquivo `.env`:

```bash
# Arquivo: D:\apps\lifeservicos\life-mobile\.env

EXPO_PUBLIC_API_URL="http://SEU_IP_NOVO:8000"
API_URL="http://SEU_IP_NOVO:8000"
```

Depois, refaça o build do APK.

---

## 🔧 Troubleshooting

### APK não instala no celular

- Habilitar "Instalação de fontes desconhecidas" nas configurações do Android
- Verificar espaço em disco disponível
- Verificar se o Android é versão 7.0+ (API 24+)

### App não conecta ao backend

1. Verificar a API de produção: `https://api.lifeservicos.com/openapi.json`
2. Se estiver usando API local, verificar no PC: `http://localhost:8000/openapi.json`
3. (Dev local) Verificar se celular está na mesma rede Wi-Fi e testar: `http://SEU_IP:8000/openapi.json`
4. Se não funcionar, obter IP correto do PC: `ipconfig` no cmd e atualizar `.env`

### App fecha ao abrir

- Verificar logs no Android Studio (Logcat)
- Pode ser problema de compatibilidade com versão do Android
- Tentar build debug primeiro

---

## 📝 Resumo de Arquivos Importantes

```
life-mobile/
├── .env                           # Configurações de API (IP do backend)
├── app.config.js                  # Configuração do Expo
├── package.json                   # Dependências do projeto
├── android/
│   ├── local.properties          # Caminho do Android SDK
│   ├── gradle.properties         # Configurações do Gradle
│   └── app/build.gradle          # Build do app Android
├── src/
│   ├── services/api.ts           # Cliente HTTP (conexão com backend)
│   └── hooks/useAuth.ts          # Autenticação
└── build-apk-final.ps1           # Script PowerShell para build
```

---

## ✅ Próximos Passos Recomendados

1. **Usar EAS Build** (Opção 2): `npx eas-cli build --platform android --profile apk`
2. Verificar se o APK foi gerado corretamente e fazer download
3. Transferir APK para o celular e instalar
4. Testar login/fluxos do app
5. Verificar a API: `https://api.lifeservicos.com/openapi.json` (produção)

**Se precisar de ajuda**, os logs do Gradle estão disponíveis em:
```
D:\apps\lifeservicos\life-mobile\android\build\reports\problems\problems-report.html
```

---

**Data de configuração**: 2025-12-09
**Base da API**: produção por padrão (`https://api.lifeservicos.com`), dev via `EXPO_PUBLIC_API_URL`
**Versões testadas**: Node 22.16.0, Expo 54.0.27, React Native 0.81.5
