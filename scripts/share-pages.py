#!/usr/bin/env python3
"""Pages d'aperçu pour les liens partagés (WhatsApp, Facebook, Telegram, X, iMessage…).

Pour chaque œuvre, artiste, actualité et exposition visibles dans Luisart, ce robot écrit
dans <dossier du site>/p/ une petite page avec le titre, la description et une image
d'aperçu, puis renvoie le visiteur vers l'application.

Rien n'est enregistré dans l'historique du dépôt : ces fichiers n'existent que dans la
version publiée du site. Une œuvre supprimée disparaît donc à la publication suivante.
"""
import sys, os, re, json, io, base64, html, hashlib, urllib.request, urllib.parse, textwrap
from concurrent.futures import ThreadPoolExecutor
from PIL import Image, ImageDraw, ImageFont, ImageFilter, ImageOps

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
SITE = 'https://amourdvine-alt.github.io/luisart/'
UA = {'User-Agent': 'LuisartShareBot/1.0 (+https://amourdvine-alt.github.io/luisart/)'}
SAFE = re.compile(r'^[A-Za-z0-9_-]{1,80}$')
W, H = 1200, 630
GOLD, CREAM, INK = (217, 178, 111), (243, 236, 224), (18, 15, 12)

# ------------------------------------------------------------------ données
def cfg():
    s = open(os.path.join(ROOT, 'firebase-config.js')).read()
    return re.search(r'projectId:\s*"([^"]+)"', s).group(1), re.search(r'apiKey:\s*"([^"]+)"', s).group(1)

def val(v):
    if 'stringValue' in v: return v['stringValue']
    if 'integerValue' in v: return int(v['integerValue'])
    if 'doubleValue' in v: return float(v['doubleValue'])
    if 'booleanValue' in v: return v['booleanValue']
    if 'nullValue' in v: return None
    if 'timestampValue' in v: return v['timestampValue']
    if 'arrayValue' in v: return [val(x) for x in v['arrayValue'].get('values', [])]
    if 'mapValue' in v: return {k: val(x) for k, x in v['mapValue'].get('fields', {}).items()}
    return None

def coll(name, page=40):
    pid, key = cfg(); out = []; tok = ''
    while True:
        q = {'pageSize': page, 'key': key}
        if tok: q['pageToken'] = tok
        url = 'https://firestore.googleapis.com/v1/projects/%s/databases/(default)/documents/%s?%s' % (pid, name, urllib.parse.urlencode(q))
        d = json.load(urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=60))
        for doc in d.get('documents', []):
            o = {k: val(v) for k, v in doc.get('fields', {}).items()}; o['id'] = doc['name'].rsplit('/', 1)[1]; out.append(o)
        tok = d.get('nextPageToken', '')
        if not tok: return out

# ------------------------------------------------------------------- images
def load_img(src):
    """Image depuis une donnée intégrée (data:) ou une adresse web. None si illisible."""
    if not src or not isinstance(src, str): return None
    try:
        if src.startswith('data:'):
            raw = base64.b64decode(src.split(',', 1)[1])
        elif src.startswith('http'):
            u = 'https://images.weserv.nl/?' + urllib.parse.urlencode({'url': src, 'w': 900, 'fit': 'inside', 'we': '', 'output': 'jpg', 'q': 82})
            raw = urllib.request.urlopen(urllib.request.Request(u, headers=UA), timeout=20).read()
        elif os.environ.get('SHARE_TEST') and os.path.isfile(os.path.join(ROOT, src)):
            raw = open(os.path.join(ROOT, src), 'rb').read()
        else:
            return None
        im = Image.open(io.BytesIO(raw)); im = ImageOps.exif_transpose(im)
        if im.mode in ('RGBA', 'LA', 'P'):
            im = im.convert('RGBA'); bg = Image.new('RGB', im.size, (245, 240, 232)); bg.paste(im, mask=im.split()[3]); im = bg
        im = im.convert('RGB')
        return im if min(im.size) >= 40 else None
    except Exception:
        return None

