const test = require('node:test');
const assert = require('node:assert/strict');
const { normalizePosItems } = require('../pos');

test('combines duplicate product lines before any stock check', () => {
  assert.deepEqual(
    normalizePosItems([
      { productId: 'prod-1', qty: 2 },
      { productId: 'prod-2', qty: 1 },
      { productId: 'prod-1', qty: 3 },
    ]),
    [
      { productId: 'prod-1', qty: 5 },
      { productId: 'prod-2', qty: 1 },
    ],
  );
});

test('rejects empty products, invalid quantities and excessive accumulated quantities', () => {
  for (const items of [[], [{ productId: '', qty: 1 }], [{ productId: 'p1', qty: 0 }], [{ productId: 'p1', qty: 60000 }, { productId: 'p1', qty: 50000 }]]) {
    assert.throws(() => normalizePosItems(items), { status: 400 });
  }
});
