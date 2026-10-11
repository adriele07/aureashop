function clean(value, maxLength = 160) {
  return String(value ?? '')
    .replace(/[\u0000-\u001F\u007F]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, maxLength);
}

function formatBRL(value) {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(Number(value || 0));
}

function buildWhatsAppMessage(order) {
  const reference = clean(order?.reference, 40);
  if (!reference) return '';
  const items = Array.isArray(order.items) ? order.items : [];
  const itemLines = items.slice(0, 20).map(item => {
    const name = clean(item.product_name || item.name, 72);
    const qty = Math.max(0, Number(item.qty) || 0);
    const unitPrice = Number(item.unit_price);
    const price = Number.isFinite(unitPrice) && unitPrice >= 0 ? ` — ${formatBRL(unitPrice)} cada` : '';
    return `• ${qty} x ${name}${price}`;
  });
  const productInstructions = [...new Set(items
    .map(item => clean(item.payment_instructions || item.paymentInstructions, 260))
    .filter(Boolean))].slice(0, 5);
  const storeInstructions = clean(order?.store?.paymentInstructions, 500);
  const instructions = productInstructions.length ? productInstructions : (storeInstructions ? [storeInstructions] : []);
  return [
    `Olá! Enviei o pedido ${reference} pelo TradeVault.`,
    clean(order?.company, 120) ? `Empresa: ${clean(order.company, 120)}` : '',
    itemLines.length ? `Itens:\n${itemLines.join('\n')}` : '',
    `Total estimado: ${formatBRL(order.subtotal)}`,
    instructions.length ? `Instruções de pagamento informadas pela loja:\n${instructions.map(value => `• ${value}`).join('\n')}`
      : 'Por favor, confirme a disponibilidade e me envie as instruções para combinar o pagamento manual deste pedido.',
    'Vou conferir os dados diretamente com a loja antes de pagar.',
  ].filter(Boolean).join('\n');
}

function buildWhatsAppUrl(phone, order) {
  const digits = String(phone || '').replace(/\D/g, '');
  if (digits.length < 10 || digits.length > 15) return null;
  const message = buildWhatsAppMessage(order);
  if (!message) return null;
  return `https://wa.me/${digits}?text=${encodeURIComponent(message)}`;
}

module.exports = { buildWhatsAppMessage, buildWhatsAppUrl };
