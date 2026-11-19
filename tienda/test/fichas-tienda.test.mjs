// Pruebas de «Fichas → tienda» (juego completo y piezas sueltas) contra un Worker local en marcha.
// Escribe unas fichas de prueba en el bucket LOCAL simulado de FICHAS_FUENTE (nunca en Cloudflare).
// Usa 2 pedidos del límite por IP; corre después de los otros archivos, con la base recién migrada.
import test from 'node:test';
import assert from 'node:assert/strict';
import { execSync } from 'node:child_process';
import { writeFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const BASE = process.env.BASE || 'http://127.0.0.1:8787';
const LOCAL = BASE.startsWith('http://127.0.0.1');
const DIR = fileURLToPath(new URL('..', import.meta.url));
const AW = { 'Content-Type': 'application/json', 'X-Requested-With': 'admin' };
let galleta = '';
const admin = (ruta, { method = 'GET', body } = {}) =>
  fetch(BASE + '/api/admin' + ruta, { method, headers: { ...(method === 'GET' ? {} : AW), Cookie: galleta }, body: body === undefined ? undefined : JSON.stringify(body) });

const tmp = mkdtempSync(join(tmpdir(), 'fichas-'));
const ponerEnR2 = (clave, contenido) => {
  const f = join(tmp, clave.replace(/\//g, '_'));
  writeFileSync(f, contenido);
  execSync(`npx wrangler r2 object put "supermuebles-fichas-fotos/${clave}" --local --file "${f}" --config ../wrangler.tienda.jsonc`, { cwd: DIR, stdio: 'ignore' });
};
const ficha = (rev, data) => ({ rev, position: 1, createdAt: '2026-11-19T00:00:00.000Z', updatedAt: '2026-11-19T00:00:00.000Z', deletedAt: null, data });
const doc = rev => JSON.stringify({
  fichas: {
    'ficha-sala-prueba': ficha(rev, {
      nombre: 'Sala Prueba Nube', categoria: 'salas', descripcion: 'Sala de prueba creada desde una ficha.', separado: true, fotos: ['foto-prueba-1'],
      incluye: ['Sofá triple', '2 butacas'], medidas: [{ nombre: 'Sofá triple', ancho: '210', fondo: '', alto: '90', precio: '890' }, { nombre: 'Butaca', ancho: '80', fondo: '', alto: '100', precio: '350' }],
    }),
    'ficha-cama-reina': ficha(1, {
      nombre: 'Cama Reina', categoria: 'infantil', descripcion: '', separado: false, fotos: [], incluye: [],
      medidas: [{ nombre: 'Cuna', ancho: '', fondo: '', alto: '', precio: '400' }, { nombre: 'Cómoda', ancho: '', fondo: '', alto: '', precio: '300' }],
    }),
    'ficha-borrada': { ...ficha(1, { nombre: 'No debe salir', categoria: 'salas', fotos: [], medidas: [] }), deletedAt: '2026-11-19T00:00:00.000Z' },
  },
});

let token;

test('preparar fichas de prueba y entrar al panel', { skip: !LOCAL && 'solo en local' }, async () => {
  ponerEnR2('fotos/foto-prueba-1.jpg', Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(200, 7)]));
  ponerEnR2('datos/fichas.json', doc(3));
  const r = await fetch(BASE + '/api/admin/entrar', { method: 'POST', headers: AW, body: JSON.stringify({ email: 'prueba@local.test', codigo: process.env.ADMIN_CODE || 'PANEL-LOCAL-1234' }) });
  galleta = r.headers.get('set-cookie').split(';')[0];
  assert.equal(r.status, 200);
});

test('el panel lista las fichas vivas y sugiere el modelo que ya existe', { skip: !LOCAL && 'solo en local' }, async () => {
  const d = await (await admin('/fichas')).json();
  assert.deepEqual(d.fichas.map(f => f.nombre).sort(), ['Cama Reina', 'Sala Prueba Nube']);
  assert.equal(d.fichas.find(f => f.nombre === 'Cama Reina').sugerido.id, 'cama-reina');
  assert.equal(d.fichas.find(f => f.nombre === 'Sala Prueba Nube').producto, null);
  assert.equal((await admin('/fichas/foto/foto-prueba-1')).status, 200);
});

test('pasar una ficha nueva: juego completo sumado, piezas sueltas y foto de la ficha', { skip: !LOCAL && 'solo en local' }, async () => {
  assert.equal((await fetch(BASE + '/api/fotos/foto-prueba-1')).status, 404, 'antes de publicar la foto es privada');
  let r = await admin('/fichas/ficha-sala-prueba/publicar', { method: 'POST', body: {
    producto: 'nuevo', nombre: 'Sala Prueba Nube', categoria: 'salas', descripcion: 'Sala de prueba.', separado: true, usar_foto_ficha: true, activo: true,
    piezas: [{ nombre: 'Sofá triple', cantidad: 1, precio_cents: 89000, ancho: '210', alto: '90' }, { nombre: 'Butaca', cantidad: 2, precio_cents: 35000 }],
  } });
  assert.equal(r.status, 200, await r.clone().text());
  const pub = await r.json();
  assert.equal(pub.producto, 'sala-prueba-nube');
  assert.equal(pub.juego_cents, 89000 + 2 * 35000);

  const prods = await (await fetch(BASE + '/api/productos')).json();
  const p = prods.productos.find(x => x.id === 'sala-prueba-nube');
  assert.equal(p.price_cents, 159000);
  assert.equal(p.sold_separately, true);
  assert.equal(p.image, 'api/fotos/foto-prueba-1');
  assert.deepEqual(p.piezas.map(x => [x.name, x.qty, x.price_cents]), [['Sofá triple', 1, 89000], ['Butaca', 2, 35000]]);
  const foto = await fetch(BASE + '/api/fotos/foto-prueba-1');
  assert.equal(foto.status, 200);
  assert.equal(foto.headers.get('content-type'), 'image/jpeg');

  // Pedido: un juego completo + una butaca suelta. El navegador no pone precios.
  const butaca = p.piezas.find(x => x.name === 'Butaca');
  r = await fetch(BASE + '/api/pedidos', {
    method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'tienda' },
    body: JSON.stringify({
      clave: 'fichas-' + crypto.randomUUID(), turnstile: 'XXXX.DUMMY.TOKEN.XXXX',
      cliente: { nombre: 'Sara Piezas', telefono: '0994445566', ciudad: 'Manta', direccion: 'Barrio Centro, calle 13' },
      items: [{ id: 'sala-prueba-nube', qty: 1 }, { id: 'sala-prueba-nube', pieza: butaca.id, qty: 1, price_cents: 1 }],
    }),
  });
  assert.equal(r.status, 201, await r.clone().text());
  token = (await r.json()).token;
  const seg = await (await fetch(BASE + '/api/pedidos/' + token)).json();
  assert.equal(seg.subtotal_cents, 159000 + 35000);
  assert.deepEqual(seg.lineas.map(l => l.nombre).sort(), ['Sala Prueba Nube', 'Sala Prueba Nube: Butaca']);
});

