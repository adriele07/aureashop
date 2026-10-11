(() => {
  const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g, character => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[character]));
  const safeImage = value => {
    const text = String(value || '').trim();
    if (text.startsWith('/assets/') || text.startsWith('/manus-storage/')) return text;
    try {
      const url = new URL(text);
      if (url.protocol !== 'https:' || url.username || url.password) return '/assets/cinder-ceramic.jpg';
      url.pathname = url.pathname.replace(/[()'"\s]/g, character => encodeURIComponent(character));
      return url.toString();
    } catch {
      return '/assets/cinder-ceramic.jpg';
    }
  };
  window.imgStyle = value => `style="background-image:url('${escapeHtml(safeImage(value))}')"`;

  window.productCard = product => { const availableQty = Number(product.availableQty ?? product.stockQty ?? 0); const canOrder = availableQty >= Number(product.moq); return `<article class="product-card">
    <a href="/products/${encodeURIComponent(product.slug)}" class="product-image" ${window.imgStyle(product.image)}>
      <span class="product-badge">${escapeHtml(product.badge)}</span>
    </a>
    <div class="product-info">
      <a href="/products/${encodeURIComponent(product.slug)}"><h3>${escapeHtml(product.name)}</h3></a>
      <p class="product-supplier">${escapeHtml(product.supplier)} · ${escapeHtml(product.category)}</p>
      <div class="product-meta"><div class="meta-item"><span>Pedido mínimo</span><strong>${Number(product.moq)} ${escapeHtml(product.unit)}</strong></div>
      <div class="meta-item"><span>Prazo</span><strong>${escapeHtml(product.lead)}</strong></div></div>
      <div class="product-card-foot"><div class="price">${money(product.price)}<small> por ${escapeHtml(product.unit)}</small></div>
      <button class="add-button" data-action="add" data-id="${escapeHtml(product.id)}" aria-label="Adicionar ${escapeHtml(product.name)}" ${!canOrder ? 'disabled aria-disabled="true"' : ''}>${canOrder ? '+' : '—'}</button></div>
    </div></article>`; };

  window.supplierCard = supplier => `<a href="/suppliers/${encodeURIComponent(supplier.slug)}" class="supplier-card">
    <span class="supplier-logo">${escapeHtml(supplier.mark)}</span><span><h3>${escapeHtml(supplier.name)}</h3>
    <p>${escapeHtml(supplier.specialty)} · ${escapeHtml(supplier.location)}</p></span><span class="arrow">↗</span></a>`;

  window.suppliersPage = () => `<section class="page-hero"><div class="container"><span class="eyebrow">Rede de fornecedores</span>
    <h1>Conheça quem faz.</h1><p>Fornecedores vinculados às lojas ativas do TradeVault.</p></div></section>
    <section class="section"><div class="container"><div class="supplier-grid">${suppliers.length ? suppliers.map(window.supplierCard).join('') : '<div class="empty-state"><h3>Nenhum fornecedor publicado.</h3></div>'}</div></div></section>`;

  window.supplierPage = supplier => {
    const supplierProducts = products.filter(product => product.supplierId === supplier.id);
    return `<section class="supplier-profile"><div class="container supplier-profile-grid"><aside class="profile-aside">
      <div class="supplier-logo">${escapeHtml(supplier.mark)}</div><span class="eyebrow">Fornecedor</span><h1>${escapeHtml(supplier.name)}</h1>
      <p>${escapeHtml(supplier.specialty)} · ${escapeHtml(supplier.location)}</p>
      <a href="/support" class="text-link">Fale com a loja ↗</a></aside><div class="profile-main">
      <h2>${escapeHtml(supplier.description)}</h2><div class="section-kicker">${supplierProducts.length} produto(s)</div>
      <div class="product-grid">${supplierProducts.map(window.productCard).join('')}</div></div></div></section>`;
  };

  window.productPage = product => {
    const availableQty = Number(product.availableQty ?? product.stockQty ?? 0);
    const canOrder = availableQty >= Number(product.moq);
    const supplier = suppliers.find(item => item.id === product.supplierId) || { name: product.supplier, slug: '', location: '' };
    const tiers = Array.isArray(product.tiers) ? product.tiers : [];
    return `<section class="product-detail"><div class="container"><a class="text-link" href="/catalog">← Voltar ao catálogo</a>
      <div class="detail-grid" style="margin-top:28px"><div class="detail-image" ${window.imgStyle(product.image)}><span class="product-badge">${escapeHtml(product.badge)}</span></div>
      <div class="detail-copy"><span class="eyebrow">${escapeHtml(product.category)} / ${escapeHtml(product.supplier)}</span><h1>${escapeHtml(product.name)}</h1>
      <a class="product-supplier text-link" href="/suppliers/${encodeURIComponent(supplier.slug)}">${escapeHtml(supplier.name)} · ${escapeHtml(supplier.location)} ↗</a>
      <p class="detail-desc">${escapeHtml(product.description)}</p><div class="detail-specs">
      <div class="meta-item"><span>Pedido mínimo</span><strong>${Number(product.moq)} ${escapeHtml(product.unit)}</strong></div>
      <div class="meta-item"><span>Prazo</span><strong>${escapeHtml(product.lead)}</strong></div>
      <div class="meta-item"><span>Condições</span><strong>${escapeHtml(product.terms)}</strong></div></div>
      <div class="filter-label">Faixas de preço</div><div class="tier-table"><div class="tier-table-head"><span>Volume</span><span>Preço unitário</span><span>Condição</span></div>
      ${tiers.map((tier, index) => `<div class="tier-row"><span>${escapeHtml(tier[0])} ${escapeHtml(product.unit)}</span><strong>${escapeHtml(tier[1])}</strong><span>${index ? 'Volume' : 'Base'}</span></div>`).join('')}
      </div><div class="quantity-row"><div class="quantity-control"><button data-action="qty-minus" aria-label="Diminuir quantidade">−</button>
      <input id="detail-qty" type="number" min="${Number(product.moq)}" value="${Number(product.moq)}" /><button data-action="qty-plus" aria-label="Aumentar quantidade">+</button></div>
      <span class="catalog-count">Mínimo: ${Number(product.moq)} ${escapeHtml(product.unit)} · Disponível: ${availableQty}</span></div>
      <div class="detail-actions"><button class="button button-primary" data-action="add-detail" data-id="${escapeHtml(product.id)}" ${!canOrder ? 'disabled aria-disabled="true"' : ''}>${canOrder ? 'Adicionar ao carrinho' : 'Sem estoque suficiente'} <span>→</span></button>
      <a class="button button-ghost" style="color:var(--navy);border-color:var(--line)" href="/suppliers/${encodeURIComponent(supplier.slug)}">Ver fornecedor</a></div></div></div></div></section>`;
  };

  window.updateCartUI = () => {
    document.querySelectorAll('.cart-count').forEach(element => { element.textContent = cartQty(); });
    const itemsElement = document.getElementById('cart-items');
    if (!itemsElement) return;
    if (!cart.length) {
      itemsElement.innerHTML = '<div class="empty-state" style="border:0;padding:70px 0"><h3>Seu carrinho está vazio.</h3><p>Adicione produtos para começar um pedido.</p><a href="/catalog" class="text-link" data-action="continue-shopping">Explorar catálogo ↗</a></div>';
    } else {
      itemsElement.innerHTML = cart.map(item => {
        const product = getProduct(item.id);
        if (!product) return '';
        return `<div class="cart-item"><div class="cart-item-img" ${window.imgStyle(product.image)}></div><div>
          <h3>${escapeHtml(product.name)}</h3><p>${escapeHtml(product.supplier)}</p><div class="item-actions">
          <button data-action="decrease" data-id="${escapeHtml(product.id)}" aria-label="Diminuir">−</button><span>${Number(item.qty)}</span>
          <button data-action="increase" data-id="${escapeHtml(product.id)}" aria-label="Aumentar">+</button>
          <button class="text-button" style="width:auto;padding:0 0 0 6px;font-size:10px" data-action="remove" data-id="${escapeHtml(product.id)}">Remover</button></div></div>
          <div class="item-price">${money(tierPrice(product, item.qty) * item.qty)}</div></div>`;
      }).join('');
    }
    const subtotal = document.getElementById('cart-subtotal');
    if (subtotal) subtotal.textContent = money(cartTotal());
  };

  const resultKey = 'tradevault-manual-order-result';
  const readResult = reference => {
    try {
      const value = JSON.parse(sessionStorage.getItem(resultKey) || 'null');
      return value?.order?.reference === reference ? value : null;
    } catch { return null; }
  };

  window.checkoutPage = () => {
    const params = new URLSearchParams(location.search);
    const reference = params.get('reference');
    const result = reference ? readResult(reference) : null;
    if (result) {
      const instructions = Array.isArray(result.paymentInstructions) ? result.paymentInstructions : [];
      const instructionBox = instructions.length
        ? `<div class="payment-instructions"><strong>Instruções da loja para este(s) produto(s)</strong>${instructions.map(text => `<p>${escapeHtml(text)}</p>`).join('')}</div>`
        : '<div class="payment-instructions"><strong>Pagamento combinado diretamente</strong><p>A loja ainda não cadastrou instruções específicas. Peça os dados e confirme o valor pelo WhatsApp antes de pagar.</p></div>';
      const whatsapp = result.whatsappUrl
        ? `<a class="button button-primary" href="${escapeHtml(result.whatsappUrl)}" target="_blank" rel="noopener noreferrer">Abrir conversa no WhatsApp <span>↗</span></a>`
        : '<p class="checkout-warning">O WhatsApp desta loja ainda não está configurado. Entre em contato com a loja para combinar o pagamento.</p>';
      return `<section class="page-hero"><div class="container"><span class="eyebrow">Pedido registrado · sem cobrança no site</span>
        <h1>Agora combine<br/>direto com a loja.</h1><p>Referência <strong>${escapeHtml(result.order.reference)}</strong> · ${money(result.order.subtotal)} · aguardando confirmação manual.</p></div></section>
        <section class="section"><div class="container checkout-result"><div class="checkout-card"><h2>Próximo passo</h2>
        <p>O pedido foi salvo. O site não envia mensagens nem recebe pagamento: o link abre o WhatsApp com um texto pronto; revise e toque em <strong>Enviar</strong>. A loja responderá manualmente.</p>
        ${instructionBox}${whatsapp}<p class="catalog-count">Não faça transferência antes de conferir os dados diretamente com a loja.</p>
        <a href="/account" class="text-link">Acompanhar meus pedidos ↗</a></div>
        <aside class="checkout-summary"><span class="eyebrow">Resumo do pedido</span><h2>${escapeHtml(result.order.reference)}</h2>
        ${(result.order.items || []).map(item => `<div class="summary-item"><span>${Number(item.qty)}× ${escapeHtml(item.product_name)}</span><strong>${money(item.unit_price * item.qty)}</strong></div>`).join('')}
        <div class="summary-total"><span>Total estimado</span><strong>${money(result.order.subtotal)}</strong></div><p class="checkout-note">Status: aguardando a loja confirmar o recebimento manual.</p></aside></div></section>`;
    }
    if (!cart.length) return `<section class="page-hero"><div class="container"><span class="eyebrow">Checkout</span><h1>Seu carrinho<br/>está vazio.</h1>
      <p>Adicione itens ao carrinho para montar um pedido.</p><a href="/catalog" class="button button-primary" style="margin-top:25px">Explorar catálogo <span>→</span></a></div></section>`;
    const storeNames = [...new Set(cart.map(item => getProduct(item.id)?.storeName).filter(Boolean))];
    return `<section class="page-hero"><div class="container"><span class="eyebrow">Pedido sem gateway</span><h1>Revise antes<br/>de falar com a loja.</h1>
      <p>O pedido será salvo sem cobrança. Depois, você poderá abrir uma conversa manual no WhatsApp e combinar o pagamento diretamente com a loja.</p></div></section>
      <section class="section"><div class="container checkout-layout"><div class="checkout-card"><h2>Dados do pedido</h2>
      ${storeNames.length ? `<p class="checkout-note">Loja: ${escapeHtml(storeNames[0])}</p>` : ''}
      <form id="checkout-form"><div class="form-grid"><div class="form-field full"><label>Empresa</label><input name="company" maxlength="180" placeholder="Nome da sua empresa" required /></div>
      <div class="form-field"><label>Nome do comprador</label><input name="buyer" maxlength="180" placeholder="Seu nome" required /></div>
      <div class="form-field"><label>E-mail</label><input name="email" type="email" maxlength="220" placeholder="voce@empresa.com" required /></div>
      <div class="form-field"><label>Destino de entrega</label><input name="location" maxlength="180" placeholder="Cidade / endereço" required /></div>
      <div class="form-field"><label>Pedido de compra (opcional)</label><input name="po" maxlength="100" placeholder="PO-0000" /></div>
      <div class="form-field full"><label>Nota para a loja</label><input name="note" maxlength="2000" placeholder="Prazo, personalização ou contexto adicional" /></div></div>
      <button class="button button-primary" style="margin-top:24px" type="submit">Enviar pedido e abrir WhatsApp <span>→</span></button>
      <p class="catalog-count" style="margin:15px 0 0">Nenhum pagamento é processado pelo site. A mensagem só é enviada se você tocar em Enviar no WhatsApp.</p></form></div>
      <aside class="checkout-summary"><span class="eyebrow">Resumo</span><h2>Seu pedido</h2>
      ${cart.map(item => { const product = getProduct(item.id); return product ? `<div class="summary-item"><span>${Number(item.qty)}× ${escapeHtml(product.name)}</span><strong>${money(tierPrice(product, item.qty) * item.qty)}</strong></div>` : ''; }).join('')}
      <div class="summary-total"><span>Total estimado</span><strong>${money(cartTotal())}</strong></div>
      <div class="checkout-note">✓ Pedido salvo no TradeVault<br/>✓ Pagamento combinado fora do site<br/>✓ A loja confirma manualmente o recebimento</div></aside></div></section>`;
  };

  window.submitManualCheckout = async form => {
    const values = Object.fromEntries(new FormData(form).entries());
    const button = form.querySelector('button[type=submit]');
    if (button) { button.disabled = true; button.textContent = 'Salvando pedido…'; }
    try {
      const result = await api('/api/orders', { method: 'POST', body: JSON.stringify(values) });
      sessionStorage.setItem(resultKey, JSON.stringify(result));
      cart = [];
      saveCart();
      history.replaceState({}, '', `/checkout?reference=${encodeURIComponent(result.order.reference)}`);
      render();
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch (error) {
      if (button) { button.disabled = false; button.textContent = 'Enviar pedido e abrir WhatsApp →'; }
      if (error.status === 401 && !form.querySelector('.checkout-login-prompt')) {
        const prompt = document.createElement('p');
        prompt.className = 'checkout-note checkout-login-prompt';
        prompt.innerHTML = 'Para salvar o pedido no seu histórico pessoal, entre na sua conta Manus e tente novamente. <a class="text-link" href="/auth/login">Entrar com Manus ↗</a>';
        form.appendChild(prompt);
      }
      toast(error.message || 'Não foi possível salvar o pedido.');
    }
  };
  window.submitCheckout = window.submitManualCheckout;

  const portalPaths = new Set(['/login', '/account', '/admin', '/store', '/pos']);
  const baseRender = window.render;
  window.render = () => {
    if (portalPaths.has(location.pathname)) {
      const page = document.getElementById('page-content');
      if (page) page.innerHTML = '';
      document.title = `TradeVault — ${location.pathname.slice(1)}`;
      if (typeof window.updateNav === 'function') window.updateNav();
      return;
    }
    return baseRender();
  };

  const baseNavigate = window.navigate;
  window.navigate = url => {
    baseNavigate(url);
    if (portalPaths.has(location.pathname) && typeof window.portalBoot === 'function') void window.portalBoot();
  };

  document.addEventListener('click', event => {
    const anchor = event.target.closest('a[href]');
    if (!anchor || anchor.origin !== location.origin) return;
    const path = new URL(anchor.href).pathname;
    if (!path.startsWith('/auth/')) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    location.assign(anchor.href);
  }, true);

  window.addEventListener('popstate', () => {
    if (portalPaths.has(location.pathname) && typeof window.portalBoot === 'function') void window.portalBoot();
  });
})();
