const portalApi = async (path, options = {}) => {
  const response = await fetch(path, {
    credentials: 'same-origin',
    ...options,
    headers: { 'Content-Type': 'application/json', ...(options.headers || {}) },
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || 'Não foi possível concluir a operação.');
  return data;
};

const esc = value => String(value ?? '').replace(/[&<>"']/g, character => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
}[character]));
const brl = value => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(Number(value || 0));
const dateBR = value => value ? new Date(value).toLocaleString('pt-BR') : '—';
const notice = message => window.alert(message);
const portalShell = (kicker, title, subtitle, body) => `
  <section class="portal-hero"><div class="container"><span class="eyebrow">${esc(kicker)}</span><h1>${title}</h1><p>${esc(subtitle)}</p></div></section>
  <section class="portal-section"><div class="container">${body}</div></section>`;
const metric = (label, value, detail = '') => `<div class="metric-card"><span>${esc(label)}</span><strong>${esc(value)}</strong><small>${esc(detail)}</small></div>`;
const statusLabel = status => ({
  active: 'Ativa', blocked: 'Bloqueada', awaiting_manual_payment: 'Aguardando pagamento manual',
  paid: 'Pago', processing: 'Em preparação', shipped: 'Enviado', completed: 'Concluído',
  cancelled: 'Cancelado', unpaid: 'Não pago', pending: 'Pendente', low: 'Repor',
}[status] || status || '—');
const statusPill = status => `<span class="status-pill ${esc(status)}">${esc(statusLabel(status))}</span>`;
const paymentMethodLabel = method => ({ cash: 'Dinheiro', pix_manual: 'Pix confirmado fora do site', card_external: 'Cartão em maquininha externa' }[method] || method || '—');

function loginPage() {
  return portalShell('TradeVault account', 'Entre na sua<br/>operação.', 'Acesse sua conta para abrir a gestão global, a sua loja ou seus pedidos pessoais.', `
    <div class="portal-login"><div class="portal-card"><h2>Login seguro</h2><p>Use sua conta Manus. As permissões são verificadas no servidor.</p>
    <a class="button button-primary" href="/auth/login">Entrar com Manus <span>→</span></a>
    <a class="text-link" href="/catalog">Continuar como visitante</a></div></div>`);
}

function accountPage(user, orders) {
  const dashboard = user.role === 'super_admin'
    ? '<a class="button button-primary" href="/admin">Abrir Super Admin <span>→</span></a>'
    : ['store_owner', 'staff'].includes(user.role)
      ? '<a class="button button-primary" href="/store">Abrir painel da loja <span>→</span></a>' : '';
  const rows = orders.length ? orders.map(order => `<div class="table-row wide-table-row">
    <strong>${esc(order.reference)}</strong><span>${esc(order.store_name || 'Loja')}</span>${statusPill(order.status)}
    <span>${brl(order.subtotal)}</span><span>${esc(statusLabel(order.payment_status))}</span><span>${dateBR(order.created_at)}</span></div>`).join('')
    : '<div class="empty-state"><h3>Nenhum pedido ainda.</h3><p>Explore o catálogo e comece sua próxima compra.</p><a class="text-link" href="/catalog">Explorar catálogo ↗</a></div>';
  return portalShell('Minha conta', `Olá, ${esc(user.name || 'cliente')}.`, 'Acompanhe os pedidos e o histórico pessoal da sua conta.', `
    <div class="portal-grid metrics">${metric('Pedidos', orders.length, 'histórico pessoal')}${metric('Perfil', user.role === 'customer' ? 'Cliente final' : user.role, 'acesso atual')}${metric('E-mail', user.email, 'conta autenticada')}</div>
    ${dashboard}<div class="portal-card"><div class="portal-card-head"><div><span class="section-kicker">Histórico</span><h2>Meus pedidos</h2></div>
    <a class="button button-ghost dark-button" href="/auth/logout">Sair</a></div>
    <div class="portal-table"><div class="table-row table-head wide-table-row"><span>Referência</span><span>Loja</span><span>Andamento</span><span>Total</span><span>Pagamento</span><span>Data</span></div>${rows}</div></div>`);
}

