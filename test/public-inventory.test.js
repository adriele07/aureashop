const test = require('node:test');
const assert = require('node:assert/strict');
const { sanitizePublicProduct, sanitizePublicCatalog, sanitizePublicCart } = require('../public-inventory');

function sampleProduct(overrides = {}) {
  return {
    id: 'p1',
    name: 'Produto de teste',
    moq: 2,
    stockQty: 10,
    stockReservedQty: 3,
    availableQty: 7,
    lowStockThreshold: 4,
    ...overrides,
  };
}

test('produto público mantém informação de pedido sem revelar estoque exato', () => {
  const product = sanitizePublicProduct(sampleProduct());
  assert.equal(product.name, 'Produto de teste');
  assert.equal(product.inStock, true);
  assert.equal(product.orderable, true);
  for (const field of ['stockQty', 'stockReservedQty', 'availableQty', 'lowStockThreshold']) {
    assert.equal(Object.hasOwn(product, field), false);
  }
});

test('produto sem unidades disponíveis aparece indisponível e não pode ser pedido', () => {
  const product = sanitizePublicProduct(sampleProduct({ stockQty: 5, stockReservedQty: 5, availableQty: 0 }));
  assert.equal(product.inStock, false);
  assert.equal(product.orderable, false);
});

test('catálogo e carrinho sanitizam todos os produtos', () => {
  const catalog = sanitizePublicCatalog({ suppliers: [], products: [sampleProduct()] });
  const cart = sanitizePublicCart({ id: 'cart-1', items: [], products: [sampleProduct()] });
  assert.equal(catalog.products[0].availableQty, undefined);
  assert.equal(cart.products[0].stockQty, undefined);
});
