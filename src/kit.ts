import { writeFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { buildCitationKit, napFromJsonLd, familyOf, type Family, FAMILY_LABEL } from './citations.js';
import { searchConsole } from './google.js';
import { type RegistrySite, sitePath } from './registry.js';

const UA = 'rjs-geo (+https://romainjulien.studio)';

/** JSON-LD de l'accueil en ligne. */
async function homeJsonLd(host: string): Promise<unknown[]> {
  const html = await fetch(`https://${host}/`, { headers: { 'User-Agent': UA }, signal: AbortSignal.timeout(20000) }).then((r) => r.text());
  const out: unknown[] = [];
  for (const m of html.matchAll(/<script[^>]*application\/ld\+json[^>]*>([\s\S]*?)<\/script>/gi)) {
    try { out.push(JSON.parse(m[1])); } catch { /* bloc invalide ignoré */ }
  }
  return out;
}

/**
 * Écrit le kit citations du site. Emplacement : dossier du client (au-dessus du
 * code, hors dépôt git), sinon le dossier courant.
 */
export async function citations(file: string, s: RegistrySite, opts: { family?: string; out?: string; metier?: string }) {
  const nap = napFromJsonLd(await homeJsonLd(s.host), `https://${s.host}/`);
  if (!nap) throw new Error(`Aucune entreprise trouvée dans le JSON-LD de https://${s.host}/ : le site est-il sur @rjs/geo ?`);
  const family = (opts.family && opts.family in FAMILY_LABEL ? opts.family : familyOf({ metier: opts.metier, types: nap.types })) as Family;
  const code = sitePath(file, s);
  const out = opts.out ?? (code && existsSync(code) ? join(dirname(code), `CITATIONS ${s.id}.md`) : `CITATIONS ${s.id}.md`);
  writeFileSync(out, buildCitationKit({ nap, family, host: s.host }));
  const holes = (buildCitationKit({ nap, family, host: s.host }).match(/à compléter/g) ?? []).length;
  console.log(`✅ Kit citations de ${s.id} (${FAMILY_LABEL[family]}) : ${out}${holes ? `\n   ${holes} champ(s) à compléter : ils manquent aussi dans le JSON-LD du site, à ajouter dans sa config.` : ''}`);
}

/** Sitemaps déclarés dans Search Console, avec ceux qui ne correspondent plus au site. Suppression sur demande. */
export async function sitemaps(s: RegistrySite, remove?: string) {
  const { gsc, missing } = searchConsole();
  if (!gsc) throw new Error(`Google : ${missing}`);
  const prop = await gsc.propertyFor(s.host);
  if (!prop) throw new Error(`Aucune propriété Search Console accessible pour ${s.host}.`);
  if (remove) {
    await gsc.deleteSitemap(prop.siteUrl, remove);
    console.log(`🗑  ${s.id} : ${remove} retiré de Search Console (il peut être resoumis à tout moment).`);
    return;
  }
  const current = `https://${s.host}/sitemap-index.xml`;
  console.log(`════ ${s.id} (${prop.siteUrl}) ════`);
  for (const m of await gsc.sitemaps(prop.siteUrl)) {
    const ok = m.path === current;
    const why = ok ? 'actuel' : !m.path.startsWith(`https://${s.host}/`) ? 'autre adresse (http, www…) : obsolète' : /sitemap-\d+\.xml$/.test(m.path) ? 'sous-sitemap déjà inclus dans l\'index : doublon' : !/\.xml$/.test(m.path) ? 'n\'est pas un sitemap' : 'ancien fichier';
    console.log(`   ${ok ? '✅' : '🗑 '} ${m.path}  (${why}${Number(m.errors) ? `, ${m.errors} erreur(s)` : ''})`);
  }
}
