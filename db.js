const mysql = require('mysql2/promise');
const crypto = require('crypto');
const catalog = require('./data/catalog.json');
const { normalizePosItems } = require('./pos');

const databaseUrl = process.env.DATABASE_URL || process.env.DRIZZLE_DATABASE_URL;
if (!databaseUrl) throw new Error('DATABASE_URL is required when database persistence is enabled');

// mysql2 accepts a MySQL connection URI directly. Credentials remain in the managed runtime.
const pool = mysql.createPool(databaseUrl);

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
    whatsapp_phone VARCHAR(32) NULL,
    payment_instructions TEXT NULL,
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
    last_seen_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_users_role (role)
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
  `CREATE TABLE IF NOT EXISTS system_settings (
    setting_key VARCHAR(80) PRIMARY KEY,
    setting_value TEXT NOT NULL,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
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
    store_id VARCHAR(40) NULL,
    is_active TINYINT(1) NOT NULL DEFAULT 1,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_suppliers_store (store_id, is_active)
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
    store_id VARCHAR(40) NOT NULL DEFAULT 'store-demo',
    stock_qty INT NOT NULL DEFAULT 0,
    stock_reserved_qty INT NOT NULL DEFAULT 0,
    low_stock_threshold INT NOT NULL DEFAULT 10,
    payment_instructions TEXT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_products_category (category),
    INDEX idx_products_supplier (supplier_id),
    INDEX idx_products_store (store_id),
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
    status VARCHAR(40) NOT NULL DEFAULT 'awaiting_manual_payment',
    payment_status VARCHAR(40) NOT NULL DEFAULT 'pending',
    payment_method VARCHAR(40) NOT NULL DEFAULT 'whatsapp_manual',
    paid_at TIMESTAMP NULL,
    subtotal DECIMAL(12,2) NOT NULL,
    store_id VARCHAR(40) NOT NULL DEFAULT 'store-demo',
    customer_open_id VARCHAR(180) NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_orders_email (email),
    INDEX idx_orders_created (created_at),
    INDEX idx_orders_store (store_id, created_at),
    INDEX idx_orders_customer (customer_open_id)
  ) ENGINE=InnoDB`,
  `CREATE TABLE IF NOT EXISTS order_items (
    id BIGINT PRIMARY KEY AUTO_INCREMENT,
    order_id CHAR(36) NOT NULL,
    product_id VARCHAR(40) NOT NULL,
    product_name VARCHAR(180) NOT NULL,
    unit_price DECIMAL(10,2) NOT NULL,
    qty INT NOT NULL,
    inventory_reserved TINYINT(1) NOT NULL DEFAULT 0,
    payment_instructions TEXT NULL,
    CONSTRAINT fk_order_items_order FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE,
    INDEX idx_order_items_product (product_id)
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
    closed_at TIMESTAMP NULL,
    INDEX idx_cash_store (store_id, status, opened_at)
  ) ENGINE=InnoDB`,
  `CREATE TABLE IF NOT EXISTS pos_sales (
    id CHAR(36) PRIMARY KEY,
    store_id VARCHAR(40) NOT NULL,
    cash_session_id BIGINT,
    customer_open_id VARCHAR(180),
    total DECIMAL(12,2) NOT NULL,
    payment_method VARCHAR(40) NOT NULL,
    created_by VARCHAR(180),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_pos_store (store_id, created_at),
    INDEX idx_pos_cash_session (cash_session_id)
  ) ENGINE=InnoDB`,
  `CREATE TABLE IF NOT EXISTS pos_sale_items (
    id BIGINT PRIMARY KEY AUTO_INCREMENT,
    sale_id CHAR(36) NOT NULL,
    product_id VARCHAR(40) NOT NULL,
    qty INT NOT NULL,
    unit_price DECIMAL(10,2) NOT NULL,
    CONSTRAINT fk_pos_item_sale FOREIGN KEY (sale_id) REFERENCES pos_sales(id) ON DELETE CASCADE
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

function safeJson(value, fallback) {
  if (value && typeof value === 'object') return value;
  try { return JSON.parse(value); } catch { return fallback; }
}

async function ensureColumn(connection, table, column, definition) {
  const [columns] = await connection.query(`SHOW COLUMNS FROM \`${table}\``);
  if (!columns.some(item => item.Field === column)) {
    await connection.query(`ALTER TABLE \`${table}\` ADD COLUMN \`${column}\` ${definition}`);
  }
}

function priceFromTier(value) {
  let normalized = String(value ?? '').replace(/[^\d,.-]/g, '').trim();
  const comma = normalized.lastIndexOf(',');
  const dot = normalized.lastIndexOf('.');
  if (comma >= 0 && dot >= 0) {
    normalized = comma > dot ? normalized.replace(/\./g, '').replace(',', '.') : normalized.replace(/,/g, '');
  } else if (comma >= 0) {
    normalized = normalized.replace(/\./g, '').replace(',', '.');
  }
  const price = Number(normalized);
  return Number.isFinite(price) ? price : 0;
}

function unitPrice(product, qty) {
  const tiers = Array.isArray(product.tiers) ? product.tiers : [];
  let selected = tiers[0] ? priceFromTier(tiers[0][1]) : Number(product.price);
  for (const tier of tiers) {
    const start = Number(String(tier[0]).split(/[–+]/)[0].replace(/\./g, ''));
    if (Number.isFinite(start) && Number(qty) >= start) selected = priceFromTier(tier[1]);
  }
  return selected;
}

function hydrateProduct(row) {
  return {
    id: row.id,
    slug: row.slug,
    name: row.name,
    supplierId: row.supplier_id,
    supplier: row.supplier_name,
    category: row.category,
    moq: Number(row.moq),
    price: Number(row.price),
    unit: row.unit,
    image: row.image,
    badge: row.badge,
    description: row.description,
    tiers: safeJson(row.tiers_json, []),
    lead: row.lead_time,
    terms: row.terms,
    storeId: row.store_id,
    storeName: row.store_name || '',
    stockQty: Number(row.stock_qty || 0),
    stockReservedQty: Number(row.stock_reserved_qty || 0),
    availableQty: Math.max(0, Number(row.stock_qty || 0) - Number(row.stock_reserved_qty || 0)),
    lowStockThreshold: Number(row.low_stock_threshold || 0),
    paymentInstructions: row.payment_instructions || row.store_payment_instructions || '',
    whatsappPhone: row.whatsapp_phone || '',
  };
}

