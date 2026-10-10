const http = require('http');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const db = require('./db');
const Stripe = require('stripe');
const jwt = require('jsonwebtoken');
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

const root = __dirname;
const publicDir = path.join(root, 'public');
const port = Number(process.env.PORT || 3000);
const contentTypes = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
};

function send(res, status, body, type = 'text/plain; charset=utf-8', extra = {}) {
  res.writeHead(status, { 'Content-Type': type, 'Cache-Control': 'no-cache', ...extra });
  res.end(body);
}
function sendJson(res, status, data, extra = {}) {
  send(res, status, JSON.stringify(data), 'application/json; charset=utf-8', extra);
}
function parseCookies(req) {
  return Object.fromEntries((req.headers.cookie || '').split(';').filter(Boolean).map(part => {
    const index = part.indexOf('=');
    return [part.slice(0, index).trim(), decodeURIComponent(part.slice(index + 1).trim())];
  }));
}
function publicHttps(req) {
  return req.headers['x-forwarded-proto'] === 'https' || Boolean(req.headers['x-forwarded-host']);
}
async function cartIdFor(req, res) {
  const cookies = parseCookies(req);
  const existing = cookies.tv_cart_id;
  const id = await db.getOrCreateCart(existing);
  if (!existing) {
    const attributes = publicHttps(req) ? 'SameSite=None; Secure' : 'SameSite=Lax';
    res.setHeader('Set-Cookie', `tv_cart_id=${encodeURIComponent(id)}; Path=/; HttpOnly; Max-Age=2592000; ${attributes}`);
  }
  return id;
}
async function readRaw(req) {
  let raw = '';
  for await (const chunk of req) {
    raw += chunk;
    if (raw.length > 512 * 1024) throw Object.assign(new Error('Payload too large'), {status: 413});
  }
  return raw;
}
async function readJson(req) {
  let raw = '';
  for await (const chunk of req) {
    raw += chunk;
    if (raw.length > 256 * 1024) throw Object.assign(new Error('Payload too large'), {status: 413});
  }
  if (!raw) return {};
  try { return JSON.parse(raw); } catch { throw Object.assign(new Error('Invalid JSON'), {status: 400}); }
}
function browserOrigin(req) {
  if (req.headers.origin) return req.headers.origin;
  const forwardedHost = req.headers['x-forwarded-host'];
  const forwardedProto = req.headers['x-forwarded-proto'] || 'https';
  return forwardedHost ? `${forwardedProto}://${forwardedHost}` : `http://127.0.0.1:${port}`;
}

function cookieAttributes(req) { return publicHttps(req) ? 'SameSite=None; Secure' : 'SameSite=Lax'; }
function setCookie(res,name,value,maxAge=2592000,attrs='HttpOnly') { res.setHeader('Set-Cookie', `${name}=${encodeURIComponent(value)}; Path=/; Max-Age=${maxAge}; ${attrs}`); }
function authCookie(req) { return parseCookies(req).webdev_app_session; }
async function currentUser(req) {
  const token=authCookie(req); if (!token || !process.env.MANUS_JWT_SECRET || !process.env.MANUS_PROJECT_ID) return null;
  try { const claims=jwt.verify(token,process.env.MANUS_JWT_SECRET,{algorithms:['HS256']}); if(claims.appId && claims.appId!==process.env.MANUS_PROJECT_ID) return null; const openId=claims.openId||claims.open_id||claims.sub; if(!openId) return null; const user=await db.getUser(openId); return user && !user.blocked ? user : null; } catch { return null; }
}
async function requireUser(req,res) { const user=await currentUser(req); if(!user){sendJson(res,401,{error:'Login necessário',login:'/auth/login'});return null;} return user; }
function requireRole(user,roles,res) { if(!roles.includes(user.role)){sendJson(res,403,{error:'Acesso não autorizado para este perfil'});return false;} return true; }
async function requireStore(req,res,user) { const store=user.role==='super_admin' ? (await db.pool.query("SELECT * FROM stores WHERE id='store-demo' LIMIT 1"))[0][0] : await db.accessibleStore(user.open_id); if(!store){sendJson(res,403,{error:'Nenhuma loja ativa associada a este usuário'});return null;} return store; }
async function oauthIdentity(accessToken) { const response=await fetch(`${process.env.MANUS_OAUTH_API_URL}/webdev.v1.WebDevAuthPublicService/GetUserInfo`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({accessToken})}); if(!response.ok) throw new Error('Identity lookup failed'); const data=await response.json(); return {openId:data.openId||data.open_id,name:data.name||data.email,email:data.email||''}; }

