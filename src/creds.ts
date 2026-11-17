import { readFileSync, existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

/**
 * Accès aux APIs, rangés hors des dépôts (jamais commités) :
 *   Google, au choix :
 *     · OAuth (recommandé) : ~/.config/rjs-geo/google-oauth-client.json (client
 *       « Application de bureau ») + google-token.json écrit par `rjs-geo google-login` ;
 *       le CLI agit en ton nom, donc sur toutes tes propriétés Search Console ;
 *     · compte de service : google-service-account.json (ou RJS_GOOGLE_SA = chemin),
 *       à ajouter comme propriétaire de chaque propriété ;
 *   Bing : ~/.config/rjs-geo/bing-api-key.txt (ou RJS_BING_KEY = la clé).
 */
export const CONFIG_DIR = join(homedir(), '.config', 'rjs-geo');
export const GOOGLE_SA_FILE = process.env.RJS_GOOGLE_SA ?? join(CONFIG_DIR, 'google-service-account.json');
export const BING_KEY_FILE = join(CONFIG_DIR, 'bing-api-key.txt');
export const GOOGLE_CLIENT_FILE = join(CONFIG_DIR, 'google-oauth-client.json');
export const GOOGLE_TOKEN_FILE = join(CONFIG_DIR, 'google-token.json');

export type OAuthClient = { client_id: string; client_secret: string };

/** Fichier client OAuth téléchargé depuis Google Cloud ({ installed: {...} } ou { web: {...} }). */
export function googleOAuthClient(): OAuthClient | null {
  if (!existsSync(GOOGLE_CLIENT_FILE)) return null;
  const j = JSON.parse(readFileSync(GOOGLE_CLIENT_FILE, 'utf8'));
  const c = j.installed ?? j.web ?? j;
  if (!c.client_id || !c.client_secret) throw new Error(`${GOOGLE_CLIENT_FILE} : fichier client OAuth invalide (client_id ou client_secret absent).`);
  return { client_id: c.client_id, client_secret: c.client_secret };
}

export function googleRefreshToken(): string | null {
  if (!existsSync(GOOGLE_TOKEN_FILE)) return null;
  return JSON.parse(readFileSync(GOOGLE_TOKEN_FILE, 'utf8')).refresh_token ?? null;
}

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
