# TradeVault — Plano de implementação

## Escopo
Marketplace B2B para conectar fornecedores a compradores empresariais em compras de grande volume. A integração Shopify foi descartada pelo usuário. A operação própria usa o banco gerenciado do webdev para catálogo, carrinho, pedidos e contatos comerciais, com Stripe Checkout para pagamento.

## Arquitetura
- **Servidor:** Node.js nativo (`server.js`) com SSR simples e APIs JSON na porta `3000`.
- **Persistência:** MySQL gerenciado do projeto via `mysql2` (`DATABASE_URL`), com schema idempotente em `db.js`.
- **Tabelas:** `suppliers`, `products`, `carts`, `cart_items`, `orders`, `order_items`, `stripe_events`, `support_requests` e `newsletter_subscribers`.
- **Seed:** `data/catalog.json` é inserido de forma idempotente; produtos existentes não são sobrescritos.
- **Carrinho:** associado a cookie HTTP-only com `SameSite=None; Secure` no Preview público e persistido em `carts`/`cart_items`.
- **Checkout:** valida empresa, comprador, email e destino; calcula faixas de preço por volume; cria pedido `pending_payment`; abre Stripe Checkout com os itens reais e salva o `stripe_session_id`.
- **Webhook:** `/api/stripe/webhook` preserva o corpo bruto, verifica assinatura, deduplica `event_id` e atualiza `orders.status`/`payment_status` para eventos de pagamento.
- **Rotas:** `/`, `/catalog`, `/products/:slug`, `/suppliers`, `/suppliers/:slug`, `/buyer-guide`, `/support`, `/checkout`.
- **APIs:** `/api/catalog`, `/api/cart`, `/api/cart/items`, `/api/checkout/session`, `/api/orders`, `/api/stripe/webhook`, `/api/support` e `/api/newsletter`.

## Direção de design
- **Movimento:** editorial B2B contemporâneo, inspirado em relatórios de procurement e terminais de comércio global.
- **Princípios:** hierarquia clara; densidade informacional com respiro; confiança por prova social e sinais de verificação; decisões orientadas a ação.
- **Filosofia de cores:** azul-marinho profundo cria autoridade e estabilidade; branco e azul-gelo mantêm leitura e sensação operacional; âmbar funciona como sinal próprio de oportunidade, verificação e avanço.
- **Layout:** composição assimétrica com hero dividido entre mensagem e painel de inteligência comercial; catálogo com navegação lateral e cartões de produto; seções alternam faixas em largura total e grids compactos.
- **Elementos assinatura:** selo circular “TV / Verified”; linha de conexão âmbar no hero; microetiquetas monoespaçadas para MOQ, lead time e termos.
- **Interação:** filtros e ações mantêm o contexto; o carrinho abre como drawer lateral; o checkout redireciona para uma página Stripe segura; feedbacks usam toast discreto.
- **Animação:** entradas suaves em 400–600ms, hover com elevação mínima e realce de borda âmbar, drawer com deslocamento horizontal.
- **Tipografia:** `DM Sans` para interface e `Space Grotesk` para títulos/wordmark, com `JetBrains Mono` para dados operacionais.
- **Essência da marca:** “A camada de confiança entre quem fabrica e quem compra em escala.” Personalidade: preciso, seguro, progressivo.
- **Tom de voz:** direto, seguro e informado. Exemplos: “Abasteça a próxima operação com fornecedores verificados.” / “Condições comerciais claras antes do primeiro contato.”
- **Wordmark:** “TradeVault” com monograma TV construído como um cofre aberto: dois blocos geométricos e uma abertura âmbar central.
- **Cor proprietária:** âmbar TradeVault `#F4B544`.

## Estrutura
- `server.js`: servidor SSR, cookies de carrinho, APIs do marketplace e Stripe Checkout/webhook.
- `db.js`: schema, seed idempotente, consultas, carrinho, pedidos e eventos de pagamento.
- `data/catalog.json`: conteúdo inicial de fornecedores e produtos.
- `public/index.html`: shell semântico da aplicação.
- `public/styles.css`: tokens visuais, layout responsivo e estados de interação.
- `public/app.js`: catálogo, páginas, filtros e sincronização com APIs persistentes.
- `public/manus-routes.json`: rotas declaradas para Preview.
- `app.config.ts`: logoUrl literal do projeto.
- `TODO.md`: critérios de resultado, persistência e go-live.

## Go-live
O Stripe está habilitado em sandbox e o webhook do Preview está registrado. Para vender em produção, o proprietário ainda precisa reivindicar o sandbox/conta Stripe, configurar chaves live, meios de pagamento, frete, impostos e domínio, depois publicar o checkpoint.
