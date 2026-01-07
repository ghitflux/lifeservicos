# 🚀 Guia de Configuração - Life Mobile App

Este guia ajuda você a configurar corretamente o app mobile para se conectar ao backend do **life-system**.

## 📋 Pré-requisitos

- ✅ Backend **life-system** rodando na porta **8000**
- ✅ Node.js instalado
- ✅ Expo CLI instalado (`npm install -g expo-cli`)
- ✅ Expo Go instalado no celular (Android/iOS)
- ✅ Celular e computador na **mesma rede Wi-Fi**

---

## 🔧 Configuração Rápida (Automática)

### Opção 1: Detecção Automática de IP

Execute o comando abaixo para detectar automaticamente o IP da sua máquina:

```bash
npm run config:ip
```

O script irá:
1. 🔍 Detectar todos os IPs locais da máquina
2. ✨ Selecionar automaticamente o IP Wi-Fi (prioridade)
3. 📝 Perguntar se deseja atualizar o arquivo `.env`
4. ✅ Configurar `EXPO_PUBLIC_API_URL` automaticamente

### Opção 2: Iniciar com Configuração Automática

Execute o comando que detecta o IP e já inicia o Expo:

```bash
npm run dev
```

Isso irá executar `config:ip` e depois `expo start` automaticamente.

---

## ⚙️ Configuração Manual

Se preferir configurar manualmente, siga os passos:

### 1️⃣ Descobrir seu IP Local

**Windows:**
```bash
ipconfig
```
Procure por "Adaptador de Rede sem Fio Wi-Fi" → "Endereço IPv4"
Exemplo: `192.168.3.8`

**macOS/Linux:**
```bash
ifconfig
```
Procure pela interface Wi-Fi (geralmente `en0` no Mac ou `wlan0` no Linux)
Exemplo: `192.168.3.8`

### 2️⃣ Editar arquivo `.env`

Abra o arquivo `.env` na raiz do projeto e configure:

```bash
# API - Backend do life-system (porta 8000)
EXPO_PUBLIC_API_URL="http://SEU_IP_AQUI:8000"
API_URL="http://SEU_IP_AQUI:8000"
```

**Exemplo:**
```bash
EXPO_PUBLIC_API_URL="http://192.168.3.8:8000"
API_URL="http://192.168.3.8:8000"
```

### 3️⃣ Iniciar o Expo

```bash
npm start
```

---

## 📱 Testando a Conexão

### 1. Verificar se o Backend está rodando

Abra o navegador e acesse:
```
http://SEU_IP:8000/docs
```

Exemplo: `http://192.168.3.8:8000/docs`

Se a documentação da API abrir, o backend está funcionando! ✅

### 2. Verificar logs do app

Após escanear o QR code no Expo Go, verifique os logs no terminal:

```
[API] Base URL: http://192.168.3.8:8000 (Platform: android)
```

Se aparecer essa mensagem, a configuração está correta! ✅

### 3. Testar login

Tente fazer login no app. Se conseguir, tudo está funcionando! 🎉

---

## ❌ Problemas Comuns

### Erro: "Network request failed"

**Causas possíveis:**
- ❌ Backend não está rodando
- ❌ IP configurado está incorreto
- ❌ Celular e computador em redes Wi-Fi diferentes
- ❌ Firewall bloqueando a porta 8000

**Soluções:**
1. Verifique se o backend está rodando: `http://SEU_IP:8000/docs`
2. Execute `npm run config:ip` novamente
3. Certifique-se de que ambos estão na mesma rede Wi-Fi
4. Desabilite temporariamente o firewall para testar

### Erro: "Unable to resolve host"

**Causa:**
- ❌ Variável de ambiente não foi carregada

**Solução:**
1. Pare o Expo (`Ctrl+C`)
2. Execute `npm run dev` novamente
3. Limpe o cache: `npx expo start -c`

### IP mudou (reconectou Wi-Fi)

**Solução:**
1. Execute `npm run config:ip`
2. Confirme a atualização do `.env`
3. Reinicie o Expo

---

## 🎯 Fluxo Completo de Desenvolvimento

```bash
# 1. Garantir que o backend está rodando
cd ../life-system
python manage.py runserver 0.0.0.0:8000

# 2. Em outro terminal, configurar e iniciar o mobile
cd ../life-mobile
npm run dev

# 3. Escanear QR code no Expo Go

# 4. Testar login e funcionalidades
```

---

## 🔍 Verificação de Rede

### Testar conectividade da rede

**Do celular para o computador:**
1. Abra o navegador do celular
2. Acesse: `http://SEU_IP:8000/docs`
3. Se abrir a documentação da API, a rede está OK! ✅

**Listar todos os IPs da máquina:**
```bash
node scripts/get-local-ip.js
```

---

## 📝 Variáveis de Ambiente

O app suporta as seguintes variáveis no arquivo `.env`:

| Variável | Descrição | Exemplo |
|----------|-----------|---------|
| `EXPO_PUBLIC_API_URL` | URL da API (prioridade) | `http://192.168.3.8:8000` |
| `API_URL` | URL da API (fallback) | `http://192.168.3.8:8000` |
| `DATABASE_URL` | Conexão PostgreSQL | `postgresql://user:pass@localhost:5432/db` |

---

## 🚀 Comandos Úteis

| Comando | Descrição |
|---------|-----------|
| `npm run config:ip` | Detecta e configura IP automaticamente |
| `npm run dev` | Configura IP + inicia Expo |
| `npm start` | Inicia Expo normalmente |
| `npx expo start -c` | Inicia Expo limpando cache |
| `npx expo doctor` | Verifica problemas no projeto |

---

## 📚 Recursos Adicionais

- [Documentação Expo](https://docs.expo.dev/)
- [Expo Go App](https://expo.dev/client)
- [Troubleshooting Expo](https://docs.expo.dev/troubleshooting/overview/)

---

## 💡 Dicas

1. **Sempre use a mesma rede Wi-Fi** no celular e no computador
2. **Configure IP estático no roteador** para evitar mudanças frequentes
3. **Use `npm run dev`** para garantir IP atualizado sempre
4. **Mantenha o backend rodando** com `0.0.0.0:8000` para aceitar conexões externas
5. **Verifique o firewall** se não conseguir conectar

---

🎉 **Pronto!** Agora você está configurado para desenvolver no app mobile conectado ao backend local.
