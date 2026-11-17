#!/usr/bin/env python3
"""rjs : outil d'exploitation des sites RJS Studio, branché sur sites.json.

  rjs list [prod|dev|abandonne]       liste les sites
  rjs check <id|all> [--quiet]        contrôle technique en production
  rjs indexnow <id|all> [URL ...]     envoie le sitemap (ou ces URL) à IndexNow
  rjs versions                        version de @rjs/geo figée dans chaque repo local
  rjs conseils <id|all>               build propre local + conseils @rjs/geo (remplace conseils.sh)
  rjs sync [id|all]                   git pull --rebase --autostash des repos locaux (Mac)
  rjs newkey <id>                     génère une clé IndexNow et crée public/<clé>.txt
"""
import json, os, re, sys, html, secrets, subprocess, urllib.request, urllib.error
from concurrent.futures import ThreadPoolExecutor
import http.client
OPS = os.path.dirname(os.path.realpath(__file__))
REG = os.environ.get("RJS_REGISTRY", os.path.join(OPS, "sites.json"))
WORKDEV = os.environ.get("RJS_WORKDEV", os.path.normpath(os.path.join(OPS, "..", "..")))
UA = "rjs-ops/1.0 (+https://romainjulien.studio)"

def load():  return json.load(open(REG, encoding="utf-8"))
def save(d): json.dump(d, open(REG, "w", encoding="utf-8"), ensure_ascii=False, indent=2)

def pick(arg, status="prod"):
    sites = load()["sites"]
    if arg in (None, "all"): return [s for s in sites if s["status"] == status]
    found = [s for s in sites if arg in (s["id"], s["host"], s["host"].removeprefix("www."))]
    if not found: sys.exit(f"Site inconnu : {arg} (voir rjs list)")
    return found

def fetch(url):
    req = urllib.request.Request(url, headers={"User-Agent": UA})
    try:
        with urllib.request.urlopen(req, timeout=20) as r:
            return r.status, r.geturl(), r.read().decode("utf-8", "ignore")
    except urllib.error.HTTPError as e: return e.code, url, ""
    except Exception as e: return 0, url, str(e)

def sitemap_urls(host):
    code, _, body = fetch(f"https://{host}/sitemap-index.xml")
    if code != 200 or "<loc>" not in body:
        code, _, body = fetch(f"https://{host}/sitemap.xml")
        if code != 200: return []
    locs = re.findall(r"<loc>\s*([^<\s]+)\s*</loc>", body)
    if "sitemapindex" in body:
        return [u for s in locs for u in re.findall(r"<loc>\s*([^<\s]+)\s*</loc>", fetch(s)[2])]
    return locs

def norm(u): return u.rstrip("/") if u.count("/") > 2 else u

def head(url):
    """Premier saut seulement (sans suivre) : (code, location)."""
    from urllib.parse import urlsplit
    u = urlsplit(url); C = http.client.HTTPSConnection if u.scheme == "https" else http.client.HTTPConnection
    try:
        c = C(u.netloc, timeout=15); c.request("HEAD", u.path or "/", headers={"User-Agent": UA}); r = c.getresponse()
        return r.status, r.getheader("Location") or ""
    except Exception as e: return 0, str(e)

def page(u):
    code, final, body = fetch(u); return u, code, final, body

