# Genera pages/catalogo.html y las páginas por categoría (salas, comedores, dormitorios)
# a partir del catálogo real (PDF "CATALOGO SUPERMUEBLES 2.0").
# Para agregar un precio a un modelo, ponlo en "precio" (número en USD): el filtro de precio aparece solo.
import os
from config import SITE

HERE = os.path.dirname(os.path.abspath(__file__))

# nombre, tipo, puestos, acabados, imagen, ancho, alto, texto, alt
M = [
    ('Sala Titanic', 'salas', '', 'champagne terciopelo', 'sala-titanic', 871, 959,
     'Tapiz gris claro con costuras verticales, butaca de terciopelo azul marino y mesa de centro con espejos.',
     'Sala Titanic: sofás grises, butaca azul y mesa de centro sobre una alfombra azul'),
    ('Sala Titanic tipo L', 'salas', '', 'champagne terciopelo', 'sala-titanic-l', 1086, 1448,
     'Seccional en L con acanaladuras verticales y patas en tono champán.',
     'Sala Titanic tipo L: sofá seccional gris con butaca de terciopelo azul'),
    ('Sala Rose', 'salas', '', 'champagne marmol terciopelo', 'sala-rose', 847, 1109,
     'Seccional en L crema con poltrona rosa y juego de dos mesas de centro.',
     'Sala Rose: sofá seccional crema, poltrona rosa y mesas de centro'),
    ('Sala Soft tipo L', 'salas', '', 'champagne terciopelo', 'sala-soft-l', 1056, 1382,
     'Seccional modular en L beige y champagne, con pufs azul cobalto.',
     'Sala Soft: seccional en L beige con pufs azules y mesa de centro de cristal'),
    ('Sala Francis', 'salas', '', 'lacado', 'sala-francis', 881, 1079,
     'Sofás gris perla con butacas mostaza y mesa de centro con almacenaje.',
     'Sala Francis: dos sofás gris perla, cojines mostaza y mesa de centro blanca y madera'),
    ('Sala Relax', 'salas', '', 'cuero', 'sala-relax', 837, 910,
     'Reclinables eléctricos y manuales en cuero sintético. Se vende en conjunto o por separado.',
     'Sala Relax: sofás y sillones reclinables en cuero sintético marrón'),
    ('Sofá cama nido', 'salas', '', 'cuero', 'sofa-cama', 1238, 936,
     'Cuero sintético beige grisáceo con cama nido deslizable para visitas.',
     'Sofá cama beige con la cama nido extendida'),
    ('Comedor Rose', 'comedores', '6', 'champagne', 'comedor-rose', 1237, 1415,
     'Seis sillas en rosa claro y blanco hueso, con base tipo bufetera y vidrio de 15 mm.',
     'Comedor Rose: mesa de cristal con base de madera champagne y sillas rosas y blancas'),
    ('Comedor Gabriela', 'comedores', '8', 'champagne marmol', 'comedor-gabriela', 1260, 1600,
     'Para 8 personas: seis sillas marfil con argolla dorada y dos sitiales azules.',
     'Comedor Gabriela: mesa tipo mármol con sillas marfil y sitiales azules'),
    ('Comedor Dubai', 'comedores', '6', 'champagne marmol terciopelo', 'comedor-dubai', 1155, 1600,
     'Seis puestos con tablero de piedra sinterizada y base en X.',
     'Comedor Dubai: mesa de piedra sinterizada con sillas azules y blancas'),
    ('Comedor Luxuri', 'comedores', '6', 'cedro marmol', 'comedor-luxuri', 1170, 1274,
     'Seis puestos con tablero tipo mármol y pedestal de cedro oscuro.',
     'Comedor Luxuri: mesa con pedestal de madera oscura y sillas marfil'),
    ('Dormitorio Arabi', 'dormitorios', '', 'champagne', 'dorm-arabi', 1406, 1600,
     'Cama plataforma con cabecera capitoné en rombos y veladores de dos cajones.',
     'Dormitorio Arabi: cama tapizada con marco champagne y veladores'),
    ('Dormitorio Venecia', 'dormitorios', '', '', 'dorm-venecia', 1224, 1600,
     'Cabecero tridimensional dorado, dos veladores y baúl tipo puff.',
     'Dormitorio Venecia: cama con cabecero dorado y baúl a los pies'),
    ('Cama Miami', 'dormitorios', '', '', 'dorm-miami', 1238, 1508,
     'Cuerina capitoné con líneas de espejo metálico y dos mesas de noche.',
     'Cama Miami: cabecero con espejo metálico y mesas de noche'),
    ('Cama Princess', 'infantil', '', '', 'dorm-princess', 923, 956,
     'Cabecero de concha con corona, en rosa palo y beige.',
     'Cama Princess: cama infantil rosa con cabecero en forma de concha'),
    ('Cama Barquito de Sueños', 'infantil', '', 'cafe lacado', 'dorm-barquito', 811, 976,
     'Cuna convertible con cuatro cajones, en café chocolate con frentes blancos.',
     'Cuna convertible de madera oscura con cajones blancos'),
    ('Cama Castillo Rosa', 'infantil', '', 'lacado', 'dorm-castillo', 922, 1136,
     'Litera con cama nido deslizable y escalera con cajones, en blanco y rosa.',
     'Litera blanca y rosa con escalera de cajones'),
    ('Cama Reina', 'infantil', '', 'lacado', 'dorm-reina', 912, 1106,
     'Cuna y cómoda cambiador en blanco brillante con detalles dorados.',
     'Cuna blanca con dosel y cómoda cambiador rosa'),
    ('Litera Nido Mágico', 'infantil', '', 'cafe', 'dorm-litera', 819, 926,
     'Litera con escritorio empotrado, cajón extraíble y escalera con cajones.',
     'Litera de madera café con escritorio y escalera con cajones'),
]

