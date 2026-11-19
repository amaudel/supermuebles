-- Esquema inicial de la tienda (TIENDA-DISENO.md, sección 6).
-- Dinero en centavos de USD (enteros). Fechas en UTC, ISO 8601. Identificadores aleatorios.

CREATE TABLE products (
  id TEXT PRIMARY KEY,
  slug TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  category TEXT NOT NULL,
  description TEXT,
  image TEXT,
  price_cents INTEGER,               -- NULL = solo cotización por WhatsApp
  active INTEGER NOT NULL DEFAULT 0,
  sort INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE option_groups (
  id TEXT PRIMARY KEY,
  product_id TEXT NOT NULL REFERENCES products(id),
  name TEXT NOT NULL,
  required INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE options (
  id TEXT PRIMARY KEY,
  group_id TEXT NOT NULL REFERENCES option_groups(id),
  label TEXT NOT NULL,
  price_delta_cents INTEGER NOT NULL DEFAULT 0,
  active INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE orders (
  id TEXT PRIMARY KEY,
  public_code TEXT NOT NULL UNIQUE,
  tracking_token TEXT NOT NULL UNIQUE,
  status TEXT NOT NULL DEFAULT 'nuevo',
  payment_status TEXT NOT NULL DEFAULT 'pendiente',
  customer_name TEXT NOT NULL,
  phone TEXT NOT NULL,
  email TEXT,
  id_number TEXT,
  city TEXT NOT NULL,
  address TEXT NOT NULL,
  reference TEXT,
  subtotal_cents INTEGER NOT NULL,
  shipping_cents INTEGER,            -- NULL hasta que la asesora lo confirma
  discount_cents INTEGER NOT NULL DEFAULT 0,
  total_cents INTEGER,
  deposit_cents INTEGER,
  notes TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  idempotency_key TEXT NOT NULL UNIQUE
);

CREATE TABLE order_items (
  id TEXT PRIMARY KEY,
  order_id TEXT NOT NULL REFERENCES orders(id),
  product_id TEXT NOT NULL REFERENCES products(id),
  name_snapshot TEXT NOT NULL,
  unit_cents_snapshot INTEGER NOT NULL,
  qty INTEGER NOT NULL CHECK (qty > 0),
  options_json TEXT NOT NULL DEFAULT '[]',
  note TEXT
);

CREATE TABLE order_events (
  id TEXT PRIMARY KEY,
  order_id TEXT NOT NULL REFERENCES orders(id),
  at TEXT NOT NULL,
  actor TEXT NOT NULL,
  type TEXT NOT NULL,
  detail_json TEXT NOT NULL DEFAULT '{}'
);

CREATE TABLE payments (
  id TEXT PRIMARY KEY,
  order_id TEXT NOT NULL REFERENCES orders(id),
  method TEXT NOT NULL,
  amount_cents INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'pendiente',
  proof_key TEXT,
  provider TEXT,
  provider_ref TEXT,
  verified_by TEXT,
  verified_at TEXT
);

CREATE TABLE settings (
  key TEXT PRIMARY KEY,
  value_json TEXT NOT NULL
);

CREATE TABLE admin_users (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  name TEXT,
  role TEXT NOT NULL DEFAULT 'asesora',
  active INTEGER NOT NULL DEFAULT 1
);

CREATE INDEX idx_orders_status ON orders(status, created_at);
CREATE INDEX idx_items_order ON order_items(order_id);
CREATE INDEX idx_events_order ON order_events(order_id, at);
CREATE INDEX idx_payments_order ON payments(order_id);

-- La tienda nace apagada: nada se muestra al público hasta encenderla.
INSERT INTO settings(key, value_json) VALUES ('tienda_activa', 'false');