async function adminPage() {
  const [overview, stores, users, plans, reports, settings] = await Promise.all([
    portalApi('/api/admin/overview'), portalApi('/api/admin/stores'), portalApi('/api/admin/users'),
    portalApi('/api/admin/plans'), portalApi('/api/admin/reports'), portalApi('/api/admin/settings'),
  ]);
  const eligible = users.filter(user => user.role !== 'super_admin');
  const storeRows = stores.length ? stores.map(store => `<div class="portal-data-row">
    <div><strong>${esc(store.name)}</strong><small>${Number(store.members)} membro(s) · ${Number(store.products_count)} produto(s) · ${Number(store.pending_orders)} pedido(s) pendente(s)</small></div>
    <div>${statusPill(store.status)}<small>Recebido: ${brl(store.revenue)}</small></div>
    <label class="compact-field">Plano<select data-store-plan="${esc(store.id)}">${plans.map(plan => `<option value="${esc(plan.id)}" ${plan.id === store.plan_id ? 'selected' : ''}>${esc(plan.name)}${plan.active ? '' : ' (inativo)'}</option>`).join('')}</select></label>
    <div class="row-actions"><button class="mini-button" data-store-status="${esc(store.id)}" data-status="${store.status === 'active' ? 'blocked' : 'active'}">${store.status === 'active' ? 'Bloquear' : 'Ativar'}</button>
    <button class="mini-button" data-assign-store="${esc(store.id)}">Vincular equipe</button></div></div>`).join('')
    : '<div class="empty-state">Nenhuma loja cadastrada.</div>';
  const planRows = plans.map(plan => `<div class="portal-data-row">
    <div><strong>${esc(plan.name)}</strong><small>ID ${esc(plan.id)} · ${plan.active ? 'ativo' : 'inativo'} · limite de equipe: ${Number(plan.limits?.staff ?? 0)}</small></div>
    <div><strong>${brl(plan.monthly_price)}/mês</strong><small>valor de referência, sem cobrança pelo site</small></div>
    <button class="mini-button" data-edit-plan="${esc(plan.id)}" data-name="${esc(plan.name)}" data-price="${Number(plan.monthly_price)}" data-staff="${Number(plan.limits?.staff ?? 0)}" data-active="${plan.active ? '1' : '0'}">Editar</button>
  </div>`).join('');
  const reportRows = reports.length ? reports.map(row => `<div class="table-row wide-table-row"><strong>${esc(row.month_key)}</strong><span>${Number(row.orders)} venda(s)</span><strong>${brl(row.revenue)}</strong></div>`).join('') : '<div class="empty-state">Ainda não há vendas pagas nos últimos 12 meses.</div>';
  const userRows = users.length ? users.map(user => `<div class="table-row wide-table-row">
    <strong>${esc(user.name)}</strong><span>${esc(user.email)}</span><span>${esc(user.role)}</span><span>${user.blocked ? 'Bloqueado' : 'Ativo'}</span>
    <button class="mini-button" data-user-block="${esc(user.open_id)}" data-blocked="${user.blocked ? '0' : '1'}">${user.blocked ? 'Desbloquear' : 'Bloquear'}</button>
    ${user.role === 'customer' || user.role === 'super_admin' ? `<button class="mini-button" data-admin-role="${esc(user.open_id)}" data-current-role="${esc(user.role)}">${user.role === 'super_admin' ? 'Remover admin' : 'Tornar admin'}</button>` : ''}</div>`).join('') : '<div class="empty-state">Nenhum usuário entrou ainda.</div>';
  return portalShell('Super Admin / visão global', 'Comando geral<br/>da rede.', 'Cadastre lojas, acompanhe recebimentos confirmados e administre planos sem cobrança automática.', `
    <div class="portal-grid metrics">${metric('Lojas', overview.stores.total, `${overview.stores.active || 0} ativas · ${overview.stores.blocked || 0} bloqueadas`)}
    ${metric('Recebido', brl(overview.sales.revenue), `${overview.sales.orders || 0} venda(s) registradas`)}
    ${metric('Pedidos a confirmar', overview.pending.total, brl(overview.pending.amount) + ' não é faturamento recebido')}
    ${metric('Clientes', overview.customers.total, 'contas não bloqueadas')}</div>
    <div class="portal-grid portal-two"><div class="portal-card"><div class="portal-card-head"><div><span class="section-kicker">Lojas</span><h2>Gerenciamento</h2></div><button class="button button-primary" data-admin-action="new-store">+ Nova loja</button></div>
      <div class="portal-data-list">${storeRows}</div><details class="portal-details"><summary>Usuários disponíveis para vínculo</summary><p>O usuário precisa ter entrado na plataforma ao menos uma vez.</p><ul>${eligible.map(user => `<li>${esc(user.name)} · ${esc(user.email)} · <code>${esc(user.open_id)}</code> · ${esc(user.role)}</li>`).join('') || '<li>Nenhum usuário elegível.</li>'}</ul></details>
    </div><div class="portal-card"><div class="portal-card-head"><div><span class="section-kicker">Planos</span><h2>Assinaturas locais</h2></div><button class="button button-ghost dark-button" data-admin-action="new-plan">+ Criar plano</button></div>
      <div class="portal-data-list">${planRows}</div><p class="small-note">Os valores são referências para gestão. O sistema não cobra clientes nem cria recorrências; a atribuição é manual.</p></div></div>
    <div class="portal-grid portal-two"><div class="portal-card"><div class="portal-card-head"><div><span class="section-kicker">Relatórios gerais</span><h2>Receita confirmada por mês</h2></div></div>
      <div class="portal-table"><div class="table-row table-head wide-table-row"><span>Mês</span><span>Vendas</span><span>Receita confirmada</span></div>${reportRows}</div></div>
      <div class="portal-card"><div class="portal-card-head"><div><span class="section-kicker">Configurações gerais</span><h2>Vitrine</h2></div><button class="mini-button" data-admin-action="settings">Editar</button></div>
      <p><strong>${esc(settings.brand_name || 'TradeVault')}</strong></p><p>${esc(settings.announcement || '')}</p><p>${esc(settings.support_email || 'E-mail de suporte não configurado')}</p><small>Configurações de autenticação e infraestrutura continuam protegidas no ambiente de hospedagem.</small></div></div>
    <div class="portal-card"><div class="portal-card-head"><div><span class="section-kicker">Acesso</span><h2>Usuários</h2></div></div><div class="portal-table">${userRows}</div></div>`);
}

