// Pruebas del panel de reseñas contra un Worker local en marcha: `npm run dev` y, en otra terminal, `npm test`.
// Necesitan una base local vacía (`npm run db:migrar` sobre .wrangler borrado): crean el primer administrador.
import test from 'node:test';
import assert from 'node:assert/strict';

const BASE = process.env.BASE || 'http://127.0.0.1:8788';
const J = { 'Content-Type': 'application/json' };
const CORREO = 'prueba@ejemplo.com';
const CLAVE = 'Clave-de-prueba-1';
let token = '';

const api = (ruta, { metodo = 'GET', cuerpo, auth = true } = {}) =>
  fetch(BASE + '/api/' + ruta, {
    method: metodo,
    headers: { ...J, ...(auth && token ? { Authorization: 'Bearer ' + token } : {}) },
    body: cuerpo ? JSON.stringify(cuerpo) : undefined,
  });

test('la página del panel se sirve', async () => {
  const r = await fetch(BASE + '/');
  assert.equal(r.status, 200);
  assert.match(await r.text(), /Control de Reseñas/);
});

test('sin usuarios: estado lo dice y la API exige sesión', async () => {
  const e = await (await api('estado')).json();
  assert.equal(e.hayUsuarios, false);
  assert.equal((await api('datos', { auth: false })).status, 401);
});

test('el primer administrador puede ser un correo con @ y queda guardado tal cual', async () => {
  const r = await api('setup', { metodo: 'POST', cuerpo: { nombre: 'Prueba', usuario: CORREO.toUpperCase(), clave: CLAVE } });
  assert.equal(r.status, 200);
  const d = await r.json();
  assert.equal(d.yo.usuario, CORREO);
  assert.equal(d.yo.rol, 'admin');
  token = d.token;
  assert.equal((await api('setup', { metodo: 'POST', cuerpo: { nombre: 'Otro', usuario: 'otro', clave: CLAVE } })).status, 409);
});

test('login: acepta el correo con @, rechaza clave mala y usuario sin @', async () => {
  const bien = await api('login', { metodo: 'POST', cuerpo: { usuario: CORREO, clave: CLAVE }, auth: false });
  assert.equal(bien.status, 200);
  token = (await bien.json()).token;
  assert.equal((await api('login', { metodo: 'POST', cuerpo: { usuario: CORREO, clave: 'mala-mala-1' }, auth: false })).status, 401);
  assert.equal((await api('login', { metodo: 'POST', cuerpo: { usuario: 'pruebaejemplo.com', clave: CLAVE }, auth: false })).status, 401);
});

test('crear usuario de equipo, sin duplicados', async () => {
  const r = await api('usuarios', { metodo: 'POST', cuerpo: { nombre: 'Vendedora', usuario: 'ventas@ejemplo.com', clave: CLAVE, rol: 'vendedor' } });
  assert.equal(r.status, 201);
  assert.equal((await r.json()).usuario, 'ventas@ejemplo.com');
  assert.equal((await api('usuarios', { metodo: 'POST', cuerpo: { nombre: 'Otra', usuario: 'VENTAS@ejemplo.com', clave: CLAVE } })).status, 409);
});

test('cliente: se crea, no se duplica el mismo día, se marca y se borra', async () => {
  const c = { nombre: 'Cliente Prueba', telefono: '0991234567', producto: 'Comedor', entrega: '2026-11-01' };
  const r = await api('clientes', { metodo: 'POST', cuerpo: c });
  assert.equal(r.status, 201);
  const id = (await r.json()).id;
  assert.equal((await api('clientes', { metodo: 'POST', cuerpo: c })).status, 409);
  assert.equal((await api('clientes/' + id, { metodo: 'PATCH', cuerpo: { msg1: '2026-11-02' } })).status, 204);
  const datos = await (await api('datos')).json();
  assert.equal(datos.clientes.find(x => x.id === id).msg1, '2026-11-02');
  const hist = await (await api('clientes/' + id + '/historial')).json();
  assert.ok(hist.some(e => e.tipo === 'mensaje1'));
  assert.equal((await api('clientes/' + id, { metodo: 'DELETE' })).status, 204);
  assert.equal((await api('clientes/' + id)).status, 404);
});

