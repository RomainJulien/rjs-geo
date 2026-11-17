import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';

/**
 * Registre des sites (RJS-OPS/sites.json) : la seule liste du portefeuille.
 * Emplacement : option --registry, sinon variable RJS_REGISTRY.
 * Les chemins `path` sont relatifs à WorkDEV (RJS_WORKDEV, sinon deux dossiers
 * au-dessus du registre, comme RJS-OPS dans WORKS AGENCE).
 */
export type RegistrySite = {
  id: string;
  client?: string;
  host: string;
  bingProperty?: string;
  repo?: string;
  branch?: string;
  path?: string;
  status: 'prod' | 'dev' | 'abandonne' | string;
  indexnowKey?: string;
  credit?: boolean;
  notes?: string;
  launch?: Record<string, string>;
};
export type Registry = { _doc?: string; github?: string; sites: RegistrySite[] };

export function registryPath(explicit?: string): string {
  const p = explicit || process.env.RJS_REGISTRY;
  if (!p) throw new Error('Registre introuvable : --registry <sites.json> ou variable RJS_REGISTRY (le lanceur RJS-OPS/rjs la pose).');
  const abs = resolve(p);
  if (!existsSync(abs)) throw new Error(`Registre introuvable : ${abs}`);
  return abs;
}

export const loadRegistry = (file: string): Registry => JSON.parse(readFileSync(file, 'utf8'));
export const saveRegistry = (file: string, reg: Registry) => writeFileSync(file, JSON.stringify(reg, null, 2) + '\n');

export const workdev = (file: string) => process.env.RJS_WORKDEV ?? resolve(dirname(file), '..', '..');
export const sitePath = (file: string, s: RegistrySite) => (s.path ? join(workdev(file), s.path) : undefined);

/** `all` (ou rien) = sites du statut demandé ; sinon id, host ou host sans www. */
export function pick(reg: Registry, arg: string | undefined, status = 'prod'): RegistrySite[] {
  if (!arg || arg === 'all') return reg.sites.filter((s) => (s.status ?? 'prod') === status);
  const found = reg.sites.filter((s) => [s.id, s.host, s.host?.replace(/^www\./, '')].includes(arg));
  if (!found.length) throw new Error(`Site inconnu : ${arg} (voir « list »)`);
  return found;
}