function promptSupplier(supplier) {
  const name = window.prompt('Nome do fornecedor:', supplier?.name || '');
  if (name === null) return null;
  const location = window.prompt('Cidade/país:', supplier?.location || 'Brasil');
  if (location === null) return null;
  const specialty = window.prompt('Especialidade:', supplier?.specialty || '');
  if (specialty === null) return null;
  const description = window.prompt('Descrição:', supplier?.description || '');
  if (description === null) return null;
  const tagsText = window.prompt('Tags separadas por vírgula (opcional):', (supplier?.tags || []).join(', '));
  if (tagsText === null) return null;
  return { ...(supplier?.id ? { id: supplier.id } : {}), name, location, specialty, description, tags: tagsText.split(',').map(value => value.trim()).filter(Boolean) };
}

function promptProduct(product, suppliers) {
  if (!suppliers.length) { notice('Cadastre um fornecedor nesta loja antes de cadastrar produtos.'); return null; }
  const options = suppliers.map((supplier, index) => `${index + 1}. ${supplier.name}${supplier.is_active ? '' : ' (inativo)'} — ${supplier.id}`).join('\n');
  const currentIndex = Math.max(0, suppliers.findIndex(item => item.id === product?.supplierId));
  const choice = window.prompt(`Escolha o número do fornecedor:\n${options}`, String(currentIndex + 1));
  if (choice === null) return null;
  const supplier = suppliers[Number(choice) - 1];
  if (!supplier || !supplier.is_active) { notice('Escolha um fornecedor ativo desta loja.'); return null; }
  const name = window.prompt('Nome do produto:', product?.name || ''); if (name === null) return null;
  const category = window.prompt('Categoria:', product?.category || 'Geral'); if (category === null) return null;
  const price = window.prompt('Preço unitário (ex.: 29,90):', String(product?.price ?? '0').replace('.', ',')); if (price === null) return null;
  const moq = window.prompt('Quantidade mínima de pedido:', String(product?.moq ?? 1)); if (moq === null) return null;
  const stockQty = window.prompt('Estoque inicial:', String(product?.stockQty ?? 0)); if (stockQty === null) return null;
  const lowStockThreshold = window.prompt('Alerta de estoque baixo em:', String(product?.lowStockThreshold ?? 10)); if (lowStockThreshold === null) return null;
  const image = window.prompt('URL HTTPS pública da foto (opcional):', product?.image || ''); if (image === null) return null;
  const unit = window.prompt('Unidade (un, cx, kg etc.):', product?.unit || 'un'); if (unit === null) return null;
  const paymentInstructions = window.prompt('Instruções de pagamento manual para este produto (opcional):', product?.paymentInstructions || ''); if (paymentInstructions === null) return null;
  return {
    ...(product?.id ? { id: product.id } : {}), supplierId: supplier.id, name, category,
    price: Number(String(price).replace(/\./g, '').replace(',', '.')), moq: Number(moq),
    stockQty: Number(stockQty), lowStockThreshold: Number(lowStockThreshold), image, unit,
    paymentInstructions, supplier: supplier.name, badge: product?.badge || 'LOJA',
  };
}