def check(site, quiet=False):
    h = site["host"]; pb = []; warn = []
    # §1.1 playbook indexation : toutes les variantes convergent en 1 saut vers l'origine
    bare = h.removeprefix("www."); origin = f"https://{h}/"
    # (http → https → domaine final = 2 sauts : comportement normal de Netlify, accepté)
    for v in {f"http://{bare}/", f"https://{bare}/", f"http://www.{bare}/", f"https://www.{bare}/"} - {origin}:
        cur = v
        for _ in range(3):
            c, loc = head(cur)
            if c in (301, 302, 307, 308) and loc: cur = loc if loc.startswith("http") else origin.rstrip("/") + loc
            else: break
        if c == 0 and cur == v: continue  # variante non servie (DNS absent) : pas bloquant
        if cur.rstrip("/") != origin.rstrip("/"): pb.append(f"{v} aboutit à {cur} (attendu : {origin})")
        elif c in (302, 307): warn.append(f"{v} : redirection temporaire, préférer 301")
    # §1.2 robots
    rc, _, robots = fetch(f"https://{h}/robots.txt")
    if rc != 200: warn.append("robots.txt absent")
    else:
        if re.search(r"(?mi)^user-agent:\s*\*\s*$(?:\n(?!user-agent).*)*?^disallow:\s*/\s*$", robots): pb.append("robots.txt bloque tout (Disallow: /)")
        if not re.search(r"(?i)^sitemap:", robots, re.M): warn.append("robots.txt sans ligne Sitemap:")
    urls = sitemap_urls(h)
    if not urls: pb.append("sitemap introuvable ou vide")
    long_desc = 0; no_alt = 0; titles = {}; descs = {}
    with ThreadPoolExecutor(8) as ex: pages = list(ex.map(page, urls))
    for u, code, final, body in pages:
        if code != 200: pb.append(f"{u} répond {code}"); continue
        if norm(final) != norm(u): pb.append(f"{u} redirige vers {final}")
        m = re.search(r'<link[^>]+rel="canonical"[^>]+href="([^"]+)"', body) or re.search(r'<link[^>]+href="([^"]+)"[^>]+rel="canonical"', body)
        if not m: pb.append(f"{u} sans canonical")
        elif m.group(1) != u and not (u.count("/") <= 3 and norm(m.group(1)) == norm(u)):
            pb.append(f"{u} canonical différente : {m.group(1)}")
        if re.search(r'<meta[^>]+name="robots"[^>]+content="[^"]*noindex', body): warn.append(f"{u} en noindex mais listée dans le sitemap (la retirer du sitemap)")  # §1.4
        t = re.search(r"<title>([^<]*)</title>", body); t = html.unescape(t.group(1)).strip() if t else ""
        titles.setdefault(t, []).append(u)
        d = re.search(r'<meta[^>]+name="description"[^>]+content="([^"]*)"', body)
        if not d: warn.append(f"{u} sans meta description")
        else:
            dv = html.unescape(d.group(1)); descs.setdefault(dv, []).append(u)
            if len(dv) > 160: long_desc += 1
        no_alt += len(re.findall(r"<img(?![^>]*\balt=)[^>]*>", body))
        words = len(re.sub(r"<[^>]+>", " ", re.sub(r"(?s)<(script|style)[^>]*>.*?</\1>", " ", body)).split())
        if words < 150: warn.append(f"{u} : seulement {words} mots dans le HTML brut")  # §1.5
    dup_t = [v for k, v in titles.items() if len(v) > 1]; dup_d = [v for k, v in descs.items() if len(v) > 1]
    if dup_t: warn.append(f"{sum(len(v) for v in dup_t)} pages partagent un title identique")
    if dup_d: warn.append(f"{sum(len(v) for v in dup_d)} pages partagent une meta description identique")
    if fetch(f"https://{h}/llms.txt")[0] != 200: warn.append("llms.txt absent")
    k = site.get("indexnowKey")
    if not k: warn.append("pas de clé IndexNow")
    elif fetch(f"https://{h}/{k}.txt")[2].strip() != k: pb.append("clé IndexNow non servie")
    if long_desc: warn.append(f"{long_desc}/{len(urls)} meta descriptions > 160 car.")
    if no_alt: warn.append(f"{no_alt} images sans attribut alt")
    ok = not pb
    out = []
    if not (quiet and ok and not warn):
        out.append(f"{'✅' if ok else '❌'} {site['id']} ({h}) : {len(urls)} URL" + ("" if ok else f", {len(pb)} problème(s)"))
        out += [f"   ❌ {p}" for p in pb[:8]] + [f"   ⚠️  {w}" for w in warn[:8]]
    return ok, "\n".join(out)

GEO_COMMITS = {}
def geo_head():
    p = os.path.join(WORKDEV, "WORKS AGENCE", "rjs-geo")
    r = subprocess.run(["git", "-C", p, "log", "--format=%h %ad", "--date=short"], capture_output=True, text=True).stdout.split("\n")
    return [l for l in r if l]

def versions():
    hist = geo_head(); latest = hist[0].split()[0] if hist else "?"
    order = {l.split()[0]: i for i, l in enumerate(hist)}
    for s in load()["sites"]:
        lock = os.path.join(WORKDEV, s["path"], "package-lock.json")
        if not os.path.exists(lock): continue
        res = json.load(open(lock)).get("packages", {}).get("node_modules/@rjs/geo", {}).get("resolved", "")
        if not res: continue
        c = res.split("#")[-1][:7]; behind = order.get(c, "?")
        print(f"{'✅' if c == latest else '⬆️ '} {s['id']:22} {c}  " + ("à jour" if c == latest else f"{behind} commit(s) de retard"))
    print(f"\nDernière version de @rjs/geo : {hist[0] if hist else '?'}")

