(function exposeCatalogUtils(root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.TradeVaultCatalog = api;
})(typeof globalThis === 'object' ? globalThis : window, function createCatalogUtils() {
  function findProduct(products, key) {
    if (!Array.isArray(products)) return null;
    const normalizedKey = String(key ?? '');
    if (!normalizedKey) return null;
    return products.find(product => product && (String(product.id) === normalizedKey || String(product.slug) === normalizedKey)) || null;
  }

  return { findProduct };
});
