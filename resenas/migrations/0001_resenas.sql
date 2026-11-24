-- Esquema del panel de reseñas, tomado de la base de producción `supermuebles-resenas` (19 oct 2026).
-- No incluye las tablas `web` (el HTML ahora vive en src/panel.html) ni `secreto` (sin uso en el código).
CREATE TABLE IF NOT EXISTS clientes (id TEXT PRIMARY KEY, nombre TEXT NOT NULL, telefono TEXT NOT NULL, producto TEXT, entrega TEXT NOT NULL, msg1 TEXT, msg2 TEXT, clic TEXT, resena INTEGER DEFAULT 0, no_molestar INTEGER DEFAULT 0, creado TEXT, borrado INTEGER DEFAULT 0, creado_por TEXT);
CREATE TABLE IF NOT EXISTS config (k TEXT PRIMARY KEY, v TEXT);
CREATE TABLE IF NOT EXISTS usuarios (id TEXT PRIMARY KEY, usuario TEXT UNIQUE NOT NULL, nombre TEXT, rol TEXT, hash TEXT, sal TEXT, activo INTEGER DEFAULT 1, fallos INTEGER DEFAULT 0, bloqueado_hasta TEXT, creado TEXT);
CREATE TABLE IF NOT EXISTS sesiones (th TEXT PRIMARY KEY, usuario_id TEXT, expira TEXT);
CREATE TABLE IF NOT EXISTS eventos (id INTEGER PRIMARY KEY AUTOINCREMENT, cliente_id TEXT, fecha TEXT, usuario_id TEXT, usuario TEXT, tipo TEXT, detalle TEXT);
