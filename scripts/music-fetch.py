"""Cherche sur Wikimedia Commons des enregistrements libres (domaine public, CC0 ou CC BY),
les compresse en MP3 et écrit music/manifest.json avec titre, auteur et licence."""
import json,urllib.request,urllib.parse,subprocess,os,re,html
UA={'User-Agent':'LuisartMusicBot/1.0 (https://github.com/amourdvine-alt/luisart)'}
API='https://commons.wikimedia.org/w/api.php?'
WANT=[
 ('Gymnopédie n°1','Erik Satie','Calme','Satie Gymnopedie',['gymnop']),
 ('Gnossienne n°1','Erik Satie','Calme','Satie Gnossienne',['gnossienne']),
 ('Clair de lune','Claude Debussy','Contemplatif','Debussy Clair de lune Suite bergamasque',['clair de lune']),
 ('Arabesque n°1','Claude Debussy','Piano','Debussy Arabesque',['arabesque']),
 ('Sonate « Clair de lune »','Ludwig van Beethoven','Piano','Beethoven Piano Sonata 14 Moonlight',['moonlight','sonata no. 14','op. 27']),
 ('Träumerei','Robert Schumann','Piano','Schumann Kinderszenen Traumerei',['träumerei','traumerei','träumerei']),
 ('Le Cygne','Camille Saint-Saëns','Classique','Saint-Saens Carnival of the Animals Swan',['swan','cygne']),
 ('Sicilienne','Gabriel Fauré','Contemplatif','Faure Sicilienne',['sicilienne']),
 ('Pavane','Gabriel Fauré','Contemplatif','Faure Pavane',['pavane']),
 ('Prélude « La goutte d’eau »','Frédéric Chopin','Piano','Chopin Prelude Op. 28 No. 15',['no. 15','raindrop']),
 ('Valse op. 64 n°2','Frédéric Chopin','Piano','Chopin Waltz Op. 64 No. 2',['64']),
 ('Kora','','Afrique','kora',['kora']),
 ('Balafon','','Afrique','balafon',['balafon']),
 ('Mbira','','Afrique','mbira',['mbira']),
]
OK=re.compile(r'^(public domain|pd|cc0|cc[ -]?by( \d\.\d)?|cc[ -]?by[ -]\d\.\d)$',re.I)
def get(q):
    return json.load(urllib.request.urlopen(urllib.request.Request(API+urllib.parse.urlencode(q),headers=UA),timeout=60))
os.makedirs('music',exist_ok=True)
old=json.load(open('music/manifest.json')) if os.path.exists('music/manifest.json') else []
out=list(old);seen=set(x.get('orig') for x in old)
for title,comp,mood,query,keys in WANT:
    try:
        r=get({'action':'query','format':'json','generator':'search','gsrnamespace':6,'gsrlimit':25,
               'gsrsearch':query+' filemime:audio','prop':'imageinfo','iiprop':'url|size|mime|extmetadata|mediatype'})
    except Exception as e:
        print('recherche échouée',title,e);continue
    pages=sorted((r.get('query') or {}).get('pages',{}).values(),key=lambda p:p.get('index',99))
    got=None
    for p in pages:
        ii=(p.get('imageinfo') or [{}])[0];md=ii.get('extmetadata') or {}
        lic=html.unescape(re.sub('<[^>]+>','',(md.get('LicenseShortName') or {}).get('value',''))).strip()
        if not OK.match(lic):continue
        if 'sa' in lic.lower() or 'nc' in lic.lower() or 'nd' in lic.lower():continue
        dur=float(ii.get('duration') or 0)
        url=ii.get('url','')
        if p['title'] in seen or not url:continue
        tl=p['title'].lower()
        if not any(k in tl for k in keys) or re.search(r'baudelaire|poem|poème|inleiding|lecture|reading|spoken',tl):continue
        if dur and dur<60:continue
        art=html.unescape(re.sub('<[^>]+>','',(md.get('Artist') or {}).get('value',''))).strip()[:120]
        got=dict(url=url,lic=lic,art=art,page='https://commons.wikimedia.org/wiki/'+urllib.parse.quote(p['title'].replace(' ','_')),file=p['title']);break
    if not got:print('rien de libre pour',title);continue
    fn=re.sub(r'[^a-z0-9]+','-',title.lower().encode('ascii','ignore').decode()).strip('-') or 'piste'
    src='/tmp/'+fn+'.src'
    try:
        open(src,'wb').write(urllib.request.urlopen(urllib.request.Request(got['url'],headers=UA),timeout=180).read())
        subprocess.run(['ffmpeg','-y','-loglevel','error','-i',src,'-vn','-t','420','-ac','2','-b:a','96k','-af','afade=t=out:st=414:d=6','music/'+fn+'.mp3'],check=True)
        d=float(subprocess.run(['ffprobe','-v','error','-show_entries','format=duration','-of','csv=p=0','music/'+fn+'.mp3'],capture_output=True,text=True).stdout or 0)
        if d<60:os.remove('music/'+fn+'.mp3');print('trop court',title);continue
    except Exception as e:
        print('téléchargement échoué',title,e);continue
    seen.add(got['file'])
    out.append(dict(f=fn+'.mp3',t=title,c=comp,m=mood,d=round(d),lic=got['lic'],by=got['art'],src=got['page'],orig=got['file']))
    print('OK',title,got['lic'],round(d),'s',got['file'])
json.dump(out,open('music/manifest.json','w'),ensure_ascii=False,indent=1)
print(len(out),'morceaux')