def conseils(site):
    p = os.path.join(WORKDEV, site["path"])
    for d in ("dist", ".astro", "node_modules/.vite"): subprocess.run(["rm", "-rf", os.path.join(p, d)])
    r = subprocess.run(["npm", "--prefix", p, "run", "build"], capture_output=True, text=True)
    block = [l for l in (r.stdout + r.stderr).splitlines() if re.search(r"GEO/SEO|⚠️|   ·", l)]
    print(f"════ {site['id']} ════"); print("\n".join(block) if block else "   ⚠️  Aucun bloc conseils : build en échec ?")

def indexnow(site, urls=None):
    h, k = site["host"], site.get("indexnowKey")
    if not k: print(f"⏭  {site['id']} : pas de clé"); return False
    if fetch(f"https://{h}/{k}.txt")[2].strip() != k: print(f"❌ {site['id']} : clé non servie, déploie d'abord"); return False
    urls = urls or sitemap_urls(h)
    data = json.dumps({"host": h, "key": k, "keyLocation": f"https://{h}/{k}.txt", "urlList": urls}).encode()
    req = urllib.request.Request("https://api.indexnow.org/indexnow", data=data, headers={"Content-Type": "application/json; charset=utf-8", "User-Agent": UA})
    try: code = urllib.request.urlopen(req, timeout=30).status
    except urllib.error.HTTPError as e: code = e.code
    print(f"{'✅' if code in (200,202) else '❌'} {site['id']} : {len(urls)} URL envoyées, réponse {code}")
    return code in (200, 202)

def sync(site):
    p = os.path.join(WORKDEV, site["path"])
    if not os.path.isdir(os.path.join(p, ".git")): print(f"⏭  {site['id']} : pas de repo local"); return
    r = subprocess.run(["git", "-C", p, "pull", "--rebase", "--autostash", "-q"], capture_output=True, text=True)
    st = subprocess.run(["git", "-C", p, "status", "-sb"], capture_output=True, text=True).stdout.splitlines()[0]
    print(f"{'✅' if r.returncode == 0 else '❌'} {site['id']} : {st} {r.stderr.strip()[:120]}")

def newkey(site):
    if site.get("indexnowKey"): sys.exit(f"{site['id']} a déjà une clé : {site['indexnowKey']}")
    k = secrets.token_hex(16); pub = os.path.join(WORKDEV, site["path"], "public")
    os.makedirs(pub, exist_ok=True); open(os.path.join(pub, f"{k}.txt"), "w").write(k)
    d = load(); [s.update(indexnowKey=k) for s in d["sites"] if s["id"] == site["id"]]; save(d)
    print(f"Clé {k} créée dans public/ et enregistrée. Commit + push, puis : rjs indexnow {site['id']}")

def main(a):
    if not a or a[0] in ("-h", "--help", "help"): print(__doc__); return
    cmd, rest = a[0], a[1:]
    if cmd == "list":
        st = rest[0] if rest else None
        for s in load()["sites"]:
            if not st or s["status"] == st: print(f"{s['status']:9} {s['id']:22} {s['host'] or '-':30} {s['branch']:7} {s['notes']}")
    elif cmd == "check":
        quiet = "--quiet" in rest; rest = [x for x in rest if x != "--quiet"]
        with ThreadPoolExecutor(4) as ex: res = list(ex.map(lambda s: check(s, quiet), pick(rest[0] if rest else "all")))
        for ok, txt in res:
            if txt: print(txt)
        n = sum(ok for ok, _ in res); print(f"\n{n}/{len(res)} sites sans problème bloquant."); sys.exit(0 if n == len(res) else 1)
    elif cmd == "indexnow":
        sites = pick(rest[0] if rest else "all"); urls = rest[1:] or None
        if urls and len(sites) > 1: sys.exit("Des URL précises ne s'envoient que pour un seul site.")
        [indexnow(s, urls) for s in sites]
    elif cmd == "versions": versions()
    elif cmd == "conseils": [conseils(s) for s in pick(rest[0] if rest else "all")]
    elif cmd == "sync": [sync(s) for s in pick(rest[0] if rest else "all")]
    elif cmd == "newkey": newkey(pick(rest[0])[0])
    else: print(__doc__); sys.exit(1)

if __name__ == "__main__": main(sys.argv[1:])
