const mysql = require('mysql2/promise');
const crypto = require('crypto');
const catalog = require('./data/catalog.json');

const databaseUrl = process.env.DATABASE_URL || process.env.DRIZZLE_DATABASE_URL;
if (!databaseUrl) throw new Error('DATABASE_URL is required when database persistence is enabled');

const pool = mysql.createPool({
  uri: databaseUrl,
  waitForConnections: true,
  connectionLimit: 8,
  queueLimit: 0,
  enableKeepAlive: true,
});

const statements = [

  `CREATE TABLE IF NOT EXISTS plans (
    id VARCHAR(40) PRIMARY KEY,
    name VARCHAR(80) NOT NULL,
    monthly_price DECIMAL(10,2) NOT NULL DEFAULT 0,
    limits_json JSON NOT NULL,
    active TINYINT(1) NOT NULL DEFAULT 1
  ) ENGINE=InnoDB`,
  `CREATE TABLE IF NOT EXISTS stores (
    id VARCHAR(40) PRIMARY KEY,
    name VARCHAR(180) NOT NULL,
    slug VARCHAR(180) NOT NULL UNIQUE,
    status VARCHAR(20) NOT NULL DEFAULT 'active',
    plan_id VARCHAR(40) NOT NULL DEFAULT 'starter',
    owner_open_id VARCHAR(180),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_stores_status (status)
  ) ENGINE=InnoDB`,
  `CREATE TABLE IF NOT EXISTS app_users (
    open_id VARCHAR(180) PRIMARY KEY,
    name VARCHAR(180) NOT NULL,
    email VARCHAR(220) NOT NULL,
    role VARCHAR(30) NOT NULL DEFAULT 'customer',
    blocked TINYINT(1) NOT NULL DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    last_seen_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  ) ENGINE=InnoDB`,
  `CREATE TABLE IF NOT EXISTS admin_allowlist (
    identifier VARCHAR(240) PRIMARY KEY,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  ) ENGINE=InnoDB`,
  `CREATE TABLE IF NOT EXISTS store_members (
    store_id VARCHAR(40) NOT NULL,
    open_id VARCHAR(180) NOT NULL,
    role VARCHAR(30) NOT NULL DEFAULT 'staff',
    PRIMARY KEY (store_id, open_id),
    CONSTRAINT fk_member_store FOREIGN KEY (store_id) REFERENCES stores(id) ON DELETE CASCADE,
    CONSTRAINT fk_member_user FOREIGN KEY (open_id) REFERENCES app_users(open_id) ON DELETE CASCADE
  ) ENGINE=InnoDB`,
  `CREATE TABLE IF NOT EXISTS inventory_movements (
    id BIGINT PRIMARY KEY AUTO_INCREMENT,
    store_id VARCHAR(40) NOT NULL,
    product_id VARCHAR(40) NOT NULL,
    type VARCHAR(20) NOT NULL,
    qty INT NOT NULL,
    note VARCHAR(255),
    created_by VARCHAR(180),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_inventory_store (store_id, created_at)
  ) ENGINE=InnoDB`,
  `CREATE TABLE IF NOT EXISTS cash_sessions (
    id BIGINT PRIMARY KEY AUTO_INCREMENT,
    store_id VARCHAR(40) NOT NULL,
    opened_by VARCHAR(180) NOT NULL,
    opening_amount DECIMAL(12,2) NOT NULL DEFAULT 0,
    closing_amount DECIMAL(12,2),
    status VARCHAR(20) NOT NULL DEFAULT 'open',
    opened_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    closed_at TIMESTAMP NULL
  ) ENGINE=InnoDB`,
  `CREATE TABLE IF NOT EXISTS pos_sales (
    id CHAR(36) PRIMARY KEY,
    store_id VARCHAR(40) NOT NULL,
    cash_session_id BIGINT,
    customer_open_id VARCHAR(180),
    total DECIMAL(12,2) NOT NULL,
    payment_method VARCHAR(40) NOT NULL,
    created_by VARCHAR(180),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  ) ENGINE=InnoDB`,
  `CREATE TABLE IF NOT EXISTS pos_sale_items (
    id BIGINT PRIMARY KEY AUTO_INCREMENT,
    sale_id CHAR(36) NOT NULL,
    product_id VARCHAR(40) NOT NULL,
    qty INT NOT NULL,
    unit_price DECIMAL(10,2) NOT NULL,
    CONSTRAINT fk_pos_item_sale FOREIGN KEY (sale_id) REFERENCES pos_sales(id) ON DELETE CASCADE
  ) ENGINE=InnoDB`,
  `CREATE TABLE IF NOT EXISTS suppliers (
    id VARCHAR(40) PRIMARY KEY,
    slug VARCHAR(160) NOT NULL UNIQUE,
    name VARCHAR(180) NOT NULL,
    mark VARCHAR(12) NOT NULL,
    location VARCHAR(180) NOT NULL,
    specialty VARCHAR(180) NOT NULL,
    since VARCHAR(8) NOT NULL,
    description TEXT NOT NULL,
    tags_json JSON NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  ) ENGINE=InnoDB`,
  `CREATE TABLE IF NOT EXISTS products (
    id VARCHAR(40) PRIMARY KEY,
    slug VARCHAR(160) NOT NULL UNIQUE,
    name VARCHAR(180) NOT NULL,
    supplier_id VARCHAR(40) NOT NULL,
    supplier_name VARCHAR(180) NOT NULL,
    category VARCHAR(100) NOT NULL,
    moq INT NOT NULL,
    price DECIMAL(10,2) NOT NULL,
    unit VARCHAR(24) NOT NULL,
    image TEXT NOT NULL,
    badge VARCHAR(80) NOT NULL,
    description TEXT NOT NULL,
    tiers_json JSON NOT NULL,
    lead_time VARCHAR(80) NOT NULL,
    terms VARCHAR(80) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_products_category (category),
    INDEX idx_products_supplier (supplier_id),
    CONSTRAINT fk_products_supplier FOREIGN KEY (supplier_id) REFERENCES suppliers(id)
  ) ENGINE=InnoDB`,
  `CREATE TABLE IF NOT EXISTS carts (
    id CHAR(36) PRIMARY KEY,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
  ) ENGINE=InnoDB`,
  `CREATE TABLE IF NOT EXISTS cart_items (
    cart_id CHAR(36) NOT NULL,
    product_id VARCHAR(40) NOT NULL,
    qty INT NOT NULL,
    PRIMARY KEY (cart_id, product_id),
    CONSTRAINT fk_cart_items_cart FOREIGN KEY (cart_id) REFERENCES carts(id) ON DELETE CASCADE,
    CONSTRAINT fk_cart_items_product FOREIGN KEY (product_id) REFERENCES products(id)
  ) ENGINE=InnoDB`,
  `CREATE TABLE IF NOT EXISTS orders (
    id CHAR(36) PRIMARY KEY,
    reference VARCHAR(40) NOT NULL UNIQUE,
    company VARCHAR(180) NOT NULL,
    buyer_name VARCHAR(180) NOT NULL,
    email VARCHAR(220) NOT NULL,
    location VARCHAR(180) NOT NULL,
    po_number VARCHAR(100),
    note TEXT,
    status VARCHAR(40) NOT NULL DEFAULT 'pending_review',
    payment_status VARCHAR(40) NOT NULL DEFAULT 'unpaid',
    stripe_session_id VARCHAR(255),
    payment_intent_id VARCHAR(255),
    subtotal DECIMAL(12,2) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_orders_email (email),
    INDEX idx_orders_created (created_at)
  ) ENGINE=InnoDB`,
  `CREATE TABLE IF NOT EXISTS stripe_events (
    event_id VARCHAR(255) PRIMARY KEY,
    event_type VARCHAR(120) NOT NULL,
    received_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  ) ENGINE=InnoDB`,
  `CREATE TABLE IF NOT EXISTS order_items (
    id BIGINT PRIMARY KEY AUTO_INCREMENT,
    order_id CHAR(36) NOT NULL,
    product_id VARCHAR(40) NOT NULL,
    product_name VARCHAR(180) NOT NULL,
    unit_price DECIMAL(10,2) NOT NULL,
    qty INT NOT NULL,
    CONSTRAINT fk_order_items_order FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE
  ) ENGINE=InnoDB`,
  `CREATE TABLE IF NOT EXISTS support_requests (
    id BIGINT PRIMARY KEY AUTO_INCREMENT,
    email VARCHAR(220) NOT NULL,
    message TEXT NOT NULL,
    status VARCHAR(40) NOT NULL DEFAULT 'new',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  ) ENGINE=InnoDB`,
  `CREATE TABLE IF NOT EXISTS newsletter_subscribers (
    id BIGINT PRIMARY KEY AUTO_INCREMENT,
    email VARCHAR(220) NOT NULL UNIQUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  ) ENGINE=InnoDB`,
];

