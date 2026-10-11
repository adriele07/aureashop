const test = require('node:test');
const assert = require('node:assert/strict');
const { findProduct } = require('../public/catalog-utils');

const products = [
  { id: 'p1', slug: 'linen-weave-tote', moq: 120 },
  { id: 'p2', slug: 'cinder-ceramic-set', moq: 48 },
];

test('finds a product by the internal ID stored in cart items', () => {
  assert.equal(findProduct(products, 'p1').moq, 120);
});

test('finds a product by the slug used in product-page routes', () => {
  assert.equal(findProduct(products, 'cinder-ceramic-set').id, 'p2');
});

test('returns null rather than crashing for a missing product or catalog', () => {
  assert.equal(findProduct(products, 'missing'), null);
  assert.equal(findProduct(null, 'p1'), null);
  assert.equal(findProduct(products, ''), null);
});
