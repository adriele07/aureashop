const http = require('http');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const jwt = require('jsonwebtoken');
const db = require('./db');
const { setCookie } = require('./http-cookies');
const { ADMIN_ROLES, STORE_ROLES, roleAllowed } = require('./role-access');

const root = __dirname;
const publicDir = path.join(root, 'public');
const port = Number(process.env.PORT || 3000);
const PREVIEW_ORIGIN = process.env.TRADEVAULT_PREVIEW_ORIGIN || 'https://8328-ic9v86ngduvji1ughr2wy-488132de.us4.manus.computer';
const contentTypes = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.avif': 'image/avif',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
};

function send(res, status, body, type = 'text/plain; charset=utf-8', extra = {}) {
  // Do not set X-Frame-Options: Preview is embedded in a cross-site iframe.
  res.writeHead(status, {
    'Content-Type': type,
    'Cache-Control': 'no-cache',
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'strict-origin-when-cross-origin',
    'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
    ...extra,
  });
  res.end(body);
}

function sendJson(res, status, data, extra = {}) {
  send(res, status, JSON.stringify(data), 'application/json; charset=utf-8', extra);
}

function parseCookies(req) {
  return Object.fromEntries((req.headers.cookie || '').split(';').filter(Boolean).map(part => {
    const index = part.indexOf('=');
    if (index < 0) return [part.trim(), ''];
    const key = part.slice(0, index).trim();
    try { return [key, decodeURIComponent(part.slice(index + 1).trim())]; } catch { return [key, '']; }
  }));
}

function firstHeader(value) {
  return String(value || '').split(',')[0].trim();
}

function forwardedOrigin(req) {
  const host = firstHeader(req.headers['x-forwarded-host']) || firstHeader(req.headers.host) || `127.0.0.1:${port}`;
  const protocol = firstHeader(req.headers['x-forwarded-proto']) || (req.socket.encrypted ? 'https' : 'http');
  return `${protocol}://${host}`;
}

function normalizeOrigin(value) {
  try {
    const url = new URL(value);
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.pathname !== '/' || url.search || url.hash) return null;
    return url.origin;
  } catch { return null; }
}

function allowedOrigins(req) {
  const allowed = new Set([normalizeOrigin(PREVIEW_ORIGIN)].filter(Boolean));
  const configured = String(process.env.TRADEVAULT_PUBLIC_ORIGIN || '').split(',').map(normalizeOrigin).filter(Boolean);
  for (const origin of configured) allowed.add(origin);
  const proxyOrigin = normalizeOrigin(forwardedOrigin(req));
  const trustedProxyOrigin = Boolean(proxyOrigin && allowed.has(proxyOrigin));
  if (proxyOrigin) allowed.add(proxyOrigin);
  const incomingOrigin = normalizeOrigin(req.headers.origin || '');
  const containerOrigin = normalizeOrigin(`http://127.0.0.1:${port}`);
  if (trustedProxyOrigin && incomingOrigin === containerOrigin) allowed.add(incomingOrigin);
  return allowed;
}

function requestOrigin(req) {
  const configured = String(process.env.TRADEVAULT_PUBLIC_ORIGIN || '').split(',').map(normalizeOrigin).filter(Boolean);
  if (configured.length === 1) return configured[0];
  for (const candidate of [req.headers.origin, req.headers.referer]) {
    if (!candidate) continue;
    let origin = normalizeOrigin(candidate);
    if (!origin) {
      try { origin = normalizeOrigin(new URL(candidate).origin); } catch { continue; }
    }
    if (origin && allowedOrigins(req).has(origin)) return origin;
  }
  const forwarded = normalizeOrigin(forwardedOrigin(req));
  if (forwarded && !/^(https?:\/\/)?(localhost|127\.0\.0\.1|0\.0\.0\.0)(:\d+)?$/i.test(forwarded)) return forwarded;
  return PREVIEW_ORIGIN;
}

function sameOriginRequest(req) {
  const origin = normalizeOrigin(req.headers.origin || '');
  if (!origin) return true; // Non-browser clients have no Origin header; browser fetches do.
  const allowed = allowedOrigins(req);
  return allowed.has(origin);
}

