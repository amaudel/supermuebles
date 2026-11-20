// Aviso al panel de reseñas (resenas/): cuando un pedido pasa a «entregado», el cliente entra solo
// a la lista de ese panel y empieza el flujo de reseña de Google.
//
// Cómo llega el aviso:
//  - En la nube, por el vínculo de servicio RESENAS (Worker `supermuebles-resenas`), que no pasa por internet.
//  - En local, por RESENAS_URL (por ejemplo http://127.0.0.1:8788), si se define en .dev.vars.
// La clave compartida es el secreto RESENAS_CLAVE aquí y INTEGRACION_CLAVE allá (mismo valor).
// Si falta la clave o el destino, no se hace nada. Si falla, el pedido igual queda entregado y el
// fallo se anota en el historial del pedido para que se pueda agregar al cliente a mano.
import type { Env } from './index';

const ahora = () => new Date().toISOString();
const hoyEC = () => new Date().toLocaleDateString('en-CA', { timeZone: 'America/Guayaquil' });

type Pedido = { public_code: string; customer_name: string; phone: string };
type Linea = { name_snapshot: string; qty: number };

// «2 × Sala, Mesa de centro»: lo que se entregó, en una línea.
export function resumenDeProductos(lineas: Linea[]): string {
  return lineas.map(l => (l.qty > 1 ? `${l.qty} × ${l.name_snapshot}` : l.name_snapshot)).join(', ').slice(0, 120);
}

async function enviar(env: Env, cuerpo: unknown): Promise<Response> {
  const init = {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Integracion-Clave': env.RESENAS_CLAVE! },
    body: JSON.stringify(cuerpo),
    signal: AbortSignal.timeout(8000),
  };
  if (env.RESENAS_URL) return fetch(env.RESENAS_URL.replace(/\/+$/, '') + '/api/integracion/entrega', init);
  return env.RESENAS!.fetch('https://resenas.interno/api/integracion/entrega', init);
}

export async function avisarResenas(env: Env, db: D1Database, pedidoId: string): Promise<void> {
  if (!env.RESENAS_CLAVE || !(env.RESENAS_URL || env.RESENAS)) return;
  let detalle: Record<string, unknown>;
  try {
    const o = await db.prepare('SELECT public_code, customer_name, phone FROM orders WHERE id = ?').bind(pedidoId).first<Pedido>();
    if (!o) return;
    const { results } = await db.prepare('SELECT name_snapshot, qty FROM order_items WHERE order_id = ? ORDER BY rowid').bind(pedidoId).all<Linea>();
    const cuerpo = { pedido: o.public_code, nombre: o.customer_name, telefono: o.phone, producto: resumenDeProductos(results), entrega: hoyEC() };
    let r: Response | null = null;
    for (let intento = 0; intento < 2 && !(r && r.ok); intento++) {
      try { r = await enviar(env, cuerpo); } catch (e) { r = null; }
    }
    if (r && r.ok) {
      const d: any = await r.json().catch(() => ({}));
      detalle = { ok: true, yaExistia: !!d.yaExistia };
    } else {
      const d: any = r ? await r.json().catch(() => ({})) : {};
      detalle = { ok: false, error: (d && d.error) || (r ? `El panel de reseñas respondió ${r.status}.` : 'El panel de reseñas no respondió.') };
    }
  } catch (e) {
    console.error('resenas', e);
    detalle = { ok: false, error: 'No se pudo avisar al panel de reseñas.' };
  }
  await db.prepare('INSERT INTO order_events (id, order_id, at, actor, type, detail_json) VALUES (?, ?, ?, ?, ?, ?)')
    .bind(crypto.randomUUID(), pedidoId, ahora(), 'sistema', 'resenas', JSON.stringify(detalle)).run();
}
