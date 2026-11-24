# Panel de reseñas

Herramienta interna para pedir reseñas de Google a quienes ya recibieron su mueble. Lista de clientes, mensaje 1 y recordatorio (se mandan a mano por WhatsApp), enlace de seguimiento `/r/<id>`, usuarios con rol (administrador o vendedor) y registro de quién hizo cada cosa.

En producción: https://supermuebles-resenas.andresdelgado1984.workers.dev/

## Cómo está organizado

| Archivo | Qué es |
|---|---|
| `src/worker.js` | Worker: API, login, sesiones y enlace `/r/<id>`. |
| `src/panel.html` | El panel completo (HTML, CSS y JS en un archivo). |
| `migrations/0001_resenas.sql` | Esquema de la base D1 (`supermuebles-resenas`). |
| `test/resenas.test.mjs` | Pruebas contra un Worker local. |
| `wrangler.jsonc` | Configuración de Cloudflare: **la base D1 real de producción**. |

## Trabajar en local

Desde esta carpeta:

```
npm ci
npm run db:migrar     # crea la base local simulada
npm run dev           # http://127.0.0.1:8788
npm test              # en otra terminal; necesita la base local vacía
```

Para repetir las pruebas hay que borrar `.wrangler/state` y volver a migrar: el primer usuario solo se puede crear una vez.

## Usuarios

- El usuario va en minúsculas y puede llevar letras, números y `. _ - @`, así que puede ser un correo.
- El primer administrador se crea desde la pantalla de entrada («Primera vez») mientras no haya usuarios. Después, el administrador crea a los demás en «Usuarios».
- Las claves se guardan con PBKDF2 (100 000 iteraciones). No se pueden recuperar: un administrador puede reiniciar la de otra persona, y cada uno cambia la suya en el panel.
- 5 intentos fallidos bloquean al usuario 15 minutos.

## Publicar (hay que hacerlo con cuidado)

`npm run publicar` **reemplaza el Worker en producción**. Antes de publicar:

1. Este Worker sirve el panel desde `src/panel.html`. El de producción lo lee de la tabla `web` de D1. El resultado visible es el mismo, pero conviene probarlo en local primero.
2. Usa la misma base D1 de producción, con los clientes reales. No borrar ni recrear tablas.
3. Los usuarios ya creados antes de este cambio quedaron sin `@` (por ejemplo `andresdelgado1984gmail.com`). Siguen entrando con ese nombre. Para cambiarlo basta actualizar el campo `usuario` de esa fila.
4. El Worker nunca lee las tablas `web` ni `secreto`; se pueden dejar o borrar después de confirmar que todo funciona.

Nada se publica sin el OK del dueño.
