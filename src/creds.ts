import { readFileSync, existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

/**
 * Accès aux APIs, rangés hors des dépôts (jamais commités) :
 *   ~/.config/rjs-geo/google-service-account.json   (ou RJS_GOOGLE_SA = chemin)
 *   ~/.config/rjs-geo/bing-api-key.txt               (ou RJS_BING_KEY = la clé)
 */
export const CONFIG_DIR = join(homedir(), '.config', 'rjs-geo');
export const GOOGLE_SA_FILE = process.env.RJS_GOOGLE_SA ?? join(CONFIG_DIR, 'google-service-account.json');
export const BING_KEY_FILE = join(CONFIG_DIR, 'bing-api-key.txt');

export type ServiceAccount = { client_email: string; private_key: string };

export function googleServiceAccount(): ServiceAccount | null {
  if (!existsSync(GOOGLE_SA_FILE)) return null;
  const sa = JSON.parse(readFileSync(GOOGLE_SA_FILE, 'utf8'));
  if (!sa.client_email || !sa.private_key) throw new Error(`${GOOGLE_SA_FILE} : fichier de clé de compte de service invalide (client_email ou private_key absent).`);
  return sa;
}

export function bingKey(): string | null {
  if (process.env.RJS_BING_KEY) return process.env.RJS_BING_KEY.trim();
  return existsSync(BING_KEY_FILE) ? readFileSync(BING_KEY_FILE, 'utf8').trim() || null : null;
}