TIPOS = [('todos', 'Todos'), ('salas', 'Salas'), ('comedores', 'Comedores'), ('dormitorios', 'Dormitorios'), ('infantil', 'Infantil')]
PUESTOS = [('todos', 'Todos'), ('6', '6 puestos'), ('8', '8 puestos')]
ACABADOS = [('todos', 'Todos'), ('champagne', 'Champagne'), ('cedro', 'Cedro oscuro'), ('cafe', 'Café o nogal'),
            ('lacado', 'Lacado blanco'), ('marmol', 'Tipo mármol'), ('terciopelo', 'Terciopelo'), ('cuero', 'Cuero sintético')]

GENERAL = '[[wa:Hola, vi un mueble en la web de Supermuebles Cuenca y quiero cotizarlo. ¿Me ayudan a revisar medidas, opciones de acabado, precio y entrega?]]'


def slug(n):
    import unicodedata, re
    s = unicodedata.normalize('NFKD', n).encode('ascii', 'ignore').decode().lower()
    return re.sub(r'[^a-z0-9]+', '-', s).strip('-')


def chips(key, label, opts):
    b = ''.join('<button class="chip" type="button" data-filter="%s" data-value="%s" aria-pressed="%s">%s</button>'
                % (key, v, 'true' if i == 0 else 'false', t) for i, (v, t) in enumerate(opts))
    return '<fieldset><legend>%s</legend><div class="chips">%s</div></fieldset>' % (label, b)