function requireFields(payload, fields) {
  for (const field of fields) if (!String(payload[field] || '').trim()) throw Object.assign(new Error(`Missing field: ${field}`), {status: 400});
}

async function api(req, res, url) {

  if (url.pathname === '/api/auth/me' && req.method === 'GET') { const user=await currentUser(req); return sendJson(res,200,{authenticated:Boolean(user),user}); }
  if (url.pathname === '/api/admin/overview' && req.method === 'GET') { const user=await requireUser(req,res); if(!user||!requireRole(user,['super_admin'],res)) return true; return sendJson(res,200,await db.adminOverview()); }
  if (url.pathname === '/api/admin/stores' && req.method === 'GET') { const user=await requireUser(req,res); if(!user||!requireRole(user,['super_admin'],res)) return true; return sendJson(res,200,await db.listStores()); }
  if (url.pathname === '/api/admin/stores' && req.method === 'POST') { const user=await requireUser(req,res); if(!user||!requireRole(user,['super_admin'],res)) return true; const body=await readJson(req); requireFields(body,['name']); return sendJson(res,201,await db.createStore(body,body.ownerOpenId||null)); }
  const storeStatus=url.pathname.match(/^\/api\/admin\/stores\/([^/]+)$/); if(storeStatus&&req.method==='PATCH'){const user=await requireUser(req,res);if(!user||!requireRole(user,['super_admin'],res))return true;const body=await readJson(req);return sendJson(res,200,await db.setStoreStatus(decodeURIComponent(storeStatus[1]),body.status==='blocked'?'blocked':'active'));}
  if (url.pathname === '/api/admin/users' && req.method === 'GET') { const user=await requireUser(req,res); if(!user||!requireRole(user,['super_admin'],res)) return true; return sendJson(res,200,await db.listUsers()); }
  const userPatch=url.pathname.match(/^\/api\/admin\/users\/([^/]+)$/); if(userPatch&&req.method==='PATCH'){const user=await requireUser(req,res);if(!user||!requireRole(user,['super_admin'],res))return true;const body=await readJson(req);return sendJson(res,200,await db.updateUserRole(decodeURIComponent(userPatch[1]),body.role||'customer',body.blocked));}
  if (url.pathname === '/api/admin/plans' && req.method === 'GET') { const user=await requireUser(req,res); if(!user||!requireRole(user,['super_admin'],res)) return true; const [rows]=await db.pool.query('SELECT * FROM plans WHERE active=1 ORDER BY monthly_price'); return sendJson(res,200,rows); }
  if (url.pathname === '/api/store/overview' && req.method === 'GET') { const user=await requireUser(req,res); if(!user||!requireRole(user,['store_owner','staff','super_admin'],res)) return true; const store=await requireStore(req,res,user); return store&&sendJson(res,200,{store,overview:await db.storeOverview(store.id)}); }
  if (url.pathname === '/api/store/products' && ['GET','POST'].includes(req.method)) { const user=await requireUser(req,res); if(!user||!requireRole(user,['store_owner','staff','super_admin'],res)) return true; const store=await requireStore(req,res,user); if(!store)return true; if(req.method==='GET')return sendJson(res,200,await db.listStoreProducts(store.id)); const body=await readJson(req);requireFields(body,['name']);return sendJson(res,201,await db.saveStoreProduct(store.id,body)); }
  if (url.pathname === '/api/store/inventory' && req.method === 'POST') { const user=await requireUser(req,res);if(!user||!requireRole(user,['store_owner','staff','super_admin'],res))return true;const store=await requireStore(req,res,user);if(!store)return true;const body=await readJson(req);requireFields(body,['productId','type','qty']);return sendJson(res,200,await db.moveInventory(store.id,body,user.open_id)); }
  if (url.pathname === '/api/store/orders' && req.method === 'GET') { const user=await requireUser(req,res);if(!user||!requireRole(user,['store_owner','staff','super_admin'],res))return true;const store=await requireStore(req,res,user);return store&&sendJson(res,200,await db.storeOrders(store.id)); }
  if (url.pathname === '/api/store/cash' && req.method === 'GET') { const user=await requireUser(req,res);if(!user||!requireRole(user,['store_owner','staff','super_admin'],res))return true;const store=await requireStore(req,res,user);return store&&sendJson(res,200,await db.cash(store.id)); }
  if (url.pathname === '/api/store/cash' && req.method === 'POST') { const user=await requireUser(req,res);if(!user||!requireRole(user,['store_owner','staff','super_admin'],res))return true;const store=await requireStore(req,res,user);if(!store)return true;const body=await readJson(req);return sendJson(res,200,body.action==='close'?await db.closeCash(store.id,body.amount):await db.openCash(store.id,user.open_id,body.amount)); }
  if (url.pathname === '/api/store/pos-sales' && req.method === 'POST') { const user=await requireUser(req,res);if(!user||!requireRole(user,['store_owner','staff','super_admin'],res))return true;const store=await requireStore(req,res,user);if(!store)return true;return sendJson(res,201,await db.createPosSale(store.id,user.open_id,await readJson(req))); }
  if (url.pathname === '/api/account/orders' && req.method === 'GET') { const user=await requireUser(req,res);if(!user)return true;return sendJson(res,200,await db.accountOrders(user.open_id,user.email)); }
  if (url.pathname === '/api/stripe/webhook' && req.method === 'POST') {
    const raw = await readRaw(req);
    let event;
    try { event = stripe.webhooks.constructEvent(raw, req.headers['stripe-signature'], process.env.STRIPE_WEBHOOK_SECRET); }
    catch (error) { return sendJson(res, 400, {error: `Webhook signature verification failed: ${error.message}`}); }
    await db.processStripeEvent(event);
    return sendJson(res, 200, {received: true});
  }
  if (url.pathname === '/api/catalog' && req.method === 'GET') return sendJson(res, 200, await db.getCatalog());
  if (url.pathname === '/api/cart' && req.method === 'GET') {
    const id = await cartIdFor(req, res);
    return sendJson(res, 200, await db.getCart(id));
  }
  if (url.pathname === '/api/cart/items' && req.method === 'POST') {
    const body = await readJson(req);
    requireFields(body, ['productId']);
    const id = await cartIdFor(req, res);
    return sendJson(res, 200, await db.addCartItem(id, body.productId, body.qty));
  }
  const cartItemMatch = url.pathname.match(/^\/api\/cart\/items\/([^/]+)$/);
  if (cartItemMatch && ['PATCH', 'DELETE'].includes(req.method)) {
    const id = await cartIdFor(req, res);
    if (req.method === 'DELETE') return sendJson(res, 200, await db.removeCartItem(id, decodeURIComponent(cartItemMatch[1])));
    const body = await readJson(req);
    return sendJson(res, 200, await db.setCartItem(id, decodeURIComponent(cartItemMatch[1]), body.qty));
  }
  if (url.pathname === '/api/checkout/session' && req.method === 'POST') {
    const body = await readJson(req);
    requireFields(body, ['company', 'buyer', 'email', 'location']);
    const id = await cartIdFor(req, res);
    const cart = await db.getCart(id);
    if (!cart.items.length) throw Object.assign(new Error('Cart is empty'), {status: 400});
    const checkoutUser=await currentUser(req); if(checkoutUser) { body.customerOpenId=checkoutUser.open_id; } const order = await db.createOrder(id, body, 'pending_payment');
    const lineItems = cart.products.map((product, index) => ({
      price_data: {
        currency: 'brl',
        product_data: {name: product.name, description: `${product.supplier} · MOQ ${product.moq}`},
        unit_amount: Math.round(db.unitPrice(product, cart.items[index].qty) * 100),
      },
      quantity: cart.items[index].qty,
    }));
    const origin = browserOrigin(req);
    const session = await stripe.checkout.sessions.create({
      mode: 'payment',
      line_items: lineItems,
      customer_email: body.email,
      client_reference_id: order.id,
      allow_promotion_codes: true,
      metadata: {order_id: order.id, order_reference: order.reference, customer_email: body.email, customer_name: body.buyer, company: body.company},
      success_url: `${origin}/checkout?payment=success&reference=${encodeURIComponent(order.reference)}&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${origin}/checkout?payment=cancelled&reference=${encodeURIComponent(order.reference)}`,
    });
    await db.updateOrderPayment(order.id, session.id);
    return sendJson(res, 201, {url: session.url, reference: order.reference});
  }
  if (url.pathname === '/api/orders' && req.method === 'POST') {
    const body = await readJson(req);
    requireFields(body, ['company', 'buyer', 'email', 'location']);
    const id = await cartIdFor(req, res);
    const checkoutUser=await currentUser(req); if(checkoutUser) body.customerOpenId=checkoutUser.open_id; return sendJson(res, 201, await db.createOrder(id, body));
  }
  const orderMatch = url.pathname.match(/^\/api\/orders\/([^/]+)$/);
  if (orderMatch && req.method === 'GET') return sendJson(res, 200, await db.getOrder(decodeURIComponent(orderMatch[1])) || {error: 'Order not found'}, { 'Cache-Control': 'no-store' });
  if (url.pathname === '/api/support' && req.method === 'POST') {
    const body = await readJson(req);
    requireFields(body, ['email', 'message']);
    await db.saveSupport(body.email, body.message);
    return sendJson(res, 201, {ok: true});
  }
  if (url.pathname === '/api/newsletter' && req.method === 'POST') {
    const body = await readJson(req);
    requireFields(body, ['email']);
    await db.saveSubscriber(body.email);
    return sendJson(res, 201, {ok: true});
  }
  return false;
}

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
    if (url.pathname === '/health') return send(res, 200, 'ok');
    if (url.pathname === '/auth/login') {
      const redirectUri=`${browserOrigin(req)}/auth/callback`; const nonce=crypto.randomUUID(); setCookie(res,'tv_oauth_nonce',nonce,600,`HttpOnly; ${cookieAttributes(req)}`); const state=Buffer.from(JSON.stringify({redirectUri,nonce})).toString('base64url'); const portal=process.env.MANUS_OAUTH_PORTAL_URL; if(!portal)return send(res,500,'OAuth não configurado'); return res.writeHead(302,{Location:`${portal}/app-auth?appId=${encodeURIComponent(process.env.MANUS_PROJECT_ID)}&redirectUri=${encodeURIComponent(redirectUri)}&state=${encodeURIComponent(state)}&responseType=code`}).end();
    }
    if (url.pathname === '/auth/callback') {
      const cookies=parseCookies(req); let state; try{state=JSON.parse(Buffer.from(url.searchParams.get('state')||'','base64url').toString());}catch{state=null;} if(!state||state.nonce!==cookies.tv_oauth_nonce)return send(res,400,'OAuth state inválido'); const response=await fetch(`${process.env.MANUS_OAUTH_API_URL}/webdev.v1.WebDevAuthPublicService/ExchangeToken`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({clientId:process.env.MANUS_PROJECT_ID,grantType:'authorization_code',code:url.searchParams.get('code'),redirectUri:state.redirectUri})}); if(!response.ok)return send(res,401,'Não foi possível concluir o login'); const token=(await response.json()).accessToken; const identity=await oauthIdentity(token); await db.upsertUser(identity); setCookie(res,'webdev_app_session',token,2147483647,`HttpOnly; ${cookieAttributes(req)}`); return res.writeHead(302,{Location:'/account'}).end();
    }
    if (url.pathname === '/auth/logout') { setCookie(res,'webdev_app_session','',0,`HttpOnly; ${cookieAttributes(req)}`); return res.writeHead(302,{Location:'/'}).end(); }
    if (url.pathname.startsWith('/api/')) {
      const handled = await api(req, res, url);
      if (!handled && !res.writableEnded) sendJson(res, 404, {error: 'Not found'});
      return;
    }
    if (url.pathname === '/manus-routes.json') {
      const routes = fs.readFileSync(path.join(publicDir, 'manus-routes.json'));
      return send(res, 200, routes, contentTypes['.json']);
    }
    const decodedPath = decodeURIComponent(url.pathname);
    const assetPath = path.normalize(path.join(publicDir, decodedPath));
    if (assetPath.startsWith(publicDir) && path.extname(assetPath) && fs.existsSync(assetPath)) {
      const ext = path.extname(assetPath).toLowerCase();
      return send(res, 200, fs.readFileSync(assetPath), contentTypes[ext] || 'application/octet-stream');
    }
    const index = fs.readFileSync(path.join(publicDir, 'index.html'), 'utf8');
    send(res, 200, index, contentTypes['.html']);
  } catch (error) {
    console.error(error);
    if (!res.headersSent) sendJson(res, error.status || 500, {error: error.message || 'Internal server error'});
  }
});

async function start() {
  await db.ensureSchema();
  server.listen(port, '0.0.0.0', () => console.log(`TradeVault persistent server listening on 0.0.0.0:${port}`));
}
start().catch(error => { console.error('Database startup failed', error); process.exitCode = 1; });
