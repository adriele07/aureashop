# TradeVault — plano de varejo local

## Direção do produto

O TradeVault será uma vitrine e ferramenta de gestão para **lojas de varejo da mesma cidade**, não um marketplace de atacado. O limite está implementado como **3.000 produtos por loja**, não 3.000 no sistema inteiro; essa regra pode ser ajustada se a intenção era global. Cidade, bairro e endereço ainda precisam ser configuráveis, pois o município não foi informado. Cada pedido pertence a uma loja e abre conversa WhatsApp com texto pré-preenchido; nada é enviado sem ação manual e o site não processa pagamento.

## Perfis e permissões

- **Super Admin:** administra lojas, equipe, usuários, planos locais e relatórios globais. As APIs administrativas aceitam somente `super_admin`, concedido conforme allowlist.
- **Lojista/funcionários:** gerenciam apenas uma loja vinculada: catálogo, abastecimento, inventário, caixa, PDV, pedidos e dados públicos da loja. As APIs aceitam somente `store_owner`/`staff` e derivam o `store_id` da associação autenticada; o papel persiste em relogins OAuth.
- **Cliente:** vê catálogo público, adiciona ao carrinho e consulta apenas o histórico de sua identidade. A API pública mostra disponibilidade, não saldo físico, reservas ou limites internos de estoque.

## Estado técnico e próximos resultados

1. **Concluído no código:** removida a exceção `super_admin`→loja; o escopo operacional exige vínculo de dono/equipe.
2. **Concluído no código:** login OAuth preserva `store_owner`/`staff` já atribuídos, só promove `super_admin` para identidade allowlisted e rebaixa superadmin removido da allowlist.
3. **Concluído no código:** limite rígido de 3.000 produtos por loja aplicado sob transação/lock; edição não consome vaga; o painel mostra `n/3.000` e bloqueia novo cadastro no teto.
4. **Concluído no código:** o endpoint importa `buildWhatsAppUrl`, o construtor que antes estava ausente. As respostas públicas de catálogo/carrinho filtram contagens exatas de estoque e expõem somente flags de disponibilidade.
5. **Ainda pendente:** substituir MOQ, preços por volume, termos B2B, comprador empresarial, procurement, fornecedores internacionais e guia de atacado por diretório de lojas locais, localização, categorias, disponibilidade e preço unitário.
6. **Ainda pendente:** adicionar cidade/bairro/endereço público à loja e filtros locais, sem expor configuração administrativa.
7. **Ainda pendente:** decidir o acesso do consumidor. O fluxo atual exige conta Manus, pouco apropriada a consumidores comuns. Alternativas: pedido visitante com rastreador privado ou conta própria. Não adicionar envio de SMS/e-mail ou autenticação paga sem decisão do proprietário.
8. Manter estoque, PDV, caixa, histórico da loja e pedido manual via WhatsApp; pedido reserva estoque, confirmação externa marca como pago e cancelar libera a reserva. Não adicionar Stripe, API de WhatsApp, pagamento automático ou gateway.

## Arquitetura

Node.js serve API e arquivos do site; MySQL gerenciado usa migrações idempotentes/aditivas. O banco é compartilhado entre Preview e publicação, então não apagar nem reinicializar dados. `server.js` aplica login, papel, origem e saneamento das respostas públicas; `db.js` valida associações, estoque e regras por loja; `role-access.js` contém guards e política de papéis no login; `product-limit.js` aplica o teto; `public-inventory.js` remove saldos internos das respostas públicas. `public/app.js`/`manual-flow.js` servem vitrine/carrinho/pedido; `public/portal.js` separa os portais. Não incluir segredos em arquivos ou Git.

## Design

- **Movimento:** varejo de bairro contemporâneo, com linguagem editorial simples e sinalização clara de loja/categoria.
- **Princípios:** localização fácil de perceber; preço unitário e disponibilidade visíveis; compra curta; ferramentas internas densas mas legíveis.
- **Cores:** preservar azul-marinho, branco/azul-gelo e âmbar da marca atual; verde apenas para estoque disponível/confirmado.
- **Layout:** diretório com busca, categorias e proximidade; página da loja com identidade, endereço e catálogo; painel organizado por tarefa e adaptado a celular.
- **Interação/animação:** feedback curto para carrinho/estoque, movimentos discretos; nunca abrir WhatsApp ou enviar mensagem automaticamente.
- **Tipografia/voz:** manter DM Sans e Space Grotesk e o wordmark TradeVault; português brasileiro próximo e objetivo, por exemplo: “Encontre lojas perto de você” e “Combine seu pedido direto com a loja”.

## Principais arquivos

- `server.js`: sessão OAuth, autorização, catálogo/carrinho públicos, pedidos e health check.
- `db.js`: schema/migrações, catálogo, estoque, lojas/equipe, relatórios, pedidos, caixa e PDV.
- `role-access.js`, `product-limit.js`, `public-inventory.js`, `whatsapp.js`: autorização/papéis, teto, privacidade do estoque e link manual.
- `public/index.html`, `styles.css`, `app.js`, `manual-flow.js`, `portal.js`, `portal.css`: vitrine e portais.
- `test/`: regressões de lookup, cookies, pedido WhatsApp, sanitização pública, papéis e limite 3.000.

## Limitações para uso real

A auditoria de código identificou e foram corrigidos: falta de import do construtor WhatsApp usado após salvar um pedido; sobrescrita do papel `store_owner`/`staff` a cada OAuth; exposição pública de quantidades exatas/reservadas de estoque. Esses pontos têm regressões automatizadas, e a suíte passou com 26/26 testes. Ainda assim, **a interface permanece um template atacadista** (MOQ, preços por volume e dados empresariais). Cidade/bairro/endereço, catálogo real, telefone/instruções WhatsApp e regras de retirada/entrega ainda faltam. O consumidor continua dependendo de OAuth Manus; visitante versus conta própria precisa de escolha. O fluxo OAuth real, relogin de equipe e pedido com WhatsApp não foram executados contra o MySQL compartilhado. Pedidos não expiram automaticamente e podem reter estoque até cancelamento manual. A publicação pública não foi feita. Custos da conta Manus não são estimados; dúvidas devem ser enviadas a https://help.manus.im.
