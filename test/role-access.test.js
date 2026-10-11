const test = require('node:test');
const assert = require('node:assert/strict');
const { ADMIN_ROLES, STORE_ROLES, roleAllowed } = require('../role-access');

test('somente super_admin pode acessar as rotas globais', () => {
  assert.equal(roleAllowed({ role: 'super_admin' }, ADMIN_ROLES), true);
  for (const role of ['store_owner', 'staff', 'customer', 'unknown']) {
    assert.equal(roleAllowed({ role }, ADMIN_ROLES), false);
  }
});

test('somente store_owner e staff podem acessar as rotas operacionais da loja', () => {
  assert.equal(roleAllowed({ role: 'store_owner' }, STORE_ROLES), true);
  assert.equal(roleAllowed({ role: 'staff' }, STORE_ROLES), true);
  for (const role of ['super_admin', 'customer', 'unknown']) {
    assert.equal(roleAllowed({ role }, STORE_ROLES), false);
  }
});

test('usuário ausente não recebe autorização por padrão', () => {
  assert.equal(roleAllowed(null, ADMIN_ROLES), false);
  assert.equal(roleAllowed(undefined, STORE_ROLES), false);
});
