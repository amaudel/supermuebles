// API de las fichas de producto (fase 0 de la tienda).
// Solo atiende /fichas-api/*; el resto del sitio lo sirven los archivos estáticos.
//
// Todo vive en un bucket R2 privado, sin base de datos:
//   datos/fichas.json        todas las fichas (un solo documento pequeño)
//   fotos/<id>.jpg           cada foto; el metadato `ficha` dice a qué ficha pertenece
//   datos/intentos.json      intentos fallidos de acceso
// Los cambios al documento usan escritura condicional (etag): si otra petición escribió antes,
// se vuelve a leer y se reintenta, así nunca se pisan dos guardados a la vez.
import { SEED } from './seed';

export interface Env {
  ASSETS: Fetcher;
  FOTOS: R2Bucket;
  FICHAS_CODE: string; // código de acceso compartido (secreto del Worker)
}

const COOKIE = 'sm_fichas';
const SESION_DIAS = 30;
const MAX_FALLOS = 20;            // intentos fallidos permitidos...
const VENTANA_FALLOS = 600;       // ...cada 10 minutos, entre todos
const MAX_FOTOS = 6;
const MAX_FOTO_BYTES = 2_500_000;
const MAX_FICHA_BYTES = 64_000;
const ID = /^[A-Za-z0-9_-]{1,40}$/;
const DOC = 'datos/fichas.json';
const INTENTOS = 'datos/intentos.json';

const CATEGORIAS = ['salas', 'comedores', 'dormitorios', 'infantil', 'armarios', 'complementos', 'otro', ''];

const ahora = () => new Date().toISOString();
const segundos = () => Math.floor(Date.now() / 1000);

function json(cuerpo: unknown, status = 200, extra: HeadersInit = {}): Response {
  return new Response(JSON.stringify(cuerpo), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...extra },
  });
}
const error = (mensaje: string, status: number) => json({ error: mensaje }, status);

/* ---------- acceso: código compartido y sesión firmada en cookie ---------- */

const enc = new TextEncoder();

