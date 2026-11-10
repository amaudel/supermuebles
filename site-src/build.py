# Ensambla deploy/*.html a partir de layout.html + pages/*.html (+ parciales _*.html),
# y escribe sitemap.xml y robots.txt.
# Uso (desde la carpeta site-src):
#   python make_catalog.py   (si cambias los modelos)
#   python build.py
import os, re, urllib.parse
from config import SITE, WHATSAPP, WHATSAPP2, LASTMOD, GENERAL_MSG, LOCATION, ANALYTICS

ROOT = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(ROOT, '..', 'deploy')

BUSINESS = '''{
  "@context": "https://schema.org",
  "@type": "FurnitureStore",
  "name": "Supermuebles Cuenca",
  "description": "Fábrica de muebles en Turi, Cuenca: salas, comedores y dormitorios. Compra directo a la fábrica.",
  "url": "%(site)s/",
  "image": "%(site)s/img/catalogo/hero.jpg",
  "logo": "%(site)s/img/logo.png",
  "telephone": ["+59374039472", "+593959641962"],
  "address": {
    "@type": "PostalAddress",
    "streetAddress": "Sector San Pedro, vía al centro de rehabilitación, Turi",
    "addressLocality": "Cuenca",
    "addressRegion": "Azuay",
    "addressCountry": "EC"
  },
  "geo": {"@type": "GeoCoordinates", "latitude": %(lat)s, "longitude": %(lng)s},
  "hasMap": "https://maps.google.com/?cid=%(cid)s",
  "openingHoursSpecification": [
    {"@type": "OpeningHoursSpecification", "dayOfWeek": ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"], "opens": "08:00", "closes": "12:00"},
    {"@type": "OpeningHoursSpecification", "dayOfWeek": ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"], "opens": "13:30", "closes": "17:00"},
    {"@type": "OpeningHoursSpecification", "dayOfWeek": "Saturday", "opens": "08:00", "closes": "14:00"}
  ],
  "department": {
    "@type": "FurnitureStore",
    "name": "Supermuebles Guayaquil",
    "telephone": "+593999880023",
    "address": {
      "@type": "PostalAddress",
      "streetAddress": "Mall del Norte, segundo piso",
      "addressLocality": "Guayaquil",
      "addressCountry": "EC"
    }
  },
  "sameAs": ["https://www.facebook.com/supermueblescuenca", "https://www.instagram.com/supermuebles_cuenca/", "https://www.tiktok.com/@supermueblescuenc"]
}''' % {'site': SITE, 'lat': LOCATION['lat'], 'lng': LOCATION['lng'], 'cid': LOCATION['cid']}

CRUMBS = {
    'catalogo.html': 'Catálogo', 'salas.html': 'Salas', 'comedores.html': 'Comedores', 'dormitorios.html': 'Dormitorios',
    'a-medida.html': 'A medida', 'visitanos.html': 'Visítanos', 'privacidad.html': 'Privacidad',
}
UNDER_CATALOG = {'salas.html', 'comedores.html', 'dormitorios.html'}


def breadcrumb(fname):
    items = [('Inicio', SITE + '/')]
    if fname in UNDER_CATALOG:
        items.append(('Catálogo', SITE + '/catalogo.html'))
    items.append((CRUMBS[fname], '%s/%s' % (SITE, fname)))
    els = ',\n    '.join('{"@type": "ListItem", "position": %d, "name": "%s", "item": "%s"}' % (i + 1, n, u) for i, (n, u) in enumerate(items))
    return '{\n  "@context": "https://schema.org",\n  "@type": "BreadcrumbList",\n  "itemListElement": [\n    %s\n  ]\n}' % els


