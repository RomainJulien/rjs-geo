// Plugin Netlify @rjs/geo : après un déploiement de PRODUCTION réussi, envoie à
// IndexNow (Bing, Yandex, Seznam, Naver…) uniquement les pages du sitemap dont le
// HTML a changé depuis le déploiement précédent. Premier déploiement : tout le sitemap.
//
// netlify.toml :
//   [[plugins]]
//   package = "./node_modules/@rjs/geo/netlify-plugin"
//
// Prérequis : un fichier public/<clé>.txt contenant la clé (créé par `rjs newkey <site>`).
import { readFileSync, readdirSync, existsSync, writeFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { servedUrl } from '../dist/scan.js';

const CACHE = '.rjs-indexnow-hashes.json';

const walk = (d) => readdirSync(d).flatMap((n) => {
  const p = join(d, n);
  return statSync(p).isDirectory() ? walk(p) : p.endsWith('.html') ? [p] : [];
});

const locs = (f) => [...readFileSync(f, 'utf8').matchAll(/<loc>\s*([^<\s]+)\s*<\/loc>/g)].map((m) => m[1]);

function sitemap(dir) {
  const idx = join(dir, 'sitemap-index.xml');
  const files = existsSync(idx) ? locs(idx).map((u) => join(dir, new URL(u).pathname)) : [join(dir, 'sitemap.xml')];
  return files.filter(existsSync).flatMap(locs);
}

export const onSuccess = async ({ constants, inputs, utils }) => {
  const log = (m) => console.log(`[rjs-indexnow] ${m}`);
  if (process.env.CONTEXT !== 'production') return log(`contexte « ${process.env.CONTEXT} » : rien envoyé (production seulement).`);
  const dir = constants.PUBLISH_DIR;
  const key = readdirSync(dir).find((n) => /^[0-9a-f]{32}\.txt$/.test(n) && readFileSync(join(dir, n), 'utf8').trim() === n.slice(0, 32));
  if (!key) return log('aucune clé IndexNow dans public/ : rien envoyé (lancer `rjs newkey <site>`).');
  const k = key.slice(0, 32);
  const urls = sitemap(dir);
  if (!urls.length) return log('sitemap introuvable : rien envoyé.');
  const origin = new URL(urls[0]).origin;
  const host = new URL(origin).host;

  // Empreinte de chaque page du sitemap, comparée au déploiement précédent.
  const files = new Map(walk(dir).map((f) => [servedUrl(dir, f, origin), f]));
  const hashes = {};
  for (const u of urls) {
    const f = files.get(u) ?? files.get(u + '/') ?? (u === origin ? files.get(origin + '/') : undefined);
    if (f) hashes[u] = createHash('sha1').update(readFileSync(f)).digest('hex');
  }
  let previous = null;
  if (await utils.cache.restore(CACHE)) { try { previous = JSON.parse(readFileSync(CACHE, 'utf8')); } catch { previous = null; } }
  const changed = previous ? urls.filter((u) => hashes[u] && hashes[u] !== previous[u]) : urls;
  writeFileSync(CACHE, JSON.stringify(hashes));
  await utils.cache.save(CACHE);

  if (!changed.length) return log('aucune page modifiée : rien à envoyer.');
  if (inputs.dryRun) return log(`dryRun : ${changed.length} URL seraient envoyées :\n  ${changed.join('\n  ')}`);

  // La clé doit être servie par le site en ligne (sinon IndexNow refuse).
  try {
    const live = await (await fetch(`https://${host}/${k}.txt`)).text();
    if (live.trim() !== k) return log(`clé pas encore servie sur https://${host}/${k}.txt : envoi reporté au prochain déploiement.`);
  } catch (e) { return log(`impossible de vérifier la clé en ligne (${e.message}) : rien envoyé.`); }

  const res = await fetch('https://api.indexnow.org/indexnow', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
    body: JSON.stringify({ host, key: k, keyLocation: `https://${host}/${k}.txt`, urlList: changed.slice(0, 10000) }),
  });
  log(`${changed.length} URL ${previous ? 'modifiée(s)' : '(premier envoi : tout le sitemap)'} envoyée(s) à IndexNow : réponse ${res.status}.`);
  if (![200, 202].includes(res.status)) {
    // Échec d'envoi : on oublie les empreintes pour réessayer ces URL au prochain déploiement.
    writeFileSync(CACHE, JSON.stringify(previous ?? {})); await utils.cache.save(CACHE);
    utils.status.show({ title: 'IndexNow', summary: `Envoi refusé (HTTP ${res.status}), nouvel essai au prochain déploiement.` });
  }
};
