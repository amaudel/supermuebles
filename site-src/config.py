# Datos que se usan en varias páginas. Cuando exista el dominio propio, cambia SITE y vuelve a correr build.py.
SITE = 'https://supermuebles-cuenca.vercel.app'
WHATSAPP = '593999880023'
WHATSAPP2 = '593959641962'  # segundo número de la fábrica (celular y WhatsApp)
LASTMOD = '2026-10-26'

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


# Medición de visitas sin cookies (Vercel Web Analytics).
# Ponla en True solo después de activar Web Analytics en el panel del proyecto en Vercel;
# antes de eso el script respondería 404. Los eventos personalizados (clics a WhatsApp, etc.)
# requieren el plan Pro de Vercel; sin él se cuentan solo las visitas.
ANALYTICS = False
