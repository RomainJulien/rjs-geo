import { type Registry, type RegistrySite, saveRegistry } from './registry.js';

/**
 * Suivi des liens obtenus (annuaires, partenaires, presse) : on enregistre
 * l'adresse de la page qui fait le lien, le contrôle vérifie ensuite qu'elle
 * existe toujours et pointe bien vers le site. Plus fiable que Bing, dont les
 * données de liens arrivent des semaines après.
 */
export type TrackedLink = { url: string; source?: string; added: string; status?: 'ok' | 'perdu' | 'injoignable'; checked?: string };

const UA = 'Mozilla/5.0 (compatible; rjs-geo; +https://romainjulien.studio)';
const today = () => new Date().toISOString().slice(0, 10);

export function addLink(file: string, reg: Registry, s: RegistrySite, url: string, source?: string) {
  new URL(url); // adresse valide, sinon erreur claire
  const links = (s.links ??= []);
  if (links.some((l) => l.url === url)) { console.log(`(déjà suivi : ${url})`); return; }
  links.push({ url, ...(source ? { source } : {}), added: today() });
  saveRegistry(file, reg);
  console.log(`✅ ${s.id} : lien suivi depuis ${source ?? new URL(url).host} (${links.length} au total).`);
}

/** Vérifie chaque page : présente, et contient un lien vers le domaine du site. */
export async function checkLinks(s: RegistrySite): Promise<TrackedLink[]> {
  const bare = s.host.replace(/^www\./, '').replace(/\./g, '\\.');
  const re = new RegExp(`href=["']?https?://(www\\.)?${bare}`, 'i');
  for (const l of s.links ?? []) {
    try {
      const r = await fetch(l.url, { headers: { 'User-Agent': UA }, signal: AbortSignal.timeout(20000) });
      const body = r.ok ? await r.text() : '';
      l.status = !r.ok ? 'injoignable' : re.test(body) ? 'ok' : 'perdu';
    } catch { l.status = 'injoignable'; }
    l.checked = today();
  }
  return s.links ?? [];
}

export async function linksReport(file: string, reg: Registry, sites: RegistrySite[], save = true) {
  for (const s of sites) {
    const links = await checkLinks(s);
    if (!links.length) { console.log(`· ${s.id} : aucun lien suivi (kit : ./rjs citations ${s.id})`); continue; }
    const ok = links.filter((l) => l.status === 'ok').length;
    console.log(`${ok === links.length ? '✅' : '⚠️ '} ${s.id} : ${ok}/${links.length} lien(s) en place`);
    for (const l of links.filter((x) => x.status !== 'ok')) console.log(`   ${l.status === 'perdu' ? '❌ lien disparu' : '⚠️  page injoignable'} : ${l.source ? `${l.source}, ` : ''}${l.url}`);
  }
  if (save) saveRegistry(file, reg);
}