async function ensureSchema() {
  const connection = await pool.getConnection();
  try {
    for (const sql of statements) await connection.query(sql);

    // Additive, idempotent migrations keep earlier project data intact.
    await ensureColumn(connection, 'stores', 'whatsapp_phone', 'VARCHAR(32) NULL');
    await ensureColumn(connection, 'stores', 'payment_instructions', 'TEXT NULL');
    await ensureColumn(connection, 'suppliers', 'store_id', 'VARCHAR(40) NULL');
    await ensureColumn(connection, 'suppliers', 'is_active', 'TINYINT(1) NOT NULL DEFAULT 1');
    await ensureColumn(connection, 'products', 'store_id', "VARCHAR(40) NOT NULL DEFAULT 'store-demo'");
    await ensureColumn(connection, 'products', 'stock_qty', 'INT NOT NULL DEFAULT 0');
    await ensureColumn(connection, 'products', 'stock_reserved_qty', 'INT NOT NULL DEFAULT 0');
    await ensureColumn(connection, 'products', 'low_stock_threshold', 'INT NOT NULL DEFAULT 10');
    await ensureColumn(connection, 'products', 'payment_instructions', 'TEXT NULL');
    await ensureColumn(connection, 'orders', 'payment_status', "VARCHAR(40) NOT NULL DEFAULT 'pending'");
    await ensureColumn(connection, 'orders', 'store_id', "VARCHAR(40) NOT NULL DEFAULT 'store-demo'");
    await ensureColumn(connection, 'orders', 'customer_open_id', 'VARCHAR(180) NULL');
    await ensureColumn(connection, 'orders', 'payment_method', "VARCHAR(40) NOT NULL DEFAULT 'whatsapp_manual'");
    await ensureColumn(connection, 'orders', 'paid_at', 'TIMESTAMP NULL');
    await ensureColumn(connection, 'order_items', 'payment_instructions', 'TEXT NULL');
    await ensureColumn(connection, 'order_items', 'inventory_reserved', 'TINYINT(1) NOT NULL DEFAULT 0');
    await connection.execute("UPDATE orders SET payment_status='pending',status='awaiting_manual_payment' WHERE payment_status='unpaid' AND paid_at IS NULL AND status='pending'");

    for (const email of (process.env.TRADEVAULT_SUPER_ADMIN_EMAILS || '').split(',').map(value => value.trim().toLowerCase()).filter(Boolean)) {
      await connection.execute('INSERT IGNORE INTO admin_allowlist (identifier) VALUES (?)', [`email:${email}`]);
    }
    for (const openId of (process.env.TRADEVAULT_SUPER_ADMIN_OPEN_IDS || '').split(',').map(value => value.trim()).filter(Boolean)) {
      await connection.execute('INSERT IGNORE INTO admin_allowlist (identifier) VALUES (?)', [`open_id:${openId}`]);
    }

    await connection.execute("INSERT IGNORE INTO plans (id,name,monthly_price,limits_json) VALUES ('starter','Starter',0,'{\"stores\":1,\"staff\":3}'),('pro','Pro',149,'{\"stores\":3,\"staff\":15}'),('growth','Growth',399,'{\"stores\":10,\"staff\":100}')");
    await connection.execute("INSERT IGNORE INTO stores (id,name,slug,status,plan_id) VALUES ('store-demo','TradeVault Demo Store','tradevault-demo','active','starter')");
    await connection.execute("UPDATE suppliers SET store_id='store-demo' WHERE store_id IS NULL OR store_id=''");

    for (const email of (process.env.TRADEVAULT_SUPER_ADMIN_EMAILS || '').split(',').map(value => value.trim().toLowerCase()).filter(Boolean)) {
      await connection.execute("UPDATE app_users SET role='super_admin' WHERE email=?", [email]);
    }
    await connection.execute("UPDATE app_users u SET role='customer' WHERE role='super_admin' AND NOT EXISTS (SELECT 1 FROM admin_allowlist a WHERE a.identifier=CONCAT('open_id:',u.open_id) OR a.identifier=CONCAT('email:',LOWER(u.email)))");

    for (const supplier of catalog.suppliers) {
      await connection.execute(
        `INSERT IGNORE INTO suppliers (id,slug,name,mark,location,specialty,since,description,tags_json,store_id,is_active)
         VALUES (?,?,?,?,?,?,?,?,?,'store-demo',1)`,
        [supplier.id, supplier.slug, supplier.name, supplier.mark, supplier.location, supplier.specialty, supplier.since, supplier.description, JSON.stringify(supplier.tags)],
      );
    }
    for (const product of catalog.products) {
      await connection.execute(
        `INSERT IGNORE INTO products
          (id,slug,name,supplier_id,supplier_name,category,moq,price,unit,image,badge,description,tiers_json,lead_time,terms,store_id,stock_qty,low_stock_threshold,payment_instructions)
         VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
        [product.id, product.slug, product.name, product.supplierId, product.supplier, product.category, product.moq, product.price, product.unit, product.image, product.badge, product.description, JSON.stringify(product.tiers), product.lead, product.terms, 'store-demo', product.moq * 5, 10, ''],
      );
    }

    const defaults = [
      ['brand_name', 'TradeVault'],
      ['support_email', ''],
      ['announcement', 'Os pedidos são combinados diretamente com a loja pelo WhatsApp.'],
    ];
    for (const [key, value] of defaults) {
      await connection.execute('INSERT IGNORE INTO system_settings (setting_key,setting_value) VALUES (?,?)', [key, value]);
    }
  } finally {
    connection.release();
  }
}

async function getCatalog() {
  const [supplierRows] = await pool.query(
    `SELECT DISTINCT su.* FROM suppliers su
     JOIN products p ON p.supplier_id=su.id
     JOIN stores st ON st.id=p.store_id AND st.status='active'
     WHERE su.is_active=1 ORDER BY su.name`,
  );
  const [productRows] = await pool.query(
    `SELECT p.*, st.name AS store_name, st.whatsapp_phone, st.payment_instructions AS store_payment_instructions
     FROM products p
     JOIN stores st ON st.id=p.store_id AND st.status='active'
     JOIN suppliers su ON su.id=p.supplier_id AND su.is_active=1
     ORDER BY p.created_at, p.name`,
  );
  return {
    suppliers: supplierRows.map(row => ({
      id: row.id,
      slug: row.slug,
      name: row.name,
      mark: row.mark,
      location: row.location,
      specialty: row.specialty,
      since: row.since,
      description: row.description,
      tags: safeJson(row.tags_json, []),
      storeId: row.store_id,
    })),
    products: productRows.map(hydrateProduct),
  };
}

function validUuid(value) {
  return typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

async function getOrCreateCart(cartId) {
  const id = validUuid(cartId) ? cartId : crypto.randomUUID();
  await pool.execute('INSERT IGNORE INTO carts (id) VALUES (?)', [id]);
  return id;
}

async function getCart(cartId) {
  const id = await getOrCreateCart(cartId);
  const [rows] = await pool.execute(
    `SELECT ci.product_id AS id, ci.qty, p.*, st.name AS store_name, st.whatsapp_phone,
      st.payment_instructions AS store_payment_instructions
     FROM cart_items ci
     JOIN products p ON p.id=ci.product_id
     JOIN stores st ON st.id=p.store_id AND st.status='active'
     JOIN suppliers su ON su.id=p.supplier_id AND su.is_active=1
     WHERE ci.cart_id=? ORDER BY ci.product_id`,
    [id],
  );
  const items = rows.map(row => ({ id: row.id, qty: Number(row.qty) }));
  const products = rows.map(hydrateProduct);
  return { id, items, products, total: rows.reduce((sum, row) => sum + unitPrice(hydrateProduct(row), Number(row.qty)) * Number(row.qty), 0) };
}

async function addCartItem(cartId, productId, requestedQty) {
  const id = await getOrCreateCart(cartId);
  const [[product]] = await pool.execute(
    `SELECT p.id,p.moq,p.store_id,p.stock_qty,p.stock_reserved_qty FROM products p JOIN stores st ON st.id=p.store_id AND st.status='active'
     JOIN suppliers su ON su.id=p.supplier_id AND su.is_active=1 WHERE p.id=? LIMIT 1`,
    [productId],
  );
  if (!product) throw Object.assign(new Error('Produto não encontrado ou indisponível'), { status: 404 });
  const [[otherStore]] = await pool.execute(
    `SELECT p.store_id FROM cart_items ci JOIN products p ON p.id=ci.product_id
     WHERE ci.cart_id=? AND p.store_id<>? LIMIT 1`,
    [id, product.store_id],
  );
  if (otherStore) throw Object.assign(new Error('Finalize um pedido por loja. Esvazie o carrinho antes de adicionar produtos de outra loja.'), { status: 409 });
  const [[existing]] = await pool.execute('SELECT qty FROM cart_items WHERE cart_id=? AND product_id=?', [id, productId]);
  const requested = Math.max(1, Math.min(10000, Number(requestedQty) || 1));
  const qty = Math.max(Number(product.moq), Number(existing?.qty || 0) + requested);
  const available = Math.max(0, Number(product.stock_qty) - Number(product.stock_reserved_qty || 0));
  if (qty > available) throw Object.assign(new Error(`Estoque disponível insuficiente. Restam ${available} unidade(s).`), { status: 409 });
  await pool.execute(
    'INSERT INTO cart_items (cart_id,product_id,qty) VALUES (?,?,?) ON DUPLICATE KEY UPDATE qty=VALUES(qty)',
    [id, productId, qty],
  );
  return getCart(id);
}

async function setCartItem(cartId, productId, requestedQty) {
  const id = await getOrCreateCart(cartId);
  const [[product]] = await pool.execute(
    `SELECT p.moq,p.stock_qty,p.stock_reserved_qty FROM products p JOIN stores st ON st.id=p.store_id AND st.status='active'
     JOIN suppliers su ON su.id=p.supplier_id AND su.is_active=1 WHERE p.id=? LIMIT 1`,
    [productId],
  );
  if (!product) throw Object.assign(new Error('Produto não encontrado ou indisponível'), { status: 404 });
  const qty = Math.max(Number(product.moq), Math.min(10000, Number(requestedQty) || Number(product.moq)));
  const available = Math.max(0, Number(product.stock_qty) - Number(product.stock_reserved_qty || 0));
  if (qty > available) throw Object.assign(new Error(`Estoque disponível insuficiente. Restam ${available} unidade(s).`), { status: 409 });
  await pool.execute(
    'INSERT INTO cart_items (cart_id,product_id,qty) VALUES (?,?,?) ON DUPLICATE KEY UPDATE qty=VALUES(qty)',
    [id, productId, qty],
  );
  return getCart(id);
}

async function removeCartItem(cartId, productId) {
  const id = await getOrCreateCart(cartId);
  await pool.execute('DELETE FROM cart_items WHERE cart_id=? AND product_id=?', [id, productId]);
  return getCart(id);
}

function cleanPlainText(value, maxLength) {
  return String(value ?? '').replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '').trim().slice(0, maxLength);
}

async function createOrder(cartId, payload) {
  const id = await getOrCreateCart(cartId);
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    const [rows] = await connection.execute(
      `SELECT ci.product_id AS id, ci.qty, p.*, st.name AS store_name, st.whatsapp_phone,
        st.payment_instructions AS store_payment_instructions
       FROM cart_items ci
       JOIN products p ON p.id=ci.product_id
       JOIN stores st ON st.id=p.store_id AND st.status='active'
       JOIN suppliers su ON su.id=p.supplier_id AND su.is_active=1
       WHERE ci.cart_id=? FOR UPDATE`,
      [id],
    );
    if (!rows.length) throw Object.assign(new Error('O carrinho está vazio ou os itens não estão mais disponíveis.'), { status: 400 });
    for (const row of rows) {
      const available = Math.max(0, Number(row.stock_qty) - Number(row.stock_reserved_qty || 0));
      if (Number(row.qty) > available) throw Object.assign(new Error(`Estoque insuficiente para ${row.name}. Restam ${available} unidade(s).`), { status: 409 });
    }
    const storeIds = [...new Set(rows.map(row => row.store_id))];
    if (storeIds.length !== 1) throw Object.assign(new Error('Finalize um pedido de cada loja separadamente.'), { status: 400 });

    const items = rows.map(row => ({ product: hydrateProduct(row), qty: Number(row.qty) }));
    const subtotal = items.reduce((sum, item) => sum + unitPrice(item.product, item.qty) * item.qty, 0);
    const orderId = crypto.randomUUID();
    const reference = `TV-${new Date().toISOString().slice(0, 10).replaceAll('-', '')}-${crypto.randomBytes(3).toString('hex').toUpperCase()}`;
    const orderStatus = 'awaiting_manual_payment';
    await connection.execute(
      `INSERT INTO orders
       (id,reference,company,buyer_name,email,location,po_number,note,status,payment_status,payment_method,subtotal,store_id,customer_open_id)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      [orderId, reference, cleanPlainText(payload.company, 180), cleanPlainText(payload.buyer, 180), cleanPlainText(payload.email, 220).toLowerCase(), cleanPlainText(payload.location, 180), cleanPlainText(payload.po, 100) || null, cleanPlainText(payload.note, 2000) || null, orderStatus, 'pending', 'whatsapp_manual', subtotal, storeIds[0], payload.customerOpenId || null],
    );

    const orderItems = [];
    for (const item of items) {
      const instructions = item.product.paymentInstructions || item.product.paymentInstructions === ''
        ? item.product.paymentInstructions
        : '';
      await connection.execute(
        `INSERT INTO order_items (order_id,product_id,product_name,unit_price,qty,payment_instructions,inventory_reserved)
         VALUES (?,?,?,?,?,?,1)`,
        [orderId, item.product.id, item.product.name, unitPrice(item.product, item.qty), item.qty, instructions],
      );
      await connection.execute('UPDATE products SET stock_reserved_qty=stock_reserved_qty+? WHERE id=? AND store_id=?', [item.qty, item.product.id, storeIds[0]]);
      orderItems.push({
        product_id: item.product.id,
        product_name: item.product.name,
        unit_price: unitPrice(item.product, item.qty),
        qty: item.qty,
        payment_instructions: instructions,
      });
    }
    await connection.execute('DELETE FROM cart_items WHERE cart_id=?', [id]);
    await connection.commit();

    const store = rows[0];
    return {
      id: orderId,
      reference,
      status: orderStatus,
      paymentStatus: 'pending',
      paymentMethod: 'whatsapp_manual',
      subtotal,
      items: orderItems,
      store: {
        id: store.store_id,
        name: store.store_name,
        whatsappPhone: store.whatsapp_phone || '',
        paymentInstructions: store.store_payment_instructions || '',
      },
    };
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

async function getOrder(reference) {
  const [[order]] = await pool.execute('SELECT * FROM orders WHERE reference=? LIMIT 1', [reference]);
  if (!order) return null;
  const [items] = await pool.execute('SELECT * FROM order_items WHERE order_id=? ORDER BY id', [order.id]);
  return { ...order, items };
}

async function saveSupport(email, message) {
  await pool.execute('INSERT INTO support_requests (email,message) VALUES (?,?)', [cleanPlainText(email, 220), cleanPlainText(message, 4000)]);
}

async function saveSubscriber(email) {
  await pool.execute('INSERT IGNORE INTO newsletter_subscribers (email) VALUES (?)', [cleanPlainText(email, 220).toLowerCase()]);
}

async function getUser(openId) {
  const [[row]] = await pool.execute('SELECT * FROM app_users WHERE open_id=? LIMIT 1', [openId]);
  return row || null;
}

async function upsertUser(identity) {
  if (!identity.openId) throw Object.assign(new Error('A identidade de login está incompleta.'), { status: 400 });
  const email = cleanPlainText(identity.email || '', 220).toLowerCase();
  const [[allowlisted]] = await pool.execute(
    'SELECT identifier FROM admin_allowlist WHERE identifier IN (?,?) LIMIT 1',
    [`open_id:${identity.openId}`, `email:${email}`],
  );
  const role = allowlisted ? 'super_admin' : 'customer';
  await pool.execute(
    `INSERT INTO app_users (open_id,name,email,role)
     VALUES (?,?,?,?)
     ON DUPLICATE KEY UPDATE name=VALUES(name),email=VALUES(email),role=IF(VALUES(role)='super_admin','super_admin',IF(role='super_admin' AND NOT EXISTS (SELECT 1 FROM admin_allowlist WHERE identifier=CONCAT('open_id:',VALUES(open_id)) OR identifier=CONCAT('email:',LOWER(VALUES(email)))),'customer',role)),last_seen_at=CURRENT_TIMESTAMP`,
    [identity.openId, cleanPlainText(identity.name || 'TradeVault user', 180), email, role],
  );
  return getUser(identity.openId);
}

async function isStoreMember(openId, storeId) {
  const [[row]] = await pool.execute(
    `SELECT sm.*,st.name,st.status FROM store_members sm JOIN stores st ON st.id=sm.store_id
     WHERE sm.open_id=? AND sm.store_id=? LIMIT 1`,
    [openId, storeId],
  );
  return row || null;
}

async function accessibleStore(openId) {
  const [[row]] = await pool.execute(
    `SELECT st.* FROM stores st JOIN store_members m ON m.store_id=st.id
     WHERE m.open_id=? AND st.status='active' ORDER BY st.created_at LIMIT 1`,
    [openId],
  );
  return row || null;
}

async function adminOverview() {
  const [[stores]] = await pool.query(
    `SELECT COUNT(*) AS total, COALESCE(SUM(status='active'),0) AS active,
      COALESCE(SUM(status='blocked'),0) AS blocked FROM stores`,
  );
  const [[sales]] = await pool.query(
    `SELECT COALESCE(SUM(amount),0) AS revenue, COALESCE(SUM(order_count),0) AS orders FROM (
      SELECT subtotal AS amount,1 AS order_count FROM orders WHERE payment_status='paid'
      UNION ALL SELECT total AS amount,1 AS order_count FROM pos_sales
    ) paid_sales`,
  );
  const [[customers]] = await pool.query("SELECT COUNT(*) AS total FROM app_users WHERE role='customer' AND blocked=0");
  const [[pending]] = await pool.query("SELECT COUNT(*) AS total,COALESCE(SUM(subtotal),0) AS amount FROM orders WHERE payment_status='pending'");
  return { stores, sales, customers, pending };
}

async function adminReports() {
  const [rows] = await pool.query(
    `SELECT month_key, SUM(revenue) AS revenue, SUM(order_count) AS orders FROM (
      SELECT DATE_FORMAT(created_at,'%Y-%m') AS month_key, subtotal AS revenue, 1 AS order_count
      FROM orders WHERE payment_status='paid' AND created_at >= DATE_SUB(CURDATE(), INTERVAL 12 MONTH)
      UNION ALL
      SELECT DATE_FORMAT(created_at,'%Y-%m') AS month_key, total AS revenue, 1 AS order_count
      FROM pos_sales WHERE created_at >= DATE_SUB(CURDATE(), INTERVAL 12 MONTH)
    ) r GROUP BY month_key ORDER BY month_key`,
  );
  return rows;
}

async function listStores() {
  const [rows] = await pool.query(
    `SELECT st.*,pl.name AS plan_name,pl.monthly_price,
      (SELECT COUNT(*) FROM store_members m WHERE m.store_id=st.id) AS members,
      (SELECT COUNT(*) FROM products p WHERE p.store_id=st.id) AS products_count,
      (SELECT COUNT(*) FROM orders o WHERE o.store_id=st.id AND o.payment_status='pending') AS pending_orders,
      (COALESCE((SELECT SUM(o.subtotal) FROM orders o WHERE o.store_id=st.id AND o.payment_status='paid'),0)
       +COALESCE((SELECT SUM(ps.total) FROM pos_sales ps WHERE ps.store_id=st.id),0)) AS revenue
     FROM stores st LEFT JOIN plans pl ON pl.id=st.plan_id ORDER BY st.created_at DESC`,
  );
  return rows;
}

async function createStore(payload, ownerOpenId) {
  const name = cleanPlainText(payload.name, 180);
  if (!name) throw Object.assign(new Error('Informe o nome da loja.'), { status: 400 });
  const planId = cleanPlainText(payload.planId || 'starter', 40);
  const id = `store-${crypto.randomBytes(5).toString('hex')}`;
  const slug = `${name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'store'}-${id.slice(-4)}`;
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    const [[plan]] = await connection.execute('SELECT id,limits_json FROM plans WHERE id=? AND active=1 FOR UPDATE', [planId]);
    if (!plan) throw Object.assign(new Error('Plano ativo não encontrado.'), { status: 400 });
    const limits = safeJson(plan.limits_json, {});
    const storeLimit = Number(limits.stores ?? limits.maxStores ?? 1000);
    const [[storeCount]] = await connection.execute('SELECT COUNT(*) AS total FROM stores WHERE plan_id=?', [planId]);
    if (Number.isFinite(storeLimit) && storeLimit > 0 && Number(storeCount.total) >= storeLimit) {
      throw Object.assign(new Error('O limite de lojas do plano foi atingido.'), { status: 409 });
    }
    await connection.execute('INSERT INTO stores (id,name,slug,plan_id,owner_open_id) VALUES (?,?,?,?,?)', [id, name, slug, planId, ownerOpenId || null]);
    if (ownerOpenId) {
      const [[owner]] = await connection.execute('SELECT open_id,role FROM app_users WHERE open_id=? FOR UPDATE', [ownerOpenId]);
      if (!owner) throw Object.assign(new Error('O usuário proprietário precisa entrar na plataforma primeiro.'), { status: 404 });
      if (owner.role === 'super_admin') throw Object.assign(new Error('Não use a conta Super Admin como proprietária de uma loja.'), { status: 409 });
      await connection.execute("INSERT INTO store_members (store_id,open_id,role) VALUES (?,?, 'owner')", [id, ownerOpenId]);
      await connection.execute("UPDATE app_users SET role='store_owner' WHERE open_id=?", [ownerOpenId]);
    }
    await connection.commit();
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
  return (await listStores()).find(store => store.id === id);
}

async function assignStoreMember(storeId, openId, role) {
  if (!['store_owner', 'staff'].includes(role)) throw Object.assign(new Error('Perfil de loja inválido.'), { status: 400 });
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    const [[store]] = await connection.execute(
      `SELECT st.id,st.plan_id,pl.limits_json FROM stores st LEFT JOIN plans pl ON pl.id=st.plan_id WHERE st.id=? FOR UPDATE`,
      [storeId],
    );
    if (!store) throw Object.assign(new Error('Loja não encontrada.'), { status: 404 });
    const [[user]] = await connection.execute('SELECT open_id,role FROM app_users WHERE open_id=? FOR UPDATE', [openId]);
    if (!user) throw Object.assign(new Error('O usuário precisa entrar na plataforma antes de ser vinculado.'), { status: 404 });
    if (user.role === 'super_admin') throw Object.assign(new Error('Não altere o acesso de um Super Admin por vínculo de loja.'), { status: 409 });
    const [[membership]] = await connection.execute('SELECT store_id,role FROM store_members WHERE open_id=? AND store_id<>? LIMIT 1', [openId, storeId]);
    if (membership) throw Object.assign(new Error('Cada usuário pode estar vinculado a uma loja por vez.'), { status: 409 });
    const [[current]] = await connection.execute('SELECT role FROM store_members WHERE store_id=? AND open_id=?', [storeId, openId]);
    const limits = safeJson(store.limits_json, {});
    const staffLimit = Number(limits.staff ?? limits.maxStaff ?? 1000);
    if (role === 'staff' && !current) {
      const [[count]] = await connection.execute("SELECT COUNT(*) AS total FROM store_members WHERE store_id=? AND role='staff'", [storeId]);
      if (Number(count.total) >= staffLimit) throw Object.assign(new Error('O limite de funcionários do plano foi atingido.'), { status: 409 });
    }
    const memberRole = role === 'store_owner' ? 'owner' : 'staff';
    await connection.execute(
      'INSERT INTO store_members (store_id,open_id,role) VALUES (?,?,?) ON DUPLICATE KEY UPDATE role=VALUES(role)',
      [storeId, openId, memberRole],
    );
    if (role === 'store_owner') {
      await connection.execute('UPDATE stores SET owner_open_id=? WHERE id=?', [openId, storeId]);
    }
    await connection.execute('UPDATE app_users SET role=? WHERE open_id=?', [role, openId]);
    await connection.commit();
    return { storeId, openId, role };
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

async function setStoreStatus(id, status) {
  const [result] = await pool.execute('UPDATE stores SET status=? WHERE id=?', [status, id]);
  if (!result.affectedRows) throw Object.assign(new Error('Loja não encontrada.'), { status: 404 });
  return (await listStores()).find(store => store.id === id);
}

async function assignStorePlan(storeId, planId) {
  const [[plan]] = await pool.execute('SELECT id FROM plans WHERE id=?', [planId]);
  if (!plan) throw Object.assign(new Error('Plano não encontrado.'), { status: 404 });
  const [result] = await pool.execute('UPDATE stores SET plan_id=? WHERE id=?', [planId, storeId]);
  if (!result.affectedRows) throw Object.assign(new Error('Loja não encontrada.'), { status: 404 });
  return (await listStores()).find(store => store.id === storeId);
}

async function listUsers() {
  const [rows] = await pool.query('SELECT open_id,name,email,role,blocked,created_at,last_seen_at FROM app_users ORDER BY created_at DESC');
  return rows;
}

async function updateUserRole(openId, role, blocked) {
  if (role !== undefined && !['customer', 'super_admin'].includes(role)) {
    throw Object.assign(new Error('Perfil inválido; use o vínculo de loja para owner/staff.'), { status: 400 });
  }
  const [[target]] = await pool.execute('SELECT email FROM app_users WHERE open_id=?', [openId]);
  if (!target) throw Object.assign(new Error('Usuário não encontrado.'), { status: 404 });
  if (role === 'super_admin') await pool.execute('INSERT IGNORE INTO admin_allowlist (identifier) VALUES (?)', [`open_id:${openId}`]);
  if (role === 'customer') {
    const email = `email:${String(target.email || '').trim().toLowerCase()}`;
    const [[emailGrant]] = await pool.execute('SELECT identifier FROM admin_allowlist WHERE identifier=?', [email]);
    if (emailGrant) throw Object.assign(new Error('Este e-mail está autorizado pela configuração protegida e não pode ser rebaixado aqui.'), { status: 409 });
    await pool.execute('DELETE FROM admin_allowlist WHERE identifier=?', [`open_id:${openId}`]);
  }
  const fields = [];
  const values = [];
  if (role !== undefined) { fields.push('role=?'); values.push(role); }
  if (blocked !== undefined) { fields.push('blocked=?'); values.push(blocked ? 1 : 0); }
  if (!fields.length) throw Object.assign(new Error('Nenhuma alteração informada.'), { status: 400 });
  values.push(openId);
  await pool.execute(`UPDATE app_users SET ${fields.join(',')} WHERE open_id=?`, values);
  return getUser(openId);
}

async function listPlans() {
  const [rows] = await pool.query('SELECT * FROM plans ORDER BY monthly_price,id');
  return rows.map(row => ({ ...row, limits: safeJson(row.limits_json, {}) }));
}

function validatePlan(payload, partial = false) {
  const result = {};
  if (!partial || payload.name !== undefined) {
    const name = cleanPlainText(payload.name, 80);
    if (!name) throw Object.assign(new Error('Informe o nome do plano.'), { status: 400 });
    result.name = name;
  }
  if (!partial || payload.monthlyPrice !== undefined) {
    const monthlyPrice = Number(payload.monthlyPrice);
    if (!Number.isFinite(monthlyPrice) || monthlyPrice < 0 || monthlyPrice > 1000000) throw Object.assign(new Error('Valor de referência do plano inválido.'), { status: 400 });
    result.monthlyPrice = monthlyPrice;
  }
  if (!partial || payload.limits !== undefined) {
    if (!payload.limits || typeof payload.limits !== 'object' || Array.isArray(payload.limits)) throw Object.assign(new Error('Informe os limites do plano como objeto.'), { status: 400 });
    result.limits = payload.limits;
  }
  if (payload.active !== undefined) result.active = Boolean(payload.active);
  return result;
}

async function createPlan(payload) {
  const values = validatePlan(payload);
  const requestedId = cleanPlainText(payload.id || values.name.toLowerCase().replace(/[^a-z0-9]+/g, '-'), 40).toLowerCase();
  if (!/^[a-z0-9][a-z0-9-]{1,39}$/.test(requestedId)) throw Object.assign(new Error('ID do plano inválido.'), { status: 400 });
  await pool.execute(
    'INSERT INTO plans (id,name,monthly_price,limits_json,active) VALUES (?,?,?,?,?)',
    [requestedId, values.name, values.monthlyPrice, JSON.stringify(values.limits), values.active === undefined ? 1 : Number(values.active)],
  );
  return (await listPlans()).find(plan => plan.id === requestedId);
}

async function updatePlan(id, payload) {
  const values = validatePlan(payload, true);
  const fields = [];
  const params = [];
  if (values.name !== undefined) { fields.push('name=?'); params.push(values.name); }
  if (values.monthlyPrice !== undefined) { fields.push('monthly_price=?'); params.push(values.monthlyPrice); }
  if (values.limits !== undefined) { fields.push('limits_json=?'); params.push(JSON.stringify(values.limits)); }
  if (values.active !== undefined) { fields.push('active=?'); params.push(Number(values.active)); }
  if (!fields.length) throw Object.assign(new Error('Nenhuma alteração informada.'), { status: 400 });
  params.push(id);
  const [result] = await pool.execute(`UPDATE plans SET ${fields.join(',')} WHERE id=?`, params);
  if (!result.affectedRows) throw Object.assign(new Error('Plano não encontrado.'), { status: 404 });
  return (await listPlans()).find(plan => plan.id === id);
}

const SYSTEM_SETTING_KEYS = new Set(['brand_name', 'support_email', 'announcement']);
async function getSystemSettings() {
  const [rows] = await pool.query('SELECT setting_key,setting_value,updated_at FROM system_settings ORDER BY setting_key');
  return Object.fromEntries(rows.map(row => [row.setting_key, row.setting_value]));
}

async function updateSystemSettings(payload) {
  const entries = Object.entries(payload || {});
  if (!entries.length) throw Object.assign(new Error('Nenhuma configuração informada.'), { status: 400 });
  for (const [key, value] of entries) {
    if (!SYSTEM_SETTING_KEYS.has(key)) throw Object.assign(new Error(`Configuração não permitida: ${key}`), { status: 400 });
    const maxLength = key === 'announcement' ? 500 : key === 'support_email' ? 220 : 80;
    const clean = cleanPlainText(value, maxLength);
    if (key === 'support_email' && clean && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(clean)) {
      throw Object.assign(new Error('E-mail de suporte inválido.'), { status: 400 });
    }
    await pool.execute(
      'INSERT INTO system_settings (setting_key,setting_value) VALUES (?,?) ON DUPLICATE KEY UPDATE setting_value=VALUES(setting_value)',
      [key, clean],
    );
  }
  return getSystemSettings();
}

async function storeOverview(storeId) {
  const [[sales]] = await pool.execute(
    `SELECT COALESCE(SUM(amount),0) AS revenue,COALESCE(SUM(order_count),0) AS orders FROM (
      SELECT subtotal AS amount,1 AS order_count FROM orders WHERE store_id=? AND payment_status='paid'
      UNION ALL SELECT total AS amount,1 AS order_count FROM pos_sales WHERE store_id=?
    ) paid_sales`,
    [storeId, storeId],
  );
  const [[products]] = await pool.execute(
    'SELECT COUNT(*) AS total,COALESCE(SUM(stock_qty-stock_reserved_qty<=low_stock_threshold),0) AS low_stock FROM products WHERE store_id=?',
    [storeId],
  );
  const [[pendingOrders]] = await pool.execute("SELECT COUNT(*) AS total FROM orders WHERE store_id=? AND payment_status='pending'", [storeId]);
  const [lowStock] = await pool.execute(
    'SELECT id,name,stock_qty,stock_reserved_qty,low_stock_threshold FROM products WHERE store_id=? AND stock_qty-stock_reserved_qty<=low_stock_threshold ORDER BY stock_qty-stock_reserved_qty,name LIMIT 100',
    [storeId],
  );
  return { sales, products, pendingOrders, lowStock };
}

function validImageUrl(value) {
  const image = cleanPlainText(value, 1000);
  if (!image) return '';
  if (image.startsWith('/assets/') || image.startsWith('/manus-storage/')) return image;
  try {
    const parsed = new URL(image);
    if (parsed.protocol === 'https:' && !parsed.username && !parsed.password) return parsed.toString();
  } catch { /* invalid URL */ }
  throw Object.assign(new Error('A foto deve usar URL HTTPS pública ou caminho /manus-storage/.'), { status: 400 });
}

async function listStoreProducts(storeId) {
  const [rows] = await pool.execute(
    `SELECT p.*,st.name AS store_name,st.whatsapp_phone,st.payment_instructions AS store_payment_instructions
     FROM products p JOIN stores st ON st.id=p.store_id
     WHERE p.store_id=? ORDER BY p.name`,
    [storeId],
  );
  return rows.map(hydrateProduct);
}

async function saveStoreProduct(storeId, payload) {
  const name = cleanPlainText(payload.name, 180);
  const price = Number(payload.price);
  const moq = Number(payload.moq || 1);
  const stock = Number(payload.stockQty ?? 0);
  const threshold = Number(payload.lowStockThreshold ?? 10);
  if (!name || !Number.isFinite(price) || price < 0 || price > 100000000 || !Number.isInteger(moq) || moq < 1 || moq > 1000000 || !Number.isInteger(stock) || stock < 0 || !Number.isInteger(threshold) || threshold < 0) {
    throw Object.assign(new Error('Dados do produto inválidos.'), { status: 400 });
  }
  const supplierId = cleanPlainText(payload.supplierId, 40);
  if (!supplierId) throw Object.assign(new Error('Selecione um fornecedor vinculado a esta loja.'), { status: 400 });
  const [[supplier]] = await pool.execute(
    'SELECT id,name FROM suppliers WHERE id=? AND store_id=? AND is_active=1 LIMIT 1',
    [supplierId, storeId],
  );
  if (!supplier) throw Object.assign(new Error('O fornecedor não pertence a esta loja ou está inativo.'), { status: 404 });

  const id = payload.id ? cleanPlainText(payload.id, 40) : `p-${crypto.randomBytes(5).toString('hex')}`;
  if (payload.id) {
    const [[existing]] = await pool.execute('SELECT id,stock_reserved_qty FROM products WHERE id=? AND store_id=? LIMIT 1', [id, storeId]);
    if (!existing) throw Object.assign(new Error('Produto não pertence a esta loja.'), { status: 404 });
    if (stock < Number(existing.stock_reserved_qty || 0)) throw Object.assign(new Error('O estoque não pode ficar abaixo das unidades reservadas para pedidos pendentes.'), { status: 409 });
  }
  const slugBase = cleanPlainText(payload.slug || name, 120).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'product';
  const slug = `${slugBase}-${id.slice(-4)}`;
  const category = cleanPlainText(payload.category || 'Geral', 100);
  const unit = cleanPlainText(payload.unit || 'un', 24);
  const description = cleanPlainText(payload.description || '', 4000);
  const paymentInstructions = cleanPlainText(payload.paymentInstructions || '', 3000);
  const image = validImageUrl(payload.image || '');
  const tiers = Array.isArray(payload.tiers) && payload.tiers.length ? payload.tiers.slice(0, 10) : [[`${moq}+`, `R$ ${price.toFixed(2).replace('.', ',')}`]];
  const values = [id, slug, name, supplier.id, supplier.name, category, moq, price, unit, image, cleanPlainText(payload.badge || 'LOJA', 80), description, JSON.stringify(tiers), cleanPlainText(payload.lead || 'A confirmar', 80), cleanPlainText(payload.terms || 'A combinar', 80), storeId, stock, threshold, paymentInstructions];
  await pool.execute(
    `INSERT INTO products
      (id,slug,name,supplier_id,supplier_name,category,moq,price,unit,image,badge,description,tiers_json,lead_time,terms,store_id,stock_qty,low_stock_threshold,payment_instructions)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
     ON DUPLICATE KEY UPDATE slug=VALUES(slug),name=VALUES(name),supplier_id=VALUES(supplier_id),supplier_name=VALUES(supplier_name),category=VALUES(category),moq=VALUES(moq),price=VALUES(price),unit=VALUES(unit),image=VALUES(image),badge=VALUES(badge),description=VALUES(description),tiers_json=VALUES(tiers_json),lead_time=VALUES(lead_time),terms=VALUES(terms),stock_qty=VALUES(stock_qty),low_stock_threshold=VALUES(low_stock_threshold),payment_instructions=VALUES(payment_instructions)`,
    values,
  );
  return (await listStoreProducts(storeId)).find(product => product.id === id);
}

async function listStoreSuppliers(storeId) {
  const [rows] = await pool.execute(
    `SELECT su.*,(SELECT COUNT(*) FROM products p WHERE p.supplier_id=su.id AND p.store_id=su.store_id) AS product_count
     FROM suppliers su WHERE su.store_id=? ORDER BY su.is_active DESC,su.name`,
    [storeId],
  );
  return rows.map(row => ({ ...row, tags: safeJson(row.tags_json, []) }));
}

async function saveStoreSupplier(storeId, payload) {
  const name = cleanPlainText(payload.name, 180);
  const specialty = cleanPlainText(payload.specialty || '', 180);
  const location = cleanPlainText(payload.location || '', 180);
  const description = cleanPlainText(payload.description || '', 3000);
  if (!name || !specialty || !location) throw Object.assign(new Error('Informe nome, especialidade e local do fornecedor.'), { status: 400 });
  const id = payload.id ? cleanPlainText(payload.id, 40) : `s-${crypto.randomBytes(5).toString('hex')}`;
  if (payload.id) {
    const [[existing]] = await pool.execute('SELECT id FROM suppliers WHERE id=? AND store_id=?', [id, storeId]);
    if (!existing) throw Object.assign(new Error('Fornecedor não pertence a esta loja.'), { status: 404 });
  }
  const slug = `${name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'supplier'}-${id.slice(-4)}`;
  const tags = Array.isArray(payload.tags) ? payload.tags.map(tag => cleanPlainText(tag, 40)).filter(Boolean).slice(0, 10) : [];
  const active = payload.active === undefined ? 1 : Number(Boolean(payload.active));
  await pool.execute(
    `INSERT INTO suppliers (id,slug,name,mark,location,specialty,since,description,tags_json,store_id,is_active)
     VALUES (?,?,?,?,?,?,?,?,?,?,?)
     ON DUPLICATE KEY UPDATE slug=VALUES(slug),name=VALUES(name),mark=VALUES(mark),location=VALUES(location),specialty=VALUES(specialty),since=VALUES(since),description=VALUES(description),tags_json=VALUES(tags_json),is_active=VALUES(is_active)`,
    [id, slug, name, name.split(/\s+/).map(part => part[0]).join('').slice(0, 3).toUpperCase(), location, specialty, cleanPlainText(payload.since || String(new Date().getFullYear()), 8), description, JSON.stringify(tags), storeId, active],
  );
  await pool.execute('UPDATE products SET supplier_name=? WHERE supplier_id=? AND store_id=?', [name, id, storeId]);
  return (await listStoreSuppliers(storeId)).find(supplier => supplier.id === id);
}

async function setStoreSupplierStatus(storeId, id, active) {
  const [result] = await pool.execute('UPDATE suppliers SET is_active=? WHERE id=? AND store_id=?', [active ? 1 : 0, id, storeId]);
  if (!result.affectedRows) throw Object.assign(new Error('Fornecedor não encontrado nesta loja.'), { status: 404 });
  return (await listStoreSuppliers(storeId)).find(supplier => supplier.id === id);
}

async function storeSettings(storeId) {
  const [[row]] = await pool.execute('SELECT id,name,whatsapp_phone,payment_instructions FROM stores WHERE id=?', [storeId]);
  if (!row) throw Object.assign(new Error('Loja não encontrada.'), { status: 404 });
  return row;
}

async function updateStoreSettings(storeId, payload) {
  const fields = [];
  const values = [];
  if (payload.whatsappPhone !== undefined) {
    const digits = String(payload.whatsappPhone || '').replace(/\D/g, '');
    if (digits && (digits.length < 10 || digits.length > 15)) throw Object.assign(new Error('Informe o WhatsApp com código do país e DDD (10 a 15 dígitos).'), { status: 400 });
    fields.push('whatsapp_phone=?');
    values.push(digits || null);
  }
  if (payload.paymentInstructions !== undefined) {
    const instructions = cleanPlainText(payload.paymentInstructions, 3000);
    fields.push('payment_instructions=?');
    values.push(instructions || null);
  }
  if (!fields.length) throw Object.assign(new Error('Nenhuma configuração informada.'), { status: 400 });
  values.push(storeId);
  const [result] = await pool.execute(`UPDATE stores SET ${fields.join(',')} WHERE id=?`, values);
  if (!result.affectedRows) throw Object.assign(new Error('Loja não encontrada.'), { status: 404 });
  return storeSettings(storeId);
}

async function moveInventory(storeId, payload, openId) {
  const qty = Number(payload.qty);
  if (!Number.isInteger(qty) || qty <= 0 || qty > 1000000 || !['in', 'out'].includes(payload.type)) {
    throw Object.assign(new Error('Tipo ou quantidade de movimentação inválida.'), { status: 400 });
  }
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    const [[product]] = await connection.execute('SELECT stock_qty,stock_reserved_qty FROM products WHERE id=? AND store_id=? FOR UPDATE', [payload.productId, storeId]);
    if (!product) throw Object.assign(new Error('Produto não pertence a esta loja.'), { status: 404 });
    if (payload.type === 'out' && Number(product.stock_qty) - Number(product.stock_reserved_qty || 0) < qty) throw Object.assign(new Error('Estoque disponível insuficiente; há unidades reservadas para pedidos pendentes.'), { status: 409 });
    await connection.execute('UPDATE products SET stock_qty=stock_qty+? WHERE id=? AND store_id=?', [payload.type === 'out' ? -qty : qty, payload.productId, storeId]);
    await connection.execute('INSERT INTO inventory_movements (store_id,product_id,type,qty,note,created_by) VALUES (?,?,?,?,?,?)', [storeId, payload.productId, payload.type, qty, cleanPlainText(payload.note || '', 255) || null, openId]);
    await connection.commit();
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
  return (await listStoreProducts(storeId)).find(product => product.id === payload.productId);
}

async function storeOrders(storeId) {
  const [orders] = await pool.execute('SELECT * FROM orders WHERE store_id=? ORDER BY created_at DESC LIMIT 100', [storeId]);
  if (!orders.length) return [];
  const ids = orders.map(order => order.id);
  const placeholders = ids.map(() => '?').join(',');
  const [items] = await pool.execute(`SELECT * FROM order_items WHERE order_id IN (${placeholders}) ORDER BY id`, ids);
  const byOrder = new Map();
  for (const item of items) {
    if (!byOrder.has(item.order_id)) byOrder.set(item.order_id, []);
    byOrder.get(item.order_id).push(item);
  }
  return orders.map(order => ({ ...order, items: byOrder.get(order.id) || [] }));
}

async function confirmManualPayment(storeId, orderId) {
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    const [[order]] = await connection.execute('SELECT * FROM orders WHERE id=? AND store_id=? FOR UPDATE', [orderId, storeId]);
    if (!order) throw Object.assign(new Error('Pedido não encontrado nesta loja.'), { status: 404 });
    if (order.payment_status === 'paid') {
      await connection.commit();
      return order;
    }
    if (order.payment_status !== 'pending' || order.status !== 'awaiting_manual_payment') {
      throw Object.assign(new Error('Este pedido não está aguardando confirmação manual.'), { status: 409 });
    }
    const [items] = await connection.execute('SELECT product_id,qty,inventory_reserved FROM order_items WHERE order_id=?', [orderId]);
    for (const item of items) {
      const [[product]] = await connection.execute('SELECT stock_qty,stock_reserved_qty FROM products WHERE id=? AND store_id=? FOR UPDATE', [item.product_id, storeId]);
      if (!product) throw Object.assign(new Error('Um item do pedido não pertence mais a esta loja.'), { status: 409 });
      const qty = Number(item.qty);
      const reserved = Boolean(item.inventory_reserved);
      const available = Number(product.stock_qty) - Number(product.stock_reserved_qty || 0);
      if (Number(product.stock_qty) < qty || (reserved && Number(product.stock_reserved_qty) < qty) || (!reserved && available < qty)) {
        throw Object.assign(new Error('Estoque insuficiente para confirmar o pedido. Faça a reposição e tente novamente.'), { status: 409 });
      }
      if (reserved) {
        await connection.execute('UPDATE products SET stock_qty=stock_qty-?,stock_reserved_qty=stock_reserved_qty-? WHERE id=? AND store_id=?', [qty, qty, item.product_id, storeId]);
      } else {
        await connection.execute('UPDATE products SET stock_qty=stock_qty-? WHERE id=? AND store_id=?', [qty, item.product_id, storeId]);
      }
    }
    await connection.execute("UPDATE orders SET payment_status='paid',status='paid',paid_at=CURRENT_TIMESTAMP WHERE id=? AND store_id=?", [orderId, storeId]);
    await connection.commit();
    const [[updated]] = await pool.execute('SELECT * FROM orders WHERE id=? AND store_id=?', [orderId, storeId]);
    return updated;
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

async function cancelManualOrder(storeId, orderId) {
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    const [[order]] = await connection.execute('SELECT id,status,payment_status FROM orders WHERE id=? AND store_id=? FOR UPDATE', [orderId, storeId]);
    if (!order) throw Object.assign(new Error('Pedido não encontrado nesta loja.'), { status: 404 });
    if (order.payment_status !== 'pending' || order.status !== 'awaiting_manual_payment') {
      throw Object.assign(new Error('Somente pedidos pendentes podem ser cancelados aqui. Confirme eventual pagamento fora do sistema.'), { status: 409 });
    }
    const [items] = await connection.execute('SELECT product_id,qty,inventory_reserved FROM order_items WHERE order_id=?', [orderId]);
    for (const item of items) {
      if (item.inventory_reserved) {
        await connection.execute('UPDATE products SET stock_reserved_qty=GREATEST(stock_reserved_qty-?,0) WHERE id=? AND store_id=?', [item.qty, item.product_id, storeId]);
      }
    }
    await connection.execute('UPDATE order_items SET inventory_reserved=0 WHERE order_id=?', [orderId]);
    await connection.execute("UPDATE orders SET status='cancelled',payment_status='cancelled' WHERE id=? AND store_id=?", [orderId, storeId]);
    await connection.commit();
    const [[updated]] = await pool.execute('SELECT * FROM orders WHERE id=? AND store_id=?', [orderId, storeId]);
    return updated;
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

async function updateStoreOrderStatus(storeId, orderId, status) {
  const previous = { processing: 'paid', shipped: 'processing', completed: 'shipped' };
  if (!Object.hasOwn(previous, status)) throw Object.assign(new Error('Status de andamento inválido.'), { status: 400 });
  const [result] = await pool.execute(
    'UPDATE orders SET status=? WHERE id=? AND store_id=? AND payment_status=\'paid\' AND status=?',
    [status, orderId, storeId, previous[status]],
  );
  if (!result.affectedRows) throw Object.assign(new Error('Pedido pago não encontrado ou transição inválida.'), { status: 409 });
  const [[order]] = await pool.execute('SELECT * FROM orders WHERE id=? AND store_id=?', [orderId, storeId]);
  return order;
}

async function cash(storeId) {
  const [[open]] = await pool.execute("SELECT * FROM cash_sessions WHERE store_id=? AND status='open' ORDER BY id DESC LIMIT 1", [storeId]);
  const [history] = await pool.execute('SELECT * FROM cash_sessions WHERE store_id=? ORDER BY id DESC LIMIT 20', [storeId]);
  if (open) {
    const [[sales]] = await pool.execute("SELECT COALESCE(SUM(total),0) AS cash_sales FROM pos_sales WHERE cash_session_id=? AND payment_method='cash'", [open.id]);
    open.cash_sales = Number(sales.cash_sales || 0);
    open.expected_cash = Number(open.opening_amount) + open.cash_sales;
  }
  return { open, history };
}

async function openCash(storeId, openId, amount) {
  const value = Number(amount);
  if (!Number.isFinite(value) || value < 0 || value > 100000000) throw Object.assign(new Error('Valor inicial inválido.'), { status: 400 });
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    const [[store]] = await connection.execute("SELECT id FROM stores WHERE id=? AND status='active' FOR UPDATE", [storeId]);
    if (!store) throw Object.assign(new Error('Loja ativa não encontrada.'), { status: 404 });
    const [[existing]] = await connection.execute("SELECT id FROM cash_sessions WHERE store_id=? AND status='open' LIMIT 1 FOR UPDATE", [storeId]);
    if (existing) throw Object.assign(new Error('Já existe um caixa aberto.'), { status: 409 });
    await connection.execute('INSERT INTO cash_sessions (store_id,opened_by,opening_amount) VALUES (?,?,?)', [storeId, openId, value]);
    await connection.commit();
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
  return cash(storeId);
}

async function closeCash(storeId, amount) {
  const value = Number(amount);
  if (!Number.isFinite(value) || value < 0 || value > 100000000) throw Object.assign(new Error('Valor final inválido.'), { status: 400 });
  const [result] = await pool.execute(
    "UPDATE cash_sessions SET status='closed',closing_amount=?,closed_at=CURRENT_TIMESTAMP WHERE store_id=? AND status='open'",
    [value, storeId],
  );
  if (!result.affectedRows) throw Object.assign(new Error('Não existe caixa aberto.'), { status: 409 });
  return cash(storeId);
}

async function createPosSale(storeId, openId, payload) {
  const items = normalizePosItems(Array.isArray(payload.items) ? payload.items : []);
  const methods = ['cash', 'card_external', 'pix_manual'];
  if (!items.length || items.length > 50 || !methods.includes(payload.paymentMethod || 'cash')) {
    throw Object.assign(new Error('Venda inválida.'), { status: 400 });
  }
  const connection = await pool.getConnection();
  const saleId = crypto.randomUUID();
  try {
    await connection.beginTransaction();
    const [[session]] = await connection.execute("SELECT id FROM cash_sessions WHERE store_id=? AND status='open' ORDER BY id DESC LIMIT 1 FOR UPDATE", [storeId]);
    if (!session) throw Object.assign(new Error('Abra o caixa antes de registrar vendas.'), { status: 409 });
    let total = 0;
    const priced = [];
    for (const item of items) {
      const qty = Number(item.qty);
      if (!Number.isInteger(qty) || qty <= 0 || qty > 100000) throw Object.assign(new Error('Quantidade inválida.'), { status: 400 });
      const [[product]] = await connection.execute('SELECT id,price,stock_qty,stock_reserved_qty FROM products WHERE id=? AND store_id=? FOR UPDATE', [item.productId, storeId]);
      if (!product) throw Object.assign(new Error('Produto não pertence a esta loja.'), { status: 404 });
      if (Number(product.stock_qty) - Number(product.stock_reserved_qty || 0) < qty) throw Object.assign(new Error(`Estoque disponível insuficiente para ${item.productId}.`), { status: 409 });
      const unitPriceValue = Number(product.price);
      total += unitPriceValue * qty;
      priced.push({ id: product.id, qty, unitPrice: unitPriceValue });
    }
    await connection.execute('INSERT INTO pos_sales (id,store_id,cash_session_id,total,payment_method,created_by) VALUES (?,?,?,?,?,?)', [saleId, storeId, session.id, total, payload.paymentMethod || 'cash', openId]);
    for (const item of priced) {
      await connection.execute('INSERT INTO pos_sale_items (sale_id,product_id,qty,unit_price) VALUES (?,?,?,?)', [saleId, item.id, item.qty, item.unitPrice]);
      const [stockUpdate] = await connection.execute('UPDATE products SET stock_qty=stock_qty-? WHERE id=? AND store_id=? AND stock_qty-COALESCE(stock_reserved_qty,0)>=?', [item.qty, item.id, storeId, item.qty]);
      if (!stockUpdate.affectedRows) throw Object.assign(new Error('O estoque disponível mudou durante a venda. Atualize o PDV e tente novamente.'), { status: 409 });
    }
    await connection.commit();
    return { id: saleId, total };
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

async function listPosSales(storeId) {
  const [rows] = await pool.execute(
    `SELECT ps.id,ps.total,ps.payment_method,ps.created_at,u.name AS staff_name,
      GROUP_CONCAT(CONCAT(psi.qty,' × ',p.name) ORDER BY psi.id SEPARATOR ', ') AS items
     FROM pos_sales ps
     LEFT JOIN pos_sale_items psi ON psi.sale_id=ps.id
     LEFT JOIN products p ON p.id=psi.product_id
     LEFT JOIN app_users u ON u.open_id=ps.created_by
     WHERE ps.store_id=? GROUP BY ps.id ORDER BY ps.created_at DESC LIMIT 100`,
    [storeId],
  );
  return rows;
}

async function accountOrders(openId) {
  const [rows] = await pool.execute(
    `SELECT o.*,st.name AS store_name FROM orders o LEFT JOIN stores st ON st.id=o.store_id
     WHERE o.customer_open_id=?
     ORDER BY o.created_at DESC LIMIT 200`,
    [openId],
  );
  return rows;
}

module.exports = {
  pool,
  ensureSchema,
  getCatalog,
  getOrCreateCart,
  getCart,
  addCartItem,
  setCartItem,
  removeCartItem,
  createOrder,
  unitPrice,
  getOrder,
  saveSupport,
  saveSubscriber,
  upsertUser,
  getUser,
  isStoreMember,
  accessibleStore,
  adminOverview,
  adminReports,
  listStores,
  createStore,
  assignStoreMember,
  setStoreStatus,
  assignStorePlan,
  listUsers,
  updateUserRole,
  listPlans,
  createPlan,
  updatePlan,
  getSystemSettings,
  updateSystemSettings,
  storeOverview,
  listStoreProducts,
  saveStoreProduct,
  listStoreSuppliers,
  saveStoreSupplier,
  setStoreSupplierStatus,
  storeSettings,
  updateStoreSettings,
  moveInventory,
  storeOrders,
  confirmManualPayment,
  cancelManualOrder,
  updateStoreOrderStatus,
  cash,
  openCash,
  closeCash,
  createPosSale,
  listPosSales,
  accountOrders,
};
