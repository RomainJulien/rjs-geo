import { readFileSync, readdirSync, existsSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';

/**
 * Garde-fou au build : analyse le HTML GÉNÉRÉ (dist/) d'un site Astro.
 *
 * Complète `auditGeo` (qui regarde les DONNÉES) en vérifiant le RÉSULTAT :
 * - les 4 signaux d'indexation (GUIDE.md §6) :
 *   URL servie (200) == canonical == entrée sitemap == liens internes ;
 * - noindex, title/description (longueur, doublons), images sans alt ;
 * - pièges des pages villes détectables automatiquement (GUIDE.md §8) :
 *   n°1 cannibalisation home / page de la commune du siège,
 *   n°2 pages quasi identiques (templates [ville] peu différenciés),
 *   n°4 NAP du JSON-LD absent du texte visible.
 *
 * Ne vérifie PAS ce qui n'existe qu'en production (host www/non-www servi par
 * Netlify, variables d'env Netlify) : c'est le rôle de `rjs check` (RJS-OPS).
 */

export type ScanLevel = 'block' | 'warn' | 'info';
export type ScanFinding = { level: ScanLevel; code: string; message: string; urls?: string[] };
export type ScanOptions = {
  /** URL du site (Astro `site`), ex. https://www.exemple.fr */
  site: string;
  /** Longueur max conseillée des meta descriptions (Google et Bing tronquent vers 155-160). */
  maxDescription?: number;
  /** Seuil de similarité (0 à 1) au-delà duquel deux pages sont jugées quasi identiques. */
  duplicateThreshold?: number;
  /** Longueur max des <title> (défaut 65, simple conseil ; 60 avec rjs.config). */
  maxTitle?: number;
  /**
   * Gravité d'un title ou d'une description trop longs. Absent (anciens sites) :
   * description en ⚠️, title en simple conseil. Avec rjs.config : `block` par défaut.
   */
  lengthLevel?: ScanLevel;
  /** URL attendue du lien « Site réalisé par RJS Studio » (contrôle ignoré si absent). */
  creditUrl?: string;
};

type Page = {
  file: string; url: string; canonical?: string; title: string; description?: string;
  noindex: boolean; imgNoAlt: number; links: string[]; text: string; jsonld: unknown[]; h1: number;
};

export type { Page as ScannedPage };

const IGNORED_LINK = /\.(pdf|jpe?g|png|webp|avif|gif|svg|ico|xml|txt|json|mp4|webm|zip)$/i;

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((n) => {
    const p = join(dir, n);
    return statSync(p).isDirectory() ? walk(p) : p.endsWith('.html') ? [p] : [];
  });
}

/** Fichier de dist/ → URL servie par Netlify (pretty URLs). */
export function servedUrl(distDir: string, file: string, origin: string): string {
  let rel = relative(distDir, file).split(sep).join('/');
  if (rel === 'index.html') rel = '';
  else if (rel.endsWith('/index.html')) rel = rel.slice(0, -'index.html'.length);
  else rel = rel.replace(/\.html$/, '');
  return `${origin}/${rel}`;
}

const attr = (tag: string, name: string): string | undefined => {
  const m = tag.match(new RegExp(`\\b${name}\\s*=\\s*("([^"]*)"|'([^']*)')`, 'i'));
  return m ? (m[2] ?? m[3]) : undefined;
};
const decode = (s: string) =>
  s.replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;|&#x27;|&apos;/g, "'")
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&nbsp;/g, ' ');

