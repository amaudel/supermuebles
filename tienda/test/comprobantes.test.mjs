// Pruebas de comprobantes (fase 3) contra un Worker local en marcha (npm run dev, que incluye --test-scheduled).
// Usa 1 pedido y 7 subidas: el límite de comprobantes es 10 por minuto, así que espera un minuto entre corridas.
import test from 'node:test';
import assert from 'node:assert/strict';
import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const BASE = process.env.BASE || 'http://127.0.0.1:8787';
const LOCAL = BASE.startsWith('http://127.0.0.1');
const AW = { 'Content-Type': 'application/json', 'X-Requested-With': 'admin' };
let galleta = '';
const admin = (ruta, { method = 'GET', body } = {}) =>
  fetch(BASE + '/api/admin' + ruta, { method, headers: { ...(method === 'GET' ? {} : AW), Cookie: galleta }, body: body === undefined ? undefined : JSON.stringify(body) });
const subir = (token, bytes, tipo, headers = { 'X-Requested-With': 'tienda' }) =>
  fetch(BASE + '/api/pedidos/' + token + '/comprobante', { method: 'POST', headers: { 'Content-Type': tipo, ...headers }, body: bytes });

const PNG = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(64, 1)]);
const PDF = Buffer.from('%PDF-1.4\n% comprobante de prueba\n%%EOF\n');

let pedido;

test('preparar: pedido en «Por pagar»', async () => {
  const r = await fetch(BASE + '/api/admin/entrar', { method: 'POST', headers: AW, body: JSON.stringify({ email: 'prueba@local.test', codigo: process.env.ADMIN_CODE || 'PANEL-LOCAL-1234' }) });
  assert.equal(r.status, 200);
  galleta = r.headers.get('set-cookie').split(';')[0];

  const n = await fetch(BASE + '/api/pedidos', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'tienda' },
    body: JSON.stringify({
      clave: 'comp-' + crypto.randomUUID(), turnstile: 'XXXX.DUMMY.TOKEN.XXXX',
      cliente: { nombre: 'Luis Comprobante', telefono: '0992223344', ciudad: 'Ambato', direccion: 'Av. Cevallos y Montalvo' },
      items: [{ id: 'cama-princess', qty: 1 }],
    }),
  });
  assert.equal(n.status, 201);
  pedido = await n.json();
  pedido.id = (await (await admin('/pedidos?estado=&q=' + pedido.codigo)).json()).pedidos[0].id;

  assert.equal((await subir(pedido.token, PNG, 'image/png')).status, 409, 'sin total todavía no se puede pagar');

  await admin(`/pedidos/${pedido.id}/montos`, { method: 'POST', body: { envio_cents: 2500, abono_cents: null } });
  assert.equal((await admin(`/pedidos/${pedido.id}/estado`, { method: 'POST', body: { estado: 'por_pagar', desde: 'nuevo' } })).status, 200);
});

test('subir: rechaza lo que no es foto o PDF, lo muy pesado y sin encabezado', async () => {
  assert.equal((await subir(pedido.token, PNG, 'image/png', {})).status, 403);
  assert.equal((await subir(pedido.token, Buffer.from('<html>hola</html>'), 'image/png')).status, 415, 'el tipo se mira en los bytes');
  assert.equal((await subir(pedido.token, Buffer.alloc(5_000_001, 0xff), 'image/jpeg')).status, 413);
  assert.equal((await subir('0'.repeat(32), PNG, 'image/png')).status, 404);
});

test('subir, ver en el panel, rechazar, volver a subir y confirmar', async () => {
  let r = await subir(pedido.token, PNG, 'image/png');
  assert.equal(r.status, 201, await r.clone().text());
  assert.equal((await subir(pedido.token, PNG, 'image/png')).status, 409, 'no se sube dos veces mientras se revisa');

  let seg = await (await fetch(BASE + '/api/pedidos/' + pedido.token)).json();
  assert.equal(seg.estado, 'comprobante_recibido');
  assert.equal(seg.pago, null);

  let det = await (await admin('/pedidos/' + pedido.id)).json();
  assert.equal(det.pagos.length, 1);
  assert.equal(det.pagos[0].estado, 'en_revision');
  assert.equal(det.pagos[0].monto_cents, 42050 + 2500);
  const archivo = await admin(`/pedidos/${pedido.id}/comprobantes/${det.pagos[0].id}`);
  assert.equal(archivo.status, 200);
  assert.equal(archivo.headers.get('content-type'), 'image/png');
  assert.match(archivo.headers.get('content-security-policy'), /sandbox/);
  assert.equal(Buffer.from(await archivo.arrayBuffer()).length, PNG.length);
  assert.equal((await fetch(`${BASE}/api/admin/pedidos/${pedido.id}/comprobantes/${det.pagos[0].id}`)).status, 401, 'sin sesión no se ve');

  r = await admin(`/pedidos/${pedido.id}/estado`, { method: 'POST', body: { estado: 'por_pagar', desde: 'comprobante_recibido', motivo: 'El valor no coincide' } });
  assert.equal(r.status, 200);
  det = await r.json();
  assert.equal(det.pagos[0].estado, 'rechazado');
  seg = await (await fetch(BASE + '/api/pedidos/' + pedido.token)).json();
  assert.equal(seg.estado_pago, 'rechazado');

  assert.equal((await subir(pedido.token, PDF, 'application/pdf')).status, 201);
  r = await admin(`/pedidos/${pedido.id}/estado`, { method: 'POST', body: { estado: 'confirmado', desde: 'comprobante_recibido' } });
  det = await r.json();
  assert.deepEqual(det.pagos.map(g => g.estado).sort(), ['rechazado', 'verificado']);
  assert.equal(det.pagos.find(g => g.estado === 'verificado').verificado_por, 'prueba@local.test');
  assert.equal(det.pedido.estado_pago, 'verificado');
});

test('limpieza diaria: borra comprobantes de pedidos cerrados hace más de 90 días', { skip: !LOCAL && 'solo en local' }, async () => {
  const dir = fileURLToPath(new URL('..', import.meta.url));
  execSync(
    `npx wrangler d1 execute supermuebles-tienda-pruebas --config ../wrangler.tienda.jsonc --local --command "UPDATE orders SET status = 'entregado', updated_at = '2020-01-01T00:00:00.000Z' WHERE id = '${pedido.id}'"`,
    { cwd: dir, stdio: 'ignore' },
  );
  let c = await fetch(BASE + '/cdn-cgi/handler/scheduled?cron=0+8+*+*+*');
  if (c.status === 404) c = await fetch(BASE + '/__scheduled?cron=0+8+*+*+*');
  assert.equal(c.status, 200);
  const det = await (await admin('/pedidos/' + pedido.id)).json();
  assert.ok(det.pagos.every(g => !g.tiene_archivo), 'los archivos quedan borrados');
  assert.equal((await admin(`/pedidos/${pedido.id}/comprobantes/${det.pagos[0].id}`)).status, 404);
});