test('modelo existente sin venta suelta: conserva su foto del catálogo y no acepta piezas', { skip: !LOCAL && 'solo en local' }, async () => {
  let r = await admin('/fichas/ficha-cama-reina/publicar', { method: 'POST', body: {
    producto: 'cama-reina', nombre: 'Cama Reina', categoria: 'infantil', descripcion: '', separado: false, usar_foto_ficha: false, activo: true,
    piezas: [{ nombre: 'Cuna', cantidad: 1, precio_cents: 40000 }, { nombre: 'Cómoda', cantidad: 1, precio_cents: 30000 }],
  } });
  assert.equal(r.status, 200, await r.clone().text());
  const prods = await (await fetch(BASE + '/api/productos')).json();
  const p = prods.productos.find(x => x.id === 'cama-reina');
  assert.ok(p.image.startsWith('img/catalogo/'), 'sigue con la foto del catálogo');
  assert.equal(p.price_cents, 70000);

  r = await fetch(BASE + '/api/pedidos', {
    method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'tienda' },
    body: JSON.stringify({
      clave: 'fichas-' + crypto.randomUUID(), turnstile: 'XXXX.DUMMY.TOKEN.XXXX',
      cliente: { nombre: 'Sara Piezas', telefono: '0994445566', ciudad: 'Manta', direccion: 'Barrio Centro, calle 13' },
      items: [{ id: 'cama-reina', pieza: p.piezas[0].id, qty: 1 }],
    }),
  });
  assert.equal(r.status, 409, 'no se vende suelta');

  assert.equal((await admin('/productos/cama-reina', { method: 'PUT', body: { price_cents: 1, active: true } })).status, 400, 'el precio del juego no se pisa a mano');
  assert.equal((await admin('/productos/cama-reina', { method: 'PUT', body: { price_cents: 70000, active: true } })).status, 200, 'mostrar u ocultar sí');
});

test('si el dueño cambia la ficha, el panel lo avisa; una ficha no se une a dos modelos', { skip: !LOCAL && 'solo en local' }, async () => {
  ponerEnR2('datos/fichas.json', doc(4));
  const d = await (await admin('/fichas')).json();
  const f = d.fichas.find(x => x.id === 'ficha-sala-prueba');
  assert.equal(f.producto.id, 'sala-prueba-nube');
  assert.equal(f.cambio, true);
  const r = await admin('/fichas/ficha-sala-prueba/publicar', { method: 'POST', body: {
    producto: 'nuevo', nombre: 'Otra', categoria: 'salas', piezas: [{ nombre: 'Sofá', cantidad: 1, precio_cents: 100 }],
  } });
  assert.equal(r.status, 409);
});
