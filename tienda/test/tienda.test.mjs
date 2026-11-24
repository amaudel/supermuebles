// Pruebas de la API de la tienda (fase 1) contra un Worker local en marcha.
// Antes: npm run db:migrar && npm run db:precios-prueba, y npm run dev en otra terminal.
// Usa la llave de prueba de Turnstile (.dev.vars), que aprueba cualquier respuesta.
// El límite es de 10 envíos por minuto: estas pruebas usan 5; no las repitas seguidas más de una vez por minuto.
import test from 'node:test';
import assert from 'node:assert/strict';

const BASE = process.env.BASE || 'http://127.0.0.1:8787';
const H = { 'Content-Type': 'application/json', 'X-Requested-With': 'tienda' };
const clave = () => 'prueba-' + crypto.randomUUID();
const cliente = { nombre: 'Cliente de Prueba', telefono: '099 999 9999', ciudad: 'Guayaquil', direccion: 'Av. de prueba 123 y calle 4' };

const enviar = (body, headers = H) =>
  fetch(BASE + '/api/pedidos', { method: 'POST', headers, body: JSON.stringify({ turnstile: 'XXXX.DUMMY.TOKEN.XXXX', cliente, ...body }) });

test('productos: solo los que tienen precio, con la tienda encendida', async () => {
  const r = await fetch(BASE + '/api/productos');
  assert.equal(r.status, 200);
  assert.equal(r.headers.get('cache-control'), 'no-store');
  const d = await r.json();
  assert.equal(d.activa, true);
  assert.ok(d.productos.length >= 1);
  for (const p of d.productos) assert.equal(typeof p.price_cents, 'number');
  assert.ok(!d.productos.some(p => p.id === 'sala-rose'), 'un modelo sin precio no aparece');
});

test('pedido: el servidor pone el precio, une líneas iguales y la clave repetida devuelve el mismo pedido', async () => {
  const k = clave();
  const items = [
    { id: 'sala-titanic', qty: 1, nota: 'Tela gris', price_cents: 1 },
    { id: 'sala-titanic', qty: 2, nota: 'Tela gris' },
    { id: 'comedor-dubai', qty: 1 },
  ];
  const r = await enviar({ clave: k, items });
  assert.equal(r.status, 201, await r.clone().text());
  const d = await r.json();
  assert.match(d.codigo, /^SM-[A-Z0-9]{6}$/);
  assert.match(d.token, /^[a-f0-9]{32}$/);

  const s = await (await fetch(BASE + '/api/pedidos/' + d.token)).json();
  assert.equal(s.codigo, d.codigo);
  assert.equal(s.estado, 'nuevo');
  assert.equal(s.lineas.length, 2);
  const titanic = s.lineas.find(l => l.nombre === 'Sala Titanic');
  assert.equal(titanic.cantidad, 3);
  assert.equal(titanic.precio_cents, 100000);
  assert.equal(s.subtotal_cents, 3 * 100000 + 85000);
  assert.equal(s.envio_cents, null);
  assert.equal(s.total_cents, null);
  assert.equal(s.nombre, 'Cliente');
  assert.equal(s.telefono, undefined, 'el seguimiento no muestra el teléfono');

  const otra = await enviar({ clave: k, items });
  assert.equal(otra.status, 200);
  const o = await otra.json();
  assert.equal(o.token, d.token);
  assert.equal(o.repetido, true);
});

test('pedido: sin el encabezado propio se rechaza', async () => {
  const r = await enviar({ clave: clave(), items: [{ id: 'sala-titanic', qty: 1 }] }, { 'Content-Type': 'application/json' });
  assert.equal(r.status, 403);
});

test('pedido: un modelo sin precio no se puede pedir', async () => {
  const r = await enviar({ clave: clave(), items: [{ id: 'sala-rose', qty: 1 }] });
  assert.equal(r.status, 409);
});

test('pedido: datos inválidos dicen qué campo corregir', async () => {
  const r = await fetch(BASE + '/api/pedidos', {
    method: 'POST',
    headers: H,
    body: JSON.stringify({ clave: clave(), turnstile: 'XXXX.DUMMY.TOKEN.XXXX', cliente: { ...cliente, telefono: '12' }, items: [{ id: 'sala-titanic', qty: 1 }] }),
  });
  assert.equal(r.status, 400);
  assert.equal((await r.json()).campo, 'telefono');
});

test('seguimiento: un enlace inventado no muestra nada', async () => {
  assert.equal((await fetch(BASE + '/api/pedidos/' + '0'.repeat(32))).status, 404);
  assert.equal((await fetch(BASE + '/api/pedidos/SM-ABC123')).status, 404);
});
