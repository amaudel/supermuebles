// Pruebas del panel (fase 2) contra un Worker local en marcha.
// Antes: npm run db:migrar && npm run db:precios-prueba (crea la usuaria prueba@local.test), y npm run dev.
// Cada corrida suma 2 entradas fallidas al límite (10 cada 10 minutos) y 1 pedido al límite por IP.
import test from 'node:test';
import assert from 'node:assert/strict';

const BASE = process.env.BASE || 'http://127.0.0.1:8787';
const EMAIL = 'prueba@local.test';
const CODIGO = process.env.ADMIN_CODE || 'PANEL-LOCAL-1234';
const W = { 'Content-Type': 'application/json', 'X-Requested-With': 'admin' };

let galleta = '';
const admin = (ruta, { method = 'GET', body } = {}) =>
  fetch(BASE + '/api/admin' + ruta, {
    method,
    headers: { ...(method === 'GET' ? {} : W), Cookie: galleta },
    body: body === undefined ? undefined : JSON.stringify(body),
  });

let pedido; // { codigo, token, id }

test('entrar: pide encabezado propio, rechaza código o correo malos y acepta los buenos', async () => {
  const sinEncabezado = await fetch(BASE + '/api/admin/entrar', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: EMAIL, codigo: CODIGO }) });
  assert.equal(sinEncabezado.status, 403);
  assert.equal((await fetch(BASE + '/api/admin/entrar', { method: 'POST', headers: W, body: JSON.stringify({ email: EMAIL, codigo: 'malo' }) })).status, 401);
  assert.equal((await fetch(BASE + '/api/admin/entrar', { method: 'POST', headers: W, body: JSON.stringify({ email: 'otra@x.test', codigo: CODIGO }) })).status, 401);
  assert.equal((await fetch(BASE + '/api/admin/yo')).status, 401);

  const r = await fetch(BASE + '/api/admin/entrar', { method: 'POST', headers: W, body: JSON.stringify({ email: EMAIL.toUpperCase(), codigo: CODIGO }) });
  assert.equal(r.status, 200);
  const sc = r.headers.get('set-cookie');
  assert.match(sc, /HttpOnly/);
  assert.match(sc, /SameSite=Strict/);
  assert.match(sc, /Path=\/api\/admin/);
  galleta = sc.split(';')[0];
  const yo = await (await admin('/yo')).json();
  assert.equal(yo.email, EMAIL);

  const [n, exp, , firma] = galleta.split(/[=.]/);
  const otra = `${n}=${exp}.${Buffer.from('jefe@x.test').toString('base64url')}.${firma}`;
  assert.equal((await fetch(BASE + '/api/admin/yo', { headers: { Cookie: otra } })).status, 401, 'cambiar el correo de la cookie la invalida');
});

