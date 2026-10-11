const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const serverSource = fs.readFileSync(path.join(__dirname, '..', 'server.js'), 'utf8');

test('o servidor importa o construtor WhatsApp que usa ao responder o checkout', () => {
  assert.match(serverSource, /const\s+\{\s*buildWhatsAppUrl\s*\}\s*=\s*require\(['"]\.\/whatsapp['"]\)/);
  assert.match(serverSource, /whatsappUrl:\s*buildWhatsAppUrl\(order\.store\.whatsappPhone,\s*order\)/);
});
