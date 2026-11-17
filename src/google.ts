import { createSign } from 'node:crypto';
import type { ServiceAccount } from './creds.js';

/**
 * Search Console (API webmasters v3) avec un compte de service.
 * Le compte de service doit être ajouté UNE fois comme propriétaire de chaque
 * propriété (Search Console > Paramètres > Utilisateurs et autorisations).
 */
const API = 'https://www.googleapis.com/webmasters/v3';
const SCOPE = 'https://www.googleapis.com/auth/webmasters';
const b64url = (s: string | Buffer) => Buffer.from(s).toString('base64url');

/** JWT signé RS256 pour l'échange contre un jeton d'accès (exporté pour les tests). */
export function serviceAccountJwt(sa: ServiceAccount, now = Math.floor(Date.now() / 1000)): string {
  const head = b64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const claim = b64url(JSON.stringify({ iss: sa.client_email, scope: SCOPE, aud: 'https://oauth2.googleapis.com/token', iat: now, exp: now + 3600 }));
  const sig = createSign('RSA-SHA256').update(`${head}.${claim}`).sign(sa.private_key);
  return `${head}.${claim}.${b64url(sig)}`;
}

export class SearchConsole {
  private token?: string;
  constructor(private sa: ServiceAccount) {}
  get email() { return this.sa.client_email; }

  private async auth(): Promise<string> {
    if (this.token) return this.token;
    const r = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion: serviceAccountJwt(this.sa) }),
    });
    const j = (await r.json()) as { access_token?: string; error_description?: string; error?: string };
    if (!j.access_token) throw new Error(`Google : authentification refusée (${j.error_description ?? j.error ?? r.status}).`);
    return (this.token = j.access_token);
  }

  private async call<T>(method: string, path: string): Promise<T> {
    const r = await fetch(API + path, { method, headers: { Authorization: `Bearer ${await this.auth()}` } });
    if (!r.ok) {
      const j = (await r.json().catch(() => ({}))) as { error?: { message?: string } };
      throw new Error(`Search Console ${method} ${path} : HTTP ${r.status} ${j.error?.message ?? ''}`.trim());
    }
    return (r.status === 204 ? undefined : await r.json().catch(() => undefined)) as T;
  }

  async sites(): Promise<{ siteUrl: string; permissionLevel: string }[]> {
    return (await this.call<{ siteEntry?: { siteUrl: string; permissionLevel: string }[] }>('GET', '/sites')).siteEntry ?? [];
  }

  /** Propriété accessible pour ce host : domaine (sc-domain:) d'abord, puis préfixes d'URL. */
  async propertyFor(host: string) {
    const bare = host.replace(/^www\./, '');
    const wanted = [`sc-domain:${bare}`, `https://${host}/`, `https://${bare}/`, `https://www.${bare}/`];
    const all = await this.sites();
    for (const w of wanted) {
      const s = all.find((x) => x.siteUrl === w && x.permissionLevel !== 'siteUnverifiedUser');
      if (s) return s;
    }
    return undefined;
  }

  submitSitemap(property: string, feed: string) {
    return this.call<void>('PUT', `/sites/${encodeURIComponent(property)}/sitemaps/${encodeURIComponent(feed)}`);
  }

  async sitemaps(property: string) {
    type S = { path: string; lastSubmitted?: string; lastDownloaded?: string; isPending?: boolean; errors?: string; warnings?: string; contents?: { type: string; submitted?: string }[] };
    return (await this.call<{ sitemap?: S[] }>('GET', `/sites/${encodeURIComponent(property)}/sitemaps`)).sitemap ?? [];
  }
}