function publicHttps(req) {
  return requestOrigin(req).startsWith('https:') || firstHeader(req.headers['x-forwarded-proto']) === 'https';
}

function cookieAttributes(req) {
  return publicHttps(req) ? 'SameSite=None; Secure' : 'SameSite=Lax';
}

function authCookie(req) {
  return parseCookies(req).webdev_app_session;
}

async function cartIdFor(req, res) {
  const existing = parseCookies(req).tv_cart_id;
  const valid = typeof existing === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(existing);
  const id = await db.getOrCreateCart(valid ? existing : null);
  if (!valid) setCookie(res, 'tv_cart_id', id, 2592000, `HttpOnly; ${cookieAttributes(req)}`);
  return id;
}

async function readJson(req) {
  let raw = '';
  for await (const chunk of req) {
    raw += chunk;
    if (raw.length > 256 * 1024) throw Object.assign(new Error('O pedido enviado é muito grande.'), { status: 413 });
  }
  if (!raw) return {};
  try {
    const value = JSON.parse(raw);
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Formato inválido');
    return value;
  } catch {
    throw Object.assign(new Error('O corpo da requisição não contém JSON válido.'), { status: 400 });
  }
}

function currentSessionToken(req) {
  const token = authCookie(req);
  if (!token || !process.env.MANUS_JWT_SECRET || !process.env.MANUS_PROJECT_ID) return null;
  try {
    const claims = jwt.verify(token, process.env.MANUS_JWT_SECRET, { algorithms: ['HS256'] });
    if (claims.appId !== process.env.MANUS_PROJECT_ID) return null;
    const openId = claims.openId || claims.open_id || claims.sub;
    if (!openId) return null;
    return { claims, openId };
  } catch { return null; }
}

async function currentUser(req) {
  const session = currentSessionToken(req);
  if (!session) return null;
  const user = await db.getUser(session.openId);
  return user && !user.blocked ? user : null;
}

async function requireUser(req, res) {
  const user = await currentUser(req);
  if (!user) {
    sendJson(res, 401, { error: 'Entre na plataforma para continuar.', login: '/auth/login' }, { 'Cache-Control': 'no-store' });
    return null;
  }
  return user;
}

function requireRole(user, roles, res) {
  if (!roleAllowed(user, roles)) {
    sendJson(res, 403, { error: 'Seu perfil não tem acesso a esta função.' }, { 'Cache-Control': 'no-store' });
    return false;
  }
  return true;
}

async function requireStore(req, res, user) {
  const store = await db.accessibleStore(user.open_id);
  if (!store) {
    sendJson(res, 403, { error: 'Nenhuma loja ativa está vinculada a este usuário.' }, { 'Cache-Control': 'no-store' });
    return null;
  }
  return store;
}

async function oauthIdentity(accessToken) {
  const endpoint = process.env.MANUS_OAUTH_API_URL;
  if (!endpoint) throw new Error('Autenticação Manus não está configurada.');
  const response = await fetch(`${endpoint}/webdev.v1.WebDevAuthPublicService/GetUserInfo`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ accessToken }),
  });
  if (!response.ok) throw new Error('Não foi possível identificar a conta autenticada.');
  const data = await response.json();
  return { openId: data.openId || data.open_id, name: data.name || data.email || '', email: data.email || '' };
}

function requireFields(payload, fields) {
  for (const field of fields) {
    if (typeof payload[field] !== 'string' || !payload[field].trim()) {
      throw Object.assign(new Error(`Preencha o campo obrigatório: ${field}.`), { status: 400 });
    }
  }
}

function validateEmail(value) {
  const email = String(value || '').trim();
  if (email.length > 220 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw Object.assign(new Error('Informe um e-mail válido.'), { status: 400 });
  }
  return email;
}

async function adminUser(req, res) {
  const user = await requireUser(req, res);
  return user && requireRole(user, ADMIN_ROLES, res) ? user : null;
}

async function storeUser(req, res) {
  const user = await requireUser(req, res);
  return user && requireRole(user, STORE_ROLES, res) ? user : null;
}

