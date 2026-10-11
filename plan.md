# TradeVault — Plano de conclusão e Preview sem gateway pago

## Direção atual

Concluir e validar o TradeVault em modo de teste/Preview. A hospedagem WebDev usa Node.js com servidor e MySQL gerenciados; esses recursos não podem ser desativados e o banco de desenvolvimento é o mesmo do app publicado. Não inserir dados reais nem fazer ações destrutivas no banco compartilhado. A publicação pública fica para uma etapa posterior, pelo fluxo próprio da plataforma.

O checkout do TradeVault **não fará cobranças automáticas** e não chamará Stripe nem outro gateway. O cliente entra com sua conta Manus e envia o pedido; a aplicação registra o pedido como pendente, vinculado exclusivamente ao Open ID autenticado, e apresenta um link `wa.me` com texto pré-preenchido. O cliente precisa tocar no link e enviar a mensagem no WhatsApp. A loja combina o pagamento e confirma manualmente o recebimento antes de marcar como pago e dar andamento ao pedido. Instruções podem ser mantidas por loja/produto. Nenhum cartão ou chave bancária será coletado pelo aplicativo. Pedidos pendentes reservam estoque até confirmação ou cancelamento manual; não há expiração automática nesta versão. Planos são cadastrados e atribuídos manualmente, sem cobrança recorrente automática.

Isso remove tarifas de processamento cobradas por gateway, mas não garante ausência de custos da hospedagem, banco ou plano Manus; valores de conta Manus devem ser confirmados em https://help.manus.im. O conector Stripe sandbox já habilitado fica sem uso; não configurar chaves live nem colocar fluxos que cobrem clientes.

O código original está no repositório público `adriele07/aureashop`. O projeto WebDev tem repositório canônico gerenciado por Manus, pois o fluxo suportado não adota o repositório GitHub existente como canônico. Manter o GitHub atual como espelho manual, sem recriá-lo, apagar conteúdo ou alterar sua visibilidade.

## Produto e comportamento

- **Super Admin:** cadastro, gerenciamento e bloqueio de lojas; métricas globais, faturamento e relatórios por loja; configurações gerais editáveis; criação, edição, ativação/desativação e limites dos planos; atribuição manual do plano e consulta do estado por loja.
- **Lojista/funcionários:** produtos com nome, preço, categoria, foto por URL e fornecedor da própria loja; gestão de fornecedores; entrada/saída de estoque e alertas de mínimo; reserva de estoque para pedidos pendentes, baixa física após confirmação manual e liberação da reserva ao cancelar; PDV com registro manual de forma externa de recebimento, controle e histórico de caixa; consulta de pedidos pendentes, confirmação manual do pagamento e andamento sequencial; acesso apenas aos dados da própria loja.
- **Cliente:** catálogo/vitrine pública, carrinho e envio de pedido autenticado sem cobrança no site; instruções para combinar o pagamento com a loja; acompanhamento e histórico pessoal vinculado ao Open ID Manus autenticado, sem associação baseada em e-mail/campo informado pelo visitante.
- **Identidade/autorização:** preservar Manus OAuth; acumular os cabeçalhos `Set-Cookie` para manter sessão e nonce no callback; validar `webdev_app_session`; bootstrap de Super Admin por allowlist explícita; aplicar validação do lado do servidor e isolamento por loja.

## Arquitetura

- Node.js nativo, executado no container na porta `PORT`/3000; o mesmo backend serve APIs e interface.
- MySQL gerenciado pelo WebDev, usando `DATABASE_URL`; schema/migrações idempotentes, seed sem sobrescrever dados existentes.
- `http-cookies.js` mantém múltiplos cookies na resposta OAuth; `pos.js` consolida itens repetidos antes da validação do estoque.
- Não instalar nem chamar Stripe, nem configurar processamento externo. Pedidos e confirmações são dados locais; forma e instruções de pagamento são texto/registro manual.
- Container via Dockerfile, `/health` público e manifesto `public/manus-routes.json` sincronizado com as rotas.
- Cookies de Preview devem ser `SameSite=None; Secure`; não enviar `X-Frame-Options DENY/SAMEORIGIN` nem CSP que bloqueie o iframe Preview. URLs de navegação relativas ou construídas com origem pública confiável.
- Credenciais somente em ferramentas protegidas. Nenhum `.env`, segredo ou chave vai para arquivos, logs ou GitHub.

## Interface e marca

Preservar a direção já implementada: editorial B2B contemporânea; azul-marinho, branco/azul-gelo e âmbar `#F4B544`; hierarquia direta, vitrines para compras em escala, drawer de carrinho e estados claros; DM Sans, Space Grotesk e JetBrains Mono; wordmark/monograma TV existente. Não adicionar ilustrações decorativas desnecessárias aos painéis operacionais.

## Estrutura

- `server.js`: OAuth/sessões, APIs, autorização, pedido manual, health check e servidor de assets.
- `db.js`: schema/migrações MySQL, seed, isolamento de lojas, catálogo, fornecedores, pedidos, caixa e atribuição manual de planos.
- `http-cookies.js`, `pos.js`, `whatsapp.js`: cookies multi-header, normalização de itens de PDV e geração pura de link click-to-chat.
- `data/catalog.json`: seed demonstrativo idempotente.
- `public/index.html`, `styles.css`, `app.js`, `manual-flow.js`, `portal.js`: vitrine, pedido manual e painéis por perfil.
- `public/manus-routes.json`: declaração sincronizada das páginas.
- `Dockerfile`, `package.json`/`package-lock.json`: container Node 22 sem dependência de gateway.
- `test/`: testes unitários e de contrato que não alterem dados de negócio.
- `README.md`, `TODO.md`: configuração, uso sem gateway, limites e requisitos externos.

## Fluxo de entrega

Migrar e corrigir o código, configurar a identidade e a permissão do Super Admin, iniciar o servidor e validar fluxos com dados de teste sem pagamentos reais. Rodar checks e testes, verificar páginas/rotas e isolamento por perfil; gerar checkpoint no repositório gerenciado e manter o espelho `adriele07/aureashop` atualizado. O portal poderá ser publicado após os testes e a confirmação específica; publicação pública não habilita cobranças porque não existe gateway no fluxo.