PAGES = [
    # archivo, cuerpo, clave de menú, título, descripción, extras
    ('index.html', 'home.html', 'home',
     'Fábrica de Muebles en Cuenca a Medida | Supermuebles Cuenca',
     'Hecho en Cuenca para tu casa. Salas, comedores y dormitorios fabricados en Turi, a tu medida. Cotiza directo con fábrica por WhatsApp.',
     {'business': True, 'preload': True, 'order_title': 'Cuéntanos qué necesitas'}),
    ('catalogo.html', 'catalogo.html', 'catalogo',
     'Catálogo de Muebles en Cuenca | Supermuebles Cuenca',
     'Catálogo de salas, comedores y dormitorios fabricados en Cuenca. Filtra por tipo, puestos y acabado y cotiza el diseño que te gusta por WhatsApp.',
     {}),
    ('salas.html', 'salas.html', 'catalogo',
     'Muebles de Sala en Cuenca | Supermuebles Cuenca',
     'Explora salas y sofás fabricados en Cuenca. Consulta medidas, tapices disponibles y opciones para adaptar el diseño a tu espacio.',
     {}),
    ('comedores.html', 'comedores.html', 'catalogo',
     'Comedores en Cuenca | Mesas y Sillas | Supermuebles',
     'Encuentra comedores de 6 y 8 puestos y consulta opciones de medidas y acabados directamente con fábrica en Cuenca.',
     {}),
    ('dormitorios.html', 'dormitorios.html', 'catalogo',
     'Dormitorios en Cuenca | Camas y Muebles | Supermuebles',
     'Camas y muebles de dormitorio fabricados en Cuenca, además de camas infantiles. Explora diseños y cotiza opciones para tu espacio.',
     {}),
    ('a-medida.html', 'a-medida.html', 'a-medida',
     'Muebles a Medida en Cuenca | Fábrica en Turi',
     'Adapta un diseño a tu espacio con atención directa de fábrica en Turi, Cuenca. Envía una foto y las medidas para cotizar tu mueble a medida.',
     {'order_title': 'Cotiza tu mueble a medida', 'tipo_default': 'Pedido a medida'}),
    ('proyectos.html', 'proyectos.html', 'proyectos',
     'Proyectos | Supermuebles Cuenca',
     'Proyectos de Supermuebles Cuenca: qué necesitaba el cliente y qué se fabricó.',
     {'noindex': True}),
    ('privacidad.html', 'privacidad.html', 'privacidad',
     'Privacidad | Supermuebles Cuenca',
     'Qué datos usa el sitio de Supermuebles Cuenca, para qué se usan y cómo pedirnos acceso, corrección o eliminación.',
     {}),
    ('404.html', '404.html', '404',
     'Página no encontrada | Supermuebles Cuenca',
     'La página que buscas no existe. Vuelve al inicio o explora el catálogo de Supermuebles Cuenca.',
     {'noindex': True}),
    ('visitanos.html', 'visitanos.html', 'visitanos',
     'Visítanos en Cuenca y Guayaquil | Supermuebles Cuenca',
     'Locales de Supermuebles: Turi, Cuenca (sector San Pedro) y Mall del Norte, Guayaquil. Horario, cómo llegar y agenda tu visita por WhatsApp.',
     {'business': True}),
]


def read(*p):
    return open(os.path.join(ROOT, *p), encoding='utf8').read()


layout = read('layout.html')


def wa(text, number=WHATSAPP):
    return 'https://wa.me/%s?text=%s' % (number, urllib.parse.quote(text, safe=''))


def includes(s, ex):
    def one(m):
        part = read('pages', '_%s.html' % m.group(1))
        return includes(part, ex).replace('{{order_title}}', ex.get('order_title', 'Cuéntanos qué necesitas'))
    return re.sub(r'\{\{include:(\w+)\}\}', one, s)


ANALYTICS_TAGS = ('<script>window.va=window.va||function(){(window.vaq=window.vaq||[]).push(arguments);};</script>\n'
                  '<script defer src="/_vercel/insights/script.js"></script>\n')
PRIVACY_ON = ('Medimos las visitas con Vercel Web Analytics, que cuenta páginas vistas sin cookies y sin identificarte. '
              'No usamos otras herramientas de seguimiento ni publicidad.')
PRIVACY_OFF = 'Este sitio no usa cookies de seguimiento, herramientas de medición ni publicidad.'


def loc_fill(s, fname=''):
    """Rellena {{loc:clave}} con los datos de config.LOCATION (nada se escribe a mano en las páginas)."""
    L = LOCATION
    ll = '%s,%s' % (L['lat'], L['lng'])
    dest = 'https://www.google.com/maps/dir/?api=1&amp;destination=' + urllib.parse.quote(ll, safe='')
    if L['place_id']:
        dest += '&amp;destination_place_id=' + L['place_id']
    vals = {
        'name': L['name'], 'address': L['address'], 'locality': L['locality'],
        'plus_code': L['plus_code'], 'phone': L['phone'], 'phone_tel': L['phone_tel'], 'phone2': L['phone2'], 'phone2_tel': L['phone2_tel'],
        'directions': dest,
        'agenda': '#agendar' if fname == 'visitanos.html' else 'visitanos.html#agendar',
        'open': 'https://maps.google.com/?cid=' + L['cid'],
        'embed': 'https://www.google.com/maps?q=%s&amp;z=16&amp;hl=es&amp;output=embed' % urllib.parse.quote(L['name'] + ' @' + ll, safe='@,'),
        'hours': ''.join('<span class="loc-d">%s</span><span class="loc-t">%s</span>' % h for h in L['hours']),
    }
    return re.sub(r'\{\{loc:(\w+)\}\}', lambda m: vals[m.group(1)], s)