async function api(req, res, url) {
  if (url.pathname === '/api/auth/me' && req.method === 'GET') {
    const user = await currentUser(req);
    return sendJson(res, 200, { authenticated: Boolean(user), user }, { 'Cache-Control': 'no-store' });
  }

  if (url.pathname === '/api/catalog' && req.method === 'GET') return sendJson(res, 200, await db.getCatalog());

  if (url.pathname === '/api/admin/overview' && req.method === 'GET') {
    const user = await adminUser(req, res);
    if (!user) return true;
    return sendJson(res, 200, await db.adminOverview(), { 'Cache-Control': 'no-store' });
  }
  if (url.pathname === '/api/admin/reports' && req.method === 'GET') {
    const user = await adminUser(req, res);
    if (!user) return true;
    return sendJson(res, 200, await db.adminReports(), { 'Cache-Control': 'no-store' });
  }
  if (url.pathname === '/api/admin/settings' && req.method === 'GET') {
    const user = await adminUser(req, res);
    if (!user) return true;
    return sendJson(res, 200, await db.getSystemSettings(), { 'Cache-Control': 'no-store' });
  }
  if (url.pathname === '/api/admin/settings' && req.method === 'PATCH') {
    const user = await adminUser(req, res);
    if (!user) return true;
    return sendJson(res, 200, await db.updateSystemSettings(await readJson(req)), { 'Cache-Control': 'no-store' });
  }
  if (url.pathname === '/api/admin/stores' && req.method === 'GET') {
    const user = await adminUser(req, res);
    if (!user) return true;
    return sendJson(res, 200, await db.listStores(), { 'Cache-Control': 'no-store' });
  }
  if (url.pathname === '/api/admin/stores' && req.method === 'POST') {
    const user = await adminUser(req, res);
    if (!user) return true;
    const body = await readJson(req);
    requireFields(body, ['name']);
    return sendJson(res, 201, await db.createStore(body, body.ownerOpenId || null), { 'Cache-Control': 'no-store' });
  }
  const storePlan = url.pathname.match(/^\/api\/admin\/stores\/([^/]+)\/plan$/);
  if (storePlan && req.method === 'PATCH') {
    const user = await adminUser(req, res);
    if (!user) return true;
    const body = await readJson(req);
    requireFields(body, ['planId']);
    return sendJson(res, 200, await db.assignStorePlan(decodeURIComponent(storePlan[1]), body.planId), { 'Cache-Control': 'no-store' });
  }
  const storeMembers = url.pathname.match(/^\/api\/admin\/stores\/([^/]+)\/members$/);
  if (storeMembers && req.method === 'POST') {
    const user = await adminUser(req, res);
    if (!user) return true;
    const body = await readJson(req);
    requireFields(body, ['openId', 'role']);
    return sendJson(res, 200, await db.assignStoreMember(decodeURIComponent(storeMembers[1]), body.openId, body.role), { 'Cache-Control': 'no-store' });
  }
  const storeStatus = url.pathname.match(/^\/api\/admin\/stores\/([^/]+)$/);
  if (storeStatus && req.method === 'PATCH') {
    const user = await adminUser(req, res);
    if (!user) return true;
    const body = await readJson(req);
    if (!['active', 'blocked'].includes(body.status)) throw Object.assign(new Error('Status de loja inválido.'), { status: 400 });
    return sendJson(res, 200, await db.setStoreStatus(decodeURIComponent(storeStatus[1]), body.status), { 'Cache-Control': 'no-store' });
  }
  if (url.pathname === '/api/admin/users' && req.method === 'GET') {
    const user = await adminUser(req, res);
    if (!user) return true;
    return sendJson(res, 200, await db.listUsers(), { 'Cache-Control': 'no-store' });
  }
  const userPatch = url.pathname.match(/^\/api\/admin\/users\/([^/]+)$/);
  if (userPatch && req.method === 'PATCH') {
    const user = await adminUser(req, res);
    if (!user) return true;
    const body = await readJson(req);
    const target = decodeURIComponent(userPatch[1]);
    if (target === user.open_id && body.role && body.role !== 'super_admin') throw Object.assign(new Error('Não é permitido remover o próprio perfil Super Admin.'), { status: 400 });
    return sendJson(res, 200, await db.updateUserRole(target, body.role, typeof body.blocked === 'boolean' ? body.blocked : undefined), { 'Cache-Control': 'no-store' });
  }
  if (url.pathname === '/api/admin/plans' && req.method === 'GET') {
    const user = await adminUser(req, res);
    if (!user) return true;
    return sendJson(res, 200, await db.listPlans(), { 'Cache-Control': 'no-store' });
  }
  if (url.pathname === '/api/admin/plans' && req.method === 'POST') {
    const user = await adminUser(req, res);
    if (!user) return true;
    return sendJson(res, 201, await db.createPlan(await readJson(req)), { 'Cache-Control': 'no-store' });
  }
  const planPatch = url.pathname.match(/^\/api\/admin\/plans\/([^/]+)$/);
  if (planPatch && req.method === 'PATCH') {
    const user = await adminUser(req, res);
    if (!user) return true;
    return sendJson(res, 200, await db.updatePlan(decodeURIComponent(planPatch[1]), await readJson(req)), { 'Cache-Control': 'no-store' });
  }

  if (url.pathname === '/api/store/overview' && req.method === 'GET') {
    const user = await storeUser(req, res);
    if (!user) return true;
    const store = await requireStore(req, res, user);
    return store && sendJson(res, 200, { store, overview: await db.storeOverview(store.id) }, { 'Cache-Control': 'no-store' });
  }
  if (url.pathname === '/api/store/settings' && req.method === 'GET') {
    const user = await storeUser(req, res);
    if (!user) return true;
    const store = await requireStore(req, res, user);
    return store && sendJson(res, 200, await db.storeSettings(store.id), { 'Cache-Control': 'no-store' });
  }
  if (url.pathname === '/api/store/settings' && req.method === 'PATCH') {
    const user = await storeUser(req, res);
    if (!user) return true;
    const store = await requireStore(req, res, user);
    if (!store) return true;
    return sendJson(res, 200, await db.updateStoreSettings(store.id, await readJson(req)), { 'Cache-Control': 'no-store' });
  }
  if (url.pathname === '/api/store/products' && ['GET', 'POST', 'PATCH'].includes(req.method)) {
    const user = await storeUser(req, res);
    if (!user) return true;
    const store = await requireStore(req, res, user);
    if (!store) return true;
    if (req.method === 'GET') return sendJson(res, 200, await db.listStoreProducts(store.id), { 'Cache-Control': 'no-store' });
    const body = await readJson(req);
    requireFields(body, ['name', 'supplierId']);
    if (req.method === 'PATCH') requireFields(body, ['id']);
    return sendJson(res, req.method === 'POST' ? 201 : 200, await db.saveStoreProduct(store.id, body), { 'Cache-Control': 'no-store' });
  }
  if (url.pathname === '/api/store/suppliers' && ['GET', 'POST'].includes(req.method)) {
    const user = await storeUser(req, res);
    if (!user) return true;
    const store = await requireStore(req, res, user);
    if (!store) return true;
    if (req.method === 'GET') return sendJson(res, 200, await db.listStoreSuppliers(store.id), { 'Cache-Control': 'no-store' });
    return sendJson(res, 201, await db.saveStoreSupplier(store.id, await readJson(req)), { 'Cache-Control': 'no-store' });
  }
  const supplierPatch = url.pathname.match(/^\/api\/store\/suppliers\/([^/]+)$/);
  if (supplierPatch && req.method === 'PATCH') {
    const user = await storeUser(req, res);
    if (!user) return true;
    const store = await requireStore(req, res, user);
    if (!store) return true;
    const body = await readJson(req);
    if (typeof body.active === 'boolean' && Object.keys(body).length === 1) {
      return sendJson(res, 200, await db.setStoreSupplierStatus(store.id, decodeURIComponent(supplierPatch[1]), body.active), { 'Cache-Control': 'no-store' });
    }
    body.id = decodeURIComponent(supplierPatch[1]);
    return sendJson(res, 200, await db.saveStoreSupplier(store.id, body), { 'Cache-Control': 'no-store' });
  }
  if (url.pathname === '/api/store/inventory' && req.method === 'POST') {
    const user = await storeUser(req, res);
    if (!user) return true;
    const store = await requireStore(req, res, user);
    if (!store) return true;
    const body = await readJson(req);
    requireFields(body, ['productId', 'type']);
    return sendJson(res, 200, await db.moveInventory(store.id, body, user.open_id), { 'Cache-Control': 'no-store' });
  }
  if (url.pathname === '/api/store/orders' && req.method === 'GET') {
    const user = await storeUser(req, res);
    if (!user) return true;
    const store = await requireStore(req, res, user);
    return store && sendJson(res, 200, await db.storeOrders(store.id), { 'Cache-Control': 'no-store' });
  }
  const orderPayment = url.pathname.match(/^\/api\/store\/orders\/([^/]+)\/payment$/);
  if (orderPayment && req.method === 'PATCH') {
    const user = await storeUser(req, res);
    if (!user) return true;
    const store = await requireStore(req, res, user);
    if (!store) return true;
    const body = await readJson(req);
    if (body.paymentStatus !== 'paid') throw Object.assign(new Error('A loja deve confirmar somente o recebimento manual já verificado.'), { status: 400 });
    return sendJson(res, 200, await db.confirmManualPayment(store.id, decodeURIComponent(orderPayment[1])), { 'Cache-Control': 'no-store' });
  }
  const storeOrder = url.pathname.match(/^\/api\/store\/orders\/([^/]+)$/);
  if (storeOrder && req.method === 'PATCH') {
    const user = await storeUser(req, res);
    if (!user) return true;
    const store = await requireStore(req, res, user);
    if (!store) return true;
    const body = await readJson(req);
    requireFields(body, ['status']);
    if (body.status === 'cancelled') {
      return sendJson(res, 200, await db.cancelManualOrder(store.id, decodeURIComponent(storeOrder[1])), { 'Cache-Control': 'no-store' });
    }
    return sendJson(res, 200, await db.updateStoreOrderStatus(store.id, decodeURIComponent(storeOrder[1]), body.status), { 'Cache-Control': 'no-store' });
  }
  if (url.pathname === '/api/store/cash' && req.method === 'GET') {
    const user = await storeUser(req, res);
    if (!user) return true;
    const store = await requireStore(req, res, user);
    return store && sendJson(res, 200, await db.cash(store.id), { 'Cache-Control': 'no-store' });
  }
  if (url.pathname === '/api/store/cash' && req.method === 'POST') {
    const user = await storeUser(req, res);
    if (!user) return true;
    const store = await requireStore(req, res, user);
    if (!store) return true;
    const body = await readJson(req);
    if (!['open', 'close'].includes(body.action)) throw Object.assign(new Error('Ação de caixa inválida.'), { status: 400 });
    const result = body.action === 'close'
      ? await db.closeCash(store.id, body.amount)
      : await db.openCash(store.id, user.open_id, body.amount);
    return sendJson(res, 200, result, { 'Cache-Control': 'no-store' });
  }
  if (url.pathname === '/api/store/pos-sales' && ['GET', 'POST'].includes(req.method)) {
    const user = await storeUser(req, res);
    if (!user) return true;
    const store = await requireStore(req, res, user);
    if (!store) return true;
    if (req.method === 'GET') return sendJson(res, 200, await db.listPosSales(store.id), { 'Cache-Control': 'no-store' });
    return sendJson(res, 201, await db.createPosSale(store.id, user.open_id, await readJson(req)), { 'Cache-Control': 'no-store' });
  }

  if (url.pathname === '/api/account/orders' && req.method === 'GET') {
    const user = await requireUser(req, res);
    if (!user) return true;
    return sendJson(res, 200, await db.accountOrders(user.open_id), { 'Cache-Control': 'no-store' });
  }

  if (url.pathname === '/api/cart' && req.method === 'GET') {
    const id = await cartIdFor(req, res);
    return sendJson(res, 200, await db.getCart(id), { 'Cache-Control': 'no-store' });
  }
  if (url.pathname === '/api/cart/items' && req.method === 'POST') {
    const body = await readJson(req);
    requireFields(body, ['productId']);
    const id = await cartIdFor(req, res);
    return sendJson(res, 200, await db.addCartItem(id, body.productId, body.qty), { 'Cache-Control': 'no-store' });
  }
  const cartItem = url.pathname.match(/^\/api\/cart\/items\/([^/]+)$/);
  if (cartItem && ['PATCH', 'DELETE'].includes(req.method)) {
    const id = await cartIdFor(req, res);
    if (req.method === 'DELETE') return sendJson(res, 200, await db.removeCartItem(id, decodeURIComponent(cartItem[1])), { 'Cache-Control': 'no-store' });
    const body = await readJson(req);
    return sendJson(res, 200, await db.setCartItem(id, decodeURIComponent(cartItem[1]), body.qty), { 'Cache-Control': 'no-store' });
  }

  if (url.pathname === '/api/orders' && req.method === 'POST') {
    const checkoutUser = await currentUser(req);
    if (!checkoutUser) return sendJson(res, 401, { error: 'Entre na sua conta Manus para salvar e acompanhar pedidos com segurança.' }, { 'Cache-Control': 'no-store' });
    const body = await readJson(req);
    requireFields(body, ['company', 'buyer', 'email', 'location']);
    body.email = validateEmail(body.email);
    const id = await cartIdFor(req, res);
    body.customerOpenId = checkoutUser.open_id;
    const order = await db.createOrder(id, body);
    const paymentInstructions = [...new Set(order.items.map(item => item.payment_instructions).filter(Boolean))];
    return sendJson(res, 201, {
      order: { id: order.id, reference: order.reference, status: order.status, paymentStatus: order.paymentStatus, paymentMethod: order.paymentMethod, subtotal: order.subtotal, items: order.items },
      store: order.store,
      paymentInstructions,
      whatsappUrl: buildWhatsAppUrl(order.store.whatsappPhone, order),
      whatsappRequiresUserAction: true,
    }, { 'Cache-Control': 'no-store' });
  }
  const orderLookup = url.pathname.match(/^\/api\/orders\/([^/]+)$/);
  if (orderLookup && req.method === 'GET') {
    const user = await requireUser(req, res);
    if (!user) return true;
    const order = await db.getOrder(decodeURIComponent(orderLookup[1]));
    if (!order || order.customer_open_id !== user.open_id) {
      return sendJson(res, 404, { error: 'Pedido não encontrado.' }, { 'Cache-Control': 'no-store' });
    }
    return sendJson(res, 200, order, { 'Cache-Control': 'no-store' });
  }

  if (url.pathname === '/api/support' && req.method === 'POST') {
    const body = await readJson(req);
    requireFields(body, ['email', 'message']);
    await db.saveSupport(validateEmail(body.email), body.message);
    return sendJson(res, 201, { ok: true });
  }
  if (url.pathname === '/api/newsletter' && req.method === 'POST') {
    const body = await readJson(req);
    requireFields(body, ['email']);
    await db.saveSubscriber(validateEmail(body.email));
    return sendJson(res, 201, { ok: true });
  }
  return false;
}

