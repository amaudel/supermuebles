// Prueba de humo de la API de fichas contra un Worker en marcha.
// Uso: levantar `npm run dev` (con FICHAS_CODE=PRUEBA-LOCAL-1234 en ../.dev.vars) y luego `npm test`.
// Con BASE=https://… y CODIGO=… se puede apuntar a otro Worker (no hace la prueba de bloqueo por intentos).
import test from 'node:test';
import assert from 'node:assert/strict';

const BASE = process.env.BASE || 'http://127.0.0.1:8787';
const CODIGO = process.env.CODIGO || 'PRUEBA-LOCAL-1234';
const LOCAL = BASE.startsWith('http://127.0.0.1');
let sesion = '';

const api = (ruta, { metodo = 'GET', cuerpo, tipo, cookie = sesion, csrf = true } = {}) =>
  fetch(BASE + '/fichas-api' + ruta, {
    method: metodo,
    headers: {
      ...(cookie ? { Cookie: cookie } : {}),
      ...(csrf && metodo !== 'GET' ? { 'X-Requested-With': 'fichas' } : {}),
      ...(tipo ? { 'Content-Type': tipo } : cuerpo !== undefined && typeof cuerpo === 'string' ? {} : { 'Content-Type': 'application/json' }),
    },
    body: cuerpo === undefined ? undefined : typeof cuerpo === 'string' || cuerpo instanceof Uint8Array ? cuerpo : JSON.stringify(cuerpo),
  });

const JPEG = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 16, 0x4a, 0x46, 0x49, 0x46, 0, 1, 1, 0, 0, 1, 0, 1, 0, 0, 0xff, 0xd9]);
const idNuevo = () => 'prueba-' + Math.random().toString(36).slice(2, 8);

test('sin sesión no se ve nada', async () => {
  assert.equal((await api('/fichas', { cookie: '' })).status, 401);
  assert.equal((await api('/fotos/abc', { cookie: '' })).status, 401);
  assert.equal((await api('/yo', { cookie: '' })).status, 401);
});

test('entrar: exige encabezado propio, rechaza código malo, acepta el bueno', async () => {
  assert.equal((await api('/entrar', { metodo: 'POST', cuerpo: { codigo: CODIGO }, csrf: false, cookie: '' })).status, 403);
  assert.equal((await api('/entrar', { metodo: 'POST', cuerpo: { codigo: 'MALO' }, cookie: '' })).status, 401);
  const r = await api('/entrar', { metodo: 'POST', cuerpo: { codigo: CODIGO.toLowerCase() }, cookie: '' }); // sin distinguir mayúsculas
  assert.equal(r.status, 200);
  const c = r.headers.getSetCookie()[0];
  assert.match(c, /HttpOnly/); assert.match(c, /Secure/); assert.match(c, /SameSite=Strict/); assert.match(c, /Path=\/fichas-api/);
  sesion = c.split(';')[0];
  assert.equal((await api('/yo')).status, 200);
});

test('una cookie adulterada no sirve', async () => {
  const [nombre, valor] = sesion.split('=');
  const [exp, firma] = valor.split('.');
  assert.equal((await api('/yo', { cookie: `${nombre}=${Number(exp) + 999}.${firma}` })).status, 401);
  assert.equal((await api('/yo', { cookie: `${nombre}=${exp}.${firma.replace(/.$/, c => (c === '0' ? '1' : '0'))}` })).status, 401);
});

test('la lista trae los modelos del catálogo y no se duplican', async () => {
  const a = await (await api('/fichas')).json();
  const b = await (await api('/fichas')).json();
  assert.equal(a.fichas.filter(f => f.id.startsWith('seed-')).length, 19);
  assert.equal(a.fichas.length, b.fichas.length);
  const t = a.fichas.find(f => f.id === 'seed-sala-titanic');
  assert.equal(t.nombre, 'Sala Titanic'); assert.equal(t.categoria, 'salas'); assert.equal(t.rev, 1); assert.deepEqual(t.fotos, []);
});

test('guardar: sube la revisión, rechaza la vieja con 409 y limpia campos', async () => {
  const { fichas } = await (await api('/fichas')).json();
  const f = fichas.find(x => x.id === 'seed-sala-rose');
  const datos = { ...f, nombre: 'Sala Rose', categoria: 'inventada', precioSecreto: 5, medidas: [{ nombre: 'Seccional', ancho: '300', fondo: '170', alto: '85', precio: '1890', extra: 'x' }] };
  const r1 = await api('/fichas/seed-sala-rose', { metodo: 'PUT', cuerpo: { rev: f.rev, data: datos } });
  assert.equal(r1.status, 200);
  const ok = await r1.json(); assert.equal(ok.rev, f.rev + 1);
  const r2 = await api('/fichas/seed-sala-rose', { metodo: 'PUT', cuerpo: { rev: f.rev, data: datos } }); // revisión vieja
  assert.equal(r2.status, 409);
  const c = await r2.json(); assert.equal(c.actual.rev, ok.rev);
  const ahora = (await (await api('/fichas')).json()).fichas.find(x => x.id === 'seed-sala-rose');
  assert.equal(ahora.categoria, 'salas'); // la categoría inventada se descarta
  assert.equal(ahora.precioSecreto, undefined);
  assert.deepEqual(ahora.medidas, [{ nombre: 'Seccional', ancho: '300', fondo: '170', alto: '85', precio: '1890' }]);
});