_F = {}
def font(kind, size):
    k = (kind, size)
    if k not in _F:
        d = os.path.join(HERE, 'fonts')
        if kind == 'serif':
            f = ImageFont.truetype(os.path.join(d, 'Lora-Variable.ttf'), size)
            try: f.set_variation_by_axes([700])
            except Exception: pass
        else:
            f = ImageFont.truetype(os.path.join(d, 'Inter-SemiBold.otf' if kind == 'bold' else 'Inter-Medium.otf'), size)
        _F[k] = f
    return _F[k]

def wrap(dr, text, fnt, width, max_lines):
    words = text.split(); lines = []; cur = ''
    for w in words:
        t = (cur + ' ' + w).strip()
        if dr.textlength(t, font=fnt) <= width: cur = t
        else:
            if cur: lines.append(cur)
            cur = w
            while dr.textlength(cur, font=fnt) > width and len(cur) > 1: cur = cur[:-1]
    if cur: lines.append(cur)
    if len(lines) > max_lines:
        lines = lines[:max_lines]; l = lines[-1]
        while dr.textlength(l + '…', font=fnt) > width and len(l) > 1: l = l[:-1]
        lines[-1] = l.rstrip(' ,;:.-') + '…'
    return lines

def fit_title(dr, text, width, max_h):
    for size, ml in ((64, 3), (56, 3), (50, 4), (44, 4), (38, 5)):
        f = font('serif', size); ls = wrap(dr, text, f, width, ml); lh = int(size * 1.16)
        if len(ls) * lh <= max_h and not ls[-1].endswith('…'): return f, ls, lh
    return f, ls, lh