function storePage(data, products, suppliers, orders, cash, settings, sales) {
  const overview = data.overview;
  const productLimit = 3000;
  const atProductLimit = products.length >= productLimit;
  const productRows = products.length ? products.map(product => `<div class="portal-data-row">
    <div><strong>${esc(product.name)}</strong><small>${esc(product.supplier)} · ${esc(product.category)} · ${brl(product.price)}/${esc(product.unit)}</small></div>
    <div><strong>${Number(product.stockQty)} un. físico</strong><small>Disponível ${Number(product.availableQty)} · reservado ${Number(product.stockReservedQty)} · alerta em ${Number(product.lowStockThreshold)}</small>${statusPill(product.availableQty <= product.lowStockThreshold ? 'low' : 'active')}</div>
    <div class="row-actions"><button class="mini-button" data-inventory="${esc(product.id)}" data-type="in">Entrada</button><button class="mini-button" data-inventory="${esc(product.id)}" data-type="out">Saída</button><button class="mini-button" data-edit-product="${esc(product.id)}">Editar</button></div>
  </div>`).join('') : '<div class="empty-state">Cadastre um fornecedor e o primeiro produto para começar.</div>';
  const supplierRows = suppliers.length ? suppliers.map(supplier => `<div class="portal-data-row">
    <div><strong>${esc(supplier.name)}</strong><small>${esc(supplier.specialty)} · ${esc(supplier.location)} · ${Number(supplier.product_count)} produto(s)</small></div>
    <div>${supplier.is_active ? 'Ativo' : 'Inativo'}</div><div class="row-actions"><button class="mini-button" data-edit-supplier="${esc(supplier.id)}">Editar</button>
    <button class="mini-button" data-toggle-supplier="${esc(supplier.id)}" data-active="${supplier.is_active ? '0' : '1'}">${supplier.is_active ? 'Desativar' : 'Ativar'}</button></div></div>`).join('') : '<div class="empty-state">Nenhum fornecedor cadastrado.</div>';
  const orderRows = orders.length ? orders.map(order => {
    const summary = (order.items || []).map(item => `${Number(item.qty)}× ${item.product_name}`).join(' · ');
    const confirmPayment = order.payment_status === 'pending'
      ? `<button class="mini-button" data-confirm-payment="${esc(order.id)}">Confirmar recebimento</button>` : '';
    const cancel = order.payment_status === 'pending' && order.status === 'awaiting_manual_payment'
      ? `<button class="mini-button" data-cancel-order="${esc(order.id)}">Cancelar pedido</button>` : '';
    const next = { paid: 'processing', processing: 'shipped', shipped: 'completed' }[order.status];
    const advance = next ? `<button class="mini-button" data-advance-order="${esc(order.id)}" data-next-status="${next}">Marcar ${esc(statusLabel(next))}</button>` : '';
    return `<div class="portal-data-row"><div><strong>${esc(order.reference)} · ${esc(order.company)}</strong><small>${esc(summary || 'Sem itens')}</small></div>
      <div>${statusPill(order.status)}<small>${esc(statusLabel(order.payment_status))} · ${brl(order.subtotal)}</small></div>
      <div class="row-actions">${confirmPayment}${cancel}${advance}</div></div>`;
  }).join('') : '<div class="empty-state">Nenhum pedido nesta loja.</div>';
  const cashRows = cash.history.length ? cash.history.map(session => `<li>${esc(statusLabel(session.status))} · abertura ${brl(session.opening_amount)} · fechamento ${session.closing_amount == null ? '—' : brl(session.closing_amount)} · ${dateBR(session.opened_at)}</li>`).join('') : '<li>Sem sessões anteriores.</li>';
  const saleRows = sales.length ? sales.slice(0, 20).map(sale => `<div class="table-row wide-table-row"><span>${dateBR(sale.created_at)}</span><span>${esc(sale.items || '')}</span><span>${esc(paymentMethodLabel(sale.payment_method))}</span><strong>${brl(sale.total)}</strong></div>`).join('') : '<div class="empty-state">Nenhuma venda de PDV registrada.</div>';

  return portalShell('Lojista / funcionários', esc(data.store.name), 'Gerencie apenas os produtos, pessoas, pedidos e recebimentos da sua loja.', `
    <div class="portal-grid metrics">${metric('Recebido', brl(overview.sales.revenue), `${overview.sales.orders || 0} venda(s) registradas`)}
    ${metric('Pedidos a confirmar', overview.pendingOrders.total, 'pagamento combinado fora do site')}
    ${metric('Produtos', `${products.length}/3.000`, 'limite desta loja')}${metric('Estoque baixo', overview.products.low_stock || 0, 'itens para repor')}</div>
    ${overview.lowStock?.length ? `<div class="portal-card stock-alert"><strong>Alertas de estoque baixo</strong><ul>${overview.lowStock.map(product => `<li>${esc(product.name)}: ${Math.max(0, Number(product.stock_qty) - Number(product.stock_reserved_qty || 0))} disponível · ${Number(product.stock_reserved_qty || 0)} reservado (alerta em ${Number(product.low_stock_threshold)})</li>`).join('')}</ul></div>` : ''}
    <div class="portal-card"><div class="portal-card-head"><div><span class="section-kicker">Contato e pagamento</span><h2>WhatsApp da loja</h2></div></div>
      <p>O checkout abre um link manual com a mensagem do pedido. Nada é enviado até o cliente tocar em Enviar; a equipe responde pelo WhatsApp.</p>
      <form id="store-settings-form"><div class="form-grid"><div class="form-field"><label>WhatsApp com código do país e DDD</label><input name="whatsappPhone" type="tel" value="${esc(settings.whatsapp_phone || '')}" placeholder="5511999999999" maxlength="20" /></div>
      <div class="form-field full"><label>Instruções gerais para combinar pagamento (opcional)</label><textarea name="paymentInstructions" rows="3" maxlength="3000" placeholder="Informe como o cliente deve pedir os dados e confirmar diretamente com a loja.">${esc(settings.payment_instructions || '')}</textarea></div></div>
      <button class="button button-ghost dark-button" type="submit">Salvar contato e instruções</button></form></div>
    <div class="portal-grid portal-two"><div class="portal-card"><div class="portal-card-head"><div><span class="section-kicker">Produtos e estoque</span><h2>Catálogo da loja</h2></div><button class="button button-primary" data-store-action="new-product" ${atProductLimit ? 'disabled title="Limite de 3.000 produtos atingido"' : ''}>${atProductLimit ? 'Limite de 3.000 atingido' : '+ Cadastrar produto'}</button></div>
      <div class="portal-data-list">${productRows}</div></div>
      <div class="portal-card"><div class="portal-card-head"><div><span class="section-kicker">Fornecedores</span><h2>Cadastro da loja</h2></div><button class="button button-ghost dark-button" data-store-action="new-supplier">+ Novo fornecedor</button></div>
      <div class="portal-data-list">${supplierRows}</div></div></div>
    <div class="portal-card"><div class="portal-card-head"><div><span class="section-kicker">Pedidos</span><h2>Recebidos e andamento</h2></div></div>
      <p>Confirme como pago somente depois de conferir o recebimento fora do TradeVault. Pedidos pendentes não entram no faturamento.</p><div class="portal-data-list">${orderRows}</div></div>
    <div class="portal-grid portal-two"><div class="portal-card"><div class="portal-card-head"><div><span class="section-kicker">Caixa</span><h2>${cash.open ? 'Caixa aberto' : 'Caixa fechado'}</h2></div></div>
      <p>${cash.open ? `Aberto em ${dateBR(cash.open.opened_at)} · valor inicial ${brl(cash.open.opening_amount)} · dinheiro registrado ${brl(cash.open.cash_sales)} · esperado ${brl(cash.open.expected_cash)}` : 'Abra o caixa antes de registrar vendas no PDV.'}</p>
      <button class="button button-primary" data-store-action="cash">${cash.open ? 'Fechar caixa' : 'Abrir caixa'}</button> <a class="button button-ghost dark-button" href="/pos">Abrir PDV <span>→</span></a>
      <h3>Histórico de sessões</h3><ul>${cashRows}</ul></div>
      <div class="portal-card"><div class="portal-card-head"><div><span class="section-kicker">Histórico do PDV</span><h2>Vendas recentes</h2></div></div>
      <div class="portal-table"><div class="table-row table-head wide-table-row"><span>Data</span><span>Itens</span><span>Pagamento registrado</span><span>Total</span></div>${saleRows}</div></div></div>`);
}

