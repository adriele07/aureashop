function sanitizePublicProduct(product) {
  if (!product || typeof product !== 'object') return product;
  const stock = Number(product.stockQty ?? 0);
  const reserved = Number(product.stockReservedQty ?? 0);
  const suppliedAvailable = product.availableQty;
  const rawAvailable = suppliedAvailable == null ? stock - reserved : Number(suppliedAvailable);
  const available = Number.isFinite(rawAvailable) ? Math.max(0, rawAvailable) : 0;
  const minimum = Math.max(1, Number(product.moq) || 1);
  const {
    stockQty,
    stockReservedQty,
    availableQty,
    lowStockThreshold,
    ...publicFields
  } = product;
  return {
    ...publicFields,
    inStock: available > 0,
    orderable: available >= minimum,
  };
}

function sanitizePublicCatalog(catalog) {
  return {
    ...catalog,
    products: Array.isArray(catalog?.products) ? catalog.products.map(sanitizePublicProduct) : [],
  };
}

function sanitizePublicCart(cart) {
  return {
    ...cart,
    products: Array.isArray(cart?.products) ? cart.products.map(sanitizePublicProduct) : [],
  };
}

module.exports = { sanitizePublicProduct, sanitizePublicCatalog, sanitizePublicCart };
