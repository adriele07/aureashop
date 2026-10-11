# TradeVault — status para varejo local

## Escopo confirmado

- [x] Aplicação para lojas de varejo da cidade, não marketplace de atacado.
- [x] Teto aplicado como **3.000 produtos por loja**; se o limite desejado for global, a regra poderá ser ajustada.
- [x] Sem gateway: o cliente inicia o contato manual pelo link WhatsApp; o site não envia mensagem nem processa pagamento.

## Capacidades existentes e proteção

- [x] Super Admin: cadastro/bloqueio de lojas, visão global, relatórios, usuários e gestão manual de planos.
- [x] Lojista/equipe: produtos, fornecedores de abastecimento, estoque/movimentos/alertas, PDV, caixa e pedidos.
- [x] Cliente: vitrine pública, carrinho/pedido manual e histórico pessoal filtrado pela identidade autenticada.
- [x] APIs de administração aceitam somente `super_admin`; APIs operacionais aceitam somente `store_owner`/`staff` e derivam o escopo pela associação autenticada.
- [x] API/banco bloqueiam o produto 3.001; inclusão concorrente é serializada pela linha da loja. Edição não consome nova vaga.
- [x] Painel da loja mostra `n/3.000` e desabilita o botão de cadastro no teto.
- [x] `npm run check`; `npm test` com 21/21 testes; `npm audit --omit=dev` com 0 vulnerabilidades.

## Pendências antes de chamar de varejo local pronto

- [ ] A interface pública ainda tem linguagem e funções B2B: MOQ, preços por volume, comprador empresarial, fornecedores internacionais e guia de atacado. Substituir por vitrine de lojas da cidade, preço unitário e disponibilidade.
- [ ] A loja ainda não tem campos públicos de cidade/bairro/endereço nem filtro local. O município do proprietário ainda não foi informado.
- [ ] O checkout exige conta Manus, não uma conta de consumidor comum. Escolher pedido de visitante com rastreador privado ou cadastro próprio de cliente; não adicionar SMS/e-mail pago sem autorização.
- [ ] Campos de checkout ainda incluem empresa/e-mail/localização B2B; ajustar a dados adequados a consumidores depois da escolha de autenticação.
- [ ] Completar o callback OAuth real no Preview; a allowlist de Super Admin está configurada, mas o login ainda precisa ser tentado novamente após a correção do upsert.
- [ ] Configurar o WhatsApp e as instruções de pagamento de cada loja; nenhum número real foi fornecido.
- [ ] Definir política de retirada/entrega e prazo de expiração/cancelamento; reservas pendentes hoje só são liberadas por cancelamento manual.
- [ ] Testar acessos cruzados com contas autenticadas distintas de Super Admin, lojista/equipe e consumidor sem gravar pedidos reais no banco compartilhado.
- [ ] Upload de fotos pelo painel ainda não existe (cadastro por URL/caminho público).
- [ ] O Preview está em execução; publicação pública não foi feita. Custos da conta Manus devem ser confirmados em https://help.manus.im.
