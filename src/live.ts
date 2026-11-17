/**
 * Contrôle d'un site EN PRODUCTION : ce que le build ne peut pas voir (host
 * www/non-www servi par Netlify, redirections, robots.txt servi, clé IndexNow
 * en ligne) + les signaux d'indexation page par page.
 * Portage Node de `rjs check` (RJS-OPS/rjs.py), seuils alignés sur le pack.
 */

const UA = 'rjs-geo/0.3 (+https://romainjulien.studio)';

export type LiveSite = { id?: string; host: string; indexnowKey?: string; credit?: boolean };
export type LiveResult = { ok: boolean; site: string; urls: number; problems: string[]; warnings: string[] };
export type LiveOptions = { maxTitle?: number; maxDescription?: number };

/** GET avec un nouvel essai sur erreur réseau ou 5xx (un raté ponctuel ne doit pas sortir en ❌). */
async function get(url: string): Promise<{ code: number; final: string; body: string }> {
  const r = await getOnce(url);
  if (r.code !== 0 && r.code < 500) return r;
  await new Promise((ok) => setTimeout(ok, 2000));
  return getOnce(url);
}

async function getOnce(url: string): Promise<{ code: number; final: string; body: string }> {
  try {
    const r = await fetch(url, { headers: { 'User-Agent': UA }, signal: AbortSignal.timeout(20000) });
    return { code: r.status, final: r.url, body: r.ok ? await r.text() : '' };
  } catch (e) {
    return { code: 0, final: url, body: String(e) };
  }
}

/** Premier saut seulement : (code, location). */
async function hop(url: string): Promise<{ code: number; location: string }> {
  try {
    const r = await fetch(url, { method: 'HEAD', redirect: 'manual', headers: { 'User-Agent': UA }, signal: AbortSignal.timeout(15000) });
    return { code: r.status, location: r.headers.get('location') ?? '' };
  } catch {
    return { code: 0, location: '' };
  }
}

const locs = (xml: string) => [...xml.matchAll(/<loc>\s*([^<\s]+)\s*<\/loc>/g)].map((m) => m[1]);

export async function sitemapUrls(host: string): Promise<string[]> {
  let r = await get(`https://${host}/sitemap-index.xml`);
  if (r.code !== 200 || !r.body.includes('<loc>')) {
    r = await get(`https://${host}/sitemap.xml`);
    if (r.code !== 200) return [];
  }
  if (!r.body.includes('sitemapindex')) return locs(r.body);
  const subs = await Promise.all(locs(r.body).map((u) => get(u)));
  return subs.flatMap((s) => locs(s.body));
}

const norm = (u: string) => u.replace(/\/+$/, '');
const decode = (s: string) =>
  s.replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;|&#x27;|&apos;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>');