function priceFromTier(value) {
  return Number(String(value).replace(/[^\d,]/g, '').replace('.', '').replace(',', '.'));
}
function unitPrice(product, qty) {
  const tiers = product.tiers || [];
  let selected = tiers[0] ? priceFromTier(tiers[0][1]) : Number(product.price);
  for (const tier of tiers) {
    const start = Number(String(tier[0]).split(/[–+]/)[0].replace(/\./g,''));
    if (qty >= start) selected = priceFromTier(tier[1]);
  }
  return selected;
}
function hydrateProduct(row) {
  return {
    id: row.id, slug: row.slug, name: row.name, supplierId: row.supplier_id, supplier: row.supplier_name,
    category: row.category, moq: Number(row.moq), price: Number(row.price), unit: row.unit, image: row.image,
    badge: row.badge, description: row.description, tiers: typeof row.tiers_json === 'string' ? JSON.parse(row.tiers_json) : row.tiers_json,
    lead: row.lead_time, terms: row.terms,
  };
}
async function ensureSchema() {
  const connection = await pool.getConnection();
  try {
    for (const sql of statements) await connection.query(sql);
    for (const email of (process.env.TRADEVAULT_SUPER_ADMIN_EMAILS || '').split(',').map(value=>value.trim().toLowerCase()).filter(Boolean)) await connection.execute('INSERT IGNORE INTO admin_allowlist (identifier) VALUES (?)',[`email:${email}`]);
    for (const openId of (process.env.TRADEVAULT_SUPER_ADMIN_OPEN_IDS || '').split(',').map(value=>value.trim()).filter(Boolean)) await connection.execute('INSERT IGNORE INTO admin_allowlist (identifier) VALUES (?)',[`open_id:${openId}`]);
    await connection.execute("UPDATE app_users u SET role='customer' WHERE role='super_admin' AND NOT EXISTS (SELECT 1 FROM admin_allowlist a WHERE a.identifier=CONCAT('open_id:',u.open_id) OR a.identifier=CONCAT('email:',LOWER(u.email)))");
    const [orderColumns] = await connection.query('SHOW COLUMNS FROM orders');
    const known = new Set(orderColumns.map(column => column.Field));
    if (!known.has('payment_status')) await connection.query("ALTER TABLE orders ADD COLUMN payment_status VARCHAR(40) NOT NULL DEFAULT 'unpaid'");
    if (!known.has('stripe_session_id')) await connection.query('ALTER TABLE orders ADD COLUMN stripe_session_id VARCHAR(255) NULL');
    if (!known.has('payment_intent_id')) await connection.query('ALTER TABLE orders ADD COLUMN payment_intent_id VARCHAR(255) NULL');
    const [productColumns] = await connection.query('SHOW COLUMNS FROM products');
    const productKnown = new Set(productColumns.map(column => column.Field));
    if (!productKnown.has('store_id')) await connection.query("ALTER TABLE products ADD COLUMN store_id VARCHAR(40) NOT NULL DEFAULT 'store-demo'");
    if (!productKnown.has('stock_qty')) await connection.query("ALTER TABLE products ADD COLUMN stock_qty INT NOT NULL DEFAULT 0");
    if (!productKnown.has('low_stock_threshold')) await connection.query("ALTER TABLE products ADD COLUMN low_stock_threshold INT NOT NULL DEFAULT 10");
    const [orderCols] = await connection.query('SHOW COLUMNS FROM orders');
    const orderKnown = new Set(orderCols.map(column => column.Field));
    if (!orderKnown.has('store_id')) await connection.query("ALTER TABLE orders ADD COLUMN store_id VARCHAR(40) NOT NULL DEFAULT 'store-demo'");
    if (!orderKnown.has('customer_open_id')) await connection.query('ALTER TABLE orders ADD COLUMN customer_open_id VARCHAR(180) NULL');
    await connection.execute("INSERT IGNORE INTO plans (id,name,monthly_price,limits_json) VALUES ('starter','Starter',0,'{\"stores\":1,\"staff\":3}'),('pro','Pro',149,'{\"stores\":3,\"staff\":15}'),('growth','Growth',399,'{\"stores\":10,\"staff\":100}')");
    await connection.execute("INSERT IGNORE INTO stores (id,name,slug,status,plan_id) VALUES ('store-demo','TradeVault Demo Store','tradevault-demo','active','starter')");
    for (const supplier of catalog.suppliers) {
      await connection.execute(
        `INSERT IGNORE INTO suppliers (id,slug,name,mark,location,specialty,since,description,tags_json) VALUES (?,?,?,?,?,?,?,?,?)`,
        [supplier.id, supplier.slug, supplier.name, supplier.mark, supplier.location, supplier.specialty, supplier.since, supplier.description, JSON.stringify(supplier.tags)]
      );
    }
    for (const product of catalog.products) {
      await connection.execute(
        `INSERT IGNORE INTO products (id,slug,name,supplier_id,supplier_name,category,moq,price,unit,image,badge,description,tiers_json,lead_time,terms,store_id,stock_qty,low_stock_threshold) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
        [product.id, product.slug, product.name, product.supplierId, product.supplier, product.category, product.moq, product.price, product.unit, product.image, product.badge, product.description, JSON.stringify(product.tiers), product.lead, product.terms, 'store-demo', 0, 10]
      );
    }
  } finally { connection.release(); }
}
async function getCatalog() {
  const [supplierRows] = await pool.query('SELECT * FROM suppliers ORDER BY name');
  const [productRows] = await pool.query("SELECT p.* FROM products p JOIN stores s ON s.id=p.store_id WHERE s.status='active' ORDER BY p.created_at, p.name");
  return {
    suppliers: supplierRows.map(row => ({...row, tags: typeof row.tags_json === 'string' ? JSON.parse(row.tags_json) : row.tags_json})),
    products: productRows.map(hydrateProduct),
  };
}
async function getOrCreateCart(cartId) {
  const id = cartId || crypto.randomUUID();
  await pool.execute('INSERT IGNORE INTO carts (id) VALUES (?)', [id]);
  return id;
}
async function getCart(cartId) {
  const id = await getOrCreateCart(cartId);
  const [rows] = await pool.execute(`SELECT ci.product_id AS id, ci.qty, p.* FROM cart_items ci JOIN products p ON p.id=ci.product_id JOIN stores s ON s.id=p.store_id AND s.status='active' WHERE ci.cart_id=? ORDER BY ci.product_id`, [id]);
  return { id, items: rows.map(row => ({id: row.id, qty: Number(row.qty)})), products: rows.map(hydrateProduct), total: rows.reduce((sum,row) => sum + unitPrice(hydrateProduct(row), Number(row.qty)) * Number(row.qty), 0) };
}
async function addCartItem(cartId, productId, requestedQty) {
  const id = await getOrCreateCart(cartId);
  const [[product]] = await pool.execute("SELECT p.* FROM products p JOIN stores s ON s.id=p.store_id WHERE p.id=? AND s.status='active' LIMIT 1", [productId]);
  if (!product) throw Object.assign(new Error('Product not found'), {status: 404});
  const [[existing]] = await pool.execute('SELECT qty FROM cart_items WHERE cart_id=? AND product_id=?', [id, productId]);
  const qty = Math.max(Number(product.moq), Number(existing?.qty || 0) + Math.max(1, Number(requestedQty) || 1));
  await pool.execute(`INSERT INTO cart_items (cart_id,product_id,qty) VALUES (?,?,?) ON DUPLICATE KEY UPDATE qty=VALUES(qty)`, [id, productId, qty]);
  return getCart(id);
}
async function setCartItem(cartId, productId, requestedQty) {
  const id = await getOrCreateCart(cartId);
  const [[product]] = await pool.execute("SELECT p.moq FROM products p JOIN stores s ON s.id=p.store_id WHERE p.id=? AND s.status='active' LIMIT 1", [productId]);
  if (!product) throw Object.assign(new Error('Product not found'), {status: 404});
  const qty = Math.max(Number(product.moq), Number(requestedQty) || Number(product.moq));
  await pool.execute(`INSERT INTO cart_items (cart_id,product_id,qty) VALUES (?,?,?) ON DUPLICATE KEY UPDATE qty=VALUES(qty)`, [id, productId, qty]);
  return getCart(id);
}
async function removeCartItem(cartId, productId) {
  const id = await getOrCreateCart(cartId);
  await pool.execute('DELETE FROM cart_items WHERE cart_id=? AND product_id=?', [id, productId]);
  return getCart(id);
}
async function createOrder(cartId, payload, status = 'pending_review', clearCart = true) {
  const id = await getOrCreateCart(cartId);
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    const [rows] = await connection.execute(`SELECT ci.product_id AS id, ci.qty, p.* FROM cart_items ci JOIN products p ON p.id=ci.product_id JOIN stores s ON s.id=p.store_id AND s.status='active' WHERE ci.cart_id=? FOR UPDATE`, [id]);
    if (!rows.length) throw Object.assign(new Error('Cart is empty'), {status: 400});
    const storeIds=[...new Set(rows.map(row=>row.store_id))];
    if(storeIds.length!==1) throw Object.assign(new Error('Conclua pedidos de uma loja por vez'),{status:400});
    const items = rows.map(row => ({product: hydrateProduct(row), qty: Number(row.qty)}));
    const subtotal = items.reduce((sum,item) => sum + unitPrice(item.product, item.qty) * item.qty, 0);
    const orderId = crypto.randomUUID();
    const reference = `TV-${new Date().toISOString().slice(0,10).replaceAll('-','')}-${crypto.randomBytes(3).toString('hex').toUpperCase()}`;
    await connection.execute(`INSERT INTO orders (id,reference,company,buyer_name,email,location,po_number,note,status,payment_status,subtotal,store_id,customer_open_id) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`, [orderId, reference, payload.company, payload.buyer, payload.email, payload.location, payload.po || null, payload.note || null, status, status === 'pending_payment' ? 'pending' : 'unpaid', subtotal, storeIds[0], payload.customerOpenId || null]);
    for (const item of items) await connection.execute(`INSERT INTO order_items (order_id,product_id,product_name,unit_price,qty) VALUES (?,?,?,?,?)`, [orderId, item.product.id, item.product.name, unitPrice(item.product, item.qty), item.qty]);
    if(clearCart) await connection.execute('DELETE FROM cart_items WHERE cart_id=?', [id]);
    await connection.commit();
    return {id: orderId, reference, status, subtotal};
  } catch (error) { await connection.rollback(); throw error; } finally { connection.release(); }
}
async function saveSupport(email, message) { await pool.execute('INSERT INTO support_requests (email,message) VALUES (?,?)', [email, message]); }
async function saveSubscriber(email) { await pool.execute('INSERT IGNORE INTO newsletter_subscribers (email) VALUES (?)', [email]); }
async function clearCartItems(cartId) { await pool.execute('DELETE FROM cart_items WHERE cart_id=?',[cartId]); }
async function updateOrderPayment(orderId, sessionId) { await pool.execute('UPDATE orders SET stripe_session_id=? WHERE id=?', [sessionId, orderId]); }
async function processStripeEvent(event) {
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    const [result] = await connection.execute('INSERT IGNORE INTO stripe_events (event_id,event_type) VALUES (?,?)', [event.id, event.type]);
    if (result.affectedRows === 0) { await connection.commit(); return {duplicate: true}; }
    const object = event.data?.object || {};
    if (event.type === 'checkout.session.completed' && object.payment_status === 'paid' || event.type === 'checkout.session.async_payment_succeeded') {
      const orderId = object.metadata?.order_id;
      if (orderId) await connection.execute("UPDATE orders SET status='paid', payment_status='paid', payment_intent_id=? WHERE id=?", [object.payment_intent || null, orderId]);
    } else if (event.type === 'checkout.session.async_payment_failed') {
      const orderId = object.metadata?.order_id;
      if (orderId) await connection.execute("UPDATE orders SET status='payment_failed', payment_status='failed' WHERE id=?", [orderId]);
    } else if (event.type === 'checkout.session.expired') {
      const orderId = object.metadata?.order_id;
      if (orderId) await connection.execute("UPDATE orders SET status='cancelled', payment_status='expired' WHERE id=? AND payment_status<>'paid'", [orderId]);
    } else if (event.type === 'payment_intent.succeeded') {
      await connection.execute("UPDATE orders SET status='paid', payment_status='paid', payment_intent_id=? WHERE payment_intent_id=? OR id=?", [object.id, object.id, object.metadata?.order_id || '']);
    } else if (event.type === 'payment_intent.payment_failed') {
      await connection.execute("UPDATE orders SET status='payment_failed', payment_status='failed', payment_intent_id=? WHERE payment_intent_id=? OR id=?", [object.id, object.id, object.metadata?.order_id || '']);
    }
    await connection.commit();
    return {duplicate: false};
  } catch(error) { await connection.rollback(); throw error; } finally { connection.release(); }
}
async function getOrder(reference) {
  const [[order]] = await pool.execute('SELECT * FROM orders WHERE reference=? LIMIT 1', [reference]);
  if (!order) return null;
  const [items] = await pool.execute('SELECT * FROM order_items WHERE order_id=? ORDER BY id', [order.id]);
  return {...order, items};
}

async function upsertUser(identity) {
  if (!identity.openId) throw Object.assign(new Error('Identity is missing openId'), {status: 400});
  const email=String(identity.email||'').trim().toLowerCase();
  const [[allowlisted]]=await pool.execute('SELECT identifier FROM admin_allowlist WHERE identifier IN (?,?) LIMIT 1',[`open_id:${identity.openId}`,`email:${email}`]);
  const isConfiguredAdmin=Boolean(allowlisted);
  const [[existing]] = await pool.execute('SELECT * FROM app_users WHERE open_id=? LIMIT 1', [identity.openId]);
  if (existing) {
    const role = isConfiguredAdmin ? 'super_admin' : existing.role;
    await pool.execute('UPDATE app_users SET name=?,email=?,role=?,last_seen_at=CURRENT_TIMESTAMP WHERE open_id=?', [identity.name || existing.name, identity.email || existing.email, role, identity.openId]);
    return {...existing, name:identity.name||existing.name, email:identity.email||existing.email, role};
  }
  const role = isConfiguredAdmin ? 'super_admin' : 'customer';
  await pool.execute('INSERT INTO app_users (open_id,name,email,role) VALUES (?,?,?,?)', [identity.openId, identity.name || 'TradeVault user', identity.email || '', role]);
  return {open_id:identity.openId,name:identity.name||'TradeVault user',email:identity.email||'',role,blocked:0};
}
async function getUser(openId) { const [[row]] = await pool.execute('SELECT * FROM app_users WHERE open_id=? LIMIT 1',[openId]); return row || null; }
async function isStoreMember(openId, storeId) { const [[row]] = await pool.execute('SELECT sm.*,s.name,s.status FROM store_members sm JOIN stores s ON s.id=sm.store_id WHERE sm.open_id=? AND sm.store_id=? LIMIT 1',[openId,storeId]); return row || null; }
async function accessibleStore(openId) { const [[row]] = await pool.execute('SELECT s.* FROM stores s JOIN store_members m ON m.store_id=s.id WHERE m.open_id=? AND s.status=\'active\' ORDER BY s.created_at LIMIT 1',[openId]); return row || null; }
async function adminOverview() { const [[stores]] = await pool.query("SELECT COUNT(*) AS total, COALESCE(SUM(status='active'),0) AS active, COALESCE(SUM(status='blocked'),0) AS blocked FROM stores"); const [[sales]] = await pool.query("SELECT COALESCE(SUM(revenue),0) AS revenue, COALESCE(SUM(order_count),0) AS orders FROM (SELECT subtotal AS revenue,1 AS order_count FROM orders WHERE payment_status='paid' UNION ALL SELECT total AS revenue,1 AS order_count FROM pos_sales) paid_sales"); const [[customers]] = await pool.query("SELECT COUNT(*) AS total FROM app_users WHERE role='customer' AND blocked=0"); return {stores,sales,customers}; }
async function listStores() { const [rows] = await pool.query("SELECT s.*,p.name AS plan_name,(SELECT COUNT(*) FROM store_members m WHERE m.store_id=s.id) AS members,(COALESCE((SELECT SUM(o.subtotal) FROM orders o WHERE o.store_id=s.id AND o.payment_status='paid'),0)+COALESCE((SELECT SUM(ps.total) FROM pos_sales ps WHERE ps.store_id=s.id),0)) AS revenue FROM stores s LEFT JOIN plans p ON p.id=s.plan_id ORDER BY s.created_at DESC"); return rows; }
async function createStore(payload, ownerOpenId) { const id='store-'+crypto.randomBytes(5).toString('hex'); const slug=(payload.name||'store').toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'')+'-'+id.slice(-4); const connection=await pool.getConnection(); try { await connection.beginTransaction(); await connection.execute('INSERT INTO stores (id,name,slug,plan_id,owner_open_id) VALUES (?,?,?,?,?)',[id,payload.name,slug,payload.planId||'starter',ownerOpenId||null]); if(ownerOpenId){const [[owner]]=await connection.execute('SELECT open_id,role FROM app_users WHERE open_id=? FOR UPDATE',[ownerOpenId]); if(!owner) throw Object.assign(new Error('Usuário proprietário não encontrado'),{status:404}); await connection.execute("INSERT INTO store_members (store_id,open_id,role) VALUES (?,?, 'owner') ON DUPLICATE KEY UPDATE role='owner'",[id,ownerOpenId]); if(owner.role!=='super_admin') await connection.execute("UPDATE app_users SET role='store_owner' WHERE open_id=?",[ownerOpenId]);} await connection.commit(); } catch(error){await connection.rollback();throw error;} finally{connection.release();} return (await listStores()).find(s=>s.id===id); }
async function assignStoreMember(storeId,openId,role) { if(!['store_owner','staff'].includes(role))throw Object.assign(new Error('Perfil de loja inválido'),{status:400}); const connection=await pool.getConnection();try{await connection.beginTransaction();const [[store]]=await connection.execute('SELECT id FROM stores WHERE id=? FOR UPDATE',[storeId]);if(!store)throw Object.assign(new Error('Loja não encontrada'),{status:404});const [[user]]=await connection.execute('SELECT open_id,role FROM app_users WHERE open_id=? FOR UPDATE',[openId]);if(!user)throw Object.assign(new Error('Usuário não encontrado; ele precisa entrar na plataforma primeiro'),{status:404});if(user.role==='super_admin')throw Object.assign(new Error('Não altere o acesso de um Super Admin por vínculo de loja'),{status:409});const [[membership]]=await connection.execute('SELECT store_id FROM store_members WHERE open_id=? AND store_id<>? LIMIT 1',[openId,storeId]);if(membership)throw Object.assign(new Error('Cada usuário pode estar vinculado a uma loja por vez'),{status:409});const memberRole=role==='store_owner'?'owner':'staff';await connection.execute('INSERT INTO store_members (store_id,open_id,role) VALUES (?,?,?) ON DUPLICATE KEY UPDATE role=VALUES(role)',[storeId,openId,memberRole]);if(role==='store_owner')await connection.execute('UPDATE stores SET owner_open_id=? WHERE id=?',[openId,storeId]);await connection.execute('UPDATE app_users SET role=? WHERE open_id=?',[role,openId]);await connection.commit();return {storeId,openId,role};}catch(error){await connection.rollback();throw error;}finally{connection.release();} }
async function setStoreStatus(id,status) { await pool.execute('UPDATE stores SET status=? WHERE id=?',[status,id]); return (await listStores()).find(s=>s.id===id); }
async function listUsers() { const [rows] = await pool.query('SELECT open_id,name,email,role,blocked,created_at,last_seen_at FROM app_users ORDER BY created_at DESC'); return rows; }
async function updateUserRole(openId,role,blocked) { const allowed=['customer','super_admin']; if(role!==undefined&&!allowed.includes(role)) throw Object.assign(new Error('Perfil inválido; use o vínculo de loja para owner/staff'),{status:400}); const [[target]]=await pool.execute('SELECT email FROM app_users WHERE open_id=?',[openId]);if(!target)throw Object.assign(new Error('Usuário não encontrado'),{status:404}); if(role==='super_admin')await pool.execute('INSERT IGNORE INTO admin_allowlist (identifier) VALUES (?)',[`open_id:${openId}`]); if(role==='customer'){const email=`email:${String(target.email||'').trim().toLowerCase()}`;const [[emailGrant]]=await pool.execute('SELECT identifier FROM admin_allowlist WHERE identifier=?',[email]);if(emailGrant)throw Object.assign(new Error('Este e-mail está autorizado pela configuração de implantação e não pode ser rebaixado aqui'),{status:409});await pool.execute('DELETE FROM admin_allowlist WHERE identifier=?',[`open_id:${openId}`]);} const fields=[],values=[]; if(role!==undefined){fields.push('role=?');values.push(role);} if(blocked!==undefined){fields.push('blocked=?');values.push(blocked?1:0);} if(!fields.length) throw Object.assign(new Error('Nenhuma alteração informada'),{status:400}); values.push(openId); await pool.execute(`UPDATE app_users SET ${fields.join(',')} WHERE open_id=?`,values); return getUser(openId); }
async function storeOverview(storeId) { const [[sales]] = await pool.execute("SELECT COALESCE(SUM(revenue),0) AS revenue,COALESCE(SUM(order_count),0) AS orders FROM (SELECT subtotal AS revenue,1 AS order_count FROM orders WHERE store_id=? AND payment_status='paid' UNION ALL SELECT total AS revenue,1 AS order_count FROM pos_sales WHERE store_id=?) paid_sales",[storeId,storeId]); const [[products]] = await pool.execute('SELECT COUNT(*) AS total,COALESCE(SUM(stock_qty<=low_stock_threshold),0) AS low_stock FROM products WHERE store_id=?',[storeId]); const [lowStock] = await pool.execute('SELECT id,name,stock_qty,low_stock_threshold FROM products WHERE store_id=? AND stock_qty<=low_stock_threshold ORDER BY stock_qty',[storeId]); return {sales,products,lowStock}; }
async function listStoreProducts(storeId) { const [rows]=await pool.execute('SELECT * FROM products WHERE store_id=? ORDER BY name',[storeId]); return rows.map(hydrateProduct).map((p,i)=>({...p,stockQty:Number(rows[i].stock_qty),lowStockThreshold:Number(rows[i].low_stock_threshold)})); }
async function saveStoreProduct(storeId,payload) {
  const name=String(payload.name||'').trim(), price=Number(payload.price), moq=Number(payload.moq||1), stock=Number(payload.stockQty||0), threshold=Number(payload.lowStockThreshold||10);
  if(!name||!Number.isFinite(price)||price<0||!Number.isInteger(moq)||moq<1||!Number.isInteger(stock)||stock<0||!Number.isInteger(threshold)||threshold<0) throw Object.assign(new Error('Dados do produto inválidos'),{status:400});
  const id=payload.id||'p-'+crypto.randomBytes(5).toString('hex');
  if(payload.id){const [[existing]]=await pool.execute('SELECT id FROM products WHERE id=? AND store_id=? LIMIT 1',[id,storeId]);if(!existing)throw Object.assign(new Error('Produto não pertence a esta loja'),{status:404});}
  const slug=(payload.slug||name).toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'')+'-'+id.slice(-4);
  const values=[id,slug,name,payload.supplierId||'s1',payload.supplier||'TradeVault Supplier',payload.category||'General',moq,price,payload.unit||'un',payload.image||'',payload.badge||'STORE',payload.description||'',JSON.stringify(payload.tiers||[[String(moq)+'+','R$ '+price.toFixed(2).replace('.',',')]]),payload.lead||'A confirmar',payload.terms||'Net-30',storeId,stock,threshold];
  await pool.execute(`INSERT INTO products (id,slug,name,supplier_id,supplier_name,category,moq,price,unit,image,badge,description,tiers_json,lead_time,terms,store_id,stock_qty,low_stock_threshold) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?) ON DUPLICATE KEY UPDATE name=VALUES(name),category=VALUES(category),moq=VALUES(moq),price=VALUES(price),unit=VALUES(unit),image=VALUES(image),badge=VALUES(badge),description=VALUES(description),tiers_json=VALUES(tiers_json),lead_time=VALUES(lead_time),terms=VALUES(terms),stock_qty=VALUES(stock_qty),low_stock_threshold=VALUES(low_stock_threshold)`,values);
  return (await listStoreProducts(storeId)).find(p=>p.id===id);
}
async function moveInventory(storeId,payload,openId) {
  const qty=Number(payload.qty); if(!Number.isInteger(qty)||qty<=0||!['in','out'].includes(payload.type)) throw Object.assign(new Error('Tipo ou quantidade de movimentação inválida'),{status:400});
  const connection=await pool.getConnection(); try { await connection.beginTransaction(); const [[product]]=await connection.execute('SELECT stock_qty FROM products WHERE id=? AND store_id=? FOR UPDATE',[payload.productId,storeId]); if(!product) throw Object.assign(new Error('Produto não pertence a esta loja'),{status:404}); if(payload.type==='out'&&Number(product.stock_qty)<qty) throw Object.assign(new Error('Estoque insuficiente'),{status:409}); await connection.execute('UPDATE products SET stock_qty=stock_qty+? WHERE id=? AND store_id=?',[payload.type==='out'?-qty:qty,payload.productId,storeId]); await connection.execute('INSERT INTO inventory_movements (store_id,product_id,type,qty,note,created_by) VALUES (?,?,?,?,?,?)',[storeId,payload.productId,payload.type,qty,payload.note||null,openId]); await connection.commit(); } catch(error){await connection.rollback();throw error;} finally{connection.release();} return (await listStoreProducts(storeId)).find(p=>p.id===payload.productId);
}
async function storeOrders(storeId) { const [rows]=await pool.execute('SELECT * FROM orders WHERE store_id=? ORDER BY created_at DESC LIMIT 100',[storeId]); return rows; }
async function updateStoreOrderStatus(storeId,orderId,status) { const allowed=['processing','shipped','completed'];if(!allowed.includes(status))throw Object.assign(new Error('Status de pedido inválido'),{status:400});const [result]=await pool.execute("UPDATE orders SET status=? WHERE id=? AND store_id=? AND payment_status='paid' AND status IN ('paid','processing','shipped')",[status,orderId,storeId]);if(!result.affectedRows)throw Object.assign(new Error('Pedido pago não encontrado ou transição de status inválida'),{status:409});const [[order]]=await pool.execute('SELECT * FROM orders WHERE id=? AND store_id=?',[orderId,storeId]);return order; }
async function cash(storeId) { const [[open]] = await pool.execute("SELECT * FROM cash_sessions WHERE store_id=? AND status='open' ORDER BY id DESC LIMIT 1",[storeId]); const [history] = await pool.execute('SELECT * FROM cash_sessions WHERE store_id=? ORDER BY id DESC LIMIT 20',[storeId]); return {open,history}; }
async function openCash(storeId,openId,amount) { const value=Number(amount);if(!Number.isFinite(value)||value<0)throw Object.assign(new Error('Valor inicial inválido'),{status:400});const [[existing]]=await pool.execute("SELECT id FROM cash_sessions WHERE store_id=? AND status='open' LIMIT 1",[storeId]);if(existing)throw Object.assign(new Error('Já existe um caixa aberto'),{status:409});await pool.execute('INSERT INTO cash_sessions (store_id,opened_by,opening_amount) VALUES (?,?,?)',[storeId,openId,value]);return cash(storeId); }
async function closeCash(storeId,amount) { const value=Number(amount);if(!Number.isFinite(value)||value<0)throw Object.assign(new Error('Valor final inválido'),{status:400});const [result]=await pool.execute("UPDATE cash_sessions SET status='closed',closing_amount=?,closed_at=CURRENT_TIMESTAMP WHERE store_id=? AND status='open'",[value,storeId]);if(!result.affectedRows)throw Object.assign(new Error('Não existe caixa aberto'),{status:409});return cash(storeId); }
async function createPosSale(storeId,openId,payload) {
  const items=payload.items||[], methods=['cash','card','pix']; if(!items.length||!methods.includes(payload.paymentMethod||'cash')) throw Object.assign(new Error('Venda inválida'),{status:400});
  const connection=await pool.getConnection(); const saleId=crypto.randomUUID(); try { await connection.beginTransaction(); const [[session]]=await connection.execute("SELECT id FROM cash_sessions WHERE store_id=? AND status='open' ORDER BY id DESC LIMIT 1 FOR UPDATE",[storeId]); if(!session) throw Object.assign(new Error('Abra o caixa antes de registrar vendas'),{status:409}); let total=0; const priced=[];
    for(const item of items){const qty=Number(item.qty);if(!Number.isInteger(qty)||qty<=0)throw Object.assign(new Error('Quantidade inválida'),{status:400});const [[product]]=await connection.execute('SELECT id,price,stock_qty FROM products WHERE id=? AND store_id=? FOR UPDATE',[item.productId,storeId]);if(!product)throw Object.assign(new Error('Produto não pertence a esta loja'),{status:404});if(Number(product.stock_qty)<qty)throw Object.assign(new Error(`Estoque insuficiente para ${item.productId}`),{status:409});const unitPrice=Number(product.price);total+=unitPrice*qty;priced.push({id:product.id,qty,unitPrice});}
    await connection.execute('INSERT INTO pos_sales (id,store_id,cash_session_id,total,payment_method,created_by) VALUES (?,?,?,?,?,?)',[saleId,storeId,session.id,total,payload.paymentMethod||'cash',openId]); for(const item of priced){await connection.execute('INSERT INTO pos_sale_items (sale_id,product_id,qty,unit_price) VALUES (?,?,?,?)',[saleId,item.id,item.qty,item.unitPrice]);await connection.execute('UPDATE products SET stock_qty=stock_qty-? WHERE id=? AND store_id=?',[item.qty,item.id,storeId]);} await connection.commit(); return {id:saleId,total};
  } catch(error){await connection.rollback();throw error;} finally{connection.release();}
}
async function accountOrders(openId,email) { const [rows]=await pool.execute('SELECT * FROM orders WHERE customer_open_id=? OR (customer_open_id IS NULL AND email=?) ORDER BY created_at DESC',[openId,email]); return rows; }

module.exports = { pool, ensureSchema, getCatalog, getOrCreateCart, getCart, addCartItem, setCartItem, removeCartItem, createOrder, unitPrice, updateOrderPayment, processStripeEvent, saveSupport, saveSubscriber, clearCartItems, getOrder, upsertUser, getUser, isStoreMember, accessibleStore, adminOverview, listStores, createStore, assignStoreMember, setStoreStatus, listUsers, updateUserRole, storeOverview, listStoreProducts, saveStoreProduct, moveInventory, storeOrders, updateStoreOrderStatus, cash, openCash, closeCash, createPosSale, accountOrders };
