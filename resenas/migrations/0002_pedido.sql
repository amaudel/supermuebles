-- Clientes que llegan solos desde el panel de pedidos (tienda): se guarda el código del pedido
-- para que un mismo pedido nunca cree dos clientes.
ALTER TABLE clientes ADD COLUMN pedido TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS idx_clientes_pedido ON clientes(pedido) WHERE pedido IS NOT NULL;