def item(m, page):
    (n, tipo, pu, ac, img, w, h, txt, alt) = m
    sid = slug(n)
    url = '%s/%s#%s' % (SITE, page, sid)
    msg1 = 'Hola, vi el modelo «%s» en la web de Supermuebles Cuenca y quiero cotizarlo. ¿Me ayudan a revisar medidas, opciones de acabado, precio y entrega? %s' % (n, url)
    msg2 = 'Hola, me gusta el modelo «%s» de la web de Supermuebles Cuenca, pero necesito adaptarlo (otra medida o acabado). ¿Me ayudan a revisar qué ajustes son posibles? %s' % (n, url)
    return (
        '    <li class="item" id="%s" data-r data-cat="%s" data-puestos="%s" data-acabado="%s" data-precio="">\n'
        '      <figure><div class="item-img"><img src="img/catalogo/%s.jpg" width="%d" height="%d" loading="lazy" alt="%s"></div>\n'
        '      <figcaption><h2>%s</h2><p>%s</p></figcaption></figure>\n'
        '      <div class="item-cta"><a class="ulink" href="[[wa:%s]]" target="_blank" rel="noopener noreferrer">Cotizar este diseño</a>'
        '<a class="ulink" href="[[wa:%s]]" target="_blank" rel="noopener noreferrer">Quiero adaptarlo</a></div>\n'
        '    </li>' % (sid, tipo, pu, ac, img, w, h, alt, n, txt, msg1, msg2))


def write(name, html):
    open(os.path.join(HERE, 'pages', name), 'w', encoding='utf8').write(html)


# ---------- catálogo completo (con filtros) ----------
li = [item(m, 'catalogo.html') for m in M]
cat = '''
<section class="page-head" aria-labelledby="pg-title">
  <h1 class="display" id="pg-title">Catálogo de muebles</h1>
  <p class="lead">Salas, comedores y dormitorios fabricados en Turi. Filtra por tipo, puestos y acabado, elige el diseño que te gusta y conversa con fábrica para adaptarlo a tu espacio.</p>
</section>

<section class="catalog-wrap" aria-label="Modelos">
  <nav class="cats" aria-label="Categorías">
    <a href="salas.html">Ver solo salas</a>
    <a href="comedores.html">Ver solo comedores</a>
    <a href="dormitorios.html">Ver solo dormitorios</a>
  </nav>
  <form class="filters" id="filters" aria-label="Filtrar modelos" onsubmit="return false">
    %s
    %s
    %s
    <fieldset id="f-precio" hidden><legend>Precio</legend><div class="chips" id="precio-chips"></div></fieldset>
  </form>
  <ul class="catalog" id="catalog">
%s
  </ul>
  <div class="empty" id="empty" hidden>
    <p class="lead">Ningún modelo coincide con esa combinación.</p>
    <p>Cuéntanos qué buscas y revisamos contigo qué se puede hacer.</p>
    <a class="btn" href="[[wa:Hola, busqué en el catálogo de Supermuebles Cuenca y no encuentro lo que necesito. ¿Me ayudan a revisar opciones?]]" target="_blank" rel="noopener noreferrer"><svg class="i" aria-hidden="true"><use href="#i-wa"/></svg><span>Cotizar por WhatsApp</span></a>
  </div>
  <p class="catalog-note">Cada modelo se puede adaptar. Medidas, acabados, tapices disponibles, precio y entrega te los confirma una asesora antes de decidir. También fabricamos armarios y peinadoras: pídelos por WhatsApp.</p>
</section>

<section class="closer" aria-labelledby="cl-title">
  <h2 class="h2" id="cl-title">¿Te gusta uno, pero otra medida?</h2>
  <p class="lead">Escríbenos antes de decidir. Revisamos contigo qué ajustes son posibles en ese modelo.</p>
  <img class="closer-img" src="img/catalogo/s-butaca-mostaza.jpg" width="552" height="703" loading="lazy" alt="Butaca mostaza con cojín blanco de pelo">
  <div class="closer-links">
    <a class="btn" href="a-medida.html"><span>Ver cómo pedirlo a medida</span></a>
    <a class="link" href="%s" target="_blank" rel="noopener noreferrer">Cotizar por WhatsApp <svg class="i" aria-hidden="true"><use href="#i-arrow"/></svg></a>
  </div>
</section>
''' % (chips('cat', 'Tipo', TIPOS), chips('puestos', 'Puestos (comedores)', PUESTOS), chips('acabado', 'Acabado', ACABADOS),
       '\n'.join(li), GENERAL)
write('catalogo.html', cat)

