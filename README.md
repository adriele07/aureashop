# TradeVault

Sistema multiloja com catálogo, estoque, fornecedores, PDV, pedidos e áreas separadas para Super Admin, lojistas/funcionários e clientes. O projeto usa Node.js 22 e MySQL; o checkout não integra gateway de pagamento.

## Pagamento: somente combinação manual

- A loja configura seu WhatsApp (código do país + DDD + número) e instruções gerais ou específicas por produto.
- O cliente entra na conta Manus e envia o pedido sem pagar e sem cadastrar dados de cartão; assim o pedido fica ligado à sua identidade para histórico e acompanhamento. O pedido fica **aguardando pagamento manual**.
- O site abre um link `wa.me` com referência, itens, total estimado e instruções configuradas. A conversa fica como rascunho: **o cliente precisa revisar e tocar em Enviar no WhatsApp**.
- O TradeVault não envia mensagens, não usa a API paga do WhatsApp e não processa Pix, cartões ou cobranças recorrentes. O pedido reserva estoque; a reserva permanece até a loja confirmar o recebimento externo ou cancelar o pedido manualmente. Ainda não há expiração automática de pedidos abandonados.
- Planos e valores são referências locais administradas manualmente pelo Super Admin. Não há assinatura automática.

Isso evita tarifas de processamento de um gateway porque nenhuma transação é processada pelo site. Não garante que hospedagem, conta Manus, telefone ou serviços externos sejam gratuitos. Para dúvidas sobre custos/limites da conta Manus, consulte [help.manus.im](https://help.manus.im). Nenhuma chave Stripe Live é necessária; o sandbox que aparece na configuração do projeto não é chamado pelo aplicativo.

## Requisitos e execução local

- Node.js 22.x e npm 10.x.
- MySQL compatível com `DATABASE_URL`.
- Projeto Manus WebDev com servidor, MySQL gerenciado e Manus OAuth habilitados para o Preview hospedado.

```bash
npm ci
npm run check
npm test
npm start
```

O servidor escuta em `0.0.0.0:${PORT:-3000}`. `/health` responde `200 ok` sem login. A inicialização cria tabelas/migrações aditivas e insere somente dados de demonstração ausentes (`INSERT IGNORE`); não substitui alterações de catálogo existentes. No WebDev, Preview e publicação usam o mesmo MySQL: não use dados pessoais/reais em testes e não limpe tabelas para reiniciar.

## Configuração do ambiente

Configure valores somente no ambiente protegido do projeto. Nunca adicione `.env`, tokens, chaves ou DSNs ao repositório.

| Variável | Finalidade |
|---|---|
| `DATABASE_URL` | Conexão MySQL gerenciada ou escolhida pelo operador. |
| `MANUS_PROJECT_ID` | ID OAuth do projeto, fornecido pelo WebDev. |
| `MANUS_JWT_SECRET` | Verificação HS256 da sessão `webdev_app_session`, fornecido pelo WebDev. |
| `MANUS_OAUTH_PORTAL_URL` | Portal de autenticação Manus, fornecido pelo WebDev. |
| `MANUS_OAUTH_API_URL` | API OAuth Manus, fornecida pelo WebDev. |
| `TRADEVAULT_SUPER_ADMIN_EMAILS` | Allowlist de e-mails Super Admin separados por vírgula; use o campo protegido do projeto. |
| `TRADEVAULT_SUPER_ADMIN_OPEN_IDS` | Allowlist alternativa de Open IDs separados por vírgula, quando necessário. |
| `TRADEVAULT_PUBLIC_ORIGIN` | Opcional: origem HTTPS pública explicitamente autorizada, caso o proxy não a encaminhe. |
| `TRADEVAULT_PREVIEW_ORIGIN` | Origem fallback do Preview; o projeto já define a origem atual. |
| `PORT` | Porta HTTP; padrão `3000`. |

Configure o e-mail do Super Admin antes do primeiro login. O primeiro usuário não recebe privilégios automaticamente. Após inserir o e-mail pela configuração protegida, reinicie o servidor; a allowlist é sincronizada no banco ao iniciar. Depois, o Super Admin pode cadastrar lojas, vincular pessoas que já entraram e atribuir perfis.

## Fluxos

- **Super Admin:** cadastro, bloqueio/ativação de lojas, métricas globais, recebimentos confirmados por loja, relatórios, usuários, configurações públicas e planos com limites/atribuição manual.
- **Lojista e equipe:** somente dados da loja vinculada; fornecedores e produtos; preço/categoria/foto por URL; estoque, movimentações e alertas; pedidos aguardando confirmação; histórico de pedidos e PDV/caixa.
- **Cliente:** catálogo, carrinho de uma loja por pedido, envio do pedido sem cobrança, link manual do WhatsApp e histórico pessoal após login.

O primeiro Super Admin configura o WhatsApp da loja em **Visão da loja → WhatsApp da loja** e preenche instruções de pagamento. Também pode configurar instruções por produto. Sem número válido, o pedido é salvo, mas o botão de WhatsApp não fica disponível. Nenhuma mensagem é enviada automaticamente.

Fotos aceitam URLs HTTPS públicas ou os caminhos `/assets/` e `/manus-storage/`. O upload de fotos diretamente pelo painel ainda não está incluído.

## Segurança e operação

- Autenticação Manus OAuth; cookies `webdev_app_session` compatíveis com Preview HTTPS incorporado.
- Todas as mutações validam origem; rotas administrativas e de loja verificam papel e vínculo no servidor.
- O cliente consulta apenas o próprio histórico; dados da loja são filtrados por associação no backend.
- O preço do PDV é calculado no servidor. Pedidos não pagos não contam como receita e não podem avançar no processamento.
- O endpoint `/health` confirma que o processo está ativo; não substitui inspeção do login ou do banco.
- A visibilidade pública e a publicação são decisões separadas de login. Este repositório não foi publicado em produção nesta etapa.

## Testes

```bash
npm run check
npm test
npm audit --omit=dev
```

A suíte automatizada verifica sintaxe, faixas de preço e formatação/URL da mensagem manual de WhatsApp. Não cria pedidos de teste no banco compartilhado.
