"""Luisart · télécharge des images (catégories de formations), les redimensionne en WebP
et tient à jour assets/formations/credits.json. Entrée : variable LISTE (JSON [[nom, url, credit], …])."""
import json, os, io, sys, urllib.request
from PIL import Image
L = json.loads(os.environ['LISTE']); out = 'assets/formations'; os.makedirs(out, exist_ok=True)
cp = os.path.join(out, 'credits.json'); cr = json.load(open(cp)) if os.path.exists(cp) else {}
ok = 0
for nom, url, credit in L:
    try:
        req = urllib.request.Request(url, headers={'user-agent': 'Mozilla/5.0 (LuisartImages)'})
        im = Image.open(io.BytesIO(urllib.request.urlopen(req, timeout=60).read())).convert('RGB')
        w, h = im.size; r = 4 / 3
        if w / h > r: nw = int(h * r); im = im.crop(((w - nw) // 2, 0, (w - nw) // 2 + nw, h))
        else: nh = int(w / r); im = im.crop((0, (h - nh) // 2, w, (h - nh) // 2 + nh))
        im = im.resize((720, 540), Image.LANCZOS)
        im.save(os.path.join(out, nom + '.webp'), 'WEBP', quality=74, method=6)
        cr[nom] = credit; ok += 1
        print('OK', nom, os.path.getsize(os.path.join(out, nom + '.webp')) // 1024, 'Ko')
    except Exception as e:
        print('ÉCHEC', nom, str(e)[:120])
json.dump(cr, open(cp, 'w'), ensure_ascii=False, indent=1, sort_keys=True)
print(ok, 'images sur', len(L)); sys.exit(0 if ok else 1)