test('enlace /r/<id> registra el clic y manda a Google; un bot no lo registra', async () => {
  const c = { nombre: 'Clic Prueba', telefono: '0997654321', producto: 'Sala', entrega: '2026-11-03' };
  const id = (await (await api('clientes', { metodo: 'POST', cuerpo: c })).json()).id;
  const bot = await fetch(BASE + '/r/' + id, { redirect: 'manual', headers: { 'User-Agent': 'WhatsApp/2.0' } });
  assert.equal(bot.status, 302);
  assert.match(bot.headers.get('location'), /google\.com/);
  let datos = await (await api('datos')).json();
  assert.equal(datos.clientes.find(x => x.id === id).clic, null);
  await fetch(BASE + '/r/' + id, { redirect: 'manual', headers: { 'User-Agent': 'Mozilla/5.0 Chrome' } });
  datos = await (await api('datos')).json();
  assert.ok(datos.clientes.find(x => x.id === id).clic);
});

// La clave local está en resenas/.dev.vars (INTEGRACION_CLAVE); en las pruebas se puede cambiar con la variable de entorno.
const CLAVE_INTEGRACION = process.env.INTEGRACION_CLAVE || 'CLAVE-LOCAL-DE-PRUEBA';
const entrega = (cuerpo, clave = CLAVE_INTEGRACION) =>
  fetch(BASE + '/api/integracion/entrega', { method: 'POST', headers: { ...J, ...(clave ? { 'X-Integracion-Clave': clave } : {}) }, body: JSON.stringify(cuerpo) });

test('integración: sin la clave correcta no entra nadie', async () => {
  const c = { pedido: 'SM-AAAA11', nombre: 'Ana Pedido', telefono: '0981112233', producto: 'Comedor' };
  assert.equal((await entrega(c, '')).status, 401);
  assert.equal((await entrega(c, 'clave-equivocada')).status, 401);
});

test('integración: un pedido entregado crea el cliente una sola vez', async () => {
  const c = { pedido: 'SM-BBBB22', nombre: 'Luis Pedido', telefono: '+593 98 111 2233', producto: '2 × Sala, Mesa de centro', entrega: '2026-11-20' };
  const r1 = await entrega(c);
  assert.equal(r1.status, 201);
  const id = (await r1.json()).id;
  const r2 = await entrega(c);
  assert.equal(r2.status, 200);
  assert.deepEqual(await r2.json(), { id, yaExistia: true });
  const datos = await (await api('datos')).json();
  const cli = datos.clientes.filter(x => x.pedido === 'SM-BBBB22');
  assert.equal(cli.length, 1);
  assert.equal(cli[0].nombre, 'Luis Pedido');
  assert.equal(cli[0].entrega, '2026-11-20');
  assert.equal(cli[0].msg1, null);
  const hist = await (await api('clientes/' + id + '/historial')).json();
  assert.ok(hist.some(e => e.tipo === 'creado' && e.usuario === 'Tienda'));
});

test('integración: datos incompletos se rechazan con un mensaje claro', async () => {
  assert.equal((await entrega({ pedido: 'SM-CCCC33', nombre: 'Sin teléfono', telefono: '123', producto: 'X' })).status, 400);
  assert.equal((await entrega({ pedido: '', nombre: 'Sin pedido', telefono: '0981112233' })).status, 400);
});

test('cambiar la propia clave', async () => {
  assert.equal((await api('clave', { metodo: 'POST', cuerpo: { actual: 'incorrecta-1', nueva: 'Nueva-clave-22' } })).status, 400);
  assert.equal((await api('clave', { metodo: 'POST', cuerpo: { actual: CLAVE, nueva: 'Nueva-clave-22' } })).status, 204);
  assert.equal((await api('login', { metodo: 'POST', cuerpo: { usuario: CORREO, clave: 'Nueva-clave-22' }, auth: false })).status, 200);
});
