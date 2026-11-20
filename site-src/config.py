# Datos que se usan en varias páginas. Cuando exista el dominio propio, cambia SITE y vuelve a correr
# make_catalog.py y build.py (desde site-src/). SITE es la dirección pública: sale en canonical, mapa del
# sitio, robots.txt y en los enlaces de WhatsApp de cada modelo.
# Desde el 20 nov 2026 el sitio está en Cloudflare (Worker `supermuebles-cuenca`); Vercel ya no se usa.
SITE = 'https://supermuebles-cuenca.andresdelgado1984.workers.dev'
WHATSAPP = '593999880023'
WHATSAPP2 = '593959641962'  # segundo número de la fábrica (celular y WhatsApp)
LASTMOD = '2026-11-12'

# Mensaje general de WhatsApp (el de cada modelo incluye el nombre y el enlace)
GENERAL_MSG = ('Hola, vi un mueble en la web de Supermuebles Cuenca y quiero cotizarlo. '
               '¿Me ayudan a revisar medidas, opciones de acabado, precio y entrega?')


# Ubicación de la fábrica en Turi. Todo sale del perfil de Google del negocio.
# Si el dueño confirma el Place ID (empieza con "ChIJ"), ponlo en PLACE_ID y el botón
# "Cómo llegar" lo usará para identificar el destino exacto.
LOCATION = {
    'name': 'Supermuebles Cuenca',
    'lat': -2.9472789,
    'lng': -78.9971495,
    'place_id': 'ChIJY80S_zYZzZERq-GOKXlWkdw',
    'cid': '15893579638355452331',
    'plus_code': '3233+34Q',
    'address': 'Sector San Pedro, vía al centro de rehabilitación',
    'locality': 'Turi, Cuenca, Azuay, Ecuador',
    'phone': '(07) 403-9472',
    'phone_tel': '+59374039472',
    'phone2': '095 964 1962',
    'phone2_tel': '+593959641962',
    'hours': [
        ('Lunes a viernes', '8:00 a 12:00 y 13:30 a 17:00'),
        ('Sábado', '8:00 a 14:00'),
        ('Domingo', 'Solo con cita previa'),
    ],
}


# Medición de visitas con Vercel Web Analytics. Ya no aplica: el sitio dejó Vercel. Se deja en False.
# Si se quiere medir visitas en Cloudflare hay que usar Cloudflare Web Analytics y cambiar build.py.
ANALYTICS = False
