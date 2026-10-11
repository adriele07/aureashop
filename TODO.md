# TradeVault — resultados e pendências

## Implementado no código

- [x] Catálogo/vitrine, páginas de produto e fornecedor, filtros, carrinho e checkout B2B.
- [x] Schema MySQL idempotente, dados iniciais, carrinho e pedidos persistidos.
- [x] Áreas de cliente com histórico pessoal autenticado.
- [x] Área Super Admin com visão global, faturamento pago por loja, bloqueio de lojas/usuários, vínculo de equipe e edição de metadados de planos.
- [x] Área de loja com produtos, categorias, preço/MOQ, foto por URL, estoque, alertas, entradas/saídas, caixa e PDV.
- [x] Atualização do andamento de pedidos pagos e exibição do status ao cliente autenticado.
- [x] Autorização por perfil e loja no servidor; preços de PDV calculados pelo servidor; consulta individual de pedidos protegida.
- [x] Bootstrap de Super Admin por lista explícita de e-mail/Open ID, sem promover automaticamente o primeiro usuário.
- [x] Script `npm run check` valida sintaxe do servidor, banco e frontends.

## Ainda necessário antes de uso real/produção

- [ ] Configurar banco MySQL, autenticação OAuth e os segredos `TRADEVAULT_SUPER_ADMIN_EMAILS`/`TRADEVAULT_SUPER_ADMIN_OPEN_IDS` no ambiente protegido do deploy.
- [ ] Configurar Stripe de teste e webhook assinado; realizar uma compra de ponta a ponta e confirmar atualização do pedido.
- [ ] Para produção: substituir chaves de teste por chaves live, configurar domínio, meios de pagamento, impostos, frete, políticas e procedimentos de reembolso.
- [ ] Configurar provisionamento/limites de planos e cobranças recorrentes. A edição atual altera metadados locais, não cria assinaturas Stripe.
- [ ] Implementar upload de imagens (hoje o cadastro aceita URL pública), configurações gerais editáveis no painel e testes integrados com banco/OAuth/Stripe.
- [ ] Validar experiência móvel, acessibilidade e fluxos operacionais com contas reais de Super Admin, lojista, funcionário e cliente antes de abrir ao público.