function posPage(data, products, cash) {
  const available = products.filter(product => Number(product.availableQty ?? product.stockQty) > 0);
  return portalShell('PDV / caixa', esc(data.store.name), 'Registre recebimentos presenciais já efetuados. O TradeVault não processa Pix nem cartão.', `
    <div class="portal-grid portal-two"><div class="portal-card"><span class="section-kicker">Nova venda</span><h2>Registrar venda presencial</h2>
    ${cash.open ? available.length ? `<form id="pos-form"><div class="form-field"><label>Produto</label><select name="productId" required>${available.map(product => `<option value="${esc(product.id)}">${esc(product.name)} — ${brl(product.price)} (${Number(product.availableQty ?? product.stockQty)} disponível)</option>`).join('')}</select></div>
    <div class="form-grid"><div class="form-field"><label>Quantidade</label><input name="qty" type="number" value="1" min="1" max="100000" required /></div>
    <div class="form-field"><label>Recebimento já confirmado</label><select name="paymentMethod"><option value="cash">Dinheiro recebido</option><option value="pix_manual">Pix confirmado fora do site</option><option value="card_external">Cartão em maquininha externa</option></select></div></div>
    <button class="button button-primary" type="submit">Registrar venda <span>→</span></button></form>` : '<p>Não há produtos com estoque disponível. Registre uma entrada de estoque na visão da loja.</p>' : '<p>Abra o caixa na visão da loja antes de registrar vendas.</p>'}</div>
    <div class="portal-card"><span class="section-kicker">Caixa</span><h2>${cash.open ? 'Aberto' : 'Fechado'}</h2>
    <p>${cash.open ? `Inicial: ${brl(cash.open.opening_amount)} · esperado em dinheiro: ${brl(cash.open.expected_cash)}` : 'Venda indisponível até abrir o caixa.'}</p>
    <a class="text-link" href="/store">Voltar à visão da loja ↗</a><p class="small-note">Pix e cartão são apenas formas registradas depois de recebidas externamente; não há integração ou cobrança automática.</p></div></div>`);
}

