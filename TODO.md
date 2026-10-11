# TradeVault — conclusão para Preview sem gateway pago

## Funcionalidades implementadas

### Super Admin (Sua Visão / Gestor Geral)
- [x] Cadastro, gerenciamento e bloqueio de lojas.
- [x] Visão global de métricas, faturamento das lojas e relatórios gerais.
- [x] Configurações gerais editáveis e planos locais: criar, editar, ativar/desativar, definir limites, atribuir manualmente e consultar por loja; não há cobrança recorrente automática.

### Visão da Loja (Lojista / Funcionários)
- [x] Controle de Estoque: entrada, saída, alertas de estoque baixo e fornecedores vinculados à própria loja.
- [x] Gestão de Vendas: PDV, controle de caixa e histórico de pedidos.
- [x] Produtos: cadastro de itens, preços, categorias e fotos por URL pública; associação ao fornecedor da loja.
- [x] Acesso restrito apenas aos dados e configurações da própria loja.
- [x] Pedido fica pendente até a loja combinar e confirmar manualmente o pagamento; estoque é reservado, baixado apenas após confirmação externa e liberado ao cancelar; pedidos não pagos não entram no faturamento.

### Visão do Cliente Final
- [x] Catálogo/vitrine digital para visualização de produtos.
- [x] Carrinho e checkout sem cobrança automática, cartão ou gateway; o pedido autenticado gera um link click-to-chat e texto pré-preenchido para o cliente revisar e enviar manualmente.
- [x] Histórico e acompanhamento pessoal vinculados ao Open ID Manus autenticado, sem confiar em e-mail/campo enviado pelo navegador.

## Verificações concluídas

- [x] `/health`, página inicial, catálogo, manifesto de rotas e início do OAuth foram validados em localhost e na URL pública do Preview; o callback OAuth real ainda aguarda nova tentativa após a correção.
- [x] CSRF/origem: POST de mesma origem passa pela validação e pedido sem sessão retorna 401; origem externa retorna 403. Não foi criado pedido de teste.
- [x] Cookies OAuth: nonce configurado como `SameSite=None; Secure`; teste confirma que limpar o nonce não sobrescreve o cookie de sessão.
- [x] `npm run check` passou; `npm test` passou com 15/15 testes; `npm audit --omit=dev` encontrou 0 vulnerabilidades.
- [x] A busca de produto aceita o ID interno do carrinho e o slug da rota; 3 testes cobrem as duas chaves e a ausência de produto.
- [x] As queries de identidade OAuth foram preparadas com sucesso no MySQL sem executar gravações; o upsert anterior falhava com `Unknown column 'open_id'`.
- [x] Código e dependências de runtime não chamam Stripe, não têm webhook de pagamento e não enviam mensagem automática pelo WhatsApp.

## Ações necessárias antes de uso com clientes reais

- [ ] Completar o login OAuth real no Preview com a conta do Super Admin; a allowlist já foi configurada pelo campo protegido, mas o fluxo de login ainda precisa ser concluído na sessão do navegador do usuário.
- [ ] Na conta Super Admin, cadastrar o número de WhatsApp da loja (com código do país e DDD) e as instruções de pagamento gerais ou específicas de cada produto. O número atual está vazio, portanto o link de WhatsApp do catálogo-demo não poderá direcionar ao vendedor até essa configuração.
- [ ] Pedidos manuais pendentes não expiram automaticamente; a loja precisa cancelar pedidos abandonados para liberar a reserva de estoque.
- [ ] Antes de abrir ao público, validar com o dono as regras comerciais, telefone, instruções de pagamento, política de reserva/cancelamento e identidade visual/domínio.
- [ ] A publicação pública não foi feita; só publicar depois da validação/decisão específica pela plataforma. Hospedagem, banco e custos da conta Manus são separados de taxas de gateway; confirmar dúvidas de conta em https://help.manus.im.
