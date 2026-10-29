# Súper Muebles Cuenca

Sitio web de Supermuebles Cuenca, fábrica de muebles en Turi, Cuenca. Es un sitio estático: HTML, CSS y JavaScript sin dependencias.

## Cómo está organizado

| Carpeta o archivo | Qué es |
|---|---|
| `deploy/` | El sitio ya construido. Es lo que se publica. |
| `site-src/` | Fuente de las páginas. `build.py` las genera en `deploy/`. |
| `site-src/config.py` | Datos que se repiten: ubicación, horarios, teléfonos y WhatsApp. |
| `GUIA-DE-VOZ-SUPERMUEBLES.md` | Cómo escribe la marca, lema, paleta y datos verificados. |
| `TIENDA-DISENO.md` | Diseño de la tienda online (aún sin construir). |
| `wrangler.jsonc` | Configuración para publicar en Cloudflare. |

## Construir el sitio

Se necesita Python 3. Desde `site-src/`:

```bash
python make_catalog.py
python build.py
```

Los estilos (`deploy/styles.css`) y el JavaScript (`deploy/main.js`) se editan directamente en `deploy/`.

## Publicar

- **Vercel** (sitio actual): desde `deploy/`, `vercel deploy --prod --yes`.
- **Cloudflare**: desde la raíz, `npx wrangler@latest deploy`.

## Pendientes del dueño

Hay datos que no se afirman en el sitio hasta que el dueño los confirme (garantía, plazos, envío, tarjetas, fotos reales). La lista está en `GUIA-DE-VOZ-SUPERMUEBLES.md`, sección 9.