async function portalBoot() {
  const route = location.pathname;
  if (!['/login', '/account', '/admin', '/store', '/pos'].includes(route)) return;
  try {
    const me = await portalApi('/api/auth/me');
    if (!me.authenticated) {
      if (route === '/login') document.getElementById('page-content').innerHTML = loginPage();
      else location.href = '/login';
      return;
    }
    let html;
    if (route === '/account') {
      html = accountPage(me.user, await portalApi('/api/account/orders'));
    } else if (route === '/admin') {
      if (me.user.role !== 'super_admin') throw new Error('Apenas Super Admin pode abrir esta visão.');
      html = await adminPage();
    } else {
      const [data, products, suppliers, orders, cash, settings, sales] = await Promise.all([
        portalApi('/api/store/overview'), portalApi('/api/store/products'), portalApi('/api/store/suppliers'),
        portalApi('/api/store/orders'), portalApi('/api/store/cash'), portalApi('/api/store/settings'), portalApi('/api/store/pos-sales'),
      ]);
      html = route === '/pos' ? posPage(data, products, cash) : storePage(data, products, suppliers, orders, cash, settings, sales);
    }
    if (location.pathname !== route) return;
    document.getElementById('page-content').innerHTML = html;
    document.title = `TradeVault — ${route.slice(1)}`;
    portalEvents();
  } catch (error) {
    if (location.pathname !== route) return;
    document.getElementById('page-content').innerHTML = portalShell('Acesso restrito', 'Não foi possível abrir<br/>esta visão.', error.message, '<a class="button button-primary" href="/login">Voltar ao login <span>→</span></a>');
  }
}

