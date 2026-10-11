const test = require('node:test');
const assert = require('node:assert/strict');
const { buildWhatsAppMessage, buildWhatsAppUrl } = require('../whatsapp');

const order = {
  reference: 'TV-20261010-A1B2C3',
  company: 'Loja Teste',
  subtotal: 289.9,
  items: [
    { product_name: 'Caderno azul', qty: 2, unit_price: 119.95, payment_instructions: 'Transferência somente para a conta confirmada no WhatsApp.' },
    { product_name: 'Bandeja cobre', qty: 1, unit_price: 50, payment_instructions: 'Transferência somente para a conta confirmada no WhatsApp.' },
  ],
};

test('creates a click-to-chat link with phone, order, prices and product instructions', () => {
  const link = buildWhatsAppUrl('+55 (11) 99999-0000', order);
  assert.ok(link.startsWith('https://wa.me/5511999990000?text='));
  const message = decodeURIComponent(link.split('?text=')[1]);
  assert.match(message, /TV-20261010-A1B2C3/);
  assert.match(message, /2 x Caderno azul/);
  assert.match(message, /R\$\s*289,90/);
  assert.match(message, /Instruções de pagamento informadas pela loja/);
  assert.match(message, /Transferência somente para a conta confirmada no WhatsApp/);
  assert.match(message, /conferir os dados diretamente com a loja antes de pagar/);
});

test('uses store instructions when products do not have their own instructions', () => {
  const message = buildWhatsAppMessage({ ...order, items: [{ product_name: 'Caderno', qty: 1 }], store: { paymentInstructions: 'Peça os dados de pagamento ao vendedor.' } });
  assert.match(message, /Peça os dados de pagamento ao vendedor/);
});

test('does not create a link for missing or malformed phone numbers', () => {
  assert.equal(buildWhatsAppUrl('', order), null);
  assert.equal(buildWhatsAppUrl('12345', order), null);
  assert.equal(buildWhatsAppUrl('1234567890123456', order), null);
});

test('does not create a message when the order has no reference', () => {
  assert.equal(buildWhatsAppMessage({ subtotal: 10, items: [] }), '');
  assert.equal(buildWhatsAppUrl('+55 11 99999-0000', { subtotal: 10, items: [] }), null);
});

test('strips control characters from user-entered message fields', () => {
  const message = buildWhatsAppMessage({ ...order, company: 'Empresa\nFalsa\u0000' });
  assert.doesNotMatch(message, /\u0000/);
  assert.doesNotMatch(message, /Empresa\nFalsa/);
});
