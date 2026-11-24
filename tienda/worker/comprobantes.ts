// Comprobantes de pago (fase 3): el cliente sube su comprobante desde el enlace de seguimiento,
// el panel lo ve y lo verifica o rechaza, y una tarea diaria borra los que ya no hacen falta.
// Los archivos viven en el bucket privado COMPROBANTES: no tienen URL pública, solo el panel los entrega.
import type { Env } from './index';

export const MAX_BYTES = 5_000_000;
// Días que se guarda un comprobante después de entregado o cancelado el pedido (TIENDA-DISENO.md §9, a confirmar con el dueño).
export const DIAS_CONSERVACION = 90;

const H = { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' };
const json = (d: unknown, status = 200) => new Response(JSON.stringify(d), { status, headers: H });
const error = (msg: string, status: number) => json({ error: msg }, status);
const ahora = () => new Date().toISOString();

// El tipo se decide por los primeros bytes del archivo, no por lo que diga el navegador.
function tipoReal(b: Uint8Array): { mime: string; ext: string } | null {
  if (b.length > 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return { mime: 'image/jpeg', ext: 'jpg' };
  if (b.length > 8 && b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) return { mime: 'image/png', ext: 'png' };
  if (b.length > 12 && b[0] === 0x52 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x46 && b[8] === 0x57 && b[9] === 0x45 && b[10] === 0x42 && b[11] === 0x50) return { mime: 'image/webp', ext: 'webp' };
  if (b.length > 5 && b[0] === 0x25 && b[1] === 0x50 && b[2] === 0x44 && b[3] === 0x46 && b[4] === 0x2d) return { mime: 'application/pdf', ext: 'pdf' };
  return null;
}

/* ---------- cliente: POST /api/pedidos/:token/comprobante ---------- */

export async function subirComprobante(request: Request, env: Env, db: D1Database, token: string): Promise<Response> {
  if (request.headers.get('X-Requested-With') !== 'tienda') return error('Solicitud no permitida.', 403);
  if (!env.COMPROBANTES) return error('Todavía no se pueden subir comprobantes. Envíalo por WhatsApp.', 503);
  const largo = Number(request.headers.get('Content-Length') || 0);
  if (largo > MAX_BYTES) return error('El archivo pesa más de 5 MB. Envía una foto más liviana o un PDF.', 413);

  const ip = request.headers.get('CF-Connecting-IP') || 'sin-ip';
  if (env.LIMITE_COMPROBANTES) {
    const { success } = await env.LIMITE_COMPROBANTES.limit({ key: ip });
    if (!success) return error('Demasiados intentos seguidos. Espera un minuto y vuelve a subirlo.', 429);
  }

  const o = await db.prepare('SELECT id, status, total_cents, deposit_cents FROM orders WHERE tracking_token = ?').bind(token).first<any>();
  if (!o) return error('No encontramos ese pedido. Revisa el enlace.', 404);
  if (o.status !== 'por_pagar') {
    return error(o.status === 'comprobante_recibido' ? 'Ya recibimos tu comprobante y lo estamos revisando.' : 'Este pedido no está esperando un pago.', 409);
  }

  const datos = new Uint8Array(await request.arrayBuffer());
  if (datos.length === 0) return error('Elige el archivo del comprobante.', 400);
  if (datos.length > MAX_BYTES) return error('El archivo pesa más de 5 MB. Envía una foto más liviana o un PDF.', 413);
  const tipo = tipoReal(datos);
  if (!tipo) return error('Sube una foto (JPG, PNG o WEBP) o un PDF.', 415);

  const pago = crypto.randomUUID();
  const clave = `comprobantes/${o.id}/${pago}.${tipo.ext}`;
  await env.COMPROBANTES.put(clave, datos, { httpMetadata: { contentType: tipo.mime }, customMetadata: { pedido: o.id } });

  const monto = o.deposit_cents ?? o.total_cents;
  const t = ahora();
  try {
    const r = await db.batch([
      db.prepare("UPDATE orders SET status = 'comprobante_recibido', payment_status = 'en_revision', updated_at = ? WHERE id = ? AND status = 'por_pagar'").bind(t, o.id),
      db.prepare("INSERT INTO payments (id, order_id, method, amount_cents, status, proof_key) SELECT ?, ?, 'transferencia', ?, 'en_revision', ? WHERE changes() = 1")
        .bind(pago, o.id, monto, clave),
      db.prepare("INSERT INTO order_events (id, order_id, at, actor, type, detail_json) SELECT ?, ?, ?, 'cliente', 'comprobante', ? WHERE (SELECT COUNT(*) FROM payments WHERE id = ?) = 1")
        .bind(crypto.randomUUID(), o.id, t, JSON.stringify({ pago, tipo: tipo.mime, bytes: datos.length }), pago),
    ]);
    if (!r[0].meta.changes) {
      await env.COMPROBANTES.delete(clave); // otro envío ganó la carrera
      return error('Ya recibimos tu comprobante y lo estamos revisando.', 409);
    }
  } catch (e) {
    await env.COMPROBANTES.delete(clave);
    throw e;
  }
  return json({ ok: true, estado: 'comprobante_recibido' }, 201);
}

/* ---------- panel: ver el archivo ---------- */

export async function verComprobante(env: Env, db: D1Database, pedido: string, pago: string): Promise<Response> {
  const p = await db.prepare('SELECT proof_key FROM payments WHERE id = ? AND order_id = ?').bind(pago, pedido).first<{ proof_key: string | null }>();
  if (!p || !p.proof_key) return error('Ese comprobante ya no existe.', 404);
  const o = env.COMPROBANTES ? await env.COMPROBANTES.get(p.proof_key) : null;
  if (!o) return error('Ese comprobante ya no existe.', 404);
  return new Response(o.body, {
    headers: {
      'Content-Type': o.httpMetadata?.contentType || 'application/octet-stream',
      'Content-Disposition': 'inline',
      'Cache-Control': 'private, no-store',
      'X-Content-Type-Options': 'nosniff',
      // Si alguien sube un PDF con trampas, se abre aislado del panel.
      'Content-Security-Policy': "sandbox; default-src 'none'; img-src 'self'; style-src 'unsafe-inline'",
      'Referrer-Policy': 'no-referrer',
    },
  });
}

/* ---------- limpieza diaria (Cron Trigger) ---------- */

export async function limpiar(env: Env): Promise<{ comprobantes: number }> {
  const db = env.DB;
  if (!db) return { comprobantes: 0 };
  const limite = new Date(Date.now() - DIAS_CONSERVACION * 86400_000).toISOString();
  const { results } = await db
    .prepare(`SELECT p.id, p.proof_key FROM payments p JOIN orders o ON o.id = p.order_id
              WHERE p.proof_key IS NOT NULL AND o.status IN ('entregado', 'cancelado') AND o.updated_at < ? LIMIT 500`)
    .bind(limite)
    .all<{ id: string; proof_key: string }>();
  if (results.length && env.COMPROBANTES) {
    await env.COMPROBANTES.delete(results.map(r => r.proof_key));
    await db.batch(results.map(r => db.prepare('UPDATE payments SET proof_key = NULL WHERE id = ?').bind(r.id)));
  }
  await db.prepare('DELETE FROM admin_intentos WHERE at < ?').bind(Math.floor(Date.now() / 1000) - 86400).run();
  console.log('limpieza', JSON.stringify({ comprobantes: results.length }));
  return { comprobantes: results.length };
}