function portalEvents() {
  document.querySelectorAll('[data-store-status]').forEach(button => button.onclick = async () => {
    try { await portalApi(`/api/admin/stores/${encodeURIComponent(button.dataset.storeStatus)}`, { method: 'PATCH', body: JSON.stringify({ status: button.dataset.status }) }); await portalBoot(); }
    catch (error) { notice(error.message); }
  });
  document.querySelectorAll('[data-store-plan]').forEach(select => select.onchange = async () => {
    try { await portalApi(`/api/admin/stores/${encodeURIComponent(select.dataset.storePlan)}/plan`, { method: 'PATCH', body: JSON.stringify({ planId: select.value }) }); await portalBoot(); }
    catch (error) { notice(error.message); }
  });
  document.querySelectorAll('[data-user-block]').forEach(button => button.onclick = async () => {
    try { await portalApi(`/api/admin/users/${encodeURIComponent(button.dataset.userBlock)}`, { method: 'PATCH', body: JSON.stringify({ blocked: button.dataset.blocked === '1' }) }); await portalBoot(); }
    catch (error) { notice(error.message); }
  });
  document.querySelectorAll('[data-admin-role]').forEach(button => button.onclick = async () => {
    const promote = button.dataset.currentRole !== 'super_admin';
    if (!window.confirm(promote ? 'Conceder acesso de Super Admin a este usuário?' : 'Remover o perfil Super Admin deste usuário?')) return;
    try { await portalApi(`/api/admin/users/${encodeURIComponent(button.dataset.adminRole)}`, { method: 'PATCH', body: JSON.stringify({ role: promote ? 'super_admin' : 'customer' }) }); await portalBoot(); }
    catch (error) { notice(error.message); }
  });
  document.querySelectorAll('[data-admin-action="new-store"]').forEach(button => button.onclick = async () => {
    const name = window.prompt('Nome da nova loja:'); if (!name) return;
    const planId = window.prompt('ID de um plano ativo:', 'starter'); if (!planId) return;
    try { await portalApi('/api/admin/stores', { method: 'POST', body: JSON.stringify({ name, planId }) }); await portalBoot(); }
    catch (error) { notice(error.message); }
  });
  document.querySelectorAll('[data-assign-store]').forEach(button => button.onclick = async () => {
    const openId = window.prompt('Informe o open_id do usuário listado abaixo:'); if (!openId) return;
    const role = window.prompt('Perfil na loja: store_owner ou staff', 'store_owner');
    if (!['store_owner', 'staff'].includes(role)) { notice('Escolha store_owner ou staff.'); return; }
    try { await portalApi(`/api/admin/stores/${encodeURIComponent(button.dataset.assignStore)}/members`, { method: 'POST', body: JSON.stringify({ openId, role }) }); await portalBoot(); }
    catch (error) { notice(error.message); }
  });
  document.querySelectorAll('[data-edit-plan]').forEach(button => button.onclick = async () => {
    const name = window.prompt('Nome do plano:', button.dataset.name); if (name === null) return;
    const monthlyPrice = window.prompt('Valor de referência mensal (não será cobrado pelo site):', button.dataset.price.replace('.', ',')); if (monthlyPrice === null) return;
    const staff = window.prompt('Limite de funcionários:', button.dataset.staff); if (staff === null) return;
    const active = window.confirm('Deixar este plano ativo para novas lojas?');
    try { await portalApi(`/api/admin/plans/${encodeURIComponent(button.dataset.editPlan)}`, { method: 'PATCH', body: JSON.stringify({ name, monthlyPrice: Number(monthlyPrice.replace(',', '.')), limits: { staff: Number(staff) }, active }) }); await portalBoot(); }
    catch (error) { notice(error.message); }
  });
  document.querySelectorAll('[data-admin-action="new-plan"]').forEach(button => button.onclick = async () => {
    const id = window.prompt('ID curto do plano (ex.: basic):'); if (!id) return;
    const name = window.prompt('Nome do plano:'); if (!name) return;
    const monthlyPrice = window.prompt('Valor de referência mensal (não será cobrado pelo site):', '0'); if (monthlyPrice === null) return;
    const staff = window.prompt('Limite de funcionários:', '3'); if (staff === null) return;
    try { await portalApi('/api/admin/plans', { method: 'POST', body: JSON.stringify({ id, name, monthlyPrice: Number(monthlyPrice.replace(',', '.')), limits: { staff: Number(staff) }, active: true }) }); await portalBoot(); }
    catch (error) { notice(error.message); }
  });
  document.querySelectorAll('[data-admin-action="settings"]').forEach(button => button.onclick = async () => {
    const settings = await portalApi('/api/admin/settings');
    const brandName = window.prompt('Nome da vitrine:', settings.brand_name || 'TradeVault'); if (brandName === null) return;
    const supportEmail = window.prompt('E-mail público de suporte:', settings.support_email || ''); if (supportEmail === null) return;
    const announcement = window.prompt('Aviso público:', settings.announcement || ''); if (announcement === null) return;
    try { await portalApi('/api/admin/settings', { method: 'PATCH', body: JSON.stringify({ brand_name: brandName, support_email: supportEmail, announcement }) }); await portalBoot(); }
    catch (error) { notice(error.message); }
  });
  document.querySelectorAll('[data-store-action="new-supplier"]').forEach(button => button.onclick = async () => {
    const supplier = promptSupplier(); if (!supplier) return;
    try { await portalApi('/api/store/suppliers', { method: 'POST', body: JSON.stringify(supplier) }); await portalBoot(); }
    catch (error) { notice(error.message); }
  });
  document.querySelectorAll('[data-edit-supplier]').forEach(button => button.onclick = async () => {
    try {
      const suppliers = await portalApi('/api/store/suppliers');
      const supplier = promptSupplier(suppliers.find(item => item.id === button.dataset.editSupplier)); if (!supplier) return;
      await portalApi(`/api/store/suppliers/${encodeURIComponent(button.dataset.editSupplier)}`, { method: 'PATCH', body: JSON.stringify(supplier) }); await portalBoot();
    } catch (error) { notice(error.message); }
  });
  document.querySelectorAll('[data-toggle-supplier]').forEach(button => button.onclick = async () => {
    try { await portalApi(`/api/store/suppliers/${encodeURIComponent(button.dataset.toggleSupplier)}`, { method: 'PATCH', body: JSON.stringify({ active: button.dataset.active === '1' }) }); await portalBoot(); }
    catch (error) { notice(error.message); }
  });
  document.querySelectorAll('[data-store-action="new-product"]').forEach(button => button.onclick = async () => {
    try {
      const suppliers = await portalApi('/api/store/suppliers');
      const product = promptProduct(null, suppliers.filter(item => item.is_active)); if (!product) return;
      await portalApi('/api/store/products', { method: 'POST', body: JSON.stringify(product) }); await portalBoot();
    } catch (error) { notice(error.message); }
  });
  document.querySelectorAll('[data-edit-product]').forEach(button => button.onclick = async () => {
    try {
      const [products, suppliers] = await Promise.all([portalApi('/api/store/products'), portalApi('/api/store/suppliers')]);
      const product = promptProduct(products.find(item => item.id === button.dataset.editProduct), suppliers.filter(item => item.is_active)); if (!product) return;
      await portalApi('/api/store/products', { method: 'PATCH', body: JSON.stringify(product) }); await portalBoot();
    } catch (error) { notice(error.message); }
  });
  document.querySelectorAll('[data-inventory]').forEach(button => button.onclick = async () => {
    const quantity = window.prompt(button.dataset.type === 'in' ? 'Quantidade de entrada:' : 'Quantidade de saída:', '1'); if (quantity === null) return;
    const note = window.prompt('Observação da movimentação (opcional):', '') || '';
    try { await portalApi('/api/store/inventory', { method: 'POST', body: JSON.stringify({ productId: button.dataset.inventory, type: button.dataset.type, qty: Number(quantity), note }) }); await portalBoot(); }
    catch (error) { notice(error.message); }
  });
  document.querySelectorAll('[data-store-action="cash"]').forEach(button => button.onclick = async () => {
    const opening = button.textContent.includes('Abrir');
    const amount = window.prompt(opening ? 'Valor inicial do caixa:' : 'Valor contado no fechamento:', '0'); if (amount === null) return;
    try { await portalApi('/api/store/cash', { method: 'POST', body: JSON.stringify({ action: opening ? 'open' : 'close', amount: Number(amount.replace(',', '.')) }) }); await portalBoot(); }
    catch (error) { notice(error.message); }
  });
  document.querySelectorAll('[data-confirm-payment]').forEach(button => button.onclick = async () => {
    if (!window.confirm('Confirme somente depois de verificar o recebimento fora do TradeVault. Ao confirmar, o pedido contará como recebido e o estoque será atualizado.')) return;
    try { await portalApi(`/api/store/orders/${encodeURIComponent(button.dataset.confirmPayment)}/payment`, { method: 'PATCH', body: JSON.stringify({ paymentStatus: 'paid' }) }); await portalBoot(); }
    catch (error) { notice(error.message); }
  });
  document.querySelectorAll('[data-cancel-order]').forEach(button => button.onclick = async () => {
    if (!window.confirm('Cancelar o pedido pendente e liberar o estoque? Faça isso somente se nenhum pagamento tiver sido recebido; qualquer devolução externa deve ser tratada pela loja.')) return;
    try { await portalApi(`/api/store/orders/${encodeURIComponent(button.dataset.cancelOrder)}`, { method: 'PATCH', body: JSON.stringify({ status: 'cancelled' }) }); await portalBoot(); }
    catch (error) { notice(error.message); }
  });
  document.querySelectorAll('[data-advance-order]').forEach(button => button.onclick = async () => {
    try { await portalApi(`/api/store/orders/${encodeURIComponent(button.dataset.advanceOrder)}`, { method: 'PATCH', body: JSON.stringify({ status: button.dataset.nextStatus }) }); await portalBoot(); }
    catch (error) { notice(error.message); }
  });
  document.getElementById('store-settings-form')?.addEventListener('submit', async event => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    try {
      await portalApi('/api/store/settings', { method: 'PATCH', body: JSON.stringify({ whatsappPhone: form.get('whatsappPhone'), paymentInstructions: form.get('paymentInstructions') }) });
      notice('Contato e instruções atualizados.'); await portalBoot();
    } catch (error) { notice(error.message); }
  });
  document.getElementById('pos-form')?.addEventListener('submit', async event => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    try {
      await portalApi('/api/store/pos-sales', { method: 'POST', body: JSON.stringify({ paymentMethod: form.get('paymentMethod'), items: [{ productId: form.get('productId'), qty: Number(form.get('qty')) }] }) });
      notice('Venda registrada. O pagamento foi apenas anotado depois da confirmação externa.'); await portalBoot();
    } catch (error) { notice(error.message); }
  });
}

window.portalBoot = portalBoot;
portalBoot();
