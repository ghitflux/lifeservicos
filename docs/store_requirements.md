# Requisitos para Publicação nas Lojas (Google Play & App Store)

Este documento lista tudo o que você precisa preparar para publicar o aplicativo `life-mobile` e garantir a aprovação sem problemas.

## 1. Requisitos Técnicos (App)

### ⚠️ Configuração de Produção (Crítico)
O app atualmente aponta para endereços locais (`192.168...` ou `localhost`). Para funcionar na loja, você **precisa**:
1.  Ter o backend (`life-system`) hospedado em um servidor com **HTTPS** válido.
2.  Atualizar o arquivo `eas.json` (perfil `production`) com a URL pública:
    ```json
    "env": {
      "EXPO_PUBLIC_API_URL": "https://api.seudominio.com.br",
      "API_URL": "https://api.seudominio.com.br"
    }
    ```

### Credenciais de Teste
Os revisores da Google e Apple **precisam entrar no app** para testar.
- [ ] Criar um usuário de teste no banco de dados.
- [ ] Fornecer **Login** e **Senha** deste usuário no formulário de submissão ("Acesso ao App").
- **Dica:** O usuário de teste deve ter dados populados (algumas simulações, documentos) para o revisor ver que o app funciona.

---

## 2. Requisitos de Privacidade e Dados (Obrigatório)

### Política de Privacidade (URL Pública)
Você precisa de uma URL (link) acessível publicamente (ex: `https://seusite.com.br/privacidade`) contendo:
- [ ] Que dados o app coleta (Nome, CPF, Telefone, Arquivos, Fotos).
- [ ] Por que coleta (Análise de crédito, Cadastro).
- [ ] Com quem compartilha (Bancos parceiros, Instituições financeiras).
- [ ] Como o usuário pode solicitar a exclusão dos dados.

### Exclusão de Conta (Requisito Novo 2024)
A Google exige que o usuário possa solicitar a exclusão da conta **sem instalar o app**.
- [ ] **Link de Exclusão Web:** Uma URL onde o usuário possa preencher um formulário ou clicar num botão para pedir a exclusão de seus dados (pode ser na área de login do seu site web).

### Permissões Sensíveis
O app pede permissão de **Câmera** e **Arquivos**.
- [ ] **Justificativa:** No console da loja, você terá que explicar por que precisa dessas permissões (Resposta: "Para upload de documentos comprobatórios para simulação de crédito").

---

## 3. Assets Gráficos (Design)

### Ícone do App
- [ ] Imagem PNG de alta resolução.
- Dimensão: **512 x 512 px**.
- Fundo não pode ser transparente na Google Play (use o roxo do tema).

### Imagem de Destaque (Feature Graphic)
- [ ] Imagem promocional que aparece no topo da loja.
- Dimensão: **1024 x 500 px**.
- Sem texto importante nas bordas.

### Capturas de Tela (Screenshots)
- [ ] Mínimo de **2 screenshots** para celular.
- [ ] (Opcional mas recomendado) Screenshots de tablet 7" e 10".
- As imagens devem mostrar o app em uso (Dashboard, Tela de Simulação, Perfil).
- Não inclua bordas de dispositivo (o frame do celular), apenas a tela.

---

## 4. Informações da Loja (Metadados)

- [ ] **Nome do App:** (Até 30 caracteres) - Ex: "Life Digital"
- [ ] **Breve Descrição:** (Até 80 caracteres) - Ex: "Simule e gerencie seus empréstimos consignados com facilidade."
- [ ] **Descrição Completa:** (Até 4000 caracteres) - Detalhe as funcionalidades.
- [ ] **Categoria:** Finanças.
- [ ] **Classificação Etária:** Você preencherá um questionário. Como não tem conteúdo adulto/violento, será Livre ou 10+.
- [ ] **Dados de Contato:** Email de suporte (obrigatório) e Site (opcional).

---

## Resumo da Ação

1.  **Descubra a URL HTTPS** do seu servidor de produção.
2.  **Crie a página de Política de Privacidade** (pode ser uma página simples no seu site `life-system`).
3.  **Gere os Assets Gráficos** (prints e ícone).
4.  Quando estiver pronto, me avise para configurar o `eas.json` com a URL correta e gerar o build final.
