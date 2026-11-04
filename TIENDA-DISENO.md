# Tienda online de Supermuebles Cuenca: diseño

Documento para aprobar antes de construir. Lo que decidió el usuario está marcado **(decidido)**. Lo demás son decisiones mías **(mi decisión)** que se pueden cambiar. Lo que solo el dueño puede responder está en la sección 11.

## 1. Para qué sirve

Hoy el sitio muestra el catálogo y todo termina en WhatsApp. La tienda permite que una persona de cualquier ciudad del Ecuador arme un pedido, lo envíe, pague por transferencia y siga su estado, sin que una asesora tenga que anotar todo a mano. La asesora sigue en el centro: confirma envío y total, verifica el pago y avisa cuando el mueble sale de fábrica.

## 2. Qué decidió el usuario

- Todo corre en Cloudflare, sin Vercel ni Supabase **(decidido)**.
- La pasarela de pago se agrega después de crear la tienda **(decidido)**.
- Precios, medidas, política de abono y costo de envío se definen después **(decidido)**.
- El dominio se define después **(decidido)**.
- NIXGOFOOD es punto de partida: se reutiliza lógica, no se porta la aplicación.

## 3. Metas, no metas, anti-metas

**Metas**
- Pedido de punta a punta sin intervención manual hasta la verificación del pago.
- Funcionar desde el día uno sin precios publicados, y activarse modelo por modelo cuando el dueño ponga precio.
- Que el equipo cambie precios, estados y envíos desde un panel, sin tocar código ni reconstruir el sitio.
- Cero costo fijo apreciable: Workers, D1 y R2 en su capa gratuita mientras el volumen sea bajo (revisar los límites del plan antes del lanzamiento).

**No metas (por ahora)**
- Cuentas de cliente, puntos de lealtad, multi-negocio, cocina/KDS, mapas de reparto, bot de WhatsApp, Next.js.
- Pasarela de pago, facturación electrónica del SRI, correo transaccional. Se dejan los campos y los puntos de enlace listos.
- Control de inventario. Es fabricación bajo pedido.

**Anti-metas (si pasa esto, falló aunque funcione)**
- Mostrar un precio, abono, plazo o costo de envío que el dueño no confirmó.
- Guardar comprobantes de pago o datos personales sin fecha de borrado.
- Que el sitio actual (catálogo, SEO, velocidad, lint e inspector en 0 FAIL) empeore.

## 4. Cómo se ve para el cliente

1. **Catálogo** (las páginas actuales). Cada modelo con precio muestra "Agregar al pedido". Sin precio sigue mostrando "Cotizar por WhatsApp".
2. **Carrito** en un panel lateral y en `/pedido`: líneas, cantidades, observación por línea (tela, color, medida). Se guarda en el navegador.
3. **Datos de entrega**: nombre, WhatsApp, correo (opcional), ciudad, dirección, referencia, cédula o RUC (opcional, para factura). Protegido con Cloudflare Turnstile.
4. **Pedido enviado**: pantalla con un número de pedido y un enlace privado `/pedido/<código>`. Se le ofrece abrir WhatsApp con el resumen ya escrito.
5. **Seguimiento** en `/pedido/<código>`: estado, total, datos de transferencia cuando corresponden, y botón para subir el comprobante.

Regla clave **(mi decisión)**: primero pedido, después pago. Como el costo de envío y el abono aún no están definidos, el pedido nace sin envío fijado. La asesora lo confirma desde el panel, el cliente ve el total final en su enlace y recién entonces transfiere. Así no hay que inventar nada y la política puede cambiar sin tocar el flujo.

Diseño visual: las reglas de la casa. Archivo como única tipografía, esquinas cuadradas, sin etiquetas ni contadores decorativos, botones que nombran la acción ("Agregar al pedido", "Enviar pedido", "Subir comprobante"), tuteo.

## 5. Arquitectura en Cloudflare

Un solo Worker, `supermuebles-cuenca`, que ya existe:

- **Archivos estáticos**: lo de hoy (`deploy/`), servido tal cual.
- **API**: el Worker atiende `/api/*` primero (`run_worker_first`); todo lo demás va a los archivos estáticos.
- **D1** `supermuebles-tienda`: productos, opciones, pedidos, pagos, usuarios del panel, ajustes.
- **R2** `supermuebles-comprobantes`, privado: comprobantes de transferencia. Solo el panel los ve, a través del Worker.
- **Cron Trigger** diario: borra comprobantes vencidos y sesiones caducadas.
- **Turnstile** en el envío del pedido y **Rate Limiting** de Workers por IP.
- **Panel `/admin`** protegido con Cloudflare Access (código por correo, sin contraseñas que guardar) **(mi decisión)**. La alternativa es el login propio con PBKDF2 que ya tienes en `supermuebles-resenas`; sirve si se quiere dar acceso a alguien sin correo.

