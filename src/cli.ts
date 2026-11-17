#!/usr/bin/env node
/**
 * rjs-geo : checklist avant et après mise en ligne.
 *
 *   rjs-geo check                         dernier build (dist/) du site courant, mêmes règles qu'au build
 *   rjs-geo check --live <host> [--key K] le site en production
 *   rjs-geo check --registry <sites.json> [id|all] [--quiet]
 *                                          plusieurs sites en production (registre RJS-OPS, ou RJS_REGISTRY)
 *
 * Code de sortie 1 s'il reste un problème bloquant : utilisable dans une
 * tâche planifiée ou avant un `git push`.
 */
import { existsSync, readFileSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { scanDist, reportScan, type ScanOptions } from './scan.js';
import { checkLive, formatLive, type LiveSite } from './live.js';

const HELP = `rjs-geo check                          dernier build (dist/) du site courant
rjs-geo check --live <host> [--key K]  site en production
rjs-geo check --registry <sites.json> [id|all] [--quiet]
                                       sites en production du registre (ou variable RJS_REGISTRY)`;

const args = process.argv.slice(2);
const flag = (name: string) => {
  const i = args.indexOf(name);
  if (i < 0) return undefined;
  const v = args[i + 1];
  args.splice(i, v && !v.startsWith('--') ? 2 : 1);
  return v && !v.startsWith('--') ? v : '';
};

async function main() {
  const cmd = args.shift();
  if (cmd !== 'check') {
    console.log(HELP);
    process.exit(cmd ? 1 : 0);
  }
  const quiet = flag('--quiet') !== undefined;
  const live = flag('--live');
  const key = flag('--key');
  const registry = flag('--registry');

  if (live) {
    const r = await checkLive({ host: live, indexnowKey: key || undefined });
    console.log(formatLive(r, live));
    process.exit(r.ok ? 0 : 1);
  }

  if (registry !== undefined) {
    const file = registry || process.env.RJS_REGISTRY;
    if (!file || !existsSync(file)) throw new Error('Registre introuvable : --registry <sites.json> ou RJS_REGISTRY.');
    const all: (LiveSite & { status?: string; id: string })[] = JSON.parse(readFileSync(file, 'utf8')).sites;
    const want = args[0] ?? 'all';
    const sites =
      want === 'all'
        ? all.filter((s) => (s.status ?? 'prod') === 'prod')
        : all.filter((s) => [s.id, s.host, s.host?.replace(/^www\./, '')].includes(want));
    if (!sites.length) throw new Error(`Site inconnu : ${want}`);
    const results = [];
    for (let i = 0; i < sites.length; i += 4) {
      results.push(...(await Promise.all(sites.slice(i, i + 4).map((s) => checkLive(s)))));
    }
    results.forEach((r, i) => {
      const txt = formatLive(r, sites[i].host, quiet);
      if (txt) console.log(txt);
    });
    const ok = results.filter((r) => r.ok).length;
    console.log(`\n${ok}/${results.length} site(s) sans problème bloquant.`);
    process.exit(ok === results.length ? 0 : 1);
  }

  // Dernier build : réglages écrits par l'intégration dans .astro/rjs-geo.json.
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
  const distDir = resolve(args[0] ?? opts.distDir ?? join(cwd, 'dist'));
  if (!existsSync(distDir)) throw new Error(`${distDir} introuvable : lancer \`npm run build\`.`);
  const findings = scanDist(distDir, opts);
  reportScan(new URL(opts.site).host, findings);
  process.exit(findings.some((f) => f.level === 'block') ? 1 : 0);
}

main().catch((e) => {
  console.error(`❌ ${e instanceof Error ? e.message : e}`);
  process.exit(1);
});