async function hmac(secreto: string, mensaje: string): Promise<ArrayBuffer> {
  const k = await crypto.subtle.importKey('raw', enc.encode(secreto), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return crypto.subtle.sign('HMAC', k, enc.encode(mensaje));
}
const hex = (b: ArrayBuffer) => [...new Uint8Array(b)].map(x => x.toString(16).padStart(2, '0')).join('');

// Compara en tiempo constante: se pasa cada valor por SHA-256 para que tengan el mismo largo.
async function iguales(a: string, b: string): Promise<boolean> {
  const [x, y] = await Promise.all([crypto.subtle.digest('SHA-256', enc.encode(a)), crypto.subtle.digest('SHA-256', enc.encode(b))]);
  return crypto.subtle.timingSafeEqual(x, y);
}

const normalizar = (c: string) => c.toUpperCase().replace(/[^A-Z0-9]/g, '');

async function crearSesion(env: Env): Promise<string> {
  const exp = segundos() + SESION_DIAS * 86400;
  return `${exp}.${hex(await hmac(env.FICHAS_CODE, `sesion.${exp}`))}`;
}

async function sesionValida(env: Env, request: Request): Promise<boolean> {
  const m = (request.headers.get('Cookie') || '').match(new RegExp(`(?:^|;\\s*)${COOKIE}=([^;]+)`));
  if (!m) return false;
  const [exp, firma] = m[1].split('.');
  if (!exp || !firma || !/^\d+$/.test(exp) || Number(exp) < segundos()) return false;
  return iguales(firma, hex(await hmac(env.FICHAS_CODE, `sesion.${exp}`)));
}

const cookie = (valor: string, maxAge: number) =>
  `${COOKIE}=${valor}; Max-Age=${maxAge}; Path=/fichas-api; HttpOnly; Secure; SameSite=Strict`;

// Lista de instantes de intentos fallidos, con escritura condicional y unos pocos reintentos.
async function fallosRecientes(env: Env): Promise<number> {
  const o = await env.FOTOS.get(INTENTOS);
  const lista = o ? ((await o.json()) as number[]) : [];
  return lista.filter(t => t > segundos() - VENTANA_FALLOS).length;
}
async function registrarFallo(env: Env): Promise<void> {
  for (let i = 0; i < 4; i++) {
    const o = await env.FOTOS.get(INTENTOS);
    const lista = (o ? ((await o.json()) as number[]) : []).filter(t => t > segundos() - 3600);
    lista.push(segundos());
    const r = await env.FOTOS.put(INTENTOS, JSON.stringify(lista), {
      httpMetadata: { contentType: 'application/json' },
      onlyIf: o ? { etagMatches: o.etag } : { etagDoesNotMatch: '*' },
    });
    if (r) return;
  }
}

async function entrar(request: Request, env: Env): Promise<Response> {
  if ((await fallosRecientes(env)) >= MAX_FALLOS) return error('Demasiados intentos. Espera unos minutos y vuelve a probar.', 429);

  let codigo = '';
  try { codigo = String(((await request.json()) as { codigo?: unknown }).codigo ?? ''); } catch { /* cuerpo vacío */ }
  const correcto = codigo.length > 0 && codigo.length < 64 && (await iguales(normalizar(codigo), normalizar(env.FICHAS_CODE)));
  if (!correcto) {
    await registrarFallo(env);
    return error('Código incorrecto.', 401);
  }
  return json({ ok: true }, 200, { 'Set-Cookie': cookie(await crearSesion(env), SESION_DIAS * 86400) });
}

/* ---------- validación de la ficha ---------- */

const txt = (v: unknown, max: number) => (typeof v === 'string' ? v.slice(0, max) : '');
const lista = <T>(v: unknown, max: number, f: (x: any) => T): T[] => (Array.isArray(v) ? v.slice(0, max).map(f) : []);
const elegir = (v: unknown, validos: string[]) => (typeof v === 'string' && validos.includes(v) ? v : validos[0]);

type Datos = ReturnType<typeof limpiar>;

// Deja solo los campos conocidos y con largo limitado. Lo demás se descarta.
function limpiar(d: any, fotosPropias: Set<string>) {
  d = d && typeof d === 'object' ? d : {};
  const ops = (v: unknown) => lista(v, 30, (o: any) => ({ nombre: txt(o?.nombre, 80), extra: txt(o?.extra, 20) }));
  return {
    nombre: txt(d.nombre, 120),
    categoria: elegir(d.categoria, CATEGORIAS),
    descripcion: txt(d.descripcion, 300),
    destacado: d.destacado === true,
    fotos: lista(d.fotos, MAX_FOTOS, (x: unknown) => String(x)).filter(x => fotosPropias.has(x)),
    incluye: lista(d.incluye, 20, (x: unknown) => txt(x, 120)),
    medidas: lista(d.medidas, 20, (m: any) => ({
      nombre: txt(m?.nombre, 120), ancho: txt(m?.ancho, 20), fondo: txt(m?.fondo, 20), alto: txt(m?.alto, 20), precio: txt(m?.precio, 20),
    })),
    maderas: ops(d.maderas),
    telas: ops(d.telas),
    fabricacion: { valor: txt(d.fabricacion?.valor, 10), unidad: elegir(d.fabricacion?.unidad, ['semanas', 'dias']) },
    disponibilidad: elegir(d.disponibilidad, ['', 'pedido', 'stock']),
    separado: d.separado === true,
    adaptable: d.adaptable !== false,
    llegada: elegir(d.llegada, ['', 'armado', 'desarmado']),
    embalaje: { ancho: txt(d.embalaje?.ancho, 20), fondo: txt(d.embalaje?.fondo, 20), alto: txt(d.embalaje?.alto, 20), peso: txt(d.embalaje?.peso, 20) },
    notas: txt(d.notas, 1000),
  };
}

/* ---------- documento de fichas ---------- */

type Registro = { rev: number; position: number; createdAt: string; updatedAt: string; deletedAt: string | null; data: Datos };
type Doc = { fichas: Record<string, Registro> };

// Fichas iniciales: los modelos del catálogo actual. Se usan solo mientras el documento no existe.
function sembrado(): Doc {
  const t = ahora();
  const base = limpiar({}, new Set());
  const fichas: Record<string, Registro> = {};
  SEED.forEach(([id, nombre, categoria, descripcion], i) => {
    fichas[id] = {
      rev: 1, position: i + 1, createdAt: t, updatedAt: t, deletedAt: null,
      data: { ...base, nombre, categoria, descripcion, incluye: [''], medidas: [{ nombre: '', ancho: '', fondo: '', alto: '', precio: '' }] },
    };
  });
  return { fichas };
}

async function leerDoc(env: Env): Promise<{ doc: Doc; etag: string | null }> {
  const o = await env.FOTOS.get(DOC);
  return o ? { doc: (await o.json()) as Doc, etag: o.etag } : { doc: sembrado(), etag: null };
}

async function escribirDoc(env: Env, doc: Doc, etag: string | null): Promise<boolean> {
  const r = await env.FOTOS.put(DOC, JSON.stringify(doc), {
    httpMetadata: { contentType: 'application/json' },
    onlyIf: etag ? { etagMatches: etag } : { etagDoesNotMatch: '*' },
  });
  return r !== null;
}

type Cambio = { respuesta: Response; escribir: boolean };

// Lee el documento, aplica `fn` y lo escribe solo si nadie más lo cambió en el medio; si no, repite.
async function mutar(env: Env, fn: (doc: Doc) => Cambio): Promise<Response> {
  for (let i = 0; i < 12; i++) {
    const { doc, etag } = await leerDoc(env);
    const c = fn(doc);
    if (!c.escribir || (await escribirDoc(env, doc, etag))) return c.respuesta;
    await new Promise(ok => setTimeout(ok, Math.random() * 40 * (i + 1))); // espera al azar para no chocar otra vez
  }
  return error('Hay mucho movimiento a la vez. Inténtalo de nuevo.', 503);
}

// Fotos que existen de verdad, por ficha: ficha -> ids.
async function fotosPorFicha(env: Env): Promise<Map<string, Set<string>>> {
  const m = new Map<string, Set<string>>();
  let cursor: string | undefined;
  do {
    const l = await env.FOTOS.list({ prefix: 'fotos/', include: ['customMetadata'], cursor });
    for (const o of l.objects) {
      const ficha = o.customMetadata?.ficha;
      if (!ficha) continue;
      (m.get(ficha) ?? m.set(ficha, new Set()).get(ficha)!).add(o.key.slice('fotos/'.length).replace(/\.jpg$/, ''));
    }
    cursor = l.truncated ? l.cursor : undefined;
  } while (cursor);
  return m;
}

function armar(id: string, r: Registro, fotos: Set<string> | undefined) {
  return { id, rev: r.rev, updatedAt: r.updatedAt, ...r.data, fotos: r.data.fotos.filter(x => fotos?.has(x)) };
}

async function listar(env: Env): Promise<Response> {
  let { doc, etag } = await leerDoc(env);
  if (etag === null) { // primera vez: se guarda el sembrado (si otra petición lo hizo antes, se usa el suyo)
    if (!(await escribirDoc(env, doc, null))) ({ doc } = await leerDoc(env));
  }
  const fotos = await fotosPorFicha(env);
  const fichas = Object.entries(doc.fichas)
    .filter(([, r]) => !r.deletedAt)
    .sort(([, a], [, b]) => a.position - b.position || a.createdAt.localeCompare(b.createdAt))
    .map(([id, r]) => armar(id, r, fotos.get(id)));
  return json({ fichas });
}

async function guardar(request: Request, env: Env, id: string): Promise<Response> {
  if (Number(request.headers.get('Content-Length') ?? 0) > MAX_FICHA_BYTES) return error('La ficha es demasiado grande.', 413);
  const texto = await request.text();
  if (texto.length > MAX_FICHA_BYTES) return error('La ficha es demasiado grande.', 413);
  let cuerpo: { rev?: unknown; data?: unknown };
  try { cuerpo = JSON.parse(texto); } catch { return error('Datos no válidos.', 400); }
  const rev = Number(cuerpo.rev);
  if (!Number.isInteger(rev) || rev < 0) return error('Datos no válidos.', 400);

  const fotos = await fotosPorFicha(env);
  const data = limpiar(cuerpo.data, fotos.get(id) ?? new Set());

  return mutar(env, doc => {
    const t = ahora();
    const actual = doc.fichas[id];
    if (actual?.deletedAt) return { respuesta: error('Esta ficha ya no existe.', 404), escribir: false };
    if (rev === 0 && !actual) {
      const pos = Math.max(0, ...Object.values(doc.fichas).map(f => f.position)) + 1;
      doc.fichas[id] = { rev: 1, position: pos, createdAt: t, updatedAt: t, deletedAt: null, data };
      return { respuesta: json({ ok: true, rev: 1, updatedAt: t }), escribir: true };
    }
    if (!actual) return { respuesta: error('Esta ficha ya no existe.', 404), escribir: false };
    if (actual.rev !== rev) { // otra persona guardó antes: se devuelve la versión vigente
      return { respuesta: json({ error: 'Otra persona guardó cambios en esta ficha.', actual: armar(id, actual, fotos.get(id)) }, 409), escribir: false };
    }
    actual.rev = rev + 1; actual.updatedAt = t; actual.data = data;
    return { respuesta: json({ ok: true, rev: actual.rev, updatedAt: t }), escribir: true };
  });
}

// Borrado lógico: la ficha y sus fotos quedan guardadas y se pueden recuperar.
function borrar(env: Env, id: string): Promise<Response> {
  return mutar(env, doc => {
    const f = doc.fichas[id];
    if (!f || f.deletedAt) return { respuesta: error('Esta ficha ya no existe.', 404), escribir: false };
    f.deletedAt = ahora(); f.updatedAt = f.deletedAt;
    return { respuesta: json({ ok: true }), escribir: true };
  });
}

/* ---------- fotos ---------- */

async function subirFoto(request: Request, env: Env, fichaId: string): Promise<Response> {
  if (request.headers.get('Content-Type') !== 'image/jpeg') return error('La foto debe ser JPEG.', 415);
  const { doc } = await leerDoc(env);
  const ficha = doc.fichas[fichaId];
  if (!ficha || ficha.deletedAt) return error('Primero hay que guardar la ficha.', 404);
  if (((await fotosPorFicha(env)).get(fichaId)?.size ?? 0) >= MAX_FOTOS) return error(`Máximo ${MAX_FOTOS} fotos por mueble.`, 409);

  const bytes = await request.arrayBuffer();
  if (bytes.byteLength === 0 || bytes.byteLength > MAX_FOTO_BYTES) return error('La foto es demasiado grande.', 413);
  const cab = new Uint8Array(bytes, 0, 3);
  if (cab[0] !== 0xff || cab[1] !== 0xd8 || cab[2] !== 0xff) return error('La foto debe ser JPEG.', 415);

  const id = crypto.randomUUID().replace(/-/g, '').slice(0, 20);
  await env.FOTOS.put(`fotos/${id}.jpg`, bytes, { httpMetadata: { contentType: 'image/jpeg' }, customMetadata: { ficha: fichaId } });
  return json({ id }, 201);
}

async function verFoto(env: Env, id: string): Promise<Response> {
  const o = await env.FOTOS.get(`fotos/${id}.jpg`);
  if (!o) return error('No encontrada.', 404);
  return new Response(o.body, {
    headers: { 'Content-Type': 'image/jpeg', 'Cache-Control': 'private, max-age=86400', 'X-Content-Type-Options': 'nosniff', ETag: o.httpEtag },
  });
}

async function quitarFoto(env: Env, id: string): Promise<Response> {
  const key = `fotos/${id}.jpg`;
  if (!(await env.FOTOS.head(key))) return error('No encontrada.', 404);
  await env.FOTOS.delete(key);
  return json({ ok: true });
}

/* ---------- rutas ---------- */

async function rutas(request: Request, env: Env, url: URL): Promise<Response> {
  const p = url.pathname.replace(/^\/fichas-api/, '').replace(/\/+$/, '') || '/';
  const m = request.method;
  const escribe = m !== 'GET' && m !== 'HEAD';

  // Defensa contra CSRF además de SameSite=Strict: toda escritura debe traer este encabezado propio.
  if (escribe && request.headers.get('X-Requested-With') !== 'fichas') return error('Solicitud no permitida.', 403);

  if (p === '/entrar' && m === 'POST') return entrar(request, env);
  if (p === '/salir' && m === 'POST') return json({ ok: true }, 200, { 'Set-Cookie': cookie('', 0) });

  if (!(await sesionValida(env, request))) return error('Hace falta el código de acceso.', 401);

  if (p === '/yo' && m === 'GET') return json({ ok: true });
  if (p === '/fichas' && m === 'GET') return listar(env);

  let r = p.match(/^\/fichas\/([^/]+)$/);
  if (r && ID.test(r[1])) {
    if (m === 'PUT') return guardar(request, env, r[1]);
    if (m === 'DELETE') return borrar(env, r[1]);
  }
  r = p.match(/^\/fichas\/([^/]+)\/fotos$/);
  if (r && ID.test(r[1]) && m === 'POST') return subirFoto(request, env, r[1]);

  r = p.match(/^\/fotos\/([^/]+)$/);
  if (r && ID.test(r[1])) {
    if (m === 'GET') return verFoto(env, r[1]);
    if (m === 'DELETE') return quitarFoto(env, r[1]);
  }
  return error('No encontrado.', 404);
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    if (!url.pathname.startsWith('/fichas-api/') && url.pathname !== '/fichas-api') return env.ASSETS.fetch(request);
    if (!env.FICHAS_CODE) return error('El acceso todavía no está configurado.', 503);
    try {
      return await rutas(request, env, url);
    } catch (e) {
      console.error('fichas-api', e);
      return error('Error interno. Inténtalo de nuevo.', 500);
    }
  },
} satisfies ExportedHandler<Env>;
