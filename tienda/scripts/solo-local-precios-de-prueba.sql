-- SOLO PARA PRUEBAS EN LOCAL (npm run db:precios-prueba). Nunca aplicar en Cloudflare.
-- Precios inventados para poder probar el carrito; NO son precios del dueño.
UPDATE products SET price_cents = 100000 WHERE id = 'sala-titanic';
UPDATE products SET price_cents = 85000 WHERE id = 'comedor-dubai';
UPDATE products SET price_cents = 42050 WHERE id = 'cama-princess';
UPDATE settings SET value_json = 'true' WHERE key = 'tienda_activa';
