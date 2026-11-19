// API pública de la tienda (fase 1): productos con precio, envío del pedido y seguimiento.
// Reglas (TIENDA-DISENO.md): el servidor recalcula todo y no cree ningún precio del navegador,
// el pedido nace sin envío ni total final (los confirma la asesora), y nada funciona con la tienda apagada.
import type { Env } from './index';
import { adminApi, leerAjustes } from './admin';
import { subirComprobante } from './comprobantes';

const MAX_LINEAS = 20;
const MAX_CANTIDAD = 20;
const TOKEN = /^[a-f0-9]{32}$/;
const CLAVE = /^[A-Za-z0-9-]{16,64}$/;

const H = { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' };
const json = (d: unknown, status = 200) => new Response(JSON.stringify(d), { status, headers: H });
const error = (msg: string, status: number, campo?: string) => json({ error: msg, ...(campo ? { campo } : {}) }, status);

const ahora = () => new Date().toISOString();
const hex = (n: number) => [...crypto.getRandomValues(new Uint8Array(n))].map(b => b.toString(16).padStart(2, '0')).join('');
const ALFA = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'; // sin letras que se confunden (I, L, O, 0, 1)
const codigoPublico = () => 'SM-' + [...crypto.getRandomValues(new Uint8Array(6))].map(b => ALFA[b % ALFA.length]).join('');

const texto = (v: unknown, max: number) => (typeof v === 'string' ? v.replace(/\s+/g, ' ').trim().slice(0, max) : '');
const textoLargo = (v: unknown, max: number) => (typeof v === 'string' ? v.replace(/\r\n?/g, '\n').trim().slice(0, max) : '');

async function tiendaActiva(db: D1Database): Promise<boolean> {
  const r = await db.prepare("SELECT value_json FROM settings WHERE key = 'tienda_activa'").first<{ value_json: string }>();
  return r?.value_json === 'true';
}

/* ---------- GET /api/productos ---------- */

type Producto = { id: string; name: string; category: string; description: string | null; image: string | null; price_cents: number; sold_separately: number };
type Pieza = { id: string; product_id: string; name: string; qty_in_set: number; price_cents: number; width_cm: number | null; depth_cm: number | null; height_cm: number | null };

async function productos(db: D1Database): Promise<Response> {
  if (!(await tiendaActiva(db))) return json({ activa: false, productos: [] });
  const [prods, piezas] = await db.batch([
    db.prepare('SELECT id, name, category, description, image, price_cents, sold_separately FROM products WHERE active = 1 AND price_cents IS NOT NULL ORDER BY sort, name'),
    db.prepare('SELECT p.id, p.product_id, p.name, p.qty_in_set, p.price_cents, p.width_cm, p.depth_cm, p.height_cm FROM product_pieces p JOIN products o ON o.id = p.product_id WHERE o.active = 1 ORDER BY p.sort'),
  ]);
  const porProducto = new Map<string, Pieza[]>();
  for (const x of piezas.results as Pieza[]) {
    if (!porProducto.has(x.product_id)) porProducto.set(x.product_id, []);
    porProducto.get(x.product_id)!.push(x);
  }
  return json({
    activa: true,
    productos: (prods.results as Producto[]).map(p => ({
      ...p,
      sold_separately: p.sold_separately === 1,
      piezas: (porProducto.get(p.id) || []).map(x => ({
        id: x.id, name: x.name, qty: x.qty_in_set, price_cents: x.price_cents,
        medidas: [x.width_cm, x.depth_cm, x.height_cm].some(v => v) ? { ancho: x.width_cm, fondo: x.depth_cm, alto: x.height_cm } : null,
      })),
    })),
  });
}

/* ---------- GET /api/fotos/:id (fotos de fichas usadas por modelos activos) ---------- */

async function fotoPublica(env: Env, db: D1Database, id: string): Promise<Response> {
  // Solo se entrega una foto si un modelo visible la usa; las demás fotos de las fichas siguen privadas.
  const usada = await db.prepare('SELECT 1 FROM products WHERE active = 1 AND image = ?').bind('api/fotos/' + id).first();
  const fuente = env.FICHAS_FUENTE ?? env.FOTOS;
  const o = usada && fuente ? await fuente.get(`fotos/${id}.jpg`) : null;
  if (!o) return error('No encontrada.', 404);
  return new Response(o.body, {
    headers: { 'Content-Type': 'image/jpeg', 'Cache-Control': 'public, max-age=86400', 'X-Content-Type-Options': 'nosniff', ETag: o.httpEtag },
  });
}

/* ---------- POST /api/pedidos ---------- */

async function turnstileValido(env: Env, token: string, ip: string | null): Promise<boolean> {
  if (!token || token.length > 2048) return false;
  const body = new FormData();
  body.append('secret', env.TURNSTILE_SECRET!);
  body.append('response', token);
  if (ip) body.append('remoteip', ip);
  try {
    const r = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', { method: 'POST', body });
    const d = (await r.json()) as { success?: boolean };
    return d.success === true;
  } catch {
    return false;
  }
}

type Linea = { id: string; pieza: string; qty: number; nota: string };

function leerLineas(v: unknown): Linea[] | string {
  if (!Array.isArray(v) || v.length === 0) return 'Tu pedido está vacío.';
  if (v.length > MAX_LINEAS) return `Un pedido puede tener hasta ${MAX_LINEAS} líneas.`;
  // Une líneas iguales (mismo modelo, misma pieza y misma nota) sumando cantidades.
  const unidas = new Map<string, Linea>();
  for (const x of v) {
    const id = texto((x as any)?.id, 80);
    const pieza = texto((x as any)?.pieza, 80);
    const qty = Number((x as any)?.qty);
    const nota = textoLargo((x as any)?.nota, 300);
    if (!id || !Number.isInteger(qty) || qty < 1 || qty > MAX_CANTIDAD) return 'Revisa las cantidades del pedido.';
    const k = id + '\u0000' + pieza + '\u0000' + nota;
    const prev = unidas.get(k);
    if (prev) {
      prev.qty += qty;
      if (prev.qty > MAX_CANTIDAD) return 'Revisa las cantidades del pedido.';
    } else unidas.set(k, { id, pieza, qty, nota });
  }
  return [...unidas.values()];
}

type Cliente = { nombre: string; telefono: string; email: string; cedula: string; ciudad: string; direccion: string; referencia: string };

function leerCliente(v: any): Cliente | { error: string; campo: string } {
  const c: Cliente = {
    nombre: texto(v?.nombre, 120),
    telefono: texto(v?.telefono, 30),
    email: texto(v?.email, 160).toLowerCase(),
    cedula: texto(v?.cedula, 20),
    ciudad: texto(v?.ciudad, 80),
    direccion: textoLargo(v?.direccion, 300),
    referencia: textoLargo(v?.referencia, 300),
  };
  if (c.nombre.length < 3) return { error: 'Escribe tu nombre completo.', campo: 'nombre' };
  const digitos = c.telefono.replace(/\D/g, '');
  if (digitos.length < 9 || digitos.length > 15) return { error: 'Escribe un número de WhatsApp válido.', campo: 'telefono' };
  if (c.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(c.email)) return { error: 'Revisa el correo o déjalo vacío.', campo: 'email' };
  if (c.cedula && !/^\d{10}(\d{3})?$/.test(c.cedula)) return { error: 'La cédula tiene 10 dígitos y el RUC 13.', campo: 'cedula' };
  if (c.ciudad.length < 2) return { error: 'Escribe tu ciudad.', campo: 'ciudad' };
  if (c.direccion.length < 5) return { error: 'Escribe la dirección de entrega.', campo: 'direccion' };
  return c;
}

async function respuestaPedido(db: D1Database, idem: string): Promise<Response | null> {
  const prev = await db.prepare('SELECT public_code, tracking_token FROM orders WHERE idempotency_key = ?').bind(idem).first<{ public_code: string; tracking_token: string }>();
  return prev ? json({ codigo: prev.public_code, token: prev.tracking_token, repetido: true }, 200) : null;
}

async function crearPedido(request: Request, env: Env, db: D1Database): Promise<Response> {
  if (request.headers.get('X-Requested-With') !== 'tienda') return error('Solicitud no permitida.', 403);
  if (!(request.headers.get('Content-Type') || '').includes('application/json')) return error('Formato no válido.', 415);
  if (Number(request.headers.get('Content-Length') || 0) > 32_000) return error('El pedido es demasiado grande.', 413);
  if (!(await tiendaActiva(db))) return error('La tienda todavía no recibe pedidos. Escríbenos por WhatsApp.', 403);
  if (!env.TURNSTILE_SECRET) return error('La tienda todavía no está configurada.', 503);

  const ip = request.headers.get('CF-Connecting-IP');
  if (env.LIMITE_PEDIDOS) {
    const { success } = await env.LIMITE_PEDIDOS.limit({ key: ip || 'sin-ip' });
    if (!success) return error('Demasiados intentos seguidos. Espera un minuto y vuelve a enviar.', 429);
  }

  let d: any;
  try {
    d = await request.json();
  } catch {
    return error('Formato no válido.', 400);
  }

  const idem = texto(d?.clave, 64);
  if (!CLAVE.test(idem)) return error('Formato no válido.', 400);
  // Si el mismo envío llega dos veces (doble clic, red lenta), se devuelve el mismo pedido.
  const repetido = await respuestaPedido(db, idem);
  if (repetido) return repetido;

  if (!(await turnstileValido(env, texto(d?.turnstile, 2048), ip))) return error('No pudimos comprobar que eres una persona. Vuelve a intentarlo.', 400, 'turnstile');

  const cliente = leerCliente(d?.cliente);
  if ('error' in cliente) return error(cliente.error, 400, cliente.campo);
  const lineas = leerLineas(d?.items);
  if (typeof lineas === 'string') return error(lineas, 400, 'items');
  const notas = textoLargo(d?.notas, 1000);

  // Precios y nombres salen de la base, nunca del navegador.
  const ids = [...new Set(lineas.map(l => l.id))];
  const marcas = ids.map(() => '?').join(',');
  const [prods, piezas] = await db.batch([
    db.prepare(`SELECT id, name, price_cents, sold_separately FROM products WHERE active = 1 AND price_cents IS NOT NULL AND id IN (${marcas})`).bind(...ids),
    db.prepare(`SELECT id, product_id, name, price_cents FROM product_pieces WHERE product_id IN (${marcas})`).bind(...ids),
  ]);
  const porId = new Map((prods.results as { id: string; name: string; price_cents: number; sold_separately: number }[]).map(p => [p.id, p]));
  const piezaPorId = new Map((piezas.results as { id: string; product_id: string; name: string; price_cents: number }[]).map(x => [x.id, x]));
  // Cada línea es el juego completo o, si el modelo lo permite, una pieza suelta.
  const precios: { nombre: string; unidad: number; opciones: string }[] = [];
  for (const l of lineas) {
    const p = porId.get(l.id);
    if (!p) return error('Uno de los modelos ya no está disponible para pedir en línea. Revisa tu pedido.', 409, 'items');
    if (!l.pieza) { precios.push({ nombre: p.name, unidad: p.price_cents, opciones: '[]' }); continue; }
    const x = piezaPorId.get(l.pieza);
    if (!x || x.product_id !== p.id || p.sold_separately !== 1) return error('Una de las piezas ya no se vende por separado. Revisa tu pedido.', 409, 'items');
    precios.push({ nombre: `${p.name}: ${x.name}`, unidad: x.price_cents, opciones: JSON.stringify([{ pieza: x.id, nombre: x.name }]) });
  }

  const subtotal = lineas.reduce((s, l, i) => s + precios[i].unidad * l.qty, 0);
  const id = crypto.randomUUID();
  const token = hex(16); // 128 bits
  const t = ahora();

  for (let intento = 0; intento < 5; intento++) {
    const codigo = codigoPublico();
    const stmts = [
      db.prepare(
        `INSERT INTO orders (id, public_code, tracking_token, status, payment_status, customer_name, phone, email, id_number, city, address, reference,
           subtotal_cents, notes, created_at, updated_at, idempotency_key)
         VALUES (?, ?, ?, 'nuevo', 'pendiente', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      ).bind(id, codigo, token, cliente.nombre, cliente.telefono, cliente.email || null, cliente.cedula || null, cliente.ciudad, cliente.direccion,
        cliente.referencia || null, subtotal, notas || null, t, t, idem),
      ...lineas.map((l, i) =>
        db.prepare(
          'INSERT INTO order_items (id, order_id, product_id, name_snapshot, unit_cents_snapshot, qty, options_json, note) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
        ).bind(crypto.randomUUID(), id, l.id, precios[i].nombre, precios[i].unidad, l.qty, precios[i].opciones, l.nota || null),
      ),
      db.prepare('INSERT INTO order_events (id, order_id, at, actor, type, detail_json) VALUES (?, ?, ?, ?, ?, ?)')
        .bind(crypto.randomUUID(), id, t, 'cliente', 'creado', JSON.stringify({ lineas: lineas.length, subtotal_cents: subtotal })),
    ];
    try {
      await db.batch(stmts);
      return json({ codigo, token }, 201);
    } catch (e) {
      const msg = String(e);
      // Otro envío con la misma clave ganó la carrera: devolver ese pedido.
      if (msg.includes('idempotency_key')) {
        const r = await respuestaPedido(db, idem);
        if (r) return r;
      }
      if (msg.includes('public_code')) continue; // código repetido (muy raro): se prueba otro
      throw e;
    }
  }
  return error('No pudimos registrar el pedido. Inténtalo de nuevo.', 500);
}

/* ---------- GET /api/pedidos/:token ---------- */

async function verPedido(db: D1Database, token: string): Promise<Response> {
  const o = await db
    .prepare(`SELECT id, public_code, status, payment_status, customer_name, city, subtotal_cents, shipping_cents, discount_cents, total_cents, deposit_cents, created_at
              FROM orders WHERE tracking_token = ?`)
    .bind(token)
    .first<any>();
  if (!o) return error('No encontramos ese pedido. Revisa el enlace.', 404);
  const { results } = await db
    .prepare('SELECT name_snapshot AS nombre, unit_cents_snapshot AS precio_cents, qty AS cantidad, note AS nota FROM order_items WHERE order_id = ? ORDER BY rowid')
    .bind(o.id)
    .all();
  return json({
    codigo: o.public_code,
    estado: o.status,
    estado_pago: o.payment_status,
    nombre: String(o.customer_name).split(' ')[0],
    ciudad: o.city,
    creado: o.created_at,
    lineas: results,
    subtotal_cents: o.subtotal_cents,
    envio_cents: o.shipping_cents,
    descuento_cents: o.discount_cents,
    total_cents: o.total_cents,
    abono_cents: o.deposit_cents,
    // Datos para transferir: solo cuando la asesora ya fijó el total y el pedido espera el pago.
    pago: o.status === 'por_pagar' ? await datosDePago(db) : null,
  });
}

async function datosDePago(db: D1Database) {
  const a = await leerAjustes(db);
  return a.pago_banco ? { cuenta: a.pago_banco, instrucciones: a.pago_instrucciones || '' } : null;
}

/* ---------- rutas ---------- */

export async function api(request: Request, env: Env, url: URL): Promise<Response> {
  if (!env.DB) return error('No encontrado.', 404); // el sitio en vivo no tiene base: la tienda no existe ahí
  const p = url.pathname.replace(/\/+$/, '');
  const m = request.method;
  try {
    if (p === '/api/admin' || p.startsWith('/api/admin/')) return await adminApi(request, env, url);
    if (p === '/api/productos' && m === 'GET') return await productos(env.DB);
    const f = p.match(/^\/api\/fotos\/([A-Za-z0-9_-]{1,40})$/);
    if (f && m === 'GET') return await fotoPublica(env, env.DB, f[1]);
    if (p === '/api/pedidos' && m === 'POST') return await crearPedido(request, env, env.DB);
    const c = p.match(/^\/api\/pedidos\/([^/]+)\/comprobante$/);
    if (c && m === 'POST') {
      if (!TOKEN.test(c[1])) return error('No encontramos ese pedido. Revisa el enlace.', 404);
      return await subirComprobante(request, env, env.DB, c[1]);
    }
    const r = p.match(/^\/api\/pedidos\/([^/]+)$/);
    if (r && m === 'GET') {
      if (!TOKEN.test(r[1])) return error('No encontramos ese pedido. Revisa el enlace.', 404);
      return await verPedido(env.DB, r[1]);
    }
    return error('No encontrado.', 404);
  } catch (e) {
    console.error('api', e);
    return error('Error interno. Inténtalo de nuevo.', 500);
  }
}
