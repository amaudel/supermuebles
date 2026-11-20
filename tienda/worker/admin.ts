// API del panel de administración (fase 2), bajo /api/admin/*.
// Acceso: correo registrado en admin_users + código compartido del panel (secreto ADMIN_CODE).
// La sesión es una cookie firmada que lleva el correo, así cada cambio queda registrado con quién lo hizo.
import type { Env } from './index';
import { verComprobante, limpiar } from './comprobantes';
import { avisarResenas } from './resenas';

const COOKIE = 'sm_admin';
const SESION_HORAS = 12;
const MAX_FALLOS = 10;          // intentos fallidos permitidos entre todos...
const VENTANA_FALLOS = 600;     // ...cada 10 minutos
const MAX_CENTAVOS = 100_000_000; // 1 millón de dólares: tope de cordura

const H = { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' };
const json = (d: unknown, status = 200, extra: Record<string, string> = {}) => new Response(JSON.stringify(d), { status, headers: { ...H, ...extra } });
const error = (msg: string, status: number) => json({ error: msg }, status);
const ahora = () => new Date().toISOString();
const segundos = () => Math.floor(Date.now() / 1000);
const texto = (v: unknown, max: number) => (typeof v === 'string' ? v.replace(/\s+/g, ' ').trim().slice(0, max) : '');
const textoLargo = (v: unknown, max: number) => (typeof v === 'string' ? v.replace(/\r\n?/g, '\n').trim().slice(0, max) : '');

/* ---------- firma de la sesión ---------- */

const enc = new TextEncoder();
const hexDe = (b: ArrayBuffer) => [...new Uint8Array(b)].map(x => x.toString(16).padStart(2, '0')).join('');
async function hmac(secreto: string, mensaje: string): Promise<string> {
  const k = await crypto.subtle.importKey('raw', enc.encode(secreto), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return hexDe(await crypto.subtle.sign('HMAC', k, enc.encode(mensaje)));
}
async function iguales(a: string, b: string): Promise<boolean> {
  const [x, y] = await Promise.all([crypto.subtle.digest('SHA-256', enc.encode(a)), crypto.subtle.digest('SHA-256', enc.encode(b))]);
  return crypto.subtle.timingSafeEqual(x, y);
}
const b64 = (s: string) => btoa(String.fromCharCode(...enc.encode(s))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const deB64 = (s: string) => new TextDecoder().decode(Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/')), c => c.charCodeAt(0)));

const cookie = (valor: string, maxAge: number) => `${COOKIE}=${valor}; Max-Age=${maxAge}; Path=/api/admin; HttpOnly; Secure; SameSite=Strict`;

type Usuaria = { id: string; email: string; name: string | null; role: string };

async function usuariaDeSesion(env: Env, db: D1Database, request: Request): Promise<Usuaria | null> {
  const m = (request.headers.get('Cookie') || '').match(new RegExp(`(?:^|;\\s*)${COOKIE}=([^;]+)`));
  if (!m) return null;
  const [exp, correo64, firma] = m[1].split('.');
  if (!exp || !correo64 || !firma || !/^\d+$/.test(exp) || Number(exp) < segundos()) return null;
  let email = '';
  try { email = deB64(correo64); } catch { return null; }
  if (!(await iguales(firma, await hmac(env.ADMIN_CODE!, `admin.${exp}.${email}`)))) return null;
  // Si a alguien se le quita el acceso, su sesión deja de servir de inmediato.
  return db.prepare('SELECT id, email, name, role FROM admin_users WHERE email = ? AND active = 1').bind(email).first<Usuaria>();
}

async function entrar(request: Request, env: Env, db: D1Database): Promise<Response> {
  const desde = segundos() - VENTANA_FALLOS;
  const f = await db.prepare('SELECT COUNT(*) AS n FROM admin_intentos WHERE at > ?').bind(desde).first<{ n: number }>();
  if ((f?.n || 0) >= MAX_FALLOS) return error('Demasiados intentos. Espera unos minutos y vuelve a probar.', 429);

  let d: any = {};
  try { d = await request.json(); } catch { /* cuerpo vacío */ }
  const email = texto(d?.email, 160).toLowerCase();
  // Sin distinguir mayúsculas, espacios ni guiones: el teclado del celular pone mayúscula al inicio sin avisar.
  const normal = (c: string) => c.toUpperCase().replace(/[^A-Z0-9]/g, '');
  const codigo = typeof d?.codigo === 'string' ? normal(d.codigo) : '';
  const codigoOk = codigo.length > 0 && codigo.length < 100 && (await iguales(codigo, normal(env.ADMIN_CODE!)));
  const u = email ? await db.prepare('SELECT id FROM admin_users WHERE email = ? AND active = 1').bind(email).first() : null;
  if (!codigoOk || !u) {
    await db.batch([
      db.prepare('INSERT INTO admin_intentos (at) VALUES (?)').bind(segundos()),
      db.prepare('DELETE FROM admin_intentos WHERE at < ?').bind(segundos() - 86400),
    ]);
    return error('Correo o código incorrecto.', 401);
  }
  const exp = segundos() + SESION_HORAS * 3600;
  const valor = `${exp}.${b64(email)}.${await hmac(env.ADMIN_CODE!, `admin.${exp}.${email}`)}`;
  return json({ ok: true }, 200, { 'Set-Cookie': cookie(valor, SESION_HORAS * 3600) });
}

/* ---------- pedidos ---------- */

export const ESTADOS = ['nuevo', 'por_pagar', 'comprobante_recibido', 'confirmado', 'en_fabricacion', 'listo', 'enviado', 'entregado', 'cancelado'] as const;

// Cambios de estado permitidos (TIENDA-DISENO.md, sección 7).
export const TRANSICIONES: Record<string, string[]> = {
  nuevo: ['por_pagar', 'cancelado'],
  por_pagar: ['comprobante_recibido', 'confirmado', 'nuevo', 'cancelado'],
  comprobante_recibido: ['confirmado', 'por_pagar', 'cancelado'],
  confirmado: ['en_fabricacion', 'cancelado'],
  en_fabricacion: ['listo', 'cancelado'],
  listo: ['enviado', 'cancelado'],
  enviado: ['entregado'],
  entregado: [],
  cancelado: [],
};

const evento = (db: D1Database, pedido: string, actor: string, tipo: string, detalle: unknown) =>
  db.prepare('INSERT INTO order_events (id, order_id, at, actor, type, detail_json) VALUES (?, ?, ?, ?, ?, ?)')
    .bind(crypto.randomUUID(), pedido, ahora(), actor, tipo, JSON.stringify(detalle));

const registro = (db: D1Database, actor: string, accion: string, detalle: unknown) =>
  db.prepare('INSERT INTO admin_log (id, at, actor, accion, detalle_json) VALUES (?, ?, ?, ?, ?)').bind(crypto.randomUUID(), ahora(), actor, accion, JSON.stringify(detalle));

async function listarPedidos(db: D1Database, url: URL): Promise<Response> {
  const estado = url.searchParams.get('estado') || '';
  const q = texto(url.searchParams.get('q'), 80);
  const cond: string[] = [];
  const args: unknown[] = [];
  if (estado === 'abiertos') cond.push("status NOT IN ('entregado', 'cancelado')");
  else if ((ESTADOS as readonly string[]).includes(estado)) { cond.push('status = ?'); args.push(estado); }
  if (q) {
    cond.push("(public_code LIKE ? ESCAPE '\\' OR customer_name LIKE ? ESCAPE '\\' OR phone LIKE ? ESCAPE '\\' OR city LIKE ? ESCAPE '\\')");
    const like = '%' + q.replace(/[\\%_]/g, c => '\\' + c) + '%';
    args.push(like, like, like, like);
  }
  const { results } = await db
    .prepare(`SELECT id, public_code AS codigo, status AS estado, payment_status AS estado_pago, customer_name AS nombre, phone AS telefono, city AS ciudad,
                     subtotal_cents, total_cents, created_at AS creado, updated_at AS actualizado
              FROM orders ${cond.length ? 'WHERE ' + cond.join(' AND ') : ''} ORDER BY created_at DESC LIMIT 200`)
    .bind(...args)
    .all();
  return json({ pedidos: results });
}

async function verPedidoAdmin(db: D1Database, id: string): Promise<Response> {
  const o = await db.prepare('SELECT * FROM orders WHERE id = ?').bind(id).first<any>();
  if (!o) return error('No existe ese pedido.', 404);
  const [items, eventos, pagos] = await db.batch([
    db.prepare('SELECT product_id, name_snapshot AS nombre, unit_cents_snapshot AS precio_cents, qty AS cantidad, note AS nota FROM order_items WHERE order_id = ? ORDER BY rowid').bind(id),
    db.prepare('SELECT at, actor, type AS tipo, detail_json FROM order_events WHERE order_id = ? ORDER BY at').bind(id),
    db.prepare("SELECT p.id, p.method AS metodo, p.amount_cents AS monto_cents, p.status AS estado, p.proof_key IS NOT NULL AS tiene_archivo, p.verified_by AS verificado_por, p.verified_at AS verificado_en, e.at AS subido FROM payments p LEFT JOIN order_events e ON e.order_id = p.order_id AND e.type = 'comprobante' AND json_extract(e.detail_json, '$.pago') = p.id WHERE p.order_id = ? ORDER BY e.at").bind(id),
  ]);
  return json({
    pedido: {
      id: o.id, codigo: o.public_code, token: o.tracking_token, estado: o.status, estado_pago: o.payment_status,
      nombre: o.customer_name, telefono: o.phone, email: o.email, cedula: o.id_number, ciudad: o.city, direccion: o.address, referencia: o.reference,
      notas: o.notes, subtotal_cents: o.subtotal_cents, envio_cents: o.shipping_cents, descuento_cents: o.discount_cents,
      total_cents: o.total_cents, abono_cents: o.deposit_cents, creado: o.created_at, actualizado: o.updated_at,
    },
    lineas: items.results,
    eventos: (eventos.results as any[]).map(e => ({ at: e.at, actor: e.actor, tipo: e.tipo, detalle: JSON.parse(e.detail_json || '{}') })),
    pagos: pagos.results,
    siguientes: TRANSICIONES[o.status] || [],
  });
}

const centavos = (v: unknown, opcional = false): number | null | undefined => {
  if (v === null || v === undefined || v === '') return opcional ? null : undefined;
  const n = Number(v);
  return Number.isInteger(n) && n >= 0 && n <= MAX_CENTAVOS ? n : undefined;
};

async function fijarMontos(request: Request, db: D1Database, id: string, u: Usuaria): Promise<Response> {
  const d: any = await request.json().catch(() => ({}));
  const envio = centavos(d?.envio_cents);
  const descuento = centavos(d?.descuento_cents ?? 0);
  const abono = centavos(d?.abono_cents, true);
  if (envio === undefined) return error('Escribe el costo de envío (0 si no tiene costo).', 400);
  if (descuento === undefined || abono === undefined) return error('Revisa los valores.', 400);
  const o = await db.prepare('SELECT status, subtotal_cents FROM orders WHERE id = ?').bind(id).first<{ status: string; subtotal_cents: number }>();
  if (!o) return error('No existe ese pedido.', 404);
  if (!['nuevo', 'por_pagar'].includes(o.status)) return error('Los valores solo se cambian antes de confirmar el pago.', 409);
  const total = o.subtotal_cents + envio! - descuento!;
  if (total < 0) return error('El descuento no puede ser mayor que el pedido.', 400);
  if (abono !== null && abono! > total) return error('El abono no puede ser mayor que el total.', 400);
  const r = await db.batch([
    db.prepare('UPDATE orders SET shipping_cents = ?, discount_cents = ?, total_cents = ?, deposit_cents = ?, updated_at = ? WHERE id = ? AND status = ?')
      .bind(envio, descuento, total, abono, ahora(), id, o.status),
    evento(db, id, u.email, 'montos', { envio_cents: envio, descuento_cents: descuento, total_cents: total, abono_cents: abono }),
  ]);
  if (!r[0].meta.changes) return error('El pedido cambió mientras lo editabas. Vuelve a abrirlo.', 409);
  return verPedidoAdmin(db, id);
}

async function cambiarEstado(request: Request, env: Env, db: D1Database, id: string, u: Usuaria): Promise<Response> {
  const d: any = await request.json().catch(() => ({}));
  const nuevo = texto(d?.estado, 40);
  const desde = texto(d?.desde, 40);
  const motivo = textoLargo(d?.motivo, 500);
  const o = await db.prepare('SELECT status, total_cents FROM orders WHERE id = ?').bind(id).first<{ status: string; total_cents: number | null }>();
  if (!o) return error('No existe ese pedido.', 404);
  if (desde && desde !== o.status) return error('El pedido cambió mientras lo editabas. Vuelve a abrirlo.', 409);
  if (!(TRANSICIONES[o.status] || []).includes(nuevo)) return error('Ese cambio de estado no está permitido.', 400);
  if (nuevo === 'por_pagar' && o.total_cents === null) return error('Primero fija el envío y el total.', 400);
  if (nuevo === 'cancelado' && motivo.length < 3) return error('Escribe el motivo de la cancelación.', 400);
  if (o.status === 'comprobante_recibido' && nuevo === 'por_pagar' && motivo.length < 3) return error('Escribe por qué se rechaza el pago.', 400);

  const pago = nuevo === 'confirmado' ? 'verificado' : nuevo === 'por_pagar' && o.status === 'comprobante_recibido' ? 'rechazado' : null;
  const t = ahora();
  const r = await db.batch([
    db.prepare(`UPDATE orders SET status = ?, ${pago ? 'payment_status = ?, ' : ''}updated_at = ? WHERE id = ? AND status = ?`)
      .bind(...(pago ? [nuevo, pago] : [nuevo]), t, id, o.status),
    evento(db, id, u.email, 'estado', { de: o.status, a: nuevo, ...(motivo ? { motivo } : {}) }),
    // El comprobante en revisión queda verificado o rechazado junto con el pedido.
    ...(pago ? [db.prepare("UPDATE payments SET status = ?, verified_by = ?, verified_at = ? WHERE order_id = ? AND status = 'en_revision'").bind(pago, u.email, t, id)] : []),
  ]);
  if (!r[0].meta.changes) return error('El pedido cambió mientras lo editabas. Vuelve a abrirlo.', 409);
  // Entregado: el cliente pasa solo al panel de reseñas para empezar a pedirle su opinión.
  if (nuevo === 'entregado') await avisarResenas(env, db, id);
  return verPedidoAdmin(db, id);
}

async function agregarNota(request: Request, db: D1Database, id: string, u: Usuaria): Promise<Response> {
  const d: any = await request.json().catch(() => ({}));
  const t = textoLargo(d?.texto, 1000);
  if (t.length < 2) return error('Escribe la nota.', 400);
  if (!(await db.prepare('SELECT 1 FROM orders WHERE id = ?').bind(id).first())) return error('No existe ese pedido.', 404);
  await db.batch([evento(db, id, u.email, 'nota', { texto: t }), db.prepare('UPDATE orders SET updated_at = ? WHERE id = ?').bind(ahora(), id)]);
  return verPedidoAdmin(db, id);
}

/* ---------- productos ---------- */

async function listarProductos(db: D1Database): Promise<Response> {
  const { results } = await db.prepare('SELECT p.id, p.name, p.category, p.image, p.price_cents, p.active, p.sort, p.ficha_id, p.sold_separately, (SELECT COUNT(*) FROM product_pieces x WHERE x.product_id = p.id) AS piezas FROM products p ORDER BY p.sort, p.name').all();
  return json({ productos: results });
}

async function editarProducto(request: Request, db: D1Database, id: string, u: Usuaria): Promise<Response> {
  const d: any = await request.json().catch(() => ({}));
  const precio = centavos(d?.price_cents, true);
  if (precio === undefined) return error('Revisa el precio.', 400);
  if (typeof d?.active !== 'boolean') return error('Falta indicar si está activo.', 400);
  const antes = await db.prepare('SELECT price_cents, active FROM products WHERE id = ?').bind(id).first<{ price_cents: number | null; active: number }>();
  if (!antes) return error('No existe ese modelo.', 404);
  // Un modelo con piezas tiene el precio del juego calculado: aquí solo se muestra u oculta.
  const conPiezas = await db.prepare('SELECT 1 FROM product_pieces WHERE product_id = ? LIMIT 1').bind(id).first();
  if (conPiezas && precio !== antes.price_cents) return error('Este modelo tiene piezas: su precio se cambia desde «Fichas».', 400);
  await db.batch([
    db.prepare('UPDATE products SET price_cents = ?, active = ? WHERE id = ?').bind(precio, d.active ? 1 : 0, id),
    registro(db, u.email, 'producto', { id, antes, despues: { price_cents: precio, active: d.active ? 1 : 0 } }),
  ]);
  return listarProductos(db);
}

/* ---------- fichas del dueño → tienda ---------- */

type Ficha = {
  id: string; rev: number; nombre: string; categoria: string; descripcion: string; separado: boolean; fotos: string[];
  incluye: string[]; medidas: { nombre: string; ancho: string; fondo: string; alto: string; precio: string }[];
};

const slug = (t: string) => t.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 70);
const numero = (v: unknown) => { const n = parseFloat(String(v ?? '').replace(',', '.')); return isFinite(n) && n > 0 ? n : null; };

// Lee las fichas (solo lectura). En la rama de pruebas FICHAS_FUENTE apunta a las fichas reales del dueño.
async function leerFichas(env: Env): Promise<Ficha[]> {
  const fuente = env.FICHAS_FUENTE ?? env.FOTOS;
  const o = await fuente.get('datos/fichas.json');
  if (!o) return [];
  const doc = (await o.json()) as { fichas: Record<string, { rev: number; position: number; deletedAt: string | null; data: any }> };
  return Object.entries(doc.fichas || {})
    .filter(([, f]) => !f.deletedAt)
    .sort(([, a], [, b]) => a.position - b.position)
    .map(([id, f]) => ({
      id, rev: f.rev,
      nombre: String(f.data?.nombre || '').trim(), categoria: String(f.data?.categoria || ''), descripcion: String(f.data?.descripcion || '').trim(),
      separado: f.data?.separado === true, fotos: Array.isArray(f.data?.fotos) ? f.data.fotos.map(String) : [],
      incluye: Array.isArray(f.data?.incluye) ? f.data.incluye.map(String) : [],
      medidas: Array.isArray(f.data?.medidas) ? f.data.medidas : [],
    }));
}

async function listarFichas(env: Env, db: D1Database): Promise<Response> {
  const [fichas, { results }] = await Promise.all([
    leerFichas(env),
    db.prepare('SELECT id, name, ficha_id, ficha_rev FROM products').all<{ id: string; name: string; ficha_id: string | null; ficha_rev: number | null }>(),
  ]);
  const porFicha = new Map(results.filter(p => p.ficha_id).map(p => [p.ficha_id!, p]));
  const porSlug = new Map(results.map(p => [slug(p.name), p]));
  return json({
    fichas: fichas.map(f => {
      const v = porFicha.get(f.id);
      const sugerido = v ? null : porSlug.get(slug(f.nombre)) || null;
      return {
        ...f,
        producto: v ? { id: v.id, nombre: v.name, rev: v.ficha_rev } : null,
        cambio: !!v && v.ficha_rev !== f.rev,
        sugerido: sugerido && !sugerido.ficha_id ? { id: sugerido.id, nombre: sugerido.name } : null,
      };
    }),
    productos: results.map(p => ({ id: p.id, nombre: p.name, ficha_id: p.ficha_id })),
  });
}

async function fotoDeFicha(env: Env, id: string): Promise<Response> {
  const o = await (env.FICHAS_FUENTE ?? env.FOTOS).get(`fotos/${id}.jpg`);
  if (!o) return error('No encontrada.', 404);
  return new Response(o.body, { headers: { 'Content-Type': 'image/jpeg', 'Cache-Control': 'private, max-age=3600', 'X-Content-Type-Options': 'nosniff' } });
}

const CATEGORIAS_TIENDA = ['salas', 'comedores', 'dormitorios', 'infantil', 'armarios', 'complementos', 'otro'];

// Pasa una ficha a la tienda: crea el modelo o actualiza uno existente, con sus piezas revisadas en el panel.
async function publicarFicha(request: Request, env: Env, db: D1Database, fichaId: string, u: Usuaria): Promise<Response> {
  const ficha = (await leerFichas(env)).find(f => f.id === fichaId);
  if (!ficha) return error('Esa ficha ya no existe.', 404);
  const d: any = await request.json().catch(() => ({}));

  const nombre = texto(d?.nombre, 120);
  const categoria = CATEGORIAS_TIENDA.includes(d?.categoria) ? d.categoria : '';
  const descripcion = textoLargo(d?.descripcion, 400);
  if (nombre.length < 3) return error('Escribe el nombre del modelo.', 400);
  if (!categoria) return error('Elige el tipo de mueble.', 400);
  if (!Array.isArray(d?.piezas) || d.piezas.length === 0 || d.piezas.length > 20) return error('El modelo necesita al menos una pieza con precio.', 400);
  const piezas: { nombre: string; cantidad: number; precio: number; ancho: number | null; fondo: number | null; alto: number | null }[] = [];
  for (const x of d.piezas) {
    const nombreP = texto(x?.nombre, 80);
    const cantidad = Number(x?.cantidad);
    const precio = centavos(x?.precio_cents);
    if (nombreP.length < 2) return error('Cada pieza necesita un nombre.', 400);
    if (!Number.isInteger(cantidad) || cantidad < 0 || cantidad > 50) return error(`Revisa la cantidad de «${nombreP}» en el juego.`, 400);
    if (precio === undefined || precio === null || precio === 0) return error(`Falta el precio de «${nombreP}».`, 400);
    piezas.push({ nombre: nombreP, cantidad, precio, ancho: numero(x?.ancho), fondo: numero(x?.fondo), alto: numero(x?.alto) });
  }
  const juego = piezas.reduce((s, x) => s + x.cantidad * x.precio, 0);
  if (juego <= 0) return error('El juego completo tiene que llevar al menos una pieza (cantidad mayor que 0).', 400);
  const separado = d?.separado === true;
  const activo = d?.activo === true;

  // ¿Modelo existente o nuevo?
  let destino = texto(d?.producto, 80);
  const otro = await db.prepare('SELECT id FROM products WHERE ficha_id = ?').bind(ficha.id).first<{ id: string }>();
  if (otro && destino !== otro.id) return error('Esta ficha ya está en la tienda como otro modelo. Ábrela desde ese modelo.', 409);
  const existe = destino && destino !== 'nuevo'
    ? await db.prepare('SELECT id, image, ficha_id FROM products WHERE id = ?').bind(destino).first<{ id: string; image: string | null; ficha_id: string | null }>()
    : null;
  if (destino && destino !== 'nuevo' && !existe) return error('Ese modelo no existe.', 404);
  if (existe?.ficha_id && existe.ficha_id !== ficha.id) return error('Ese modelo ya está unido a otra ficha.', 409);

  // Foto de la tienda: la «foto lista» que se sube en el panel (ya retocada), nunca la foto cruda de la ficha.
  let imagen = existe?.image ?? null;
  const lista = texto(d?.foto_lista, 40);
  if (lista) {
    if (!FOTO_ID.test(lista) || !(await env.FOTOS.head(`tienda/${lista}/1600.jpg`)) || !(await env.FOTOS.head(`tienda/${lista}/480.webp`))) {
      return error('La foto lista no terminó de subir. Vuelve a subirla.', 400);
    }
    imagen = 'api/tienda-fotos/' + lista;
  }
  if (!imagen) return error('Sube la foto lista para la tienda antes de guardar.', 400);

  const stmts: D1PreparedStatement[] = [];
  if (!existe) {
    const base = slug(nombre) || 'modelo';
    let id = base;
    for (let i = 2; await db.prepare('SELECT 1 FROM products WHERE id = ?').bind(id).first(); i++) id = `${base}-${i}`;
    const orden = await db.prepare('SELECT COALESCE(MAX(sort), 0) + 10 AS s FROM products').first<{ s: number }>();
    destino = id;
    stmts.push(db.prepare('INSERT INTO products (id, slug, name, category, description, image, price_cents, active, sort, ficha_id, ficha_rev, sold_separately) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)')
      .bind(id, id, nombre, categoria, descripcion || null, imagen, juego, activo ? 1 : 0, orden?.s ?? 1000, ficha.id, ficha.rev, separado ? 1 : 0));
  } else {
    stmts.push(db.prepare('UPDATE products SET name = ?, category = ?, description = ?, image = ?, price_cents = ?, active = ?, ficha_id = ?, ficha_rev = ?, sold_separately = ? WHERE id = ?')
      .bind(nombre, categoria, descripcion || null, imagen, juego, activo ? 1 : 0, ficha.id, ficha.rev, separado ? 1 : 0, destino));
  }
  stmts.push(db.prepare('DELETE FROM product_pieces WHERE product_id = ?').bind(destino));
  piezas.forEach((x, i) => stmts.push(
    db.prepare('INSERT INTO product_pieces (id, product_id, name, qty_in_set, price_cents, width_cm, depth_cm, height_cm, sort) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)')
      .bind(crypto.randomUUID(), destino, x.nombre, x.cantidad, x.precio, x.ancho, x.fondo, x.alto, i),
  ));
  stmts.push(registro(db, u.email, 'ficha', { ficha: ficha.id, rev: ficha.rev, producto: destino, juego_cents: juego, piezas: piezas.length, activo, separado }));
  await db.batch(stmts);
  return json({ ok: true, producto: destino, juego_cents: juego });
}

async function verModelo(db: D1Database, id: string): Promise<Response> {
  const p = await db.prepare('SELECT id, name, category, description, image, price_cents, active, ficha_id, ficha_rev, sold_separately FROM products WHERE id = ?').bind(id).first();
  if (!p) return error('No existe ese modelo.', 404);
  const { results } = await db.prepare('SELECT name AS nombre, qty_in_set AS cantidad, price_cents, width_cm AS ancho, depth_cm AS fondo, height_cm AS alto FROM product_pieces WHERE product_id = ? ORDER BY sort').bind(id).all();
  return json({ modelo: p, piezas: results });
}

/* ---------- fotos listas para la tienda ---------- */

// La foto retocada se sube desde el panel en varios tamaños ya preparados por el navegador:
// WEBP de 480, 800, 1200 y 1600 px y un JPG de 1600 px de respaldo. Se guardan en tienda/<id>/.
export const FOTO_ID = /^[a-z0-9]{20}$/;
export const VARIANTES = ['480.webp', '800.webp', '1200.webp', '1600.webp', '1600.jpg'];
const MAX_VARIANTE = 3_000_000;

async function subirVariante(request: Request, env: Env, id: string, variante: string, u: Usuaria): Promise<Response> {
  if (!FOTO_ID.test(id) || !VARIANTES.includes(variante)) return error('No encontrado.', 404);
  const bytes = new Uint8Array(await request.arrayBuffer());
  if (!bytes.length || bytes.length > MAX_VARIANTE) return error('La foto es demasiado grande.', 413);
  const esJpg = bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  const esWebp = bytes.length > 12 && String.fromCharCode(...bytes.slice(0, 4)) === 'RIFF' && String.fromCharCode(...bytes.slice(8, 12)) === 'WEBP';
  if (variante.endsWith('.jpg') ? !esJpg : !esWebp) return error('Formato de foto no válido.', 415);
  await env.FOTOS.put(`tienda/${id}/${variante}`, bytes, {
    httpMetadata: { contentType: variante.endsWith('.jpg') ? 'image/jpeg' : 'image/webp' },
    customMetadata: { por: u.email },
  });
  return json({ ok: true });
}

/* ---------- ajustes ---------- */

const AJUSTES = ['tienda_activa', 'pago_banco', 'pago_instrucciones'] as const;

export async function leerAjustes(db: D1Database): Promise<Record<string, unknown>> {
  const { results } = await db.prepare(`SELECT key, value_json FROM settings WHERE key IN (${AJUSTES.map(() => '?').join(',')})`).bind(...AJUSTES).all<{ key: string; value_json: string }>();
  const a: Record<string, unknown> = { tienda_activa: false, pago_banco: null, pago_instrucciones: '' };
  for (const r of results) { try { a[r.key] = JSON.parse(r.value_json); } catch { /* valor dañado: se ignora */ } }
  return a;
}

async function guardarAjustes(request: Request, db: D1Database, u: Usuaria): Promise<Response> {
  const d: any = await request.json().catch(() => ({}));
  if (typeof d?.tienda_activa !== 'boolean') return error('Falta indicar si la tienda está abierta.', 400);
  let banco: Record<string, string> | null = null;
  if (d?.pago_banco) {
    banco = {
      banco: texto(d.pago_banco.banco, 80), tipo: texto(d.pago_banco.tipo, 40), numero: texto(d.pago_banco.numero, 40),
      titular: texto(d.pago_banco.titular, 120), identificacion: texto(d.pago_banco.identificacion, 20),
    };
    if (!banco.banco && !banco.numero && !banco.titular) banco = null;
    else if (!banco.banco || !banco.numero || !banco.titular) return error('Para la cuenta hacen falta banco, número y titular.', 400);
  }
  const instrucciones = textoLargo(d?.pago_instrucciones, 600);
  const put = (k: string, v: unknown) => db.prepare('INSERT INTO settings (key, value_json) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value_json = excluded.value_json').bind(k, JSON.stringify(v));
  await db.batch([
    put('tienda_activa', d.tienda_activa), put('pago_banco', banco), put('pago_instrucciones', instrucciones),
    registro(db, u.email, 'ajustes', { tienda_activa: d.tienda_activa, cuenta: banco ? banco.banco + ' ' + banco.numero.slice(-4) : null }),
  ]);
  return json(await leerAjustes(db));
}

// Respaldo de la tarea diaria: el plan gratuito permite solo 5 tareas programadas por cuenta y ya están ocupadas.
// Al abrir el panel se corre la limpieza si pasaron más de 24 horas desde la última.
async function limpiezaDelDia(env: Env, db: D1Database): Promise<void> {
  const r = await db.prepare("SELECT value_json FROM settings WHERE key = 'ultima_limpieza'").first<{ value_json: string }>();
  const ultima = r ? Number(JSON.parse(r.value_json)) : 0;
  if (Date.now() - ultima < 86400_000) return;
  await db.prepare("INSERT INTO settings (key, value_json) VALUES ('ultima_limpieza', ?) ON CONFLICT(key) DO UPDATE SET value_json = excluded.value_json").bind(String(Date.now())).run();
  try { await limpiar(env); } catch (e) { console.error('limpieza', e); }
}

/* ---------- rutas ---------- */

export async function adminApi(request: Request, env: Env, url: URL): Promise<Response> {
  const db = env.DB!;
  if (!env.ADMIN_CODE) return error('El panel todavía no está configurado.', 503);
  const p = url.pathname.replace(/^\/api\/admin/, '').replace(/\/+$/, '') || '/';
  const m = request.method;
  // Además de SameSite=Strict: toda escritura debe traer este encabezado propio.
  if (m !== 'GET' && m !== 'HEAD' && request.headers.get('X-Requested-With') !== 'admin') return error('Solicitud no permitida.', 403);

  if (p === '/entrar' && m === 'POST') return entrar(request, env, db);
  if (p === '/salir' && m === 'POST') return json({ ok: true }, 200, { 'Set-Cookie': cookie('', 0) });

  const u = await usuariaDeSesion(env, db, request);
  if (!u) return error('Tu sesión terminó. Vuelve a entrar.', 401);

  if (p === '/yo' && m === 'GET') {
    await limpiezaDelDia(env, db);
    return json({ email: u.email, nombre: u.name, rol: u.role });
  }
  if (p === '/pedidos' && m === 'GET') return listarPedidos(db, url);
  let r = p.match(/^\/pedidos\/([0-9a-f-]{36})(\/[a-z]+)?$/);
  if (r) {
    const [, id, accion] = r;
    if (!accion && m === 'GET') return verPedidoAdmin(db, id);
    if (accion === '/montos' && m === 'POST') return fijarMontos(request, db, id, u);
    if (accion === '/estado' && m === 'POST') return cambiarEstado(request, env, db, id, u);
    if (accion === '/nota' && m === 'POST') return agregarNota(request, db, id, u);
  }
  r = p.match(/^\/pedidos\/([0-9a-f-]{36})\/comprobantes\/([0-9a-f-]{36})$/);
  if (r && m === 'GET') return verComprobante(env, db, r[1], r[2]);
  if (p === '/productos' && m === 'GET') return listarProductos(db);
  if (p === '/fichas' && m === 'GET') return listarFichas(env, db);
  const tf = p.match(/^\/tienda-fotos\/([a-z0-9]{20})\/([0-9]{3,4}\.(?:webp|jpg))$/);
  if (tf && m === 'PUT') return subirVariante(request, env, tf[1], tf[2], u);
  let q = p.match(/^\/fichas\/foto\/([A-Za-z0-9_-]{1,40})$/);
  if (q && m === 'GET') return fotoDeFicha(env, q[1]);
  q = p.match(/^\/fichas\/([A-Za-z0-9_-]{1,40})\/publicar$/);
  if (q && m === 'POST') return publicarFicha(request, env, db, q[1], u);
  q = p.match(/^\/modelos\/([a-z0-9-]{1,80})$/);
  if (q && m === 'GET') return verModelo(db, q[1]);
  r = p.match(/^\/productos\/([a-z0-9-]{1,80})$/);
  if (r && m === 'PUT') return editarProducto(request, db, r[1], u);
  if (p === '/ajustes' && m === 'GET') return json(await leerAjustes(db));
  if (p === '/ajustes' && m === 'PUT') return guardarAjustes(request, db, u);
  return error('No encontrado.', 404);
}
