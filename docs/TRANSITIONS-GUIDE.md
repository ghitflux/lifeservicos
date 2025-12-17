# 📱 Guia de Transições Suaves

## Problema Resolvido

As transições entre telas apresentavam:
- ✗ Flash branco ao iniciar o app
- ✗ Piscadas de cores durante navegação
- ✗ Transições abruptas sem animação
- ✗ Faixas brancas em bordas durante transição

## Soluções Implementadas

### 1. Splash Screen Escura (app.config.js)
```javascript
splash: {
  backgroundColor: "#121212" // Alinhado com tema dark
}
```
**Efeito**: Sem flash branco ao iniciar

### 2. Sincronização de Splash Screen (useSplashScreen hook)
```typescript
useSplashScreen(); // Aguarda tema carregar, depois oculta splash
```
**Efeito**: Tema carrega antes de mostrar conteúdo

### 3. Animações Suaves de Transição (app/_layout.tsx)
```typescript
transitionSpec: {
  open: { animation: 'timing', config: { duration: 400 } },
  close: { animation: 'timing', config: { duration: 400 } }
}
```
**Efeito**: Transições de 400ms com efeito fade suave

### 4. SafeScreenContainer - Wrapper para Cores Consistentes
```typescript
import { SafeScreenContainer } from '@/components';

export default function Screen() {
  return (
    <SafeScreenContainer>
      <ScrollView>
        {/* Seu conteúdo aqui */}
      </ScrollView>
    </SafeScreenContainer>
  );
}
```
**Efeito**: SafeAreaView + backgroundColor sincronizados

---

## Como Usar

### ✅ Padrão Recomendado para Todas as Screens

```typescript
import { SafeScreenContainer } from '@/components';
import { ScrollView } from 'react-native';
import { Header, MobileNav } from '@/components';

export default function MyScreen() {
  return (
    <SafeScreenContainer safeArea edges={['top']}>
      <Header title="Minha Tela" />

      <ScrollView>
        {/* Conteúdo da tela */}
      </ScrollView>

      <MobileNav />
    </SafeScreenContainer>
  );
}
```

### Opções do SafeScreenContainer

```typescript
interface SafeScreenContainerProps {
  children: React.ReactNode;
  safeArea?: boolean;        // Default: true
  edges?: Array<'top' | 'bottom' | 'left' | 'right'>;
}
```

**Exemplos:**

```typescript
// Com SafeArea (padrão)
<SafeScreenContainer safeArea edges={['top']}>
  {children}
</SafeScreenContainer>

// Sem SafeArea
<SafeScreenContainer safeArea={false}>
  {children}
</SafeScreenContainer>

// Apenas topo
<SafeScreenContainer edges={['top']}>
  {children}
</SafeScreenContainer>

// Topo e bottom
<SafeScreenContainer edges={['top', 'bottom']}>
  {children}
</SafeScreenContainer>
```

---

## O Que Mudou Nos Componentes

### Antes (Problemático)
```typescript
<SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
  <Header />
  <ScrollView>
    {/* conteúdo */}
  </ScrollView>
  <MobileNav />
</SafeAreaView>
```
**Problemas:**
- ScrollView não tem backgroundColor → faixas brancas
- Colors mudam com delay → piscadas visíveis
- Sem animações de transição

### Depois (Otimizado)
```typescript
<SafeScreenContainer>
  <Header />
  <ScrollView>
    {/* conteúdo */}
  </ScrollView>
  <MobileNav />
</SafeScreenContainer>
```
**Melhorias:**
- Cores sincronizadas automaticamente
- SafeAreaView + View compartilham backgroundColor
- Transições suaves de 400ms
- Nenhuma piscada ou faixa branca

---

## Detalhes Técnicos

### 1. Ordem de Carregamento (antes vs depois)

**Antes:**
```
1. App inicia com splash branca
2. useState('dark') renderiza dark
3. SecureStore carrega async (100-200ms)
4. Estado muda para light/dark
5. Re-render com novo tema
6. RESULTADO: Flash visual
```

**Depois:**
```
1. App inicia com splash escura (#121212)
2. ThemeProvider carrega tema async
3. useSplashScreen() aguarda loading === false
4. Splash oculta automaticamente quando pronto
5. App renderiza com tema correto
6. RESULTADO: Sem piscadas
```

### 2. Stack Navigation Animations

```typescript
cardStyle: {
  backgroundColor: theme === 'dark' ? '#121212' : '#FFFFFF'
}
// Sincroniza o fundo do card com o tema

cardStyleInterpolator: ({ current }) => ({
  cardStyle: { opacity: current.progress }
})
// Fade suave durante transição
```

### 3. SafeAreaView vs ScrollView Background

**Problema original:**
- SafeAreaView define backgroundColor
- ScrollView renderiza sem backgroundColor
- Durante scroll, pode haver gaps de cores

**Solução:**
- SafeScreenContainer gerencia ambos
- Cores sempre sincronizadas
- ScrollView herda do parent

---

## Migração de Screens Existentes

Para atualizar uma screen antiga, basta:

1. **Remover:**
```typescript
// ❌ REMOVER ISSO
<SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
```

2. **Adicionar:**
```typescript
// ✅ ADICIONAR ISSO
<SafeScreenContainer>
```

3. **Remover estilos redundantes:**
```typescript
// ❌ REMOVER ISSO
const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background, // Removido!
  }
});
```

---

## Checklist de Transições Suaves

Para cada screen, verificar:

- [ ] Usa `SafeScreenContainer` em vez de `SafeAreaView`
- [ ] `ScrollView` está dentro do container
- [ ] `MobileNav` está no final (antes de fechar)
- [ ] Header está configurado corretamente
- [ ] Sem estilos conflitantes de backgroundColor
- [ ] Testado em light e dark mode
- [ ] Testado ao navegar entre screens
- [ ] Sem piscadas ou faixas brancas

---

## Performance

As alterações melhoram a performance:
- ✅ Menos re-renders (colors sincronizadas)
- ✅ Menos piscadas (backgroundColor no lugar certo)
- ✅ Animações suaves (400ms bem definidos)
- ✅ Splash screen rápido (pronta antes de renderizar)

---

## Troubleshooting

### Problema: Ainda vejo faixa branca
**Solução:**
1. Verificar se usa `SafeScreenContainer`
2. Verificar se `SafeAreaView` foi removido
3. Verificar se não há estilos conflitantes
4. Limpar cache: `npx expo start -c`

### Problema: Transição muito rápida/lenta
**Solução:**
Ajustar duração em `app/_layout.tsx`:
```typescript
transitionSpec: {
  open: { animation: 'timing', config: { duration: 300 } } // 300ms
}
```

### Problema: Tema não sincroniza
**Solução:**
1. Verificar se ThemeProvider está no topo
2. Verificar se hook useTheme() está sendo usado
3. Verificar console para erros de contexto

---

## Referencias

- `app/_layout.tsx` - Configuração de animações
- `app.config.js` - Splash screen colors
- `src/hooks/useSplashScreen.ts` - Sincronização de splash
- `src/components/SafeScreenContainer.tsx` - Wrapper de cores
- `src/contexts/ThemeContext.tsx` - Gerenciador de tema