test('pedido de punta a punta: montos, estados, notas y datos de pago', async () => {
  const r = await fetch(BASE + '/api/pedidos', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'tienda' },
    body: JSON.stringify({
      clave: 'panel-' + crypto.randomUUID(), turnstile: 'XXXX.DUMMY.TOKEN.XXXX',
      cliente: { nombre: 'Ana Panel', telefono: '0991112233', ciudad: 'Loja', direccion: 'Calle 10 de Agosto 5-67' },
      items: [{ id: 'sala-titanic', qty: 1 }],
    }),
  });
  assert.equal(r.status, 201);
  pedido = await r.json();

  const lista = await (await admin('/pedidos?estado=nuevo&q=' + pedido.codigo)).json();
  assert.equal(lista.pedidos.length, 1);
  pedido.id = lista.pedidos[0].id;

  const det = await (await admin('/pedidos/' + pedido.id)).json();
  assert.equal(det.pedido.telefono, '0991112233', 'el panel sí ve el teléfono');
  assert.deepEqual(det.siguientes, ['por_pagar', 'cancelado']);

  let x = await admin(`/pedidos/${pedido.id}/estado`, { method: 'POST', body: { estado: 'por_pagar', desde: 'nuevo' } });
  assert.equal(x.status, 400, 'no pasa a por pagar sin total');

  x = await admin(`/pedidos/${pedido.id}/montos`, { method: 'POST', body: { envio_cents: 4500, descuento_cents: 1000, abono_cents: 200000 } });
  assert.equal(x.status, 400, 'el abono no puede superar el total');
  x = await admin(`/pedidos/${pedido.id}/montos`, { method: 'POST', body: { envio_cents: 4500, descuento_cents: 1000, abono_cents: 50000 } });
  assert.equal(x.status, 200);
  assert.equal((await x.json()).pedido.total_cents, 100000 + 4500 - 1000);

  x = await admin(`/pedidos/${pedido.id}/estado`, { method: 'POST', body: { estado: 'por_pagar', desde: 'nuevo' } });
  assert.equal(x.status, 200);

  // Sin cuenta configurada, el cliente ve el total pero no datos de pago.
  await admin('/ajustes', { method: 'PUT', body: { tienda_activa: true, pago_banco: null, pago_instrucciones: '' } });
  let seg = await (await fetch(BASE + '/api/pedidos/' + pedido.token)).json();
  assert.equal(seg.estado, 'por_pagar');
  assert.equal(seg.total_cents, 103500);
  assert.equal(seg.pago, null);

  x = await admin('/ajustes', { method: 'PUT', body: { tienda_activa: true, pago_banco: { banco: 'Banco de Prueba', tipo: 'Ahorros', numero: '0000000000', titular: 'Titular de Prueba' }, pago_instrucciones: '' } });
  assert.equal(x.status, 200);
  seg = await (await fetch(BASE + '/api/pedidos/' + pedido.token)).json();
  assert.equal(seg.pago.cuenta.banco, 'Banco de Prueba');

  x = await admin(`/pedidos/${pedido.id}/estado`, { method: 'POST', body: { estado: 'entregado', desde: 'por_pagar' } });
  assert.equal(x.status, 400, 'no se salta pasos');
  x = await admin(`/pedidos/${pedido.id}/estado`, { method: 'POST', body: { estado: 'confirmado', desde: 'nuevo' } });
  assert.equal(x.status, 409, 'si alguien lo cambió antes, avisa');
  x = await admin(`/pedidos/${pedido.id}/estado`, { method: 'POST', body: { estado: 'cancelado', desde: 'por_pagar' } });
  assert.equal(x.status, 400, 'cancelar pide motivo');

  x = await admin(`/pedidos/${pedido.id}/estado`, { method: 'POST', body: { estado: 'confirmado', desde: 'por_pagar' } });
  assert.equal(x.status, 200);
  const conf = await x.json();
  assert.equal(conf.pedido.estado_pago, 'verificado');
  seg = await (await fetch(BASE + '/api/pedidos/' + pedido.token)).json();
  assert.equal(seg.pago, null, 'pagado: ya no muestra la cuenta');

  x = await admin(`/pedidos/${pedido.id}/montos`, { method: 'POST', body: { envio_cents: 0 } });
  assert.equal(x.status, 409, 'los montos no cambian después de confirmar el pago');

  x = await admin(`/pedidos/${pedido.id}/nota`, { method: 'POST', body: { texto: 'Entregar en la tarde' } });
  const conNota = await x.json();
  const tipos = conNota.eventos.map(e => e.tipo);
  assert.deepEqual(tipos, ['creado', 'montos', 'estado', 'estado', 'nota']);
  assert.ok(conNota.eventos.every(e => e.tipo === 'creado' || e.actor === EMAIL), 'cada cambio dice quién lo hizo');

  await admin('/ajustes', { method: 'PUT', body: { tienda_activa: true, pago_banco: null, pago_instrucciones: '' } });
});

test('modelos: poner y quitar precio cambia lo que se puede pedir', async () => {
  let x = await admin('/productos/sala-rose', { method: 'PUT', body: { price_cents: 123400, active: true } });
  assert.equal(x.status, 200);
  let pub = await (await fetch(BASE + '/api/productos')).json();
  assert.equal(pub.productos.find(p => p.id === 'sala-rose')?.price_cents, 123400);

  x = await admin('/productos/sala-rose', { method: 'PUT', body: { price_cents: -5, active: true } });
  assert.equal(x.status, 400);

  await admin('/productos/sala-rose', { method: 'PUT', body: { price_cents: null, active: true } });
  pub = await (await fetch(BASE + '/api/productos')).json();
  assert.ok(!pub.productos.some(p => p.id === 'sala-rose'));
});

test('salir borra la sesión', async () => {
  const r = await admin('/salir', { method: 'POST', body: {} });
  assert.match(r.headers.get('set-cookie'), /Max-Age=0/);
});