function parse(distDir: string, file: string, origin: string): Page {
  const html = readFileSync(file, 'utf8');
  const tags = (re: RegExp) => html.match(re) ?? [];
  const metas = tags(/<meta\b[^>]*>/gi);
  const canon = tags(/<link\b[^>]*>/gi).find((t) => /rel\s*=\s*["']?canonical/i.test(t));
  const desc = metas.find((t) => /name\s*=\s*["']description["']/i.test(t));
  const robots = metas.find((t) => /name\s*=\s*["']robots["']/i.test(t));
  const title = decode((html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] ?? '').trim());
  // `alt` sans valeur (HTML minifié de alt="") = image décorative, valide.
  const imgNoAlt = tags(/<img\b[^>]*>/gi).filter((t) => !/\salt(?=[\s=>\/])/i.test(t)).length;
  const links = tags(/<a\b[^>]*>/gi).map((t) => attr(t, 'href')).filter((h): h is string => !!h);
  const jsonld: unknown[] = [];
  for (const m of html.matchAll(/<script[^>]*application\/ld\+json[^>]*>([\s\S]*?)<\/script>/gi)) {
    try { jsonld.push(JSON.parse(m[1])); } catch { /* JSON-LD invalide : ignoré ici */ }
  }
  const body = html.replace(/<head[\s\S]*?<\/head>/i, ' ').replace(/<(script|style|noscript|svg)[\s\S]*?<\/\1>/gi, ' ');
  const text = decode(body.replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim();
  return {
    file, url: servedUrl(distDir, file, origin), canonical: canon ? attr(canon, 'href') : undefined, title,
    description: desc ? decode(attr(desc, 'content') ?? '') : undefined,
    noindex: !!robots && /noindex/i.test(attr(robots, 'content') ?? ''), imgNoAlt, links, text, jsonld,
    h1: tags(/<h1\b/gi).length,
  };
}

function sitemapUrls(distDir: string): string[] | null {
  const locs = (f: string) => [...readFileSync(f, 'utf8').matchAll(/<loc>\s*([^<\s]+)\s*<\/loc>/g)].map((m) => m[1]);
  const idx = join(distDir, 'sitemap-index.xml');
  const files = existsSync(idx) ? locs(idx).map((u) => join(distDir, new URL(u).pathname)) : [join(distDir, 'sitemap.xml')];
  const urls: string[] = [];
  let found = false;
  for (const f of files) if (existsSync(f)) { found = true; urls.push(...locs(f)); }
  return found ? urls : null;
}

/** Sources déclarées dans dist/_redirects (un lien vers elles est volontaire, pas cassé). */
function redirectSources(distDir: string, origin: string): Set<string> {
  const f = join(distDir, '_redirects');
  if (!existsSync(f)) return new Set();
  return new Set(
    readFileSync(f, 'utf8').split('\n').map((l) => l.trim()).filter((l) => l && !l.startsWith('#'))
      .map((l) => l.split(/\s+/)[0]).filter((s) => s.startsWith('/')).map((s) => origin + s),
  );
}

const shingles = (t: string) => {
  const w = t.toLowerCase().split(/[^\p{L}\p{N}]+/u).filter(Boolean);
  const s = new Set<string>();
  for (let i = 0; i + 4 < w.length; i++) s.add(w.slice(i, i + 5).join(' '));
  return s;
};
const jaccard = (a: Set<string>, b: Set<string>) => {
  if (!a.size || !b.size) return 0;
  let inter = 0;
  for (const x of a) if (b.has(x)) inter++;
  return inter / (a.size + b.size - inter);
};

type Node = Record<string, any>;
function findNodes(data: unknown, pred: (n: Node) => boolean, out: Node[] = []): Node[] {
  if (Array.isArray(data)) data.forEach((d) => findNodes(d, pred, out));
  else if (data && typeof data === 'object') {
    const n = data as Node;
    if (pred(n)) out.push(n);
    Object.values(n).forEach((v) => findNodes(v, pred, out));
  }
  return out;
}

const add = (m: Map<string, Set<string>>, k: string, v: string) => { (m.get(k) ?? m.set(k, new Set()).get(k)!).add(v); };

/** Pages HTML de dist/ (hors 404), analysées. */
export function readPages(distDir: string, site: string): Page[] {
  const origin = site.replace(/\/+$/, '');
  return walk(distDir).filter((p) => !/(^|\/)404(\.html|\/index\.html)$/.test(p.split(sep).join('/'))).map((p) => parse(distDir, p, origin));
}

export function scanDist(distDir: string, opts: ScanOptions): ScanFinding[] {
  const origin = opts.site.replace(/\/+$/, '');
  const root = origin + '/';
  const maxDesc = opts.maxDescription ?? 160;
  const maxTitle = opts.maxTitle ?? 65;
  const f: ScanFinding[] = [];
  const pages = readPages(distDir, origin);
  const byUrl = new Map(pages.map((p) => [p.url, p]));
  const sitemap = sitemapUrls(distDir);
  const inSitemap = new Set(sitemap ?? []);
  const listed = (u: string) => inSitemap.has(u) || (u === root && inSitemap.has(origin));
  const indexable = pages.filter((p) => !p.noindex);
  // Site qui se masque hors domaine de prod (build local, deploy preview) : rien à auditer sur l'indexation.
  if (pages.length >= 3 && indexable.length / pages.length < 0.2) {
    return [{ level: 'info', code: 'all-noindex', message: `La quasi-totalité des pages est en noindex : build hors production (normal si le site se masque hors de ${new URL(origin).host}). Contrôles d'indexation ignorés.` }];
  }

  // Signal 2 : canonical == URL servie
  const badCanon = indexable.filter((p) => p.canonical && p.canonical !== p.url && !(p.url === root && p.canonical === origin));
  if (badCanon.length) f.push({ level: 'block', code: 'canonical', message: `${badCanon.length} page(s) dont la canonical ne pointe pas sur l'URL servie (slash, host ou .html).`, urls: badCanon.map((p) => `${p.url} → canonical ${p.canonical}`) });
  const noCanon = indexable.filter((p) => !p.canonical);
  if (noCanon.length) f.push({ level: 'warn', code: 'no-canonical', message: `${noCanon.length} page(s) sans canonical.`, urls: noCanon.map((p) => p.url) });

  // Signal 3 : sitemap == URL servies
  if (!sitemap) f.push({ level: 'block', code: 'sitemap', message: 'Aucun sitemap généré (sitemap-index.xml ou sitemap.xml).' });
  else {
    const ghost = sitemap.filter((u) => !byUrl.has(u) && !(u === origin && byUrl.has(root)));
    if (ghost.length) f.push({ level: 'block', code: 'sitemap-ghost', message: `${ghost.length} URL du sitemap ne correspondent à aucune page servie telle quelle (redirection garantie).`, urls: ghost });
    const missing = indexable.filter((p) => !listed(p.url));
    if (missing.length) f.push({ level: 'warn', code: 'sitemap-missing', message: `${missing.length} page(s) indexable(s) absente(s) du sitemap.`, urls: missing.map((p) => p.url) });
    const noidx = pages.filter((p) => p.noindex && listed(p.url));
    if (noidx.length) f.push({ level: 'warn', code: 'sitemap-noindex', message: `${noidx.length} page(s) en noindex listée(s) dans le sitemap (à filtrer dans @astrojs/sitemap).`, urls: noidx.map((p) => p.url) });
  }

  // Signal 4 : liens internes == URL servies
  const redirects = redirectSources(distDir, origin);
  const host = new URL(origin).host;
  const bare = (h: string) => h.replace(/^www\./, '');
  const wrongForm = new Map<string, Set<string>>(); const broken = new Map<string, Set<string>>();
  for (const p of pages) for (const href of p.links) {
    if (/^(mailto:|tel:|sms:|javascript:|#)/i.test(href)) continue;
    let u: URL;
    try { u = new URL(href, p.url); } catch { continue; }
    if (bare(u.host) !== bare(host) || IGNORED_LINK.test(u.pathname) || u.pathname === '/llms.txt') continue;
    const target = `${origin}${u.pathname}`;
    if (u.host !== host) { add(wrongForm, `${u.origin}${u.pathname}`, p.url); continue; }
    if (byUrl.has(target) || redirects.has(target) || redirects.has(target.replace(/\/$/, ''))) continue;
    // Fichier non-HTML généré par un endpoint (contact.vcf, flux RSS…) : présent dans dist/, donc pas cassé.
    try { const f = join(distDir, decodeURIComponent(u.pathname)); if (existsSync(f) && statSync(f).isFile()) continue; } catch { /* chemin invalide */ }
    const other = target.endsWith('/') ? target.slice(0, -1) : target + '/';
    add(byUrl.has(other) ? wrongForm : broken, target, p.url);
  }
  const show = (m: Map<string, Set<string>>) => [...m].map(([t, from]) => `${t}  (depuis ${[...from][0]}${from.size > 1 ? ` et ${from.size - 1} autre(s)` : ''})`);
  if (wrongForm.size) f.push({ level: 'block', code: 'links-redirect', message: `${wrongForm.size} lien(s) interne(s) vers une forme d'URL qui redirige (slash ou www) : chaque clic = un 301 et Google découvre la mauvaise forme.`, urls: show(wrongForm) });
  if (broken.size) f.push({ level: 'warn', code: 'links-broken', message: `${broken.size} lien(s) interne(s) vers une page inexistante.`, urls: show(broken) });

  // Titles, descriptions, alt, contenu maigre
  const dup = (key: (p: Page) => string | undefined) => {
    const m = new Map<string, string[]>();
    indexable.forEach((p) => { const k = key(p); if (k) m.set(k, [...(m.get(k) ?? []), p.url]); });
    return [...m.values()].filter((v) => v.length > 1).flat();
  };
  const dupT = dup((p) => p.title);
  if (dupT.length) f.push({ level: 'warn', code: 'title-dup', message: `${dupT.length} pages partagent un même <title>.`, urls: dupT });
  const dupD = dup((p) => p.description);
  if (dupD.length) f.push({ level: 'warn', code: 'desc-dup', message: `${dupD.length} pages partagent une même meta description.`, urls: dupD });
  const noDesc = indexable.filter((p) => !p.description);
  if (noDesc.length) f.push({ level: 'warn', code: 'desc-missing', message: `${noDesc.length} page(s) sans meta description.`, urls: noDesc.map((p) => p.url) });
  const longD = indexable.filter((p) => (p.description?.length ?? 0) > maxDesc);
  if (longD.length) f.push({ level: opts.lengthLevel ?? 'warn', code: 'desc-long', message: `${longD.length}/${indexable.length} meta descriptions > ${maxDesc} caractères (tronquées par Google et Bing).`, urls: longD.map((p) => `${p.url} (${p.description!.length})`) });
  const longT = indexable.filter((p) => p.title.length > maxTitle);
  if (longT.length) f.push({ level: opts.lengthLevel ?? 'info', code: 'title-long', message: `${longT.length}/${indexable.length} <title> > ${maxTitle} caractères (tronqués dans les résultats).`, urls: longT.map((p) => `${p.url} (${p.title.length})`) });
  const noTitle = indexable.filter((p) => !p.title);
  if (noTitle.length) f.push({ level: 'block', code: 'title-missing', message: `${noTitle.length} page(s) sans <title>.`, urls: noTitle.map((p) => p.url) });
  const badH1 = indexable.filter((p) => p.h1 !== 1);
  if (badH1.length) f.push({ level: 'warn', code: 'h1', message: `${badH1.length} page(s) sans H1 unique (zéro ou plusieurs).`, urls: badH1.map((p) => `${p.url} (${p.h1} H1)`) });
  const dash = indexable.filter((p) => p.title.includes('—') || p.description?.includes('—'));
  if (dash.length) f.push({ level: 'info', code: 'emdash', message: `${dash.length} title ou description avec un tiret cadratin (à remplacer par une virgule ou deux-points).`, urls: dash.map((p) => p.url) });
  const alt = pages.reduce((n, p) => n + p.imgNoAlt, 0);
  if (alt) f.push({ level: 'warn', code: 'alt', message: `${alt} image(s) sans attribut alt.`, urls: pages.filter((p) => p.imgNoAlt).map((p) => `${p.url} (${p.imgNoAlt})`) });
  const thin = indexable.filter((p) => p.text.split(' ').length < 150);
  if (thin.length) f.push({ level: 'info', code: 'thin', message: `${thin.length} page(s) de moins de 150 mots visibles.`, urls: thin.map((p) => p.url) });

  // FAQ balisée (FAQPage) mais questions absentes du texte visible : Google l'interdit.
  const norm = (t: string) => decode(t).replace(/[’‘]/g, "'").replace(/\s+/g, ' ').trim().toLowerCase();
  const faqHidden: string[] = [];
  for (const p of indexable) {
    const qs = findNodes(p.jsonld, (n) => n['@type'] === 'Question' && typeof n.name === 'string').map((n) => n.name as string);
    if (!qs.length) continue;
    const visible = norm(p.text);
    const miss = qs.filter((q) => !visible.includes(norm(q)));
    if (miss.length) faqHidden.push(`${p.url} : « ${miss[0]} »${miss.length > 1 ? ` et ${miss.length - 1} autre(s)` : ''}`);
  }
  if (faqHidden.length) f.push({ level: 'warn', code: 'faq-visible', message: `${faqHidden.length} page(s) dont la FAQ balisée (FAQPage) n'est pas affichée telle quelle : même liste pour l'affichage et le JSON-LD (composant <Faq>).`, urls: faqHidden });

  // GUIDE.md §8, pièges 4 (NAP visible) et 1 (commune du siège)
  const home = byUrl.get(root);
  // Lien « Site réalisé par RJS Studio » vers la bonne page métier.
  if (opts.creditUrl && home) {
    const strip = (u: string) => u.replace(/[?#].*$/, '').replace(/\/+$/, '');
    const credits = home.links.filter((h) => /^https?:\/\/(www\.)?romainjulien\.studio(\/|$)/i.test(h));
    if (!credits.length) f.push({ level: 'warn', code: 'credit', message: `Pas de lien « Site réalisé par RJS Studio » sur l'accueil (composant <RjsCredit>, ou rjs.credit: false si le client l'a refusé).` });
    else if (!credits.some((h) => strip(h) === strip(opts.creditUrl!))) f.push({ level: 'warn', code: 'credit-target', message: `Le lien RJS Studio pointe vers ${credits[0]} au lieu de ${opts.creditUrl} (page métier du site).` });
  }
  const biz = home ? findNodes(home.jsonld, (n) => !!n.address && n['@type'] !== 'PostalAddress' && typeof n.address === 'object')[0] : undefined;
  if (biz) {
    const visible = pages.map((p) => p.text).join(' ');
    const cp = biz.address.postalCode as string | undefined;
    const tel = String(biz.telephone ?? '').replace(/\D/g, '').replace(/^33/, '0');
    const miss: string[] = [];
    if (cp && !visible.replace(/\s/g, '').includes(String(cp))) miss.push(`code postal ${cp}`);
    if (tel.length >= 9 && !visible.replace(/\D/g, '').includes(tel.slice(-9))) miss.push(`téléphone ${biz.telephone}`);
    if (miss.length) f.push({ level: 'warn', code: 'nap-visible', message: `NAP du JSON-LD absent du texte visible : ${miss.join(', ')} (GUIDE.md §8, piège 4).` });
    const slug = String(biz.address.addressLocality ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
    if (slug) {
      // Segment = "<ville>" ou "<métier>-<ville>" (un seul mot devant) : évite « saint-saturnin-les-apt » pour Apt.
      const isSiege = (seg: string) => seg === slug || (seg.endsWith('-' + slug) && !seg.slice(0, -slug.length - 1).includes('-'));
      const siege = indexable.filter((p) => p.url !== root && isSiege(new URL(p.url).pathname.replace(/\/$/, '').split('/').pop()!));
      if (siege.length) f.push({ level: 'warn', code: 'cannibalisation', message: `Page dédiée à la commune du siège (${biz.address.addressLocality}) : elle concurrence la home (GUIDE.md §8, piège 1). Vérifier qu'aucune indexation n'est en cours avant de corriger.`, urls: siege.map((p) => p.url) });
    }
  }

  // GUIDE.md §8, piège 2 : quasi-doublons
  const th = opts.duplicateThreshold ?? 0.8;
  const sh = indexable.map((p) => ({ p, s: shingles(p.text) }));
  const pairs: string[] = [];
  for (let i = 0; i < sh.length; i++) for (let j = i + 1; j < sh.length; j++) {
    const sim = jaccard(sh[i].s, sh[j].s);
    if (sim >= th) pairs.push(`${sh[i].p.url} ≈ ${sh[j].p.url} (${Math.round(sim * 100)} %)`);
  }
  if (pairs.length) f.push({ level: 'warn', code: 'near-duplicate', message: `${pairs.length} paire(s) de pages quasi identiques (≥ ${Math.round(th * 100)} %) : risque de filtrage par Google (GUIDE.md §8, piège 2). Le correctif est du contenu local réel.`, urls: pairs });

  return f;
}

export function reportScan(siteName: string, findings: ScanFinding[], maxUrls = 5): void {
  const icon = { block: '❌', warn: '⚠️ ', info: '· ' } as const;
  if (!findings.length) { console.log(`\n✅ Garde-fou build, ${siteName} : HTML généré cohérent.\n`); return; }
  const n = (l: ScanLevel) => findings.filter((x) => x.level === l).length;
  console.log(`\n🛡️  Garde-fou build : ${siteName}  (${n('block')} bloquant(s), ${n('warn')} à corriger, ${n('info')} à envisager)`);
  for (const level of ['block', 'warn', 'info'] as const) for (const x of findings.filter((y) => y.level === level)) {
    console.log(`   ${icon[level]} ${x.message}`);
    for (const u of (x.urls ?? []).slice(0, maxUrls)) console.log(`        ${u}`);
    if ((x.urls?.length ?? 0) > maxUrls) console.log(`        … et ${x.urls!.length - maxUrls} autre(s)`);
  }
  console.log('');
}