El catálogo sigue siendo HTML estático generado por Python, así que el SEO y la velocidad no cambian. Los precios se cargan desde `/api/productos` al abrir la página, y el dueño los cambia en el panel sin reconstruir **(mi decisión)**. Costo: Google no ve el precio en el HTML. Más adelante se puede añadir un paso de build que lo inserte para los resultados enriquecidos.

Estructura de código nueva, dentro del proyecto:

```
tienda/
  worker/        # API en TypeScript (index, rutas, validación, auth, cron)
  migrations/    # SQL de D1 numerado
  admin/         # panel (HTML + JS sin framework)
  test/          # pruebas con Miniflare
site-src/        # el generador actual agrega los botones y el carrito
wrangler.jsonc   # pasa a incluir main, D1, R2, cron y Turnstile
```

## 6. Datos (D1)

Dinero en centavos de USD, enteros. Fechas en UTC, ISO. Identificadores aleatorios.

```sql
products(id, slug, name, category, description, image, price_cents NULL, active, sort)
option_groups(id, product_id, name, required)               -- p. ej. tela, color, medida
options(id, group_id, label, price_delta_cents DEFAULT 0, active)

orders(id, public_code UNIQUE, tracking_token UNIQUE,
       status, payment_status,
       customer_name, phone, email, id_number, city, address, reference,
       subtotal_cents, shipping_cents NULL, discount_cents DEFAULT 0, total_cents NULL,
       deposit_cents NULL, notes, created_at, updated_at, idempotency_key UNIQUE)
order_items(id, order_id, product_id, name_snapshot, unit_cents_snapshot,
            qty, options_json, note)
order_events(id, order_id, at, actor, type, detail_json)      -- historial completo
payments(id, order_id, method, amount_cents, status, proof_key NULL,
         provider NULL, provider_ref NULL, verified_by NULL, verified_at NULL)
settings(key PRIMARY KEY, value_json)                         -- banco, abono %, IVA, textos
admin_users(id, email UNIQUE, name, role, active)
```

Notas:
- `price_cents` nulo significa "solo cotización". Es lo que mantiene el sitio honesto mientras no haya precios.
- Cada línea del pedido guarda una copia del nombre y precio al comprar. Cambiar un precio después no altera pedidos viejos.
- `shipping_cents`, `deposit_cents` y `total_cents` son nulos hasta que la asesora los confirma.
- `payments` ya trae `provider` y `provider_ref` para la pasarela futura.
- Los datos de la cuenta bancaria y el IVA van en `settings`, no en el código. Es el pendiente que NIXGOFOOD dejó escrito a mano.

## 7. Estados del pedido

```
nuevo → por_pagar → comprobante_recibido → confirmado
      → en_fabricacion → listo → enviado → entregado
cualquier estado previo a "enviado" → cancelado
```

- `nuevo → por_pagar`: la asesora fija envío, total y abono.
- `por_pagar → comprobante_recibido`: el cliente sube el comprobante.
- `comprobante_recibido → confirmado`: la asesora verifica el pago en su banco. Puede rechazarlo; vuelve a `por_pagar` con un motivo.
- El resto lo mueve el personal. Cada cambio se registra en `order_events` con quién y cuándo.

Se reutiliza de NIXGOFOOD la idea de tabla de transiciones permitidas (`orderTransitions.ts`), reescrita para estos estados y sin la cocina.

## 8. API

Público:
- `GET /api/productos`
- `POST /api/pedidos` (valida todo en el servidor, recalcula precios desde D1, ignora los precios que mande el navegador, exige clave de idempotencia y Turnstile)
- `GET /api/pedidos/:token`
- `POST /api/pedidos/:token/comprobante` (imagen o PDF, tamaño y tipo limitados, guarda en R2)

Panel (con Access):
- Pedidos: listar, ver, cambiar estado, fijar envío/total/abono, ver comprobante, verificar o rechazar pago, nota interna.
- Productos: crear, editar, poner precio, activar o desactivar, opciones.
- Ajustes: datos bancarios, abono, IVA, textos del pedido.

Interno:
- `scheduled()`: limpieza diaria.
- Ruta reservada `/api/pagos/webhook` para la pasarela futura (aún sin implementar).

## 9. Seguridad y datos personales

- El enlace de seguimiento tiene 128 bits aleatorios, nunca el número de pedido. Quien lo tiene ve ese pedido y nada más.
- Los comprobantes están en un bucket privado y solo se entregan al panel. No tienen URL pública.
- El servidor recalcula totales; nada que venga del navegador se cree.
- Turnstile y límite por IP en el envío del pedido; límite también en la carga de comprobantes.
- Consultas con parámetros enlazados en todas partes. Las cabeceras de seguridad ya están puestas.
- La página de privacidad debe actualizarse con qué datos se guardan, para qué, por cuánto tiempo y cómo se borran. Debe revisarla alguien con criterio legal antes de lanzar. Se guardan nombre, teléfono, dirección y comprobantes.
- Plazo de conservación de comprobantes: propongo borrarlos 90 días después de entregado o cancelado el pedido **(mi decisión, a confirmar con el dueño)**.

