-- Panel de administración (fase 2): intentos fallidos de entrada, para frenar a quien adivina códigos.
CREATE TABLE admin_intentos (
  at INTEGER NOT NULL  -- segundos desde 1970 (UTC)
);
CREATE INDEX idx_admin_intentos_at ON admin_intentos(at);

-- Registro de cambios del panel que no son de un pedido (precios, ajustes).
CREATE TABLE admin_log (
  id TEXT PRIMARY KEY,
  at TEXT NOT NULL,
  actor TEXT NOT NULL,
  accion TEXT NOT NULL,
  detalle_json TEXT NOT NULL DEFAULT '{}'
);
CREATE INDEX idx_admin_log_at ON admin_log(at);
