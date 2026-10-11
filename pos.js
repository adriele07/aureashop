function normalizePosItems(items) {
  if (!Array.isArray(items) || items.length === 0 || items.length > 50) {
    throw Object.assign(new Error('Venda inválida.'), { status: 400 });
  }

  const quantities = new Map();
  for (const item of items) {
    const productId = String(item?.productId || '').trim();
    const qty = Number(item?.qty);
    if (!productId || productId.length > 40 || !Number.isInteger(qty) || qty <= 0 || qty > 100000) {
      throw Object.assign(new Error('Produto ou quantidade inválida.'), { status: 400 });
    }
    const combined = (quantities.get(productId) || 0) + qty;
    if (combined > 100000) throw Object.assign(new Error('Quantidade acumulada inválida.'), { status: 400 });
    quantities.set(productId, combined);
  }

  return [...quantities.entries()].map(([productId, qty]) => ({ productId, qty }));
}

module.exports = { normalizePosItems };
