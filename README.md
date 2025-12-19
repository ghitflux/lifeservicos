# App Life Digital - Mobile App

Aplicativo mobile (Android/iOS) para simulação de crédito. Este app consome exclusivamente a API do `life-system` (não existe backend/banco “mobile” neste projeto).

## Pré-requisitos
- Node.js 18+
- Android Studio (Android) e/ou Xcode (iOS, macOS)
- API do `life-system` (produção: `https://api.lifeservicos.com`)

## Rodar o app
```bash
npm install

# Por padrão o app usa a API de produção:
# https://api.lifeservicos.com
#
# Para desenvolvimento (API local/rede), sobrescreva:
export EXPO_PUBLIC_API_URL="http://SEU_IP:8000"

npm start
```

## Build APK (EAS)
```bash
cd life-mobile
npx eas-cli login
npx eas-cli build --platform android --profile apk
```

## Endpoints consumidos (life-system)
- Auth: `POST /auth/login`, `GET /auth/me`, `POST /auth/logout`, `POST /auth/change-password`
- Cadastro: `POST /mobile/register`
- Simulações: `GET /mobile/simulations`, `POST /mobile/simulations/upload`
- Margem: `GET /mobile/margins/current`
- Documentos: `GET /mobile/documents`
- Contratos: `GET /mobile/contracts`
- Notificações: `GET /mobile/notifications`, `PUT /mobile/notifications/{id}/read`
- Push token: `POST /mobile/push-token`

## Estrutura
```
life-mobile/
├── app/                # Expo Router (telas)
├── src/                # components/hooks/services/utils
├── assets/
└── app.config.js       # permissões/plugins Expo
```
