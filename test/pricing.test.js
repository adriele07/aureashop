const test = require('node:test');
const assert = require('node:assert/strict');
process.env.DATABASE_URL ||= 'mysql://test:test@127.0.0.1:3306/tradevault_test';
const db = require('../db');
const catalog = require('../data/catalog.json');

test('preço unitário respeita a primeira faixa e o MOQ', () => {
  const product = catalog.products.find(item => item.slug === 'linen-weave-tote');
  assert.equal(db.unitPrice(product, 120), 8.4);
  assert.equal(db.unitPrice(product, 499), 8.4);
});

test('preço unitário aplica as faixas de desconto por volume', () => {
  const product = catalog.products.find(item => item.slug === 'linen-weave-tote');
  assert.equal(db.unitPrice(product, 500), 7.1);
  assert.equal(db.unitPrice(product, 1999), 7.1);
  assert.equal(db.unitPrice(product, 2000), 5.85);
});

test('faixas também funcionam com quantidades mínimas específicas', () => {
  const product = catalog.products.find(item => item.slug === 'cinder-ceramic-set');
  assert.equal(db.unitPrice(product, 48), 32.5);
  assert.equal(db.unitPrice(product, 200), 28.9);
  assert.equal(db.unitPrice(product, 800), 24.2);
});
