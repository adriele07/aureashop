const MAX_PRODUCTS_PER_STORE = 3000;

function assertProductCapacity(currentCount) {
  const count = Number(currentCount);
  if (!Number.isSafeInteger(count) || count < 0) {
    throw Object.assign(new Error('A contagem atual de produtos é inválida.'), { status: 500 });
  }
  if (count >= MAX_PRODUCTS_PER_STORE) {
    throw Object.assign(new Error(`Cada loja pode cadastrar no máximo ${MAX_PRODUCTS_PER_STORE.toLocaleString('pt-BR')} produtos.`), { status: 409 });
  }
  return true;
}

module.exports = { MAX_PRODUCTS_PER_STORE, assertProductCapacity };
