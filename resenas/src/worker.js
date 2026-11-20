// Panel de reseñas de Supermuebles Cuenca.
// Pide reseñas de Google a quienes ya recibieron su mueble: lista de clientes, mensajes
// 1 y 2, enlace de seguimiento /r/<id>, usuarios con rol y registro de actividad.
// Recuperado del Worker en producción (19 oct 2026) y ordenado en el proyecto el 20 nov 2026.
// Cambios respecto al original: el HTML se sirve desde src/panel.html (antes salía de la tabla
// `web` de D1) y el usuario ahora puede llevar @ (antes se borraba).
import PANEL_HTML from "./panel.html";

const DEF_ENLACE = "https://search.google.com/local/writereview?placeid=ChIJY80S_zYZzZERq-GOKXlWkdw";
const enc = new TextEncoder();
const hex = b => [...new Uint8Array(b)].map(x => x.toString(16).padStart(2, "0")).join("");
const ahora = () => new Date().toISOString();
const hoyEC = () => new Date().toLocaleDateString("en-CA", { timeZone: "America/Guayaquil" });
const json = (d, s = 200) => new Response(JSON.stringify(d), { status: s, headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" } });
const vacio = () => new Response(null, { status: 204 });
const limpiaId = s => String(s || "").replace(/[^\w-]/g, "");
const normTel = t => { let p = String(t || "").replace(/[^\d]/g, ""); if (p.startsWith("593")) p = "0" + p.slice(3); return p };
const normTxt = t => String(t || "").trim().toLowerCase().replace(/\s+/g, " ");
// Usuario: minúsculas, números y . _ - @ (así puede ser un correo). Lo demás se borra.
const normUsuario = t => normTxt(t).replace(/[^a-z0-9._@-]/g, "");
const BOT = /whatsapp|facebookexternalhit|facebot|bot|crawler|spider|preview|slurp|telegram/i;

function igual(a, b) { if (typeof a !== "string" || typeof b !== "string" || a.length !== b.length) return false; let r = 0; for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i); return r === 0 }
async function sha(t) { return hex(await crypto.subtle.digest("SHA-256", enc.encode(t))) }
async function pbkdf2(clave, sal) { const k = await crypto.subtle.importKey("raw", enc.encode(clave), "PBKDF2", false, ["deriveBits"]); return hex(await crypto.subtle.deriveBits({ name: "PBKDF2", hash: "SHA-256", salt: enc.encode(sal), iterations: 100000 }, k, 256)) }
function aleatorio(n) { const a = new Uint8Array(n); crypto.getRandomValues(a); return hex(a) }

async function getConfig(env) { const { results } = await env.DB.prepare("SELECT k,v FROM config").all(); const c = {}; for (const r of results) { try { c[r.k] = JSON.parse(r.v) } catch (e) { } } return c }
async function evento(env, clienteId, u, tipo, detalle) { await env.DB.prepare("INSERT INTO eventos (cliente_id,fecha,usuario_id,usuario,tipo,detalle) VALUES (?,?,?,?,?,?)").bind(clienteId || null, ahora(), u ? u.id : null, u ? u.nombre : "Cliente", tipo, detalle ? JSON.stringify(detalle) : null).run() }
const publico = u => ({ id: u.id, usuario: u.usuario, nombre: u.nombre, rol: u.rol, activo: u.activo });

async function sesion(env, req) {
  const m = (req.headers.get("Authorization") || "").match(/^Bearer ([a-f0-9]{64})$/); if (!m) return null;
  const s = await env.DB.prepare("SELECT u.* , s.expira FROM sesiones s JOIN usuarios u ON u.id=s.usuario_id WHERE s.th=?").bind(await sha(m[1])).first();
  if (!s || !s.activo || s.expira < ahora()) return null; return s;
}
async function crearSesion(env, u) {
  const t = aleatorio(32); const exp = new Date(Date.now() + 30 * 864e5).toISOString();
  await env.DB.prepare("INSERT INTO sesiones (th,usuario_id,expira) VALUES (?,?,?)").bind(await sha(t), u.id, exp).run();
  await env.DB.prepare("DELETE FROM sesiones WHERE expira<?").bind(ahora()).run(); return t;
}
function validaNuevo(b) {
  const usuario = normUsuario(b.usuario), nombre = String(b.nombre || "").trim().slice(0, 60), clave = String(b.clave || "");
  if (usuario.length < 3) return { error: "El usuario debe tener al menos 3 letras o números." };
  if (!nombre) return { error: "Falta el nombre." };
  if (clave.length < 8) return { error: "La clave debe tener al menos 8 caracteres." };
  return { usuario, nombre, clave };
}
async function insertaUsuario(env, v, rol) {
  const id = aleatorio(6), sal = aleatorio(16);
  await env.DB.prepare("INSERT INTO usuarios (id,usuario,nombre,rol,hash,sal,activo,fallos,creado) VALUES (?,?,?,?,?,?,1,0,?)").bind(id, v.usuario, v.nombre, rol, await pbkdf2(v.clave, sal), sal, ahora()).run();
  return { id, usuario: v.usuario, nombre: v.nombre, rol, activo: 1 };
}

const CAMPOS = ["nombre", "telefono", "producto", "entrega", "msg1", "msg2", "clic", "resena", "no_molestar"];
function tiposCambio(a, b) {
  const t = [];
  const f = (k, on, off) => { if (k in b && String(a[k] ?? "") !== String(b[k] ?? "")) t.push(b[k] && b[k] !== "0" ? on : off) };
  f("msg1", "mensaje1", "mensaje1_deshecho"); f("msg2", "recordatorio", "recordatorio_deshecho");
  f("resena", "resena", "resena_quitada"); f("no_molestar", "no_molestar", "no_molestar_quitado");
  if ("clic" in b && a.clic && !b.clic) t.push("enlace_reiniciado");
  const ed = ["nombre", "telefono", "producto", "entrega"].filter(k => k in b && String(a[k] ?? "") !== String(b[k] ?? ""));
  if (ed.length) t.push("editado");
  return { t, ed };
}

export default {
  async fetch(req, env) {
    const url = new URL(req.url), p = url.pathname, M = req.method;

    // Enlace que recibe el cliente: registra el clic (ignorando vistas previas) y va a Google.
    if (p.startsWith("/r/")) {
      const id = limpiaId(p.slice(3)); const cfg = await getConfig(env);
      if (id && !BOT.test(req.headers.get("User-Agent") || "")) {
        const c = await env.DB.prepare("SELECT id,clic FROM clientes WHERE id=? AND borrado=0").bind(id).first();
        if (c) { if (!c.clic) await env.DB.prepare("UPDATE clientes SET clic=? WHERE id=?").bind(hoyEC(), id).run(); await evento(env, id, null, "enlace_abierto") }
      }
      return Response.redirect(cfg.enlace || DEF_ENLACE, 302);
    }

    if (!p.startsWith("/api/")) return new Response(PANEL_HTML, { headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" } });

    const b = (M === "POST" || M === "PATCH" || M === "PUT") ? await req.json().catch(() => ({})) : {};
    const hayU = async () => !!(await env.DB.prepare("SELECT 1 FROM usuarios LIMIT 1").first());

    if (p === "/api/estado") return json({ hayUsuarios: await hayU() });

    // Primera vez: crea el administrador. Solo funciona mientras no haya usuarios.
    if (p === "/api/setup" && M === "POST") {
      if (await hayU()) return json({ error: "Ya hay usuarios creados." }, 409);
      const v = validaNuevo(b); if (v.error) return json(v, 400);
      const u = await insertaUsuario(env, v, "admin"); await evento(env, null, u, "usuario_creado", { usuario: u.usuario, rol: "admin" });
      return json({ token: await crearSesion(env, u), yo: u });
    }

    if (p === "/api/login" && M === "POST") {
      const usuario = normTxt(b.usuario), clave = String(b.clave || "");
      const u = await env.DB.prepare("SELECT * FROM usuarios WHERE usuario=?").bind(usuario).first();
      const malo = json({ error: "Usuario o clave incorrectos." }, 401);
      if (!u || !u.activo) return malo;
      if (u.bloqueado_hasta && u.bloqueado_hasta > ahora()) return json({ error: "Demasiados intentos. Espera 15 minutos." }, 429);
      if (!igual(await pbkdf2(clave, u.sal), u.hash)) {
        const f = (u.fallos || 0) + 1;
        await env.DB.prepare("UPDATE usuarios SET fallos=?, bloqueado_hasta=? WHERE id=?").bind(f >= 5 ? 0 : f, f >= 5 ? new Date(Date.now() + 15 * 6e4).toISOString() : null, u.id).run(); return malo;
      }
      await env.DB.prepare("UPDATE usuarios SET fallos=0, bloqueado_hasta=NULL WHERE id=?").bind(u.id).run();
      return json({ token: await crearSesion(env, u), yo: publico(u) });
    }

    // Todo lo de abajo exige sesión.
    const u = await sesion(env, req); if (!u) return json({ error: "sesion" }, 401);
    const admin = u.rol === "admin";

    if (p === "/api/logout" && M === "POST") { const m = (req.headers.get("Authorization") || "").slice(7); await env.DB.prepare("DELETE FROM sesiones WHERE th=?").bind(await sha(m)).run(); return vacio() }

    if (p === "/api/clave" && M === "POST") {
      if (!igual(await pbkdf2(String(b.actual || ""), u.sal), u.hash)) return json({ error: "La clave actual no es correcta." }, 400);
      if (String(b.nueva || "").length < 8) return json({ error: "La clave nueva debe tener al menos 8 caracteres." }, 400);
      const sal = aleatorio(16); await env.DB.prepare("UPDATE usuarios SET hash=?,sal=? WHERE id=?").bind(await pbkdf2(String(b.nueva), sal), sal, u.id).run();
      await evento(env, null, u, "clave_cambiada"); return vacio();
    }

    if (p === "/api/datos" && M === "GET") {
      const { results } = await env.DB.prepare("SELECT * FROM clientes WHERE borrado=0 ORDER BY entrega DESC").all();
      return json({ clientes: results, config: await getConfig(env), yo: publico(u) });
    }

    if (p === "/api/actividad" && M === "GET") {
      const { results } = await env.DB.prepare("SELECT e.*, c.nombre AS cliente FROM eventos e LEFT JOIN clientes c ON c.id=e.cliente_id ORDER BY e.id DESC LIMIT 60").all(); return json(results);
    }

    const parts = p.split("/").filter(Boolean);

    if (parts[1] === "clientes") {
      if (M === "POST" && !parts[2]) {
        const nombre = String(b.nombre || "").trim().slice(0, 120), tel = String(b.telefono || "").trim().slice(0, 30), producto = String(b.producto || "").trim().slice(0, 120);
        const entrega = /^\d{4}-\d{2}-\d{2}$/.test(b.entrega) ? b.entrega : hoyEC();
        if (!nombre || normTel(tel).length < 9) return json({ error: "Faltan el nombre o un teléfono válido." }, 400);
        if (!b.forzar) {
          const { results } = await env.DB.prepare("SELECT * FROM clientes WHERE borrado=0 AND entrega=?").bind(entrega).all();
          const d = results.find(x => normTel(x.telefono) === normTel(tel) && normTxt(x.producto) === normTxt(producto));
          if (d) return json({ duplicado: d }, 409);
        }
        const c = { id: aleatorio(6), nombre, telefono: tel, producto, entrega, msg1: null, msg2: null, clic: null, resena: 0, no_molestar: 0, creado: ahora(), borrado: 0, creado_por: u.id };
        await env.DB.prepare("INSERT INTO clientes (id,nombre,telefono,producto,entrega,msg1,msg2,clic,resena,no_molestar,creado,borrado,creado_por) VALUES (?,?,?,?,?,NULL,NULL,NULL,0,0,?,0,?)").bind(c.id, nombre, tel, producto, entrega, c.creado, u.id).run();
        await evento(env, c.id, u, "creado", { entrega, producto, duplicado_confirmado: !!b.forzar });
        return json(c, 201);
      }
      const id = limpiaId(parts[2]); if (!id) return json({ error: "id" }, 400);
      const a = await env.DB.prepare("SELECT * FROM clientes WHERE id=? AND borrado=0").bind(id).first();
      if (!a) return json({ error: "No existe ese cliente." }, 404);
      if (parts[3] === "historial" && M === "GET") { const { results } = await env.DB.prepare("SELECT * FROM eventos WHERE cliente_id=? ORDER BY id DESC").bind(id).all(); return json(results) }
      if (M === "PATCH") {
        const n = {}; for (const k of CAMPOS) if (k in b) { let v = b[k]; if (k === "resena" || k === "no_molestar") v = v ? 1 : 0; else if (k === "clic") { if (v !== null) continue } else v = v == null ? null : String(v).slice(0, 200); n[k] = v }
        const { t, ed } = tiposCambio(a, n); if (!Object.keys(n).length) return json({ error: "nada" }, 400);
        const ks = Object.keys(n); await env.DB.prepare("UPDATE clientes SET " + ks.map(k => k + "=?").join(",") + " WHERE id=?").bind(...ks.map(k => n[k]), id).run();
        for (const tipo of t) await evento(env, id, u, tipo, tipo === "editado" ? Object.fromEntries(ed.map(k => [k, { antes: a[k], despues: n[k] }])) : null);
        return vacio();
      }
      if (M === "DELETE") { await env.DB.prepare("UPDATE clientes SET borrado=1 WHERE id=?").bind(id).run(); await evento(env, id, u, "borrado", { nombre: a.nombre }); return vacio() }
    }

    if (p === "/api/config" && M === "PUT") {
      if (!admin) return json({ error: "Solo un administrador cambia los ajustes." }, 403);
      const st = [], cambios = []; for (const k of ["enlace", "d1", "d2", "m1", "m2", "recordarSiAbrio"]) if (k in b) { st.push(env.DB.prepare("INSERT INTO config (k,v) VALUES (?,?) ON CONFLICT(k) DO UPDATE SET v=excluded.v").bind(k, JSON.stringify(b[k]))); cambios.push(k) }
      if (st.length) await env.DB.batch(st); await evento(env, null, u, "ajustes", { campos: cambios }); return vacio();
    }

    if (parts[1] === "usuarios") {
      if (!admin) return json({ error: "Solo un administrador maneja usuarios." }, 403);
      if (M === "GET") { const { results } = await env.DB.prepare("SELECT id,usuario,nombre,rol,activo,creado FROM usuarios ORDER BY creado").all(); return json(results) }
      if (M === "POST" && !parts[2]) {
        const v = validaNuevo(b); if (v.error) return json(v, 400);
        if (await env.DB.prepare("SELECT 1 FROM usuarios WHERE usuario=?").bind(v.usuario).first()) return json({ error: "Ese usuario ya existe." }, 409);
        const n = await insertaUsuario(env, v, b.rol === "admin" ? "admin" : "vendedor"); await evento(env, null, u, "usuario_creado", { usuario: n.usuario, rol: n.rol }); return json(n, 201);
      }
      const id = limpiaId(parts[2]); const x = await env.DB.prepare("SELECT * FROM usuarios WHERE id=?").bind(id).first(); if (!x) return json({ error: "No existe." }, 404);
      if (M === "PATCH") {
        if (id === u.id && ("activo" in b || "rol" in b)) return json({ error: "No puedes quitarte a ti mismo el acceso o el rol." }, 400);
        if ("activo" in b) { await env.DB.prepare("UPDATE usuarios SET activo=? WHERE id=?").bind(b.activo ? 1 : 0, id).run(); if (!b.activo) await env.DB.prepare("DELETE FROM sesiones WHERE usuario_id=?").bind(id).run(); await evento(env, null, u, b.activo ? "usuario_activado" : "usuario_desactivado", { usuario: x.usuario }) }
        if ("rol" in b) { await env.DB.prepare("UPDATE usuarios SET rol=? WHERE id=?").bind(b.rol === "admin" ? "admin" : "vendedor", id).run(); await evento(env, null, u, "rol_cambiado", { usuario: x.usuario, rol: b.rol }) }
        if ("clave" in b) {
          if (String(b.clave).length < 8) return json({ error: "La clave debe tener al menos 8 caracteres." }, 400);
          const sal = aleatorio(16); await env.DB.prepare("UPDATE usuarios SET hash=?,sal=?,fallos=0,bloqueado_hasta=NULL WHERE id=?").bind(await pbkdf2(String(b.clave), sal), sal, id).run();
          await env.DB.prepare("DELETE FROM sesiones WHERE usuario_id=?").bind(id).run(); await evento(env, null, u, "clave_reiniciada", { usuario: x.usuario })
        }
        return vacio();
      }
    }

    return json({ error: "No existe." }, 404);
  }
};