const server = http.createServer(async (req, res) => {
  let url;
  try {
    url = new URL(req.url, 'http://localhost');
    if (url.pathname === '/health') return send(res, 200, 'ok');
    if (url.pathname === '/auth/login' && req.method === 'GET') {
      const redirectUri = `${requestOrigin(req)}/auth/callback`;
      const nonce = crypto.randomBytes(24).toString('base64url');
      setCookie(res, 'tv_oauth_nonce', nonce, 600, `HttpOnly; ${cookieAttributes(req)}`);
      const state = Buffer.from(JSON.stringify({ redirectUri, nonce })).toString('base64url');
      const portal = process.env.MANUS_OAUTH_PORTAL_URL;
      if (!portal || !process.env.MANUS_PROJECT_ID) return send(res, 503, 'Login ainda não está configurado.');
      const location = `${portal}/app-auth?appId=${encodeURIComponent(process.env.MANUS_PROJECT_ID)}&redirectUri=${encodeURIComponent(redirectUri)}&state=${encodeURIComponent(state)}&responseType=code`;
      return res.writeHead(302, { Location: location, 'Cache-Control': 'no-store' }).end();
    }
    if (url.pathname === '/auth/callback' && req.method === 'GET') {
      const cookies = parseCookies(req);
      let state;
      try { state = JSON.parse(Buffer.from(url.searchParams.get('state') || '', 'base64url').toString()); } catch { state = null; }
      const expectedRedirectUri = `${requestOrigin(req)}/auth/callback`;
      if (!state || typeof state.nonce !== 'string' || state.nonce !== cookies.tv_oauth_nonce || state.redirectUri !== expectedRedirectUri) {
        setCookie(res, 'tv_oauth_nonce', '', 0, `HttpOnly; ${cookieAttributes(req)}`);
        return send(res, 400, 'Estado OAuth inválido. Inicie o login novamente.');
      }
      const endpoint = process.env.MANUS_OAUTH_API_URL;
      if (!endpoint) return send(res, 503, 'Autenticação Manus não está configurada.');
      const response = await fetch(`${endpoint}/webdev.v1.WebDevAuthPublicService/ExchangeToken`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ clientId: process.env.MANUS_PROJECT_ID, grantType: 'authorization_code', code: url.searchParams.get('code'), redirectUri: state.redirectUri }),
      });
      if (!response.ok) return send(res, 401, 'Não foi possível concluir o login.');
      const token = (await response.json()).accessToken;
      if (!token) return send(res, 401, 'A autenticação não retornou uma sessão válida.');
      await db.upsertUser(await oauthIdentity(token));
      setCookie(res, 'webdev_app_session', token, 2147483647, `HttpOnly; ${cookieAttributes(req)}`);
      setCookie(res, 'tv_oauth_nonce', '', 0, `HttpOnly; ${cookieAttributes(req)}`);
      return res.writeHead(302, { Location: '/account', 'Cache-Control': 'no-store' }).end();
    }
    if (url.pathname === '/auth/logout' && req.method === 'GET') {
      setCookie(res, 'webdev_app_session', '', 0, `HttpOnly; ${cookieAttributes(req)}`);
      return res.writeHead(302, { Location: '/', 'Cache-Control': 'no-store' }).end();
    }

    if (url.pathname.startsWith('/api/')) {
      if (!['GET', 'HEAD', 'OPTIONS'].includes(req.method) && !sameOriginRequest(req)) {
        return sendJson(res, 403, { error: 'Origem da requisição não autorizada.' });
      }
      const handled = await api(req, res, url);
      if (!handled && !res.writableEnded) sendJson(res, 404, { error: 'Recurso não encontrado.' });
      return;
    }

    if (url.pathname === '/manus-routes.json' && req.method === 'GET') {
      const routes = fs.readFileSync(path.join(publicDir, 'manus-routes.json'));
      return send(res, 200, routes, contentTypes['.json']);
    }

    let decodedPath;
    try { decodedPath = decodeURIComponent(url.pathname); } catch { return send(res, 400, 'Caminho inválido.'); }
    const assetPath = path.resolve(publicDir, `.${decodedPath}`);
    const relative = path.relative(publicDir, assetPath);
    const safePath = relative && !relative.startsWith(`..${path.sep}`) && relative !== '..' && !path.isAbsolute(relative);
    if (safePath && path.extname(assetPath) && fs.existsSync(assetPath) && fs.statSync(assetPath).isFile()) {
      const ext = path.extname(assetPath).toLowerCase();
      return send(res, 200, fs.readFileSync(assetPath), contentTypes[ext] || 'application/octet-stream');
    }
    const index = fs.readFileSync(path.join(publicDir, 'index.html'), 'utf8');
    return send(res, 200, index, contentTypes['.html']);
  } catch (error) {
    console.error('TradeVault request failed', { path: url?.pathname || 'unknown', status: error.status || 500, code: error.code || 'application_error' });
    if (!res.headersSent) sendJson(res, error.status || 500, { error: error.status && error.status < 500 ? error.message : 'Erro interno. Tente novamente.' }, { 'Cache-Control': 'no-store' });
    else res.destroy();
  }
});

async function start() {
  await db.ensureSchema();
  server.listen(port, '0.0.0.0', () => console.log(`TradeVault listening on 0.0.0.0:${port}`));
}

start().catch(error => {
  console.error('TradeVault startup failed', { code: error.code || 'startup_error' });
  process.exitCode = 1;
});
