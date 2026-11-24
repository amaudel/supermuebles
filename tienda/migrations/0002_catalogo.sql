-- Carga los modelos del catálogo actual (site-src/make_catalog.py) SIN precio.
-- price_cents NULL = solo cotización por WhatsApp. Los precios los pone el dueño desde el panel (fase 2).
INSERT INTO products (id, slug, name, category, description, image, price_cents, active, sort) VALUES
  ('sala-titanic', 'sala-titanic', 'Sala Titanic', 'salas', 'Tapiz gris claro con costuras verticales, butaca de terciopelo azul marino y mesa de centro con espejos.', 'img/catalogo/sala-titanic.jpg', NULL, 1, 10),
  ('sala-titanic-tipo-l', 'sala-titanic-tipo-l', 'Sala Titanic tipo L', 'salas', 'Seccional en L con acanaladuras verticales y patas en tono champán.', 'img/catalogo/sala-titanic-l.jpg', NULL, 1, 20),
  ('sala-rose', 'sala-rose', 'Sala Rose', 'salas', 'Seccional en L crema con poltrona rosa y juego de dos mesas de centro.', 'img/catalogo/sala-rose.jpg', NULL, 1, 30),
  ('sala-soft-tipo-l', 'sala-soft-tipo-l', 'Sala Soft tipo L', 'salas', 'Seccional modular en L beige y champagne, con pufs azul cobalto.', 'img/catalogo/sala-soft-l.jpg', NULL, 1, 40),
  ('sala-francis', 'sala-francis', 'Sala Francis', 'salas', 'Sofás gris perla con butacas mostaza y mesa de centro con almacenaje.', 'img/catalogo/sala-francis.jpg', NULL, 1, 50),
  ('sala-relax', 'sala-relax', 'Sala Relax', 'salas', 'Reclinables eléctricos y manuales en cuero sintético. Se vende en conjunto o por separado.', 'img/catalogo/sala-relax.jpg', NULL, 1, 60),
  ('sofa-cama-nido', 'sofa-cama-nido', 'Sofá cama nido', 'salas', 'Cuero sintético beige grisáceo con cama nido deslizable para visitas.', 'img/catalogo/sofa-cama.jpg', NULL, 1, 70),
  ('comedor-rose', 'comedor-rose', 'Comedor Rose', 'comedores', 'Seis sillas en rosa claro y blanco hueso, con base tipo bufetera y vidrio de 15 mm.', 'img/catalogo/comedor-rose.jpg', NULL, 1, 80),
  ('comedor-gabriela', 'comedor-gabriela', 'Comedor Gabriela', 'comedores', 'Para 8 personas: seis sillas marfil con argolla dorada y dos sitiales azules.', 'img/catalogo/comedor-gabriela.jpg', NULL, 1, 90),
  ('comedor-dubai', 'comedor-dubai', 'Comedor Dubai', 'comedores', 'Seis puestos con tablero de piedra sinterizada y base en X.', 'img/catalogo/comedor-dubai.jpg', NULL, 1, 100),
  ('comedor-luxuri', 'comedor-luxuri', 'Comedor Luxuri', 'comedores', 'Seis puestos con tablero tipo mármol y pedestal de cedro oscuro.', 'img/catalogo/comedor-luxuri.jpg', NULL, 1, 110),
  ('dormitorio-arabi', 'dormitorio-arabi', 'Dormitorio Arabi', 'dormitorios', 'Cama plataforma con cabecera capitoné en rombos y veladores de dos cajones.', 'img/catalogo/dorm-arabi.jpg', NULL, 1, 120),
  ('dormitorio-venecia', 'dormitorio-venecia', 'Dormitorio Venecia', 'dormitorios', 'Cabecero tridimensional dorado, dos veladores y baúl tipo puff.', 'img/catalogo/dorm-venecia.jpg', NULL, 1, 130),
  ('cama-miami', 'cama-miami', 'Cama Miami', 'dormitorios', 'Cuerina capitoné con líneas de espejo metálico y dos mesas de noche.', 'img/catalogo/dorm-miami.jpg', NULL, 1, 140),
  ('cama-princess', 'cama-princess', 'Cama Princess', 'infantil', 'Cabecero de concha con corona, en rosa palo y beige.', 'img/catalogo/dorm-princess.jpg', NULL, 1, 150),
  ('cama-barquito-de-suenos', 'cama-barquito-de-suenos', 'Cama Barquito de Sueños', 'infantil', 'Cuna convertible con cuatro cajones, en café chocolate con frentes blancos.', 'img/catalogo/dorm-barquito.jpg', NULL, 1, 160),
  ('cama-castillo-rosa', 'cama-castillo-rosa', 'Cama Castillo Rosa', 'infantil', 'Litera con cama nido deslizable y escalera con cajones, en blanco y rosa.', 'img/catalogo/dorm-castillo.jpg', NULL, 1, 170),
  ('cama-reina', 'cama-reina', 'Cama Reina', 'infantil', 'Cuna y cómoda cambiador en blanco brillante con detalles dorados.', 'img/catalogo/dorm-reina.jpg', NULL, 1, 180),
  ('litera-nido-magico', 'litera-nido-magico', 'Litera Nido Mágico', 'infantil', 'Litera con escritorio empotrado, cajón extraíble y escalera con cajones.', 'img/catalogo/dorm-litera.jpg', NULL, 1, 190);