async function pool<T, R>(items: T[], n: number, fn: (x: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let i = 0;
  await Promise.all(
    Array.from({ length: Math.min(n, items.length) }, async () => {
      while (i < items.length) {
        const k = i++;
        out[k] = await fn(items[k]);
      }
    }),
  );
  return out;
}

export async function checkLive(site: LiveSite, opts: LiveOptions = {}): Promise<LiveResult> {
  const maxTitle = opts.maxTitle ?? 60;
  const maxDesc = opts.maxDescription ?? 155;
  const h = site.host;
  const pb: string[] = [];
  const warn: string[] = [];
  const bare = h.replace(/^www\./, '');
  const origin = `https://${h}/`;

  // Toutes les variantes de host convergent vers l'origine (http → https → domaine final : 2 sauts acceptés).
  const variants = new Set([`http://${bare}/`, `https://${bare}/`, `http://www.${bare}/`, `https://www.${bare}/`]);
  variants.delete(origin);
  for (const v of variants) {
    let cur = v;
    let code = 0;
    for (let n = 0; n < 3; n++) {
      const r = await hop(cur);
      code = r.code;
      if ([301, 302, 307, 308].includes(r.code) && r.location) cur = r.location.startsWith('http') ? r.location : new URL(r.location, cur).href;
      else break;
    }
    if (code === 0 && cur === v) continue; // variante non servie (DNS absent) : pas bloquant
    if (norm(cur) !== norm(origin)) pb.push(`${v} aboutit à ${cur} (attendu : ${origin})`);
    else if ([302, 307].includes(code)) warn.push(`${v} : redirection temporaire, préférer 301`);
  }

  const robots = await get(`https://${h}/robots.txt`);
  if (robots.code !== 200) warn.push('robots.txt absent');
  else {
    if (/^user-agent:\s*\*\s*$(?:\n(?!user-agent).*)*?^disallow:\s*\/\s*$/im.test(robots.body)) pb.push('robots.txt bloque tout (Disallow: /)');
    if (!/^sitemap:/im.test(robots.body)) warn.push('robots.txt sans ligne Sitemap:');
  }

  const urls = await sitemapUrls(h);
  if (!urls.length) pb.push('sitemap introuvable ou vide');

  let longDesc = 0;
  let longTitle = 0;
  let noAlt = 0;
  const titles = new Map<string, string[]>();
  const descs = new Map<string, string[]>();
  const pages = await pool(urls, 8, async (u) => ({ u, ...(await get(u)) }));
  for (const { u, code, final, body } of pages) {
    if (code !== 200) { pb.push(`${u} répond ${code}`); continue; }
    if (norm(final) !== norm(u)) pb.push(`${u} redirige vers ${final}`);
    const canon = body.match(/<link[^>]+rel="canonical"[^>]+href="([^"]+)"/) ?? body.match(/<link[^>]+href="([^"]+)"[^>]+rel="canonical"/);
    if (!canon) pb.push(`${u} sans canonical`);
    else if (canon[1] !== u && !(new URL(u).pathname === '/' && norm(canon[1]) === norm(u))) pb.push(`${u} canonical différente : ${canon[1]}`);
    if (/<meta[^>]+name="robots"[^>]+content="[^"]*noindex/.test(body)) warn.push(`${u} en noindex mais listée dans le sitemap`);
    const t = decode(body.match(/<title[^>]*>([^<]*)<\/title>/)?.[1] ?? '').trim();
    titles.set(t, [...(titles.get(t) ?? []), u]);
    if (t.length > maxTitle) longTitle++;
    const d = body.match(/<meta[^>]+name="description"[^>]+content="([^"]*)"/);
    if (!d) warn.push(`${u} sans meta description`);
    else {
      const dv = decode(d[1]);
      descs.set(dv, [...(descs.get(dv) ?? []), u]);
      if (dv.length > maxDesc) longDesc++;
    }
    noAlt += (body.match(/<img(?![^>]*\salt(?=[\s=>/]))[^>]*>/g) ?? []).length;
    const words = body.replace(/<(script|style)[^>]*>[\s\S]*?<\/\1>/g, ' ').replace(/<[^>]+>/g, ' ').split(/\s+/).filter(Boolean).length;
    if (words < 150) warn.push(`${u} : seulement ${words} mots dans le HTML brut`);
  }
  const dupT = [...titles.values()].filter((v) => v.length > 1).flat();
  const dupD = [...descs.values()].filter((v) => v.length > 1).flat();
  if (dupT.length) warn.push(`${dupT.length} pages partagent un title identique`);
  if (dupD.length) warn.push(`${dupD.length} pages partagent une meta description identique`);
  if ((await get(`https://${h}/llms.txt`)).code !== 200) warn.push('llms.txt absent');
  if (site.credit !== false) {
    const home = pages.find((p) => new URL(p.u).pathname === '/');
    if (home && !/href="https?:\/\/(www\.)?romainjulien\.studio/i.test(home.body)) warn.push("pas de lien RJS Studio sur l'accueil");
  }
  const k = site.indexnowKey;
  if (!k) warn.push('pas de clé IndexNow');
  else if ((await get(`https://${h}/${k}.txt`)).body.trim() !== k) pb.push('clé IndexNow non servie');
  if (longTitle) warn.push(`${longTitle}/${urls.length} title > ${maxTitle} car.`);
  if (longDesc) warn.push(`${longDesc}/${urls.length} meta descriptions > ${maxDesc} car.`);
  if (noAlt) warn.push(`${noAlt} images sans attribut alt`);

  return { ok: !pb.length, site: site.id ?? h, urls: urls.length, problems: pb, warnings: warn };
}

export function formatLive(r: LiveResult, host: string, quiet = false, max = 8): string {
  if (quiet && r.ok && !r.warnings.length) return '';
  return [
    `${r.ok ? '✅' : '❌'} ${r.site} (${host}) : ${r.urls} URL${r.ok ? '' : `, ${r.problems.length} problème(s)`}`,
    ...r.problems.slice(0, max).map((p) => `   ❌ ${p}`),
    ...(r.problems.length > max ? [`   … et ${r.problems.length - max} autre(s)`] : []),
    ...r.warnings.slice(0, max).map((w) => `   ⚠️  ${w}`),
    ...(r.warnings.length > max ? [`   … et ${r.warnings.length - max} autre(s)`] : []),
  ].join('\n');
}
