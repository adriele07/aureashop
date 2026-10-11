# TradeVault

Marketplace B2B com catálogo, carrinho, checkout Stripe e áreas de operação para Super Admin, lojistas/funcionários e clientes.

## Requisitos

- Node.js 22 ou compatível com a versão especificada no ambiente de deploy.
- MySQL acessível pela aplicação.
- Credenciais/configuração de autenticação Manus OAuth.
- Conta Stripe e endpoint de webhook para pagamentos.

## Configuração

Configure as variáveis no gerenciador seguro de ambiente do serviço de hospedagem. **Não** salve chaves em arquivos versionados nem as envie por chat.

| Variável | Uso |
|---|---|
| `DATABASE_URL` ou `DRIZZLE_DATABASE_URL` | Conexão MySQL; o schema e o catálogo inicial são criados de forma idempotente na inicialização. |
| `MANUS_PROJECT_ID` | Identificador do aplicativo OAuth. |
| `MANUS_JWT_SECRET` | Validação da sessão emitida para o app. |
| `MANUS_OAUTH_PORTAL_URL` | URL do portal de autenticação. |
| `MANUS_OAUTH_API_URL` | URL dos serviços OAuth públicos. |
| `TRADEVAULT_SUPER_ADMIN_EMAILS` | Lista de e-mails Super Admin, separados por vírgula; configure antes de permitir o primeiro login. |
| `TRADEVAULT_SUPER_ADMIN_OPEN_IDS` | Alternativa/adição à lista por e-mail, usando Open IDs separados por vírgula. |
| `STRIPE_SECRET_KEY` | Chave Stripe de teste ou produção. Sem ela, o checkout retorna indisponível, mas páginas públicas podem ser servidas. |
| `STRIPE_WEBHOOK_SECRET` | Segredo de assinatura do webhook Stripe. |
| `PORT` | Porta HTTP; padrão `3000`. |

O primeiro usuário **não** recebe mais privilégios administrativos automaticamente. Autorize explicitamente o administrador por e-mail/Open ID antes do login. A allowlist é sincronizada ao iniciar o serviço; reinicie após alterá-la. Depois, Super Admins podem criar lojas, vincular usuários e administrar perfis.

## Instalação e validação

```bash
npm ci
npm run check
npm test
npm start
```

A aplicação só fica operacional para catálogo persistente e áreas autenticadas quando o banco e os dados de autenticação estão configurados. O endpoint `/health` indica que o processo HTTP está ativo; não substitui uma checagem de banco, OAuth ou Stripe.

## Fluxos implementados

- **Super Admin:** métricas de vendas pagas, faturamento por loja, cadastro/bloqueio de lojas, vínculo de usuários, bloqueio de contas e manutenção dos metadados de planos.
- **Lojista/funcionário:** catálogo da própria loja, cadastro/edição de produtos, estoque de entrada/saída com alertas, caixa, PDV, pedidos online e atualização do andamento de pedidos pagos.
- **Cliente:** vitrine e catálogo, carrinho, checkout Stripe e histórico pessoal autenticado.

A foto de produto é informada por URL pública (upload de arquivos ainda não implementado). A gestão dos planos atualiza os dados internos da aplicação; **não** cria assinaturas/cobranças recorrentes no Stripe. Configurações operacionais sensíveis, como chaves, webhook, autenticação, impostos, frete e domínio, ficam no ambiente de implantação e no provedor correspondente.

## Segurança e visibilidade

- Mantenha `DATABASE_URL`, segredos OAuth e Stripe apenas no cofre de segredos do deploy.
- A autorização de loja e os preços do PDV são validados no servidor; produtos de lojas bloqueadas não podem iniciar novas compras.
- O histórico de pedidos e a consulta individual exigem autenticação e correspondência com a conta do cliente.
- O repositório GitHub atual é público. Não inclua dados reais de clientes, chaves, tokens ou exports de produção.
