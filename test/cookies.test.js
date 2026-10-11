const test = require('node:test');
const assert = require('node:assert/strict');
const { setCookie } = require('../http-cookies');

function responseStub() {
  const headers = new Map();
  return {
    getHeader: name => headers.get(name),
    setHeader: (name, value) => headers.set(name, value),
    headers,
  };
}

test('preserves the session cookie when the OAuth nonce is cleared in the same response', () => {
  const res = responseStub();
  setCookie(res, 'webdev_app_session', 'jwt-token', 2147483647, 'HttpOnly; SameSite=None; Secure');
  setCookie(res, 'tv_oauth_nonce', '', 0, 'HttpOnly; SameSite=None; Secure');

  const cookies = res.getHeader('Set-Cookie');
  assert.equal(cookies.length, 2);
  assert.match(cookies[0], /^webdev_app_session=jwt-token;/);
  assert.match(cookies[0], /SameSite=None; Secure/);
  assert.match(cookies[1], /^tv_oauth_nonce=; Path=\/; Max-Age=0;/);
});

test('replaces a cookie with the same name without dropping unrelated cookies', () => {
  const res = responseStub();
  setCookie(res, 'tv_cart_id', 'one');
  setCookie(res, 'webdev_app_session', 'jwt');
  setCookie(res, 'tv_cart_id', 'two');
  const cookies = res.getHeader('Set-Cookie');
  assert.equal(cookies.length, 2);
  assert.equal(cookies.filter(value => value.startsWith('tv_cart_id=')).length, 1);
  assert.ok(cookies.some(value => value.startsWith('tv_cart_id=two;')));
  assert.ok(cookies.some(value => value.startsWith('webdev_app_session=jwt;')));
});
