const portalApi = async (path, options = {}) => {
  const response = await fetch(path, {
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
const portalShell = (kicker, title, subtitle, body) => `
  <section class="portal-hero"><div class="container"><span class="eyebrow">${esc(kicker)}</span><h1>${title}</h1><p>${esc(subtitle)}</p></div></section>
  <section class="portal-section"><div class="container">${body}</div></section>`;
const metric = (label, value, detail = '') => `<div class="metric-card"><span>${esc(label)}</span><strong>${esc(value)}</strong><small>${esc(detail)}</small></div>`;
const notice = message => window.alert(message);

function loginPage() {
  return portalShell('TradeVault account', 'Entre na sua<br/>operação.', 'Acesse sua conta para abrir a visão de gestão global, loja ou pedidos pessoais.', `
    <div class="portal-login"><div class="portal-card"><h2>Login seguro</h2><p>Use sua conta Manus. As permissões são verificadas no servidor.</p>
    <a class="button button-primary" href="/auth/login">Entrar com Manus <span>→</span></a><a class="text-link" href="/catalog">Continuar como visitante</a></div></div>`);
}
function accountPage(user, orders) {
  const dashboard = user.role === 'super_admin' ? '<a class="button button-primary" href="/admin">Abrir Super Admin <span>→</span></a>' : ['store_owner', 'staff'].includes(user.role) ? '<a class="button button-primary" href="/store">Abrir painel da loja <span>→</span></a>' : '';
  return portalShell('Minha conta', `Olá, ${esc(user.name || 'cliente')}.`, 'Acompanhe seus pedidos e histórico pessoal.', `
    <div class="portal-grid metrics">${metric('Pedidos', orders.length, 'histórico pessoal')}${metric('Perfil', user.role === 'customer' ? 'Cliente final' : user.role, 'acesso atual')}${metric('Email', user.email, 'conta autenticada')}</div>${dashboard}
    <div class="portal-card"><div class="portal-card-head"><div><span class="section-kicker">Purchase history</span><h2>Meus pedidos</h2></div><a class="button button-ghost dark-button" href="/auth/logout">Sair</a></div>
    ${orders.length ? `<div class="portal-table"><div class="table-row table-head"><span>Referência</span><span>Status</span><span>Total</span><span>Data</span></div>${orders.map(order => `<div class="table-row"><strong>${esc(order.reference)}</strong><span class="status-pill ${esc(order.status)}">${esc(order.status)}</span><span>${brl(order.subtotal)}</span><span>${new Date(order.created_at).toLocaleDateString('pt-BR')}</span></div>`).join('')}</div>` : '<div class="empty-state"><h3>Nenhum pedido ainda.</h3><p>Explore o catálogo e comece sua próxima compra.</p><a class="text-link" href="/catalog">Explorar catálogo ↗</a></div>'}</div>`);
}

async function adminPage() {
  const [overview, stores, users, plans] = await Promise.all([
    portalApi('/api/admin/overview'), portalApi('/api/admin/stores'), portalApi('/api/admin/users'), portalApi('/api/admin/plans'),
  ]);
  const eligible = users.filter(user => user.role !== 'super_admin');
  const userOptions = eligible.map((user, index) => `${index + 1}. ${user.name} — ${user.email} [${user.open_id}]`).join('\n');
  return portalShell('Super Admin / visão global', 'Comando geral<br/>da rede.', 'Cadastre e bloqueie lojas, gerencie usuários e planos e acompanhe o faturamento consolidado.', `
    <div class="portal-grid metrics">${metric('Lojas', overview.stores.total, `${overview.stores.active || 0} ativas · ${overview.stores.blocked || 0} bloqueadas`)}${metric('Faturamento recebido', brl(overview.sales.revenue), `${overview.sales.orders || 0} vendas pagas`)}${metric('Clientes', overview.customers.total, 'contas não bloqueadas')}</div>
    <div class="portal-grid portal-two"><div class="portal-card"><div class="portal-card-head"><div><span class="section-kicker">Store management</span><h2>Lojas</h2></div><button class="button button-primary" data-admin-action="new-store">+ Nova loja</button></div>
      <div class="portal-table">${stores.length ? stores.map(store => `<div class="table-row"><strong>${esc(store.name)}</strong><span>${esc(store.plan_name || store.plan_id)}</span><span>${brl(store.revenue)} recebidos</span><span class="status-pill ${esc(store.status)}">${esc(store.status)}</span><span>${Number(store.members)} usuário(s)</span><button class="mini-button" data-store-status="${esc(store.id)}" data-status="${store.status === 'active' ? 'blocked' : 'active'}">${store.status === 'active' ? 'Bloquear' : 'Ativar'}</button><button class="mini-button" data-assign-store="${esc(store.id)}">Vincular equipe</button></div>`).join('') : '<div class="empty-state">Nenhuma loja cadastrada.</div>'}</div>
      <details class="portal-details"><summary>Usuários disponíveis para vínculo</summary><p>O usuário precisa ter entrado na plataforma ao menos uma vez.</p><ul>${eligible.map(user => `<li>${esc(user.name)} · ${esc(user.email)} · <code>${esc(user.open_id)}</code> · ${esc(user.role)}</li>`).join('') || '<li>Nenhum usuário elegível.</li>'}</ul></details>
    </div><div class="portal-card"><span class="section-kicker">Plans</span><h2>Planos de assinatura</h2><div class="plan-list">${plans.map(plan => `<div><span><strong>${esc(plan.name)}</strong><small> · ${plan.active ? 'ativo' : 'inativo'}</small></span><span>${brl(plan.monthly_price)}/mês</span><button class="mini-button" data-edit-plan="${esc(plan.id)}" data-name="${esc(plan.name)}" data-price="${Number(plan.monthly_price)}" data-active="${plan.active ? '1' : '0'}">Editar</button></div>`).join('')}</div><small>Alterar preço no sistema não altera automaticamente uma cobrança Stripe já existente.</small></div></div>
    <div class="portal-card"><div class="portal-card-head"><div><span class="section-kicker">Access control</span><h2>Usuários</h2></div></div><div class="portal-table">${users.map(user => `<div class="table-row"><strong>${esc(user.name)}</strong><span>${esc(user.email)}</span><span>${esc(user.role)}</span><span>${user.blocked ? 'Bloqueado' : 'Ativo'}</span><button class="mini-button" data-user-block="${esc(user.open_id)}" data-blocked="${user.blocked ? '0' : '1'}">${user.blocked ? 'Desbloquear' : 'Bloquear'}</button>${user.role === 'customer' || user.role === 'super_admin' ? `<button class="mini-button" data-admin-role="${esc(user.open_id)}" data-current-role="${esc(user.role)}">${user.role === 'super_admin' ? 'Remover admin' : 'Tornar admin'}</button>` : ''}</div>`).join('')}</div></div>`);
}

function storePage(data, products, orders, cash) {
  const overview = data.overview;
  return portalShell('Lojista / funcionários', esc(data.store.name), 'Gerencie produtos, estoque, vendas e caixa. Os dados exibidos pertencem à sua loja.', `
    <div class="portal-grid metrics">${metric('Faturamento recebido', brl(overview.sales.revenue), `${overview.sales.orders || 0} vendas pagas`)}${metric('Produtos', overview.products.total, 'catálogo da loja')}${metric('Estoque baixo', overview.products.low_stock || 0, 'itens para repor')}</div>
    ${overview.lowStock?.length ? `<div class="portal-card"><strong>Alertas de estoque baixo</strong><ul>${overview.lowStock.map(product => `<li>${esc(product.name)}: ${Number(product.stock_qty)} em estoque (alerta em ${Number(product.low_stock_threshold)})</li>`).join('')}</ul></div>` : ''}
    <div class="portal-grid portal-two"><div class="portal-card"><div class="portal-card-head"><div><span class="section-kicker">Inventory control</span><h2>Produtos e estoque</h2></div><button class="button button-primary" data-store-action="new-product">+ Cadastrar produto</button></div>
      <div class="portal-table">${products.length ? products.map(product => `<div class="table-row"><strong>${esc(product.name)}</strong><span>${brl(product.price)} / ${esc(product.unit)}</span><span>${Number(product.stockQty)} un.</span><span class="status-pill ${product.stockQty <= product.lowStockThreshold ? 'low' : 'ok'}">${product.stockQty <= product.lowStockThreshold ? 'Repor' : 'OK'}</span><button class="mini-button" data-inventory="${esc(product.id)}" data-type="in">Entrada</button><button class="mini-button" data-inventory="${esc(product.id)}" data-type="out">Saída</button><button class="mini-button" data-edit-product="${esc(product.id)}">Editar</button></div>`).join('') : '<div class="empty-state">Cadastre o primeiro produto para começar.</div>'}</div>
    </div><div class="portal-card"><span class="section-kicker">Cash control</span><h2>Caixa</h2><p>${cash.open ? `Aberto desde ${new Date(cash.open.opened_at).toLocaleString('pt-BR')}` : 'Nenhum caixa aberto.'}</p><button class="button button-primary" data-store-action="cash">${cash.open ? 'Fechar caixa' : 'Abrir caixa'}</button><a class="button button-ghost dark-button" href="/pos">Abrir PDV <span>→</span></a><h3>Histórico de caixa</h3>${cash.history.length ? `<ul>${cash.history.map(session => `<li>${esc(session.status)} · abertura ${brl(session.opening_amount)} · fechamento ${session.closing_amount == null ? '—' : brl(session.closing_amount)} · ${new Date(session.opened_at).toLocaleDateString('pt-BR')}</li>`).join('')}</ul>` : '<p>Sem sessões anteriores.</p>'}</div></div>
    <div class="portal-card"><div class="portal-card-head"><div><span class="section-kicker">Sales management</span><h2>Pedidos e vendas recentes</h2></div></div><div class="portal-table">${orders.length ? orders.slice(0, 10).map(order => { const next = { paid: 'processing', processing: 'shipped', shipped: 'completed' }[order.status]; return `<div class="table-row"><strong>${esc(order.reference)}</strong><span>${esc(order.company)}</span><span>${esc(order.status)}</span><span>${brl(order.subtotal)}</span><span>${new Date(order.created_at).toLocaleDateString('pt-BR')}</span>${next ? `<button class="mini-button" data-advance-order="${esc(order.id)}" data-next-status="${next}">Marcar ${next}</button>` : ''}</div>`; }).join('') : '<div class="empty-state">Nenhum pedido online nesta loja.</div>'}</div><small>Vendas do PDV entram no faturamento e no histórico do caixa. O andamento do pedido aparece para o cliente na conta.</small></div>`);
}

function posPage(data, products, cash) {
  return portalShell('PDV / caixa', esc(data.store.name), 'Registre uma venda presencial; o servidor valida preço, estoque e sessão de caixa.', `
    <div class="portal-grid portal-two"><div class="portal-card"><span class="section-kicker">Current sale</span><h2>Nova venda</h2>${cash.open ? `<form id="pos-form"><div class="form-field"><label>Produto</label><select name="productId" required>${products.map(product => `<option value="${esc(product.id)}">${esc(product.name)} — ${brl(product.price)} (estoque ${Number(product.stockQty)})</option>`).join('')}</select></div><div class="form-grid"><div class="form-field"><label>Quantidade</label><input name="qty" type="number" value="1" min="1" required /></div><div class="form-field"><label>Pagamento</label><select name="paymentMethod"><option value="cash">Dinheiro</option><option value="card">Cartão</option><option value="pix">Pix</option></select></div></div><button class="button button-primary" type="submit">Registrar venda <span>→</span></button></form>` : '<p>Abra o caixa na visão da loja antes de registrar vendas.</p>'}</div>
    <div class="portal-card"><span class="section-kicker">Cash status</span><h2>${cash.open ? 'Caixa aberto' : 'Caixa fechado'}</h2><p>${cash.open ? `Valor de abertura: ${brl(cash.open.opening_amount)}` : 'Venda indisponível até a abertura do caixa.'}</p><a class="text-link" href="/store">Voltar à visão da loja ↗</a></div></div>`);
}

function promptProduct(product) {
  const name = window.prompt('Nome do produto:', product?.name || ''); if (name === null) return null;
  const category = window.prompt('Categoria:', product?.category || 'Geral'); if (category === null) return null;
  const price = window.prompt('Preço unitário (ex.: 29,90):', String(product?.price ?? '0').replace('.', ',')); if (price === null) return null;
  const moq = window.prompt('Quantidade mínima de pedido:', String(product?.moq ?? 1)); if (moq === null) return null;
  const stockQty = window.prompt('Estoque inicial:', String(product?.stockQty ?? 0)); if (stockQty === null) return null;
  const lowStockThreshold = window.prompt('Alerta de estoque baixo em:', String(product?.lowStockThreshold ?? 10)); if (lowStockThreshold === null) return null;
  const image = window.prompt('URL pública da foto do produto (opcional):', product?.image || ''); if (image === null) return null;
  const unit = window.prompt('Unidade (un, cx, kg etc.):', product?.unit || 'un'); if (unit === null) return null;
  return { ...(product?.id ? { id: product.id } : {}), name, category, price: Number(price.replace(',', '.')), moq: Number(moq), stockQty: Number(stockQty), lowStockThreshold: Number(lowStockThreshold), image, unit, supplier: product?.supplier || 'Fornecedor da loja', badge: product?.badge || 'LOJA' };
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
    if (route === '/account') html = accountPage(me.user, await portalApi('/api/account/orders'));
    else if (route === '/admin') {
      if (me.user.role !== 'super_admin') throw new Error('Apenas Super Admin pode acessar esta visão.');
      html = await adminPage();
    } else {
      const [data, products, orders, cash] = await Promise.all([
        portalApi('/api/store/overview'), portalApi('/api/store/products'), portalApi('/api/store/orders'), portalApi('/api/store/cash'),
      ]);
      html = route === '/pos' ? posPage(data, products, cash) : storePage(data, products, orders, cash);
    }
    document.getElementById('page-content').innerHTML = html;
    document.title = `TradeVault — ${route.slice(1)}`;
    portalEvents();
  } catch (error) {
    document.getElementById('page-content').innerHTML = portalShell('Acesso restrito', 'Não foi possível abrir<br/>esta visão.', error.message, '<a class="button button-primary" href="/login">Voltar ao login <span>→</span></a>');
  }
}

function portalEvents() {
  document.querySelectorAll('[data-store-status]').forEach(button => button.onclick = async () => {
    try { await portalApi(`/api/admin/stores/${encodeURIComponent(button.dataset.storeStatus)}`, { method: 'PATCH', body: JSON.stringify({ status: button.dataset.status }) }); await portalBoot(); }
    catch (error) { notice(error.message); }
  });
  document.querySelectorAll('[data-user-block]').forEach(button => button.onclick = async () => {
    try { await portalApi(`/api/admin/users/${encodeURIComponent(button.dataset.userBlock)}`, { method: 'PATCH', body: JSON.stringify({ blocked: button.dataset.blocked === '1' }) }); await portalBoot(); }
    catch (error) { notice(error.message); }
  });
  document.querySelectorAll('[data-admin-role]').forEach(button => button.onclick = async () => {
    const promote = button.dataset.currentRole !== 'super_admin';
    if (!window.confirm(promote ? 'Conceder acesso de Super Admin a este usuário?' : 'Remover o perfil de Super Admin deste usuário?')) return;
    try { await portalApi(`/api/admin/users/${encodeURIComponent(button.dataset.adminRole)}`, { method: 'PATCH', body: JSON.stringify({ role: promote ? 'super_admin' : 'customer' }) }); await portalBoot(); }
    catch (error) { notice(error.message); }
  });
  document.querySelectorAll('[data-admin-action="new-store"]').forEach(button => button.onclick = async () => {
    const name = window.prompt('Nome da nova loja:'); if (!name) return;
    const planId = window.prompt('ID do plano (starter, pro ou growth):', 'starter'); if (!planId) return;
    try { await portalApi('/api/admin/stores', { method: 'POST', body: JSON.stringify({ name, planId }) }); await portalBoot(); }
    catch (error) { notice(error.message); }
  });
  document.querySelectorAll('[data-assign-store]').forEach(button => button.onclick = async () => {
    const openId = window.prompt('Informe o open_id do usuário listado abaixo para vinculá-lo a esta loja:'); if (!openId) return;
    const role = window.prompt('Perfil na loja: store_owner ou staff', 'store_owner'); if (!['store_owner', 'staff'].includes(role)) { notice('Escolha store_owner ou staff.'); return; }
    try { await portalApi(`/api/admin/stores/${encodeURIComponent(button.dataset.assignStore)}/members`, { method: 'POST', body: JSON.stringify({ openId, role }) }); await portalBoot(); }
    catch (error) { notice(error.message); }
  });
  document.querySelectorAll('[data-edit-plan]').forEach(button => button.onclick = async () => {
    const name = window.prompt('Nome do plano:', button.dataset.name); if (name === null) return;
    const monthlyPrice = window.prompt('Preço mensal (ex.: 149,00):', button.dataset.price.replace('.', ',')); if (monthlyPrice === null) return;
    const active = window.confirm('Manter este plano disponível para novas lojas?');
    try { await portalApi(`/api/admin/plans/${encodeURIComponent(button.dataset.editPlan)}`, { method: 'PATCH', body: JSON.stringify({ name, monthlyPrice: Number(monthlyPrice.replace(',', '.')), active }) }); await portalBoot(); }
    catch (error) { notice(error.message); }
  });
  document.querySelectorAll('[data-inventory]').forEach(button => button.onclick = async () => {
    const quantity = window.prompt(button.dataset.type === 'in' ? 'Quantidade de entrada:' : 'Quantidade de saída:', '1'); if (quantity === null) return;
    const note = window.prompt('Observação da movimentação (opcional):', '') || '';
    try { await portalApi('/api/store/inventory', { method: 'POST', body: JSON.stringify({ productId: button.dataset.inventory, type: button.dataset.type, qty: Number(quantity), note }) }); await portalBoot(); }
    catch (error) { notice(error.message); }
  });
  document.querySelectorAll('[data-store-action="new-product"]').forEach(button => button.onclick = async () => {
    const product = promptProduct(); if (!product) return;
    try { await portalApi('/api/store/products', { method: 'POST', body: JSON.stringify(product) }); await portalBoot(); }
    catch (error) { notice(error.message); }
  });
  document.querySelectorAll('[data-edit-product]').forEach(button => button.onclick = async () => {
    try {
      const products = await portalApi('/api/store/products');
      const product = promptProduct(products.find(item => item.id === button.dataset.editProduct)); if (!product) return;
      await portalApi('/api/store/products', { method: 'PATCH', body: JSON.stringify(product) }); await portalBoot();
    } catch (error) { notice(error.message); }
  });
  document.querySelectorAll('[data-store-action="cash"]').forEach(button => button.onclick = async () => {
    const opening = button.textContent.includes('Abrir');
    const amount = window.prompt(opening ? 'Valor inicial do caixa:' : 'Valor final contado:', '0'); if (amount === null) return;
    try { await portalApi('/api/store/cash', { method: 'POST', body: JSON.stringify({ action: opening ? 'open' : 'close', amount: Number(amount.replace(',', '.')) }) }); await portalBoot(); }
    catch (error) { notice(error.message); }
  });
  document.querySelectorAll('[data-advance-order]').forEach(button => button.onclick = async () => {
    try { await portalApi(`/api/store/orders/${encodeURIComponent(button.dataset.advanceOrder)}`, { method: 'PATCH', body: JSON.stringify({ status: button.dataset.nextStatus }) }); await portalBoot(); }
    catch (error) { notice(error.message); }
  });
  document.getElementById('pos-form')?.addEventListener('submit', async event => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    try {
      await portalApi('/api/store/pos-sales', { method: 'POST', body: JSON.stringify({ paymentMethod: form.get('paymentMethod'), items: [{ productId: form.get('productId'), qty: Number(form.get('qty')) }] }) });
      notice('Venda registrada; preço e estoque foram validados no servidor.'); await portalBoot();
    } catch (error) { notice(error.message); }
  });
}
portalBoot();
