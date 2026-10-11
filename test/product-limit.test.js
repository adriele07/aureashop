const test = require('node:test');
const assert = require('node:assert/strict');
const { MAX_PRODUCTS_PER_STORE, assertProductCapacity } = require('../product-limit');

test('o limite rígido é de 3.000 produtos por loja', () => {
  assert.equal(MAX_PRODUCTS_PER_STORE, 3000);
  assert.equal(assertProductCapacity(0), true);
  assert.equal(assertProductCapacity(2999), true);
});

test('o produto 3.001 é bloqueado com conflito recuperável', () => {
  assert.throws(() => assertProductCapacity(3000), { status: 409 });
});

test('contagem inválida não libera cadastro por engano', () => {
  for (const count of [-1, 1.5, NaN, Infinity]) {
    assert.throws(() => assertProductCapacity(count), { status: 500 });
  }
});
