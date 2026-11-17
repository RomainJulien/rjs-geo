#!/usr/bin/env node
/**
 * rjs-geo : le pack SEO/GEO en ligne de commande (remplace RJS-OPS/rjs.py).
 * Le lanceur RJS-OPS/rjs pose RJS_REGISTRY, d'où `./rjs check all` etc.
 */
import { existsSync, readFileSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { scanDist, reportScan, type ScanOptions } from './scan.js';
import { checkLive, formatLive } from './live.js';
import { registryPath, loadRegistry, pick } from './registry.js';
import { list, indexnow, versions, sync, conseils, newkey, packageVersion } from './ops.js';
import { launch, status } from './launch.js';
import { init } from './init.js';
import { googleLogin } from './google.js';
import { citations, sitemaps } from './kit.js';
import { addLink, linksReport, checkLinks } from './links.js';

const HELP = `rjs-geo ${packageVersion()} : pack SEO/GEO RJS Studio

Un site (à lancer depuis sa racine)
  init [--metier couvreur] [--host www.x.fr] [--id x]   prépare src/rjs.config.ts (+ registre si --id)
  check                                                 garde-fou sur le dernier build (dist/)
  check --live <host> [--key K]                         contrôle en production

Portefeuille (registre : --registry sites.json ou RJS_REGISTRY)
  list [prod|dev|abandonne]
  check <id|all> [--quiet]        contrôle en production
  launch <id> [--force]           contrôle, puis Google + Bing + IndexNow (mise en ligne)
  status <id|all>                 état Search Console et Bing (sitemaps, vérification, liens)
  citations <id> [--famille f]    kit citations (fiche NAP + annuaires du métier) dans le dossier du client
  links <id|all>                  vérifie les liens obtenus (annuaires, partenaires)
  links add <id> <url> [--source "PagesJaunes"]   ajoute un lien à suivre
  sitemaps <id> [--remove <url>]  sitemaps déclarés dans Search Console, retrait d'un sitemap obsolète
  indexnow <id|all> [URL …]       envoie le sitemap (ou ces URL) à IndexNow
  versions                        version de @rjs/geo de chaque site
  conseils <id|all>               build propre local + conseils et garde-fou
  sync [id|all]                   git pull --rebase des copies locales
  newkey <id>                     nouvelle clé IndexNow

Accès aux APIs (une fois, hors dépôts, dans ~/.config/rjs-geo/) :
  google-oauth-client.json puis  rjs-geo google-login     (ou google-service-account.json)
  bing-api-key.txt`;

const args = process.argv.slice(2);
const flag = (name: string) => {
  const i = args.indexOf(name);
  if (i < 0) return undefined;
  const v = args[i + 1];
  const has = v !== undefined && !v.startsWith('--');
  args.splice(i, has ? 2 : 1);
  return has ? v : '';
};

async function main() {
  const cmd = args.shift();
  const quiet = flag('--quiet') !== undefined;
  const force = flag('--force') !== undefined;
  const regFlag = flag('--registry');
  const reg = () => {
    const file = registryPath(regFlag);
    return { file, reg: loadRegistry(file) };
  };

  switch (cmd) {
    case 'check': {
      const live = flag('--live');
      const key = flag('--key');
      if (live) {
        const r = await checkLive({ host: live, indexnowKey: key || undefined });
        console.log(formatLive(r, live));
        return r.ok ? 0 : 1;
      }
      if (args[0] || regFlag !== undefined) {
        const { reg: r } = reg();
        const sites = pick(r, args[0]);
        const results = [];
        for (let i = 0; i < sites.length; i += 4) results.push(...(await Promise.all(sites.slice(i, i + 4).map((s) => checkLive(s)))));
        for (const [i, s] of sites.entries()) {
          if (!s.links?.length) continue;
          const lost = (await checkLinks(s)).filter((l) => l.status === 'perdu');
          if (lost.length) results[i].warnings.push(`${lost.length} lien(s) obtenu(s) disparu(s) : ${lost.map((l) => l.source ?? l.url).join(', ')}`);
        }
        results.forEach((x, i) => { const t = formatLive(x, sites[i].host, quiet); if (t) console.log(t); });
        const ok = results.filter((x) => x.ok).length;
        console.log(`\n${ok}/${results.length} sites sans problème bloquant.`);
        return ok === results.length ? 0 : 1;
      }
      return checkBuild();
    }
    case 'init': {
      const id = flag('--id');
      const opts = { metier: flag('--metier'), host: flag('--host'), id };
      if (id) { const { file, reg: r } = reg(); init(process.cwd(), { ...opts, registryFile: file, registry: r }); }
      else init(process.cwd(), opts);
      return 0;
    }
    case 'google-login': await googleLogin(); return 0;
    case 'citations': {
      const famille = flag('--famille');
      const out = flag('--out');
      const { file, reg: r } = reg();
      await citations(file, pick(r, args[0])[0], { family: famille || undefined, out: out || undefined });
      return 0;
    }
    case 'links': {
      const { file, reg: r } = reg();
      if (args[0] === 'add') {
        const source = flag('--source');
        if (!args[1] || !args[2]) throw new Error('Usage : links add <site> <adresse de la page> [--source "Annuaire"]');
        addLink(file, r, pick(r, args[1])[0], args[2], source || undefined);
        return 0;
      }
      await linksReport(file, r, pick(r, args[0]));
      return 0;
    }
    case 'sitemaps': {
      const remove = flag('--remove');
      const { reg: r } = reg();
      await sitemaps(pick(r, args[0])[0], remove || undefined);
      return 0;
    }
    case 'list': list(reg().reg, args[0]); return 0;
    case 'launch': {
      if (!args[0] || args[0] === 'all') throw new Error('launch se fait site par site : rjs-geo launch <id>');
      const { file, reg: r } = reg();
      return (await launch(file, r, pick(r, args[0])[0], { force })) ? 0 : 1;
    }
    case 'status': { const { reg: r } = reg(); for (const s of pick(r, args[0])) await status(s); return 0; }
    case 'indexnow': {
      const { reg: r } = reg();
      const sites = pick(r, args[0]);
      const urls = args.slice(1);
      if (urls.length && sites.length > 1) throw new Error('Des URL précises ne s\'envoient que pour un seul site.');
      let ok = true;
      for (const s of sites) ok = (await indexnow(s, urls)) && ok;
      return ok ? 0 : 1;
    }
    case 'versions': { const { file, reg: r } = reg(); versions(file, r); return 0; }
    case 'conseils': { const { file, reg: r } = reg(); for (const s of pick(r, args[0])) conseils(file, s); return 0; }
    case 'sync': { const { file, reg: r } = reg(); for (const s of pick(r, args[0])) sync(file, s); return 0; }
    case 'newkey': { const { file, reg: r } = reg(); newkey(file, r, pick(r, args[0])[0]); return 0; }
    case undefined: case 'help': case '-h': case '--help': console.log(HELP); return 0;
    default: console.log(HELP); return 1;
  }
}

/** Dernier build : réglages écrits par l'intégration dans .astro/rjs-geo.json. */
function checkBuild(): number {
  const cwd = process.cwd();
  const saved = join(cwd, '.astro', 'rjs-geo.json');
  let opts: ScanOptions & { distDir?: string };
  if (existsSync(saved)) opts = JSON.parse(readFileSync(saved, 'utf8'));
  else {
    const home = join(cwd, 'dist', 'index.html');
    const canon = existsSync(home) ? readFileSync(home, 'utf8').match(/rel="canonical"[^>]*href="([^"]+)"|href="([^"]+)"[^>]*rel="canonical"/) : null;
    const site = canon ? new URL(canon[1] ?? canon[2]).origin : '';
    if (!site) throw new Error('Pas de build analysable : lancer `npm run build` (dist/ et .astro/rjs-geo.json absents).');
    opts = { site };
  }
  const distDir = resolve(opts.distDir ?? join(cwd, 'dist'));
  if (!existsSync(distDir)) throw new Error(`${distDir} introuvable : lancer \`npm run build\`.`);
  const findings = scanDist(distDir, opts);
  reportScan(new URL(opts.site).host, findings);
  return findings.some((f) => f.level === 'block') ? 1 : 0;
}

main().then(
  (code) => process.exit(code),
  (e) => { console.error(`❌ ${e instanceof Error ? e.message : e}`); process.exit(1); },
);
