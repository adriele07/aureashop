# TradeVault — plano de varejo local

## Direção do produto

O TradeVault será uma vitrine e ferramenta de gestão para **lojas de varejo da mesma cidade**, não um marketplace de atacado. O limite foi interpretado como **3.000 produtos por loja**, não 3.000 no sistema inteiro; essa regra pode ser alterada se a intenção era um teto global. Cidade, bairro e endereço serão configuráveis, pois o município ainda não foi informado. Cada pedido pertence a uma loja e abre uma conversa WhatsApp com texto pré-preenchido; nada é enviado sem ação manual do cliente e o site não processa pagamentos.

## Perfis e permissões

- **Super Admin:** administra lojas, equipe, usuários, planos locais e relatórios globais. As APIs administrativas aceitam somente `super_admin`.
- **Lojista/funcionários:** gerenciam apenas uma loja vinculada: catálogo (até 3.000 produtos), fornecedores de abastecimento, inventário, caixa, PDV, pedidos e dados públicos da loja. As APIs operacionais aceitam somente `store_owner`/`staff` e derivam o `store_id` da associação autenticada.
- **Cliente:** pode ver o catálogo público; o histórico é limitado à identidade autenticada. O catálogo é público intencionalmente; APIs administrativas e da loja permanecem protegidas no servidor.

## Estado técnico e próximos resultados

1. **Concluído no código:** retirado o acesso `super_admin` das rotas operacionais da loja; o escopo de loja passa a exigir vínculo de proprietário/equipe.
2. **Concluído no código:** limite rígido de 3.000 produtos por loja aplicado no backend sob transação e lock da loja, incluindo requisições concorrentes. Editar um produto existente não consome vaga. O painel mostra `n/3.000` e desabilita novo cadastro no teto.
3. **Ainda pendente:** substituir MOQ, faixas de preço, termos B2B, comprador empresarial, procurement, fornecedores internacionais e guia de atacado por diretório de lojas locais, localização, categorias, disponibilidade e preço unitário.
4. **Ainda pendente:** adicionar cidade/bairro/endereço público à loja e filtros locais, sem expor configuração administrativa.
5. **Ainda pendente:** decidir o acesso do consumidor. O fluxo atual exige conta Manus, pouco apropriada a consumidores comuns. Alternativas: pedido de visitante com rastreador privado ou conta própria de cliente. Não implementar envio de SMS/e-mail ou autenticação paga sem escolha do proprietário.
6. Manter estoque, PDV, caixa, histórico da loja e pedido manual via WhatsApp; pedido reserva estoque, a confirmação externa marca como pago e cancelar libera a reserva. Não adicionar Stripe, API de WhatsApp, pagamento automático ou gateway.

## Arquitetura

Node.js serve a API e os arquivos do site; MySQL gerenciado usa migrações idempotentes/aditivas. O banco é compartilhado entre Preview e publicação, então não apagar nem reinicializar dados. `server.js` aplica login, papel e origem; `db.js` valida associações, estoque e regras por loja. `public/app.js`/`manual-flow.js` servem vitrine/carrinho/pedido; `public/portal.js` separa os portais Super Admin, loja, cliente e PDV. Não incluir segredos em arquivos ou Git.

## Design

- **Movimento:** varejo de bairro contemporâneo, com linguagem editorial simples e sinalização clara de loja/categoria.
- **Princípios:** localização fácil de perceber; preço unitário e disponibilidade visíveis; compra curta; ferramentas internas densas mas legíveis.
- **Cores:** preservar azul-marinho, branco/azul-gelo e âmbar da marca atual; verde apenas para estoque disponível/confirmado.
- **Layout:** diretório com busca, categorias e proximidade; página da loja com identidade, endereço e catálogo; painel organizado por tarefa e adaptado a celular.
- **Interação/animação:** feedback curto para carrinho/estoque, movimentos discretos; nunca abrir WhatsApp ou enviar mensagem automaticamente.
- **Tipografia/voz:** manter DM Sans e Space Grotesk e o wordmark TradeVault; português brasileiro próximo e objetivo, por exemplo: “Encontre lojas perto de você” e “Combine seu pedido direto com a loja”.

## Principais arquivos

- `server.js`: sessão OAuth, guards por papel/loja, catálogo/pedidos e health check.
- `role-access.js`: listas explícitas de papéis autorizados.
- `product-limit.js`: limite de produtos por loja.
- `db.js`: schema/migrações, catálogo, estoque, lojas/equipe, relatórios, pedidos, caixa e PDV.
- `public/index.html`, `styles.css`, `app.js`, `manual-flow.js`, `portal.js`, `portal.css`: vitrine e portais.
- `test/`: regressões do catálogo, login/cookies, PDV, WhatsApp, papéis e limite 3.000.

## Limitações para uso real

A proteção de papéis e o teto de produtos estão corrigidos no código e têm testes unitários, mas **a interface ainda é um template atacadista** (MOQ, preços por volume, compradores empresariais e fornecedores de outras regiões). O cadastro de localização, catálogo real, telefone/instruções de WhatsApp e regra de retirada/entrega ainda faltam. O consumidor continua dependendo de OAuth Manus; decidir visitante versus conta própria é necessário para clientes comuns. O callback OAuth real ainda requer nova tentativa com a sessão do usuário. Pedidos manuais pendentes precisam de cancelamento manual para liberar estoque; não expiram automaticamente. A publicação pública não foi feita. Custos da conta Manus não são estimados; dúvidas sobre isso devem ser enviadas a https://help.manus.im.