# ---------- páginas por categoría ----------
CATS = [
    ('salas.html', ['salas'], 'Muebles de sala en Cuenca',
     'Elige una configuración que funcione con tu espacio. ¿Te gusta un modelo pero necesitas otra medida o tapiz? Conversemos antes de cotizar.',
     'La sala se usa todos los días: para conversar, recibir visitas y descansar. Estos son los muebles de sala que fabricamos en Turi, Cuenca: seccionales, juegos de sala, butacas, sala Relax con reclinables y sofá cama. Revisa los diseños, consulta medidas y tapices disponibles y cotiza con nuestro equipo. También puedes verlos en Turi o en nuestro showroom del Mall del Norte, en Guayaquil.'),
    ('comedores.html', ['comedores'], 'Comedores en Cuenca',
     'Fíjate en la comodidad al sentarte, en el espacio para circular alrededor de la mesa y en cómo combina el conjunto con tu ambiente. Consulta otras medidas con fábrica.',
     'Comedores fabricados en Cuenca, de 6 y 8 puestos, con tableros tipo mármol o de piedra sinterizada, bases de madera y sillas tapizadas. Explora mesas, sillas y juegos de comedor, y consulta con fábrica las medidas y acabados disponibles para tu espacio.'),
    ('dormitorios.html', ['dormitorios', 'infantil'], 'Dormitorios en Cuenca',
     'Camas, cabeceras, veladores y conjuntos para descansar sin quitarte espacio para moverte. Conversemos sobre las opciones para tu dormitorio.',
     'Dormitorios fabricados en Cuenca: camas con cabeceras tapizadas, veladores, baúl y conjuntos, además de cunas, literas y camas infantiles. Cotiza el diseño que te gusta y consulta qué ajustes de medida o acabado son posibles.'),
]
for fname, tipos, h1, lead, seo in CATS:
    blocks = []
    for t in tipos:
        sub = [m for m in M if m[1] == t]
        lis = '\n'.join(item(m, fname) for m in sub)
        if t == 'infantil':
            blocks.append('  <h2 class="h2 sub-h" id="infantil" data-r>Dormitorios infantiles</h2>\n  <ul class="catalog" id="catalog-%s">\n%s\n  </ul>' % (t, lis))
        else:
            blocks.append('  <ul class="catalog" id="catalog-%s">\n%s\n  </ul>' % (t, lis))
    links = ''.join(
        '<a href="%s"%s>%s</a>' % (f, ' aria-current="page"' if f == fname else '', l)
        for f, l in [('catalogo.html', 'Todo el catálogo'), ('salas.html', 'Salas'), ('comedores.html', 'Comedores'), ('dormitorios.html', 'Dormitorios')])
    html = '''
<section class="page-head" aria-labelledby="pg-title">
  <h1 class="display" id="pg-title">%s</h1>
  <p class="lead">%s</p>
</section>

<section class="catalog-wrap" aria-label="Modelos">
  <nav class="cats" aria-label="Categorías" data-r>%s</nav>
%s
  <p class="seo-text" data-r>%s</p>
</section>

<section class="closer" aria-labelledby="cl-title">
  <h2 class="h2" id="cl-title" data-r>Antes de decidir, mide tu espacio</h2>
  <p class="lead" data-r>Envíanos una foto del ambiente y las medidas que tengas. Te ayudamos a revisar qué diseño funciona mejor.</p>
  <div class="closer-links" data-r>
    <a class="btn" href="%s" target="_blank" rel="noopener noreferrer"><svg class="i" aria-hidden="true"><use href="#i-wa"/></svg><span>Pedir ayuda con las medidas</span></a>
    <a class="link" href="a-medida.html">Ver cómo pedirlo a medida <svg class="i" aria-hidden="true"><use href="#i-arrow"/></svg></a>
  </div>
</section>
''' % (h1, lead, links, '\n'.join(blocks), seo, GENERAL)
    write(fname, html)

print('catálogo:', len(M), 'modelos; categorías:', ', '.join(c[0] for c in CATS))
