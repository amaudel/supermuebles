# Rama `tienda`: carrito, pedidos y panel

Esta rama sirve para construir las fases 1 a 3 de `TIENDA-DISENO.md` sin tocar el sitio que hoy funciona. El sitio en vivo se sigue publicando solo desde `main`.

## Dónde está cada cosa

| | Sitio en vivo | Tienda en construcción |
|---|---|---|
| Rama | `main` | `tienda` |
| Carpeta en la PC | `stitch_landing_page_supermuebles_cuenca/` | `supermuebles-tienda/` (al lado, es un worktree de git) |
| Configuración de Cloudflare | `wrangler.jsonc` | `wrangler.tienda.jsonc` |
| Worker | `supermuebles-cuenca` | `supermuebles-tienda-pruebas` |
| Fichas (R2) | `supermuebles-fichas-fotos` (datos reales del dueño) | `supermuebles-pruebas-fichas` (copia de pruebas) |
| Comprobantes (R2) | no existe | `supermuebles-pruebas-comprobantes` |
| Base de datos (D1) | no existe | `supermuebles-tienda-pruebas` |
| Vercel | `vercel deploy --prod` desde `deploy/` | nunca se publica desde esta rama |

Los arreglos del sitio (textos, fotos, videos) se siguen haciendo en la carpeta de `main`. Para traerlos a la rama: `git merge main` desde `supermuebles-tienda/`.

## Reglas para no romper el sitio en vivo

1. Desde esta carpeta no se usa `wrangler.jsonc` ni `vercel deploy`. Los comandos van por los scripts de `tienda/package.json`, que ya apuntan a `wrangler.tienda.jsonc`.
2. La tienda nace apagada: `settings.tienda_activa = false`. Mientras esté así, el catálogo no muestra «Agregar al pedido».
3. Nada pasa a `main` sin el OK del usuario. Antes de unir, `wrangler.tienda.jsonc` se compara con `wrangler.jsonc` y se decide qué recursos reales se crean.
4. No se muestra ningún precio, abono, plazo ni costo de envío que el dueño no haya confirmado (sección 11 del diseño).

## Cómo se trabaja en local

Desde `supermuebles-tienda/tienda/`:

```
npm ci                 # una vez
npm run db:migrar      # crea las tablas en la base local
npm run dev            # sitio + API en http://127.0.0.1:8787
npm test               # en otra terminal, con el dev encendido
```

En local no hace falta crear nada en Cloudflare: D1 y R2 se simulan. El código de prueba de las fichas está en `.dev.vars` (ignorado por git).

## Para publicar las pruebas en Cloudflare (`npm run publicar:pruebas`)

Falta antes:
- **Una base D1.** La cuenta tiene ocupadas las 10 del plan gratuito. Hay que liberar una o pasar al plan Workers de pago. Después: `npx wrangler d1 create supermuebles-tienda-pruebas` y poner el id en `wrangler.tienda.jsonc`.
- Crear los dos buckets de prueba: `npx wrangler r2 bucket create supermuebles-pruebas-fichas` y `... supermuebles-pruebas-comprobantes`.
- El secreto `FICHAS_CODE` del Worker de pruebas (puede ser distinto del real).
- Las llaves de Turnstile (fase 1) y Cloudflare Access para `/admin` (fase 2).

## Fases pendientes

- [ ] **Fase 1. Carrito, envío del pedido y seguimiento.** `GET /api/productos`, `POST /api/pedidos` (Turnstile, idempotencia, precios recalculados en el servidor), `GET /api/pedidos/:token`, carrito en panel lateral y `/pedido`, página `/pedido/<código>`.
- [ ] **Fase 2. Panel `/admin`.** Pedidos (listar, ver, cambiar estado, fijar envío, total y abono, nota interna), productos (precio, activar, opciones) y ajustes (banco, abono, IVA). Pasar las fichas de R2 a `products`.
- [ ] **Fase 3. Comprobantes.** Subida a R2 privado, verificar o rechazar con motivo, limpieza diaria con Cron.
- [ ] Pruebas con Miniflare de totales, idempotencia, transiciones de estado y límites de comprobante.
- [ ] Actualizar la página de privacidad antes de abrir la tienda.

Lo que ya está en la rama: `wrangler.tienda.jsonc`, el esquema inicial `tienda/migrations/0001_tienda.sql` (tablas de la sección 6 del diseño, tienda apagada) y las vinculaciones `DB` y `COMPROBANTES` en el Worker (opcionales, el sitio en vivo no las tiene).
