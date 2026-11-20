// Prueba de punta a punta: un pedido entregado en el panel de pedidos entra solo al panel de reseñas.
// Necesita los DOS Workers en marcha en local y las claves iguales:
//   tienda/   → npm run dev                       (puerto 8787; en ../.dev.vars: RESENAS_URL y RESENAS_CLAVE)
//   resenas/  → npm run dev                       (puerto 8788; en resenas/.dev.vars: INTEGRACION_CLAVE, mismo valor)
// Además, en el panel de reseñas ya debe existir el usuario de prueba (lo crean las pruebas de resenas/).
// Corre con: npm run test:resenas
import test from 'node:test';
import assert from 'node:assert/strict';

const BASE = process.env.BASE || 'http://127.0.0.1:8787';
const RESENAS = process.env.RESENAS_BASE || 'http://127.0.0.1:8788';
const USUARIO = process.env.RESENAS_USUARIO || 'prueba@ejemplo.com';
const CLAVE_USUARIO = process.env.RESENAS_CLAVE_USUARIO || 'Nueva-clave-22';
const AW = { 'Content-Type': 'application/json', 'X-Requested-With': 'admin' };
let galleta = '';
const admin = (ruta, { method = 'GET', body } = {}) =>
  fetch(BASE + '/api/admin' + ruta, { method, headers: { ...(method === 'GET' ? {} : AW), Cookie: galleta }, body: body === undefined ? undefined : JSON.stringify(body) });

let pedido;

test('preparar: pedido de prueba listo para enviarse', async () => {
  const r = await fetch(BASE + '/api/admin/entrar', { method: 'POST', headers: AW, body: JSON.stringify({ email: 'prueba@local.test', codigo: process.env.ADMIN_CODE || 'PANEL-LOCAL-1234' }) });
  assert.equal(r.status, 200);
  galleta = r.headers.get('set-cookie').split(';')[0];
  const n = await fetch(BASE + '/api/pedidos', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'tienda' },
    body: JSON.stringify({
      clave: 'resenas-' + crypto.randomUUID(), turnstile: 'XXXX.DUMMY.TOKEN.XXXX',
      cliente: { nombre: 'Marta Reseña', telefono: '0993334455', ciudad: 'Loja', direccion: 'Av. Universitaria 123' },
      items: [{ id: 'cama-princess', qty: 2 }],
    }),
  });
  assert.equal(n.status, 201);
  pedido = await n.json();
  pedido.id = (await (await admin('/pedidos?estado=&q=' + pedido.codigo)).json()).pedidos[0].id;
  await admin(`/pedidos/${pedido.id}/montos`, { method: 'POST', body: { envio_cents: 2500, abono_cents: null } });
  let desde = 'nuevo';
  for (const estado of ['por_pagar', 'confirmado', 'en_fabricacion', 'listo', 'enviado']) {
    const e = await admin(`/pedidos/${pedido.id}/estado`, { method: 'POST', body: { estado, desde } });
    assert.equal(e.status, 200, estado);
    desde = estado;
  }
});

test('antes de entregar, el cliente todavía no está en el panel de reseñas', async () => {
  const ev = (await (await admin(`/pedidos/${pedido.id}`)).json()).eventos;
  assert.ok(!ev.some(e => e.tipo === 'resenas'));
});

test('al entregar, el pedido lo anota y el cliente aparece en reseñas con su pedido', async () => {
  const e = await admin(`/pedidos/${pedido.id}/estado`, { method: 'POST', body: { estado: 'entregado', desde: 'enviado' } });
  assert.equal(e.status, 200);
  const ev = (await e.json()).eventos.filter(x => x.tipo === 'resenas');
  assert.equal(ev.length, 1);
  assert.equal(ev[0].detalle.ok, true, JSON.stringify(ev[0].detalle));

  const login = await fetch(RESENAS + '/api/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ usuario: USUARIO, clave: CLAVE_USUARIO }) });
  assert.equal(login.status, 200, 'el usuario de prueba del panel de reseñas debe existir');
  const { token } = await login.json();
  const datos = await (await fetch(RESENAS + '/api/datos', { headers: { Authorization: 'Bearer ' + token } })).json();
  const cli = datos.clientes.filter(c => c.pedido === pedido.codigo);
  assert.equal(cli.length, 1);
  assert.equal(cli[0].nombre, 'Marta Reseña');
  assert.equal(cli[0].telefono, '0993334455');
  assert.match(cli[0].producto, /^2 × /);
  assert.equal(cli[0].entrega, new Date().toLocaleDateString('en-CA', { timeZone: 'America/Guayaquil' }));
  assert.equal(cli[0].msg1, null);
});
