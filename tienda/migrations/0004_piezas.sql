-- Piezas de cada modelo y vínculo con las fichas que llena el dueño (/fichas/).
-- Precio del juego completo = suma de (cantidad en el juego × precio de la pieza).
-- Las piezas sueltas solo se venden si el modelo lo permite (sold_separately = 1, viene de la ficha).

ALTER TABLE products ADD COLUMN ficha_id TEXT;
ALTER TABLE products ADD COLUMN ficha_rev INTEGER;
ALTER TABLE products ADD COLUMN sold_separately INTEGER NOT NULL DEFAULT 0;
CREATE UNIQUE INDEX idx_products_ficha ON products(ficha_id) WHERE ficha_id IS NOT NULL;

CREATE TABLE product_pieces (
  id TEXT PRIMARY KEY,
  product_id TEXT NOT NULL REFERENCES products(id),
  name TEXT NOT NULL,
  qty_in_set INTEGER NOT NULL DEFAULT 1 CHECK (qty_in_set >= 0),
  price_cents INTEGER NOT NULL CHECK (price_cents >= 0),
  width_cm REAL,
  depth_cm REAL,
  height_cm REAL,
  sort INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX idx_pieces_product ON product_pieces(product_id, sort);