_LOGO = None
def logo(size):
    global _LOGO
    if _LOGO is None:
        try: _LOGO = Image.open(os.path.join(ROOT, 'icons', 'icon-192.png')).convert('RGB')
        except Exception: _LOGO = False
    if not _LOGO: return None
    im = _LOGO.resize((size, size), Image.LANCZOS); m = Image.new('L', (size, size), 0)
    ImageDraw.Draw(m).rounded_rectangle((0, 0, size - 1, size - 1), radius=size // 5, fill=255); im.putalpha(m); return im

def card(im, label, title, lines=(), accent='', round_img=False, cta="Voir sur Luisart"):
    """Image d'aperçu 1200 × 630 : visuel à gauche, texte à droite."""
    if im is not None:
        bg = ImageOps.fit(im, (W, H), Image.LANCZOS).filter(ImageFilter.GaussianBlur(38))
        bg = Image.blend(bg, Image.new('RGB', (W, H), INK), .72)
    else:
        bg = Image.new('RGB', (W, H), INK)
    dr = ImageDraw.Draw(bg, 'RGBA')
    dr.rectangle((0, 0, W, H), fill=(18, 15, 12, 40))
    BX, BY, BW, BH = 44, 44, 520, H - 88
    if im is not None:
        if round_img:
            d = min(BW, BH) - 40; av = ImageOps.fit(im, (d, d), Image.LANCZOS); m = Image.new('L', (d, d), 0)
            ImageDraw.Draw(m).ellipse((0, 0, d - 1, d - 1), fill=255)
            x, y = BX + (BW - d) // 2, BY + (BH - d) // 2
            dr.ellipse((x - 7, y - 7, x + d + 6, y + d + 6), fill=GOLD + (255,)); bg.paste(av, (x, y), m)
        else:
            t = im.copy(); t.thumbnail((BW - 16, BH - 16), Image.LANCZOS)
            x, y = BX + (BW - t.width) // 2, BY + (BH - t.height) // 2
            sh = Image.new('RGBA', (t.width + 80, t.height + 80), (0, 0, 0, 0))
            ImageDraw.Draw(sh).rectangle((40, 46, t.width + 40, t.height + 46), fill=(0, 0, 0, 150))
            bg.paste(sh.filter(ImageFilter.GaussianBlur(16)), (x - 40, y - 40), sh.filter(ImageFilter.GaussianBlur(16)))
            dr = ImageDraw.Draw(bg, 'RGBA')
            dr.rectangle((x - 8, y - 8, x + t.width + 7, y + t.height + 7), fill=(250, 246, 238, 255))
            dr.rectangle((x - 8, y - 8, x + t.width + 7, y + t.height + 7), outline=GOLD + (255,), width=2)
            bg.paste(t, (x, y))
    else:
        lg = logo(260)
        if lg: bg.paste(lg, (BX + (BW - 260) // 2, BY + (BH - 260) // 2), lg)
    dr = ImageDraw.Draw(bg, 'RGBA')
    TX, TW = 612, W - 612 - 52
    y = 62
    lab = (label or 'LUISART').upper()
    dr.text((TX, y), lab, font=font('bold', 22), fill=GOLD + (255,), spacing=0)
    dr.rectangle((TX, y + 40, TX + 64, y + 43), fill=GOLD + (255,)); y += 66
    lines = [l for l in lines if l]
    f, ls, lh = fit_title(dr, title or 'Luisart', TW, 300 - 42 * min(len(lines), 2))
    for l in ls:
        dr.text((TX, y), l, font=f, fill=CREAM + (255,)); y += lh
    y += 14
    for i, l in enumerate(lines[:3]):
        fs = font('reg', 30 if i == 0 else 26)
        for ll in wrap(dr, l, fs, TW, 2):
            if y > H - 150: break
            dr.text((TX, y), ll, font=fs, fill=(CREAM if i == 0 else (196, 186, 170)) + (255,)); y += 40 if i == 0 else 35
    if accent and y <= H - 150:
        y += 8; dr.text((TX, y), accent, font=font('bold', 34), fill=GOLD + (255,))
    lg = logo(54); fy = H - 100
    if lg: bg.paste(lg, (TX, fy), lg)
    dr.text((TX + 70, fy + 1), 'Luisart', font=font('bold', 25), fill=CREAM + (255,))
    dr.text((TX + 70, fy + 31), 'La maison des artistes', font=font('reg', 19), fill=(196, 186, 170, 255))
    cw = int(dr.textlength(cta, font=font('bold', 21))) + 44
    dr.rounded_rectangle((W - 52 - cw, fy + 3, W - 52, fy + 51), radius=24, fill=GOLD + (255,))
    dr.text((W - 52 - cw + 22, fy + 14), cta, font=font('bold', 21), fill=(26, 19, 7, 255))
    out = io.BytesIO(); bg.save(out, 'JPEG', quality=84, optimize=True, progressive=True); return out.getvalue()

# -------------------------------------------------------------------- pages
def clean(s, n=200):
    s = re.sub(r'\s+', ' ', str(s or '')).strip()
    return s if len(s) <= n else s[:n - 1].rsplit(' ', 1)[0].rstrip(' ,;:.-') + '…'

def fcfa(n):
    try: n = int(n)
    except Exception: return ''
    return ('{:,}'.format(n).replace(',', ' ') + ' FCFA') if n > 0 else ''

def write(out, key, hash_, title, desc, jpg, kind='article'):
    e = lambda s: html.escape(str(s), quote=True)
    os.makedirs(os.path.join(out, 'p', 'i'), exist_ok=True)
    v = hashlib.sha1(jpg).hexdigest()[:8]
    open(os.path.join(out, 'p', 'i', key + '.jpg'), 'wb').write(jpg)
    img = SITE + 'p/i/' + key + '.jpg?v=' + v; url = SITE + 'p/' + key + '.html'; app = '../#' + hash_
    page = ('<!DOCTYPE html><html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">'
            '<title>%(t)s · Luisart</title><meta name="description" content="%(d)s">'
            '<meta property="og:type" content="%(k)s"><meta property="og:site_name" content="Luisart"><meta property="og:locale" content="fr_FR">'
            '<meta property="og:title" content="%(t)s"><meta property="og:description" content="%(d)s"><meta property="og:url" content="%(u)s">'
            '<meta property="og:image" content="%(i)s"><meta property="og:image:secure_url" content="%(i)s"><meta property="og:image:type" content="image/jpeg">'
            '<meta property="og:image:width" content="1200"><meta property="og:image:height" content="630"><meta property="og:image:alt" content="%(t)s">'
            '<meta name="twitter:card" content="summary_large_image"><meta name="twitter:title" content="%(t)s"><meta name="twitter:description" content="%(d)s"><meta name="twitter:image" content="%(i)s">'
            '<link rel="canonical" href="%(u)s"><link rel="icon" type="image/png" href="../icons/icon-192.png">'
            '<script>location.replace(%(j)s)</script>'
            '<style>body{margin:0;background:#120f0c;color:#f3ece0;font:16px/1.45 -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;text-align:center;padding:24px}'
            'img{max-width:100%%;border-radius:14px}a{display:inline-block;margin:18px 0;padding:13px 26px;border-radius:30px;background:linear-gradient(#e6c581,#b98f4a);color:#1a1307;font-weight:600;text-decoration:none}p{color:#c4baaa}</style>'
            '</head><body><img src="i/%(f)s.jpg?v=%(v)s" width="1200" height="630" alt="%(t)s" style="height:auto"><h1>%(t)s</h1><p>%(d)s</p><a href="%(a)s">Ouvrir dans Luisart</a></body></html>'
            ) % dict(t=e(title), d=e(desc), k=kind, u=e(url), i=e(img), j=json.dumps(app), f=key, v=v, a=e(app))
    open(os.path.join(out, 'p', key + '.html'), 'w', encoding='utf-8').write(page)

def build(out, works, artists, news, expos, now_ms):
    A = {a['id']: a for a in artists}
    banned = lambda i: (A.get(i) or {}).get('susp') == -1
    live = lambda x: not x.get('at') or x['at'] <= now_ms
    n = dict(w=0, a=0, n=0, x=0)
    jobs = []
    # œuvres
    vis = [w for w in works if re.match(r'^w\d{8,}[A-Za-z0-9_-]*$', w['id']) and live(w) and not w.get('hid') and not w.get('pend') and not w.get('demo') and w.get('aid') in A and not banned(w.get('aid'))]
    per = {}
    for w in vis: per.setdefault(w['aid'], []).append(w)
    def do_work(w):
        a = A[w['aid']]; nm = clean(a.get('name') or 'Artiste', 60); t = clean(w.get('title') or 'Œuvre', 110)
        meta = ' · '.join(x for x in [clean(w.get('cat'), 30), clean(w.get('tech'), 40), str(w.get('yr') or '') if w.get('yr') else ''] if x)
        price = '' if w.get('sold') or w.get('st') == 'sold' else fcfa(w.get('price'))
        meta2 = ' · '.join(x for x in [clean(w.get('tech'), 40), str(w.get('yr') or '') if w.get('yr') else ''] if x)
        jpg = card(load_img(w.get('img')), clean(w.get('cat') or 'Œuvre', 28), t, ['par ' + nm, meta2], price, cta="Voir l'œuvre")
        desc = clean(' · '.join(x for x in [meta, price] if x) + ('. ' if meta or price else '') + clean(w.get('desc'), 150) or 'À découvrir sur Luisart, la maison des artistes.', 190)
        write(out, w['id'], w['id'], '%s — %s' % (t, nm), desc, jpg); n['w'] += 1
    jobs += [(do_work, w) for w in vis]
    # artistes (profil + lien de live)
    def do_artist(a):
        ws = sorted(per.get(a['id'], []), key=lambda w: -(w.get('ts') or 0)); nm = clean(a.get('name') or 'Artiste', 60)
        im = load_img(a.get('avatar')); rnd = im is not None
        if im is None and ws: im = load_img(ws[0].get('img'))
        cnt = '%d œuvre%s sur Luisart' % (len(ws), 's' if len(ws) > 1 else '') if ws else ''
        bio = clean(a.get('bio'), 150); disc = clean(a.get('disc') or 'Artiste', 40); where = clean(a.get('city') or a.get('ct'), 40)
        jpg = card(im, disc, nm, [where, bio or cnt], cnt if bio else '', round_img=rnd, cta='Voir le profil')
        write(out, 'a-' + a['id'], 'a=' + a['id'], '%s · %s' % (nm, disc), clean(bio or (cnt or 'Portfolio') + ' — Luisart, la maison des artistes.', 190), jpg, 'profile')
        jpg2 = card(im, 'En direct', nm + ' est en direct', [disc, 'Rejoignez le live sur Luisart'], '', round_img=rnd, cta='Rejoindre le live')
        write(out, 'l-' + a['id'], 'l=' + a['id'], '%s est en direct sur Luisart' % nm, 'Rejoignez le live de %s sur Luisart, la maison des artistes.' % nm, jpg2); n['a'] += 1
    jobs += [(do_artist, a) for a in artists if SAFE.match(a['id']) and not banned(a['id']) and not a.get('demo') and a.get('mem') in (None, '', 'ok') and a.get('name')]
    # actualités (publiées par l'équipe + trouvées par le robot de veille)
    def do_news(x):
        t = clean(x.get('title'), 140); where = ', '.join(v for v in [clean(x.get('place'), 40), clean(x.get('country'), 30)] if v)
        when = clean(x.get('date'), 50)
        dl = ''
        if x.get('deadline'):
            m = re.match(r'(\d{4})-(\d{2})-(\d{2})', str(x['deadline']))
            if m: dl = 'Date limite : %s/%s/%s' % (m.group(3), m.group(2), m.group(1))
        jpg = card(load_img(x.get('img')), clean(x.get('cat') or 'Actualité', 30), t, [' · '.join(v for v in [when, where] if v), clean(x.get('sub'), 60)], dl, cta="Lire l'actualité")
        write(out, 'n-' + x['id'], 'n=' + x['id'], t, clean(x.get('text') or x.get('sub') or 'Actualité de l’art sur Luisart.', 190), jpg); n['n'] += 1
    jobs += [(do_news, x) for x in news if SAFE.match(str(x.get('id', ''))) and live(x) and x.get('title')]
    # expositions virtuelles
    def do_expo(x):
        import datetime
        fd = lambda ms: datetime.datetime.utcfromtimestamp(ms / 1000).strftime('%d/%m/%Y') if ms else ''
        t = clean(x.get('t') or 'Exposition', 110); rng = ' → '.join(v for v in [fd(x.get('d0')), fd(x.get('d1'))] if v)
        jpg = card(load_img(x.get('cover')), 'Exposition virtuelle', t, [rng, clean(x.get('th'), 120)], '', cta="Voir l'exposition")
        write(out, 'x-' + x['id'], 'x=' + x['id'], t + ' — exposition virtuelle Luisart', clean(' · '.join(v for v in [rng, clean(x.get('th'), 140)] if v) or 'Exposition virtuelle sur Luisart.', 190), jpg); n['x'] += 1
    jobs += [(do_expo, x) for x in expos if SAFE.match(x['id']) and x.get('pub') and not x.get('del') and not x.get('nw')]
    def run(j):
        try: j[0](j[1])
        except Exception as er: print('  ignoré', j[1].get('id'), type(er).__name__, str(er)[:120])
    with ThreadPoolExecutor(6) as ex: list(ex.map(run, jobs))
    return n

def main():
    import time
    out = sys.argv[1] if len(sys.argv) > 1 else '_site'
    get = lambda c: (coll(c) if True else [])
    data = {}; lus = set()
    for c in ('artists', 'works', 'news', 'expo'):
        try: data[c] = get(c); lus.add(c)
        except Exception as er: print('lecture impossible :', c, type(er).__name__, str(er)[:160]); data[c] = []
    try: auto = json.load(open(os.path.join(ROOT, 'data', 'news-auto.json'))).get('items', [])
    except Exception: auto = []
    n = build(out, data['works'], data['artists'], data['news'] + auto, data['expo'], int(time.time() * 1000))
    print('pages de partage : %(w)d œuvres, %(a)d artistes, %(n)d actualités, %(x)d expositions' % n)
    # témoin lu par l'application : elle n'utilise les liens d'aperçu que si ces pages existent vraiment
    if {'artists', 'works'} <= lus:
        os.makedirs(os.path.join(out, 'p'), exist_ok=True); json.dump({'ok': 1}, open(os.path.join(out, 'p', 'ok.json'), 'w'))

if __name__ == '__main__':
    main()