## 10. Qué se reutiliza de NIXGOFOOD

Se reutiliza como lógica y pruebas, reescrito en un Worker:
- Unir líneas iguales del carrito (`cart.ts` y su prueba).
- Esquema de pedidos, líneas y token de seguimiento.
- Flujo de comprobante: subir, verificar, rechazar con motivo.
- Tabla de transiciones de estado y la forma de las pruebas.
- Endurecimiento: idempotencia, validación en servidor, límites de tamaño.

Se descarta: cocina/KDS, motorizados y distancias, multi-negocio por subdominio, lealtad, el agente de Telegram, Next.js y todo lo atado a Supabase y a Vercel.

## 11. Pendientes que solo el dueño responde

Ninguno bloquea construir. Sí bloquean abrir la tienda al público.

1. Datos de la cuenta para transferencias: banco, tipo, número, titular y cédula o RUC.
2. Quién atenderá el panel y con qué correos entra.
3. Si los precios incluyen IVA y a qué tarifa.
4. Plazo de conservación de comprobantes y datos del cliente.
5. Revisar si el contrato vigente de la propuesta cubre la tienda o la deja como ampliación.
6. Los de siempre: precios y medidas por modelo, abono, costo de envío, plazos de fabricación, garantía, tarjetas.

## 12. Fases

| Fase | Entrega | Visible al público |
|---|---|---|
| 0 | Worker con D1 y R2 en `workers.dev`, migraciones, carga del catálogo actual sin precios, pruebas | No |
| 1 | Carrito, envío del pedido y seguimiento | No (interruptor `tienda_activa` apagado) |
| 2 | Panel: pedidos, estados, envío y total | No |
| 3 | Comprobantes: subida, verificación, limpieza programada | No |
| 4 | Precios reales y apertura modelo por modelo | Sí, con lo confirmado por el dueño |
| 5 | Pasarela de pago | Cuando se elija |
| 6 | Facturación electrónica y correos | Cuando se pida |

Las fases 0 a 3 se pueden construir ya, porque no dependen de ninguno de los pendientes.

### Fase 0, primera parte: captura de fichas (4 nov 2026)

El dueño llena las fichas de producto en `/fichas/` (misma página del sitio, sin enlaces desde ninguna parte, `noindex`). Los datos se guardan en Cloudflare para convertirlos después en `products`, `option_groups` y `options`.

- Página: `deploy/fichas/index.html`. Acceso con un código compartido; el Worker lo comprueba y entrega una cookie firmada (30 días, `HttpOnly`, `Secure`, `SameSite=Strict`). El código es el secreto `FICHAS_CODE`; cambiarlo cierra todas las sesiones.
- API: `tienda/worker/index.ts`, solo bajo `/fichas-api/*` (`run_worker_first`). **Sin base de datos**: la cuenta de Cloudflare llegó al máximo de 10 bases D1 del plan gratuito, así que todo vive en el bucket R2 `supermuebles-fichas-fotos` (privado): `datos/fichas.json` (todas las fichas en un documento), `fotos/<id>.jpg` (con el metadato `ficha`) y `datos/intentos.json`. Los cambios al documento usan escritura condicional por etag con reintentos, así dos guardados a la vez no se pierden. Cada ficha lleva `rev`: si dos personas editan la misma, la segunda recibe 409 y elige qué conservar. Borrar una ficha es lógico (`deletedAt`). Máximo 20 códigos fallidos cada 10 minutos entre todos.
- Cuando se construyan pedidos y pagos (fases 1 a 3) sí hará falta D1: habrá que liberar una base o pasar al plan Workers de pago. Las fichas se migrarán entonces a `products`.
- Con el dominio de Vercel: `deploy/vercel.json` reenvía `/fichas-api/*` al Worker, así el navegador siempre habla con el mismo dominio.
- Pruebas: `tienda/test/smoke.test.mjs` (11 pruebas contra un Worker en marcha con `npm run dev`).
- Los 19 modelos del catálogo se cargan solos la primera vez que se abre (`tienda/worker/seed.ts`).

## 13. Cómo se prueba

- Pruebas automáticas del Worker con Miniflare (D1 y R2 simulados): cálculo de totales, idempotencia, transiciones válidas e inválidas, límites de comprobante.
- Cada fase se publica en `workers.dev`. El filtro web de la oficina lo bloquea desde esta red, así que se verifica desde el celular o con otra conexión.
- El sitio sigue pasando `lint.mjs` e `inspect.mjs` con 0 FAIL, incluidas las páginas nuevas.
- Nada se publica sin tu OK.
