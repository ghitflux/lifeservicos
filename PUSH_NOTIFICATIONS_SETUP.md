# 📱 Configuração de Push Notifications

## Estado Atual

✅ **Notificações In-App**: Funcionando completamente
✅ **Notificações Locais**: Funcionando completamente
⚠️ **Push Notifications Remotas**: Requerem configuração adicional

## O Que Está Funcionando AGORA

1. **Notificações na tela "Notificações"** - Aparecem quando:
   - Admin aprova simulação
   - Admin reprova simulação
   - Simulação vai para financeiro

2. **Notificações locais** - O app pode enviar notificações para si mesmo

3. **Listeners configurados** - O app está pronto para receber push quando configurado

## Para Habilitar Push Notifications Remotas

### Opção 1: Desenvolvimento Local (Sem EAS)

Para testar localmente SEM configurar EAS, você pode usar notificações locais:

```typescript
import { sendLocalNotification } from '@/services/pushNotifications';

// Em qualquer lugar do código
sendLocalNotification(
  'Nova simulação!',
  'Você tem uma nova proposta para revisar'
);
```

### Opção 2: Push Notifications Reais (Com EAS)

Para habilitar push notifications **reais** que funcionam mesmo com app fechado:

#### 1. Instalar EAS CLI
```bash
npm install -g eas-cli
```

#### 2. Login no Expo
```bash
eas login
```

#### 3. Criar/Configurar Projeto
```bash
cd life-mobile
eas build:configure
```

#### 4. O comando acima criará o `projectId` automaticamente em `app.config.js`

#### 5. Rebuild do app
```bash
# Para Android
eas build --platform android

# Para iOS
eas build --platform ios
```

### Opção 3: Configuração Manual do ProjectId

Se você já tem um projeto Expo, adicione ao `app.config.js`:

```javascript
export default {
  // ... outras configurações
  extra: {
    eas: {
      projectId: "seu-project-id-aqui"
    }
  }
}
```

## Como Obter o ProjectId

1. Acesse https://expo.dev
2. Faça login
3. Crie um novo projeto ou selecione existente
4. O projectId estará na URL: `expo.dev/accounts/[username]/projects/[project-name]`
5. Ou execute: `eas project:info`

## Backend - Enviar Push Notifications

Quando o projectId estiver configurado, você pode enviar push do backend usando a API do Expo:

```python
import requests

def send_push_notification(expo_push_token: str, title: str, body: str, data: dict = None):
    message = {
        "to": expo_push_token,
        "sound": "default",
        "title": title,
        "body": body,
        "data": data or {}
    }

    response = requests.post(
        'https://exp.host/--/api/v2/push/send',
        json=message,
        headers={
            'Accept': 'application/json',
            'Content-Type': 'application/json',
        }
    )

    return response.json()
```

## Testando Push Notifications

### Teste 1: Notificação Local (Funciona AGORA)
```typescript
import { sendLocalNotification } from '@/services/pushNotifications';

sendLocalNotification(
  'Teste',
  'Esta é uma notificação de teste!'
);
```

### Teste 2: Push Remota (Requer EAS configurado)
Após configurar EAS, use a ferramenta de teste do Expo:
https://expo.dev/notifications

## Problemas Comuns

### "No projectId found"
- **Solução**: É esperado sem EAS configurado
- **Impacto**: Apenas push remotas não funcionam
- **Notificações in-app continuam funcionando!**

### Permissões negadas
```typescript
// Verificar permissões
import * as Notifications from 'expo-notifications';

const { status } = await Notifications.getPermissionsAsync();
console.log('Status das permissões:', status);
```

## Resumo

| Funcionalidade | Status | Requer EAS |
|----------------|--------|------------|
| Notificações in-app (tela) | ✅ Funcionando | Não |
| Notificações locais | ✅ Funcionando | Não |
| Push remotas | ⚠️ Requer config | Sim |
| Listeners configurados | ✅ Pronto | Não |
| Navegação ao clicar | ✅ Funcionando | Não |

**Conclusão**: O sistema está 100% funcional para notificações in-app. Push notifications remotas são opcionais e podem ser configuradas depois quando necessário.