def ld(obj):
    return '<script type="application/ld+json">\n%s\n</script>' % obj


for fname, body, key, title, desc, ex in PAGES:
    html = layout
    content = loc_fill(includes(read('pages', body), ex), fname)
    if ex.get('tipo_default'):
        content = content.replace('value="Sala" checked', 'value="Sala"')
        content = content.replace('value="%s"><span>' % ex['tipo_default'], 'value="%s" checked><span>' % ex['tipo_default'])
        content = content.replace('<dd id="s-tipo">Sala</dd>', '<dd id="s-tipo">%s</dd>' % ex['tipo_default'])
    url = SITE + '/' if fname == 'index.html' else '%s/%s' % (SITE, fname)
    html = html.replace('{{content}}', content)
    html = html.replace('{{title}}', title).replace('{{description}}', desc)
    html = html.replace('{{page}}', key).replace('{{url}}', url)
    html = html.replace('{{analytics}}', ANALYTICS_TAGS if ANALYTICS else '')
    html = html.replace('{{privacy_measure}}', PRIVACY_ON if ANALYTICS else PRIVACY_OFF)
    html = html.replace('{{site}}', SITE)
    html = html.replace('{{robots}}', '<meta name="robots" content="noindex">' if ex.get('noindex') else '')
    scripts = []
    if ex.get('business'):
        scripts.append(ld(BUSINESS))
    if fname in CRUMBS:
        scripts.append(ld(breadcrumb(fname)))
    html = html.replace('{{jsonld}}', '\n'.join(scripts))
    html = html.replace('{{preload}}', '<link rel="preload" as="image" href="img/fabrica-poster-3.jpg" media="(min-width: 860px)" fetchpriority="high"><link rel="preload" as="image" href="img/fabrica-poster-3-m.jpg" media="(max-width: 859px)" fetchpriority="high">' if ex.get('preload') else '')
    # mensaje general de WhatsApp
    html = html.replace('[[wa:Hola Supermuebles Cuenca, quiero cotizar un mueble.]]', '[[wa:%s]]' % GENERAL_MSG)
    html = re.sub(r'<a href="([^"]+)" data-page="%s"' % re.escape(key), r'<a href="\1" aria-current="page"', html)
    html = re.sub(r' data-page="[^"]+"', '', html)
    html = re.sub(r'\[\[wa:(.*?)\]\]', lambda m: wa(m.group(1)), html)
    html = re.sub(r'\[\[wa2:(.*?)\]\]', lambda m: wa(m.group(1), WHATSAPP2), html)
    open(os.path.join(OUT, fname), 'w', encoding='utf8', newline='\n').write(html)
    print('built', fname, len(html))

# sitemap y robots (proyectos queda fuera hasta tener casos reales)
urls = [('index.html', '1.0')] + [(f, '0.8') for f, _, _, _, _, ex in PAGES if f != 'index.html' and not ex.get('noindex')]
sm = ['<?xml version="1.0" encoding="UTF-8"?>', '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">']
for f, pr in urls:
    loc = SITE + '/' if f == 'index.html' else '%s/%s' % (SITE, f)
    sm.append('  <url><loc>%s</loc><lastmod>%s</lastmod><priority>%s</priority></url>' % (loc, LASTMOD, pr))
sm.append('</urlset>')
open(os.path.join(OUT, 'sitemap.xml'), 'w', encoding='utf8', newline='\n').write('\n'.join(sm) + '\n')
open(os.path.join(OUT, 'robots.txt'), 'w', encoding='utf8', newline='\n').write('User-agent: *\nAllow: /\n\nSitemap: %s/sitemap.xml\n' % SITE)
print('sitemap.xml y robots.txt')
