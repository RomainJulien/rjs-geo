import { readFileSync, existsSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { randomBytes } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { sitemapUrls } from './live.js';
import { type Registry, type RegistrySite, sitePath, saveRegistry } from './registry.js';

/** Commandes de portefeuille, portées de RJS-OPS/rjs.py (même usage, mêmes sorties). */

const UA = 'rjs-geo (+https://romainjulien.studio)';

export const packageVersion = (): string =>
  JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')).version;

export function list(reg: Registry, status?: string) {
  for (const s of reg.sites) {
    if (status && s.status !== status) continue;
    console.log(`${s.status.padEnd(9)} ${s.id.padEnd(22)} ${(s.host || '-').padEnd(30)} ${(s.branch ?? '').padEnd(7)} ${s.notes ?? ''}`);
  }
}

export async function indexnow(s: RegistrySite, urls?: string[]): Promise<boolean> {
  const k = s.indexnowKey;
  if (!k) { console.log(`⏭  ${s.id} : pas de clé`); return false; }
  const served = await fetch(`https://${s.host}/${k}.txt`, { headers: { 'User-Agent': UA } }).then((r) => r.text()).catch(() => '');
  if (served.trim() !== k) { console.log(`❌ ${s.id} : clé non servie, déploie d'abord`); return false; }
  const list = urls?.length ? urls : await sitemapUrls(s.host);
  const r = await fetch('https://api.indexnow.org/indexnow', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'User-Agent': UA },
    body: JSON.stringify({ host: s.host, key: k, keyLocation: `https://${s.host}/${k}.txt`, urlList: list.slice(0, 10000) }),
  });
  const ok = [200, 202].includes(r.status);
  console.log(`${ok ? '✅' : '❌'} ${s.id} : ${list.length} URL envoyées à IndexNow, réponse ${r.status}`);
  return ok;
}

export function versions(file: string, reg: Registry) {
  const latest = packageVersion();
  for (const s of reg.sites) {
    const p = sitePath(file, s);
    const lock = p && join(p, 'package-lock.json');
    if (!lock || !existsSync(lock)) continue;
    const e = JSON.parse(readFileSync(lock, 'utf8')).packages?.['node_modules/@rjs/geo'];
    if (!e) continue;
    const commit = String(e.resolved ?? '').split('#')[1]?.slice(0, 7) ?? '?';
    const ok = e.version === latest;
    console.log(`${ok ? '✅' : '⬆️ '} ${s.id.padEnd(22)} ${String(e.version).padEnd(7)} (${commit})${ok ? '' : `  → ${latest}`}`);
  }
  console.log(`\nDernière version de @rjs/geo : ${latest}`);
}

export function sync(file: string, s: RegistrySite) {
  const p = sitePath(file, s);
  if (!p || !existsSync(join(p, '.git'))) { console.log(`⏭  ${s.id} : pas de repo local`); return; }
  const r = spawnSync('git', ['-C', p, 'pull', '--rebase', '--autostash', '-q'], { encoding: 'utf8' });
  const st = spawnSync('git', ['-C', p, 'status', '-sb'], { encoding: 'utf8' }).stdout.split('\n')[0];
  console.log(`${r.status === 0 ? '✅' : '❌'} ${s.id} : ${st} ${(r.stderr ?? '').trim().slice(0, 120)}`);
}

/** Build propre (caches vidés) et seulement le bloc conseils + garde-fou. */
export function conseils(file: string, s: RegistrySite) {
  const p = sitePath(file, s);
  console.log(`════ ${s.id} ════`);
  if (!p || !existsSync(p)) { console.log('   ⏭  pas de copie locale'); return; }
  for (const d of ['dist', '.astro', 'node_modules/.vite']) rmSync(join(p, d), { recursive: true, force: true });
  const r = spawnSync('npm', ['run', 'build'], { cwd: p, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  const lines = `${r.stdout}\n${r.stderr}`.split('\n').filter((l) => /GEO\/SEO|Garde-fou|⚠️|❌|^\s+·|^\s{8}\S/.test(l));
  console.log(lines.length ? lines.join('\n') : '   ⚠️  Aucun bloc conseils : build en échec ?');
}

export function newkey(file: string, reg: Registry, s: RegistrySite) {
  if (s.indexnowKey) throw new Error(`${s.id} a déjà une clé : ${s.indexnowKey}`);
  const k = randomBytes(16).toString('hex');
  const p = sitePath(file, s);
  if (p && existsSync(join(p, 'src', 'rjs.config.ts'))) {
    console.log(`Clé ${k} : ajoute-la dans src/rjs.config.ts → indexing: { indexnowKey: '${k}' } (le pack la sert tout seul).`);
  } else if (p) {
    mkdirSync(join(p, 'public'), { recursive: true });
    writeFileSync(join(p, 'public', `${k}.txt`), k);
    console.log(`Clé ${k} créée dans public/.`);
  }
  s.indexnowKey = k;
  saveRegistry(file, reg);
  console.log(`Enregistrée dans le registre. Commit + push, puis : rjs-geo indexnow ${s.id}`);
}