test('ficha nueva: se crea con rev 0 y no se puede crear dos veces', async () => {
  const id = idNuevo();
  const r = await api('/fichas/' + id, { metodo: 'PUT', cuerpo: { rev: 0, data: { nombre: 'Mesa de prueba', categoria: 'otro' } } });
  assert.equal(r.status, 200); assert.equal((await r.json()).rev, 1);
  assert.equal((await api('/fichas/' + id, { metodo: 'PUT', cuerpo: { rev: 0, data: { nombre: 'Otra' } } })).status, 409);
  assert.equal((await api('/fichas/id%20malo!', { metodo: 'PUT', cuerpo: { rev: 0, data: {} } })).status, 404);
  const gr = await api('/fichas/' + id, { metodo: 'PUT', cuerpo: { rev: 1, data: { nombre: 'x'.repeat(70_000) } } });
  assert.equal(gr.status, 413);
});

test('fotos: solo JPEG real, se sirven, se ordenan en la ficha y se quitan', async () => {
  const id = idNuevo();
  assert.equal((await api(`/fichas/${id}/fotos`, { metodo: 'POST', cuerpo: JPEG, tipo: 'image/jpeg' })).status, 404); // la ficha no existe aún
  await api('/fichas/' + id, { metodo: 'PUT', cuerpo: { rev: 0, data: { nombre: 'Con fotos' } } });
  assert.equal((await api(`/fichas/${id}/fotos`, { metodo: 'POST', cuerpo: JPEG, tipo: 'image/png' })).status, 415);
  assert.equal((await api(`/fichas/${id}/fotos`, { metodo: 'POST', cuerpo: new Uint8Array([1, 2, 3, 4]), tipo: 'image/jpeg' })).status, 415);
  assert.equal((await api(`/fichas/${id}/fotos`, { metodo: 'POST', cuerpo: new Uint8Array(2_600_000).fill(0xff), tipo: 'image/jpeg' })).status, 413);

  const ids = [];
  for (let i = 0; i < 6; i++) {
    const r = await api(`/fichas/${id}/fotos`, { metodo: 'POST', cuerpo: JPEG, tipo: 'image/jpeg' });
    assert.equal(r.status, 201); ids.push((await r.json()).id);
  }
  assert.equal((await api(`/fichas/${id}/fotos`, { metodo: 'POST', cuerpo: JPEG, tipo: 'image/jpeg' })).status, 409); // la séptima

  const v = await api('/fotos/' + ids[0]);
  assert.equal(v.status, 200); assert.equal(v.headers.get('content-type'), 'image/jpeg');
  assert.deepEqual([...new Uint8Array(await v.arrayBuffer())], [...JPEG]);

  // orden elegido por el cliente; un id ajeno se descarta
  const orden = [ids[2], 'ajena123', ids[0]];
  assert.equal((await api('/fichas/' + id, { metodo: 'PUT', cuerpo: { rev: 1, data: { nombre: 'Con fotos', fotos: orden } } })).status, 200);
  let f = (await (await api('/fichas')).json()).fichas.find(x => x.id === id);
  assert.deepEqual(f.fotos, [ids[2], ids[0]]);

  assert.equal((await api('/fotos/' + ids[0], { metodo: 'DELETE' })).status, 200);
  assert.equal((await api('/fotos/' + ids[0])).status, 404);
  f = (await (await api('/fichas')).json()).fichas.find(x => x.id === id);
  assert.deepEqual(f.fotos, [ids[2]]); // la referencia a la foto quitada desaparece sola
});

test('guardados simultáneos de fichas distintas no se pierden', async () => {
  const ids = Array.from({ length: 8 }, idNuevo);
  const rs = await Promise.all(ids.map((id, i) => api('/fichas/' + id, { metodo: 'PUT', cuerpo: { rev: 0, data: { nombre: 'Simultánea ' + i } } })));
  assert.deepEqual(rs.map(r => r.status), Array(8).fill(200));
  const lista = (await (await api('/fichas')).json()).fichas.map(f => f.id);
  for (const id of ids) assert.ok(lista.includes(id), 'falta ' + id);
});

test('borrar una ficha la saca de la lista', async () => {
  const id = idNuevo();
  await api('/fichas/' + id, { metodo: 'PUT', cuerpo: { rev: 0, data: { nombre: 'Para borrar' } } });
  assert.equal((await api('/fichas/' + id, { metodo: 'DELETE' })).status, 200);
  assert.equal((await api('/fichas/' + id, { metodo: 'DELETE' })).status, 404);
  assert.ok(!(await (await api('/fichas')).json()).fichas.some(f => f.id === id));
});

test('sin encabezado propio no se puede escribir aunque haya sesión', async () => {
  assert.equal((await api('/fichas/seed-sala-rose', { metodo: 'DELETE', csrf: false })).status, 403);
});

test('salir borra la cookie', async () => {
  const r = await api('/salir', { metodo: 'POST' });
  assert.match(r.headers.getSetCookie()[0], /Max-Age=0/);
});

test('tras muchos intentos fallidos se bloquea (solo en local)', { skip: !LOCAL }, async () => {
  let ultimo = 0;
  for (let i = 0; i < 22; i++) ultimo = (await api('/entrar', { metodo: 'POST', cuerpo: { codigo: 'MALO' + i }, cookie: '' })).status;
  assert.equal(ultimo, 429);
  assert.equal((await api('/entrar', { metodo: 'POST', cuerpo: { codigo: CODIGO }, cookie: '' })).status, 429);
});
