# TradeVault

Sistema multiloja em adaptação para **lojas de varejo locais** (não atacado), com estoque, PDV, pedidos e áreas para Super Admin, lojistas/equipe e clientes. Usa Node.js 22 e MySQL. O limite de cadastro é de 3.000 produtos por loja. O checkout não integra gateway de pagamento.

> **Estado honesto:** a separação de papéis e o teto de 3.000 estão corrigidos no backend e cobertos por testes unitários. A vitrine ainda contém texto/elementos B2B (MOQ, preço por volume, comprador empresarial e guia de atacado); cidade/bairro/endereço e filtros locais também não foram concluídos. Esta versão Preview não deve ser apresentada como varejo local pronto para clientes.

## Pagamento: somente combinação manual

- A loja configura seu WhatsApp (código do país + DDD + número) e instruções gerais ou específicas por produto.
- No fluxo atual, o cliente entra na conta Manus, envia o pedido sem pagar nem cadastrar cartão, e o pedido fica ligado à identidade para histórico/acompanhamento.
- O site abre um link `wa.me` com referência, itens, total estimado e instruções configuradas. A conversa fica como rascunho: **o cliente precisa revisar e tocar em Enviar no WhatsApp**.
- O TradeVault não envia mensagens, não usa a API paga do WhatsApp e não processa Pix, cartões ou cobranças recorrentes. O pedido reserva estoque; a reserva permanece até a loja confirmar o recebimento externo ou cancelar manualmente. Não há expiração automática de pedidos abandonados.
- Planos e valores são administrados localmente; não há assinatura automática.

Nenhuma transação é processada pelo site, mas isso **não garante que hospedagem, conta Manus, telefone ou outros serviços sejam gratuitos**. Para dúvidas sobre custos/limites da conta Manus, consulte [help.manus.im](https://help.manus.im). Nenhuma chave Stripe Live é necessária; o sandbox presente na configuração não é chamado pelo aplicativo.

## Requisitos e execução

- Node.js 22.x, npm 10.x e MySQL compatível com `DATABASE_URL`.
- Projeto Manus WebDev com servidor, banco e Manus OAuth habilitados para o Preview.

```bash
npm ci
npm run check
npm test
npm start
```

O servidor escuta em `0.0.0.0:${PORT:-3000}`. `/health` responde `200 ok` sem login. A inicialização cria tabelas/migrações aditivas e insere somente dados de demonstração ausentes (`INSERT IGNORE`); não substitui alterações de catálogo existentes. Preview e publicação compartilham o MySQL: não use dados pessoais/reais em testes e não limpe tabelas para reiniciar.

## Configuração protegida

Configure valores somente no ambiente seguro do projeto. Nunca adicione `.env`, tokens, chaves ou DSNs ao repositório.

| Variável | Finalidade |
|---|---|
| `DATABASE_URL` | Conexão MySQL gerenciada ou escolhida pelo operador. |
| `MANUS_PROJECT_ID` | ID OAuth do projeto, fornecido pelo WebDev. |
| `MANUS_JWT_SECRET` | Verificação da sessão `webdev_app_session`, fornecido pelo WebDev. |
| `MANUS_OAUTH_PORTAL_URL` | Portal de autenticação Manus. |
| `MANUS_OAUTH_API_URL` | API OAuth Manus. |
| `TRADEVAULT_SUPER_ADMIN_EMAILS` | Allowlist de e-mails Super Admin; usar o campo protegido. |
| `TRADEVAULT_SUPER_ADMIN_OPEN_IDS` | Allowlist alternativa de Open IDs, quando necessário. |
| `TRADEVAULT_PUBLIC_ORIGIN` | Opcional: origem HTTPS pública autorizada se o proxy não a encaminhar. |
| `TRADEVAULT_PREVIEW_ORIGIN` | Origem fallback do Preview atual. |
| `PORT` | Porta HTTP; padrão `3000`. |

O primeiro usuário não recebe privilégios automaticamente. A allowlist define quem pode virar Super Admin. Esse perfil cadastra lojas e vincula usuários já autenticados.

## Perfis e operações

- **Super Admin:** cadastro/bloqueio de lojas, indicadores globais, relatórios, usuários, configurações e planos locais.
- **Lojista/equipe:** produtos da loja vinculada (máximo 3.000), fornecedores de abastecimento, estoque/movimentações/alertas, pedidos, caixa e PDV.
- **Cliente:** catálogo público, carrinho de uma loja por pedido, checkout manual pelo WhatsApp e histórico pessoal após login. O login de cliente ainda usa conta Manus; um modelo adequado a consumidores comuns precisa ser escolhido antes do lançamento.

APIs globais aceitam somente `super_admin`; APIs da loja aceitam somente `store_owner`/`staff` e usam a associação da sessão para determinar `store_id`. O cliente só consulta pedidos da identidade autenticada. O catálogo público é público por projeto; não expõe as funções de painel.

Fotos são aceitas por URL HTTPS pública ou caminhos `/assets/` e `/manus-storage/`; upload pelo painel ainda não existe. Telefone/instruções WhatsApp, localização das lojas e regras locais de retirada/entrega precisam ser configuradas antes do uso real.

## Validação e publicação

```bash
npm run check
npm test
npm audit --omit=dev
```

A última validação passou com 21/21 testes e 0 vulnerabilidades nas dependências de produção. Os testes de papel e limite são unitários; não foram criados pedidos artificiais no banco compartilhado. O login OAuth real e os acessos cruzados com contas de usuário ainda precisam de teste autenticado. A publicação pública não foi feita.
