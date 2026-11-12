# Genera versiones WebP más livianas de las fotos de deploy/img, en varios anchos.
# build.py las enlaza solas (srcset) si existen. Volver a correr al agregar o cambiar fotos:
#   python make_images.py
import os, glob
from PIL import Image

HERE = os.path.dirname(os.path.abspath(__file__))
IMG = os.path.join(HERE, '..', 'deploy', 'img')
WIDTHS = [480, 800, 1200, 1600]
SKIP = ('og.jpg', 'fabrica-poster')   # imagen de redes y póster del video (ya pesan poco)

n = antes = despues = 0
for src in glob.glob(os.path.join(IMG, '**', '*.jpg'), recursive=True):
    if os.path.basename(src).startswith(SKIP):
        continue
    im = Image.open(src).convert('RGB')
    w, h = im.size
    antes += os.path.getsize(src)
    anchos = [x for x in WIDTHS if x < w] + [w] if w <= WIDTHS[-1] else WIDTHS
    for x in anchos:
        out = '%s-%d.webp' % (src[:-4], x)
        if not os.path.exists(out) or os.path.getmtime(out) < os.path.getmtime(src):
            im.resize((x, round(h * x / w)), Image.LANCZOS).save(out, 'WEBP', quality=78, method=6)
            n += 1
    despues += os.path.getsize('%s-%d.webp' % (src[:-4], anchos[min(1, len(anchos) - 1)]))
print('webp generados: %d | JPG %d KB -> WebP de celular %d KB' % (n, antes // 1024, despues // 1024))
