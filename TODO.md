# TradeVault — status para varejo local

## Escopo confirmado

- [x] Produto destinado a lojas de varejo da cidade, não marketplace de atacado.
- [x] Limite de **3.000 produtos por loja** aplicado no backend e indicado no painel.
- [x] Sem gateway: pedido é salvo sem cobrança; cliente abre link WhatsApp pré-preenchido e precisa enviar a mensagem manualmente.

## Capacidades e correções demonstradas em código/testes

- [x] Super Admin: cadastro/bloqueio de lojas, visão global, relatórios, usuários e gestão manual de planos.
- [x] Lojista/equipe: produtos, fornecedores de abastecimento, estoque/movimentos/alertas, PDV, caixa e pedidos.
- [x] Cliente: vitrine pública, carrinho/pedido manual e histórico pessoal filtrado pela identidade autenticada.
- [x] APIs administrativas aceitam somente `super_admin`; APIs operacionais aceitam somente `store_owner`/`staff` e usam associação autenticada para escopo.
- [x] Login OAuth preserva o papel de lojista/equipe atribuído pelo Super Admin; Super Admin só permanece/promove se estiver na allowlist.
- [x] API/banco bloqueiam o produto 3.001; inclusão concorrente bloqueia a linha da loja; edição não consome nova vaga.
- [x] Painel da loja mostra `n/3.000` e desabilita novo cadastro ao atingir o teto.
- [x] Construtor WhatsApp está importado pelo endpoint de checkout; regressão verifica o vínculo que antes causava erro em tempo de execução.
- [x] Catálogo e respostas do carrinho ocultam `stockQty`, `stockReservedQty`, `availableQty` e `lowStockThreshold`; expõem apenas disponibilidade e possibilidade de pedir.
- [x] `npm run check`; `npm test` com 26/26 testes; `npm audit --omit=dev` com 0 vulnerabilidades.

## Pendências antes de chamar de varejo local pronto

- [ ] A interface pública ainda tem linguagem e funções B2B: MOQ, preço por volume, comprador empresarial, fornecedores internacionais e guia de atacado. Substituir por vitrine de lojas da cidade, preço unitário e disponibilidade.
- [ ] A loja ainda não tem campos públicos de cidade/bairro/endereço nem filtro local. O município do proprietário ainda não foi informado.
- [ ] O checkout exige conta Manus, não uma conta de consumidor comum. Escolher pedido de visitante com rastreador privado ou cadastro próprio de cliente; não adicionar SMS/e-mail pago sem autorização.
- [ ] Campos do checkout ainda incluem empresa/e-mail/localização B2B; ajustar a dados adequados a consumidores depois da escolha de autenticação.
- [ ] Completar login OAuth real no Preview e verificar relogin de lojista/equipe com sessões distintas; os testes atuais são unitários, não fazem sessão HTTP autenticada.
- [ ] Configurar o WhatsApp e as instruções de pagamento de cada loja; nenhum número real foi fornecido. O Preview não foi usado para gravar pedido real no banco compartilhado.
- [ ] Definir política de retirada/entrega e prazo de expiração/cancelamento; pedidos pendentes hoje só liberam reserva por cancelamento manual.
- [ ] Validar estoque com testes de integração seguros; os testes atuais não executam reserva/confirmação/cancelamento no MySQL compartilhado.
- [ ] Upload de fotos pelo painel ainda não existe (cadastro por URL/caminho público).
- [ ] O Preview está em execução; publicação pública não foi feita. Custos da conta Manus devem ser confirmados em https://help.manus.im.
