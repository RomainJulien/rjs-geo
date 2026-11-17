import { createSign } from 'node:crypto';
import { createServer } from 'node:http';
import { writeFileSync, mkdirSync, chmodSync } from 'node:fs';
import { spawn } from 'node:child_process';
import {
  type ServiceAccount, type OAuthClient, googleServiceAccount, googleOAuthClient, googleRefreshToken,
  CONFIG_DIR, GOOGLE_CLIENT_FILE, GOOGLE_TOKEN_FILE, GOOGLE_SA_FILE,
} from './creds.js';

/**
 * Search Console (API webmasters v3). Deux façons de se connecter :
 * - OAuth en ton nom (recommandé, `rjs-geo google-login` une fois) : accès à
 *   toutes les propriétés dont tu es propriétaire, rien à faire par site ;
 * - compte de service : à ajouter comme propriétaire de chaque propriété.
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

type GoogleAuth = { kind: 'sa'; sa: ServiceAccount } | { kind: 'oauth'; client: OAuthClient; refreshToken: string };

/** Client Search Console prêt à l'emploi, ou la raison pour laquelle il n'y en a pas. */
export function searchConsole(): { gsc?: SearchConsole; missing?: string } {
  const client = googleOAuthClient();
  const token = googleRefreshToken();
  if (client && token) return { gsc: new SearchConsole({ kind: 'oauth', client, refreshToken: token }) };
  const sa = googleServiceAccount();
  if (sa) return { gsc: new SearchConsole({ kind: 'sa', sa }) };
  if (client) return { missing: 'connexion Google à faire une fois : rjs-geo google-login' };
  return { missing: `accès absent (${GOOGLE_CLIENT_FILE}, ou ${GOOGLE_SA_FILE})` };
}

export class SearchConsole {
  private token?: string;
  constructor(private auth_: GoogleAuth) {}
  /** Qui ajouter comme propriétaire si une propriété manque. */
  get who() { return this.auth_.kind === 'sa' ? this.auth_.sa.client_email : 'ton compte Google (celui de google-login)'; }

  private async auth(): Promise<string> {
    if (this.token) return this.token;
    const a = this.auth_;
    const body =
      a.kind === 'sa'
        ? new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion: serviceAccountJwt(a.sa) })
        : new URLSearchParams({ grant_type: 'refresh_token', refresh_token: a.refreshToken, client_id: a.client.client_id, client_secret: a.client.client_secret });
    const r = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body,
    });
    const j = (await r.json()) as { access_token?: string; error_description?: string; error?: string };
    if (!j.access_token) {
      const again = a.kind === 'oauth' ? ' Refaire : rjs-geo google-login' : '';
      throw new Error(`Google : authentification refusée (${j.error_description ?? j.error ?? r.status}).${again}`);
    }
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

  deleteSitemap(property: string, feed: string) {
    return this.call<void>('DELETE', `/sites/${encodeURIComponent(property)}/sitemaps/${encodeURIComponent(feed)}`);
  }

  async sitemaps(property: string) {
    type S = { path: string; lastSubmitted?: string; lastDownloaded?: string; isPending?: boolean; errors?: string; warnings?: string; contents?: { type: string; submitted?: string }[] };
    return (await this.call<{ sitemap?: S[] }>('GET', `/sites/${encodeURIComponent(property)}/sitemaps`)).sitemap ?? [];
  }
}

/**
 * Connexion OAuth une fois pour toutes : ouvre le navigateur, tu choisis ton
 * compte et acceptes, le jeton de renouvellement est rangé dans
 * ~/.config/rjs-geo/google-token.json (lisible par toi seul).
 */
export async function googleLogin(): Promise<void> {
  const client = googleOAuthClient();
  if (!client) throw new Error(`Fichier client OAuth absent : ${GOOGLE_CLIENT_FILE} (Google Cloud > Clients > Application de bureau > télécharger le JSON).`);
  const code = await new Promise<{ code: string; redirect: string }>((resolveCode, reject) => {
    const server = createServer((req, res) => {
      const u = new URL(req.url ?? '/', 'http://127.0.0.1');
      const c = u.searchParams.get('code');
      const err = u.searchParams.get('error');
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(c ? '<h1>Code reçu.</h1><p>Tu peux fermer cet onglet : le terminal confirme la connexion.</p>' : `<h1>Connexion refusée</h1><p>${err ?? ''}</p>`);
      server.close();
      if (c) resolveCode({ code: c, redirect });
      else reject(new Error(`Google a refusé la connexion (${err ?? 'sans code'}).`));
    });
    let redirect = '';
    server.listen(0, '127.0.0.1', () => {
      const port = (server.address() as { port: number }).port;
      redirect = `http://127.0.0.1:${port}`;
      const url = 'https://accounts.google.com/o/oauth2/v2/auth?' + new URLSearchParams({
        client_id: client.client_id, redirect_uri: redirect, response_type: 'code', scope: SCOPE, access_type: 'offline', prompt: 'consent',
      });
      console.log(`Ouverture du navigateur pour la connexion Google…\nSi rien ne s'ouvre, colle cette adresse dans ton navigateur :\n${url}\n`);
      spawn(process.platform === 'darwin' ? 'open' : 'xdg-open', [url], { stdio: 'ignore', detached: true }).on('error', () => {});
    });
    setTimeout(() => { server.close(); reject(new Error('Délai dépassé (5 min) : relancer rjs-geo google-login.')); }, 300_000).unref();
  });
  const r = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'authorization_code', code: code.code, redirect_uri: code.redirect, client_id: client.client_id, client_secret: client.client_secret }),
  });
  const j = (await r.json()) as { refresh_token?: string; error_description?: string; error?: string };
  if (!j.refresh_token) throw new Error(`Google n'a pas renvoyé de jeton de renouvellement (${j.error_description ?? j.error ?? r.status}).`);
  mkdirSync(CONFIG_DIR, { recursive: true });
  writeFileSync(GOOGLE_TOKEN_FILE, JSON.stringify({ refresh_token: j.refresh_token, saved: new Date().toISOString() }));
  chmodSync(GOOGLE_TOKEN_FILE, 0o600);
  const sites = await new SearchConsole({ kind: 'oauth', client, refreshToken: j.refresh_token }).sites();
  console.log(`✅ Connexion Google enregistrée (${GOOGLE_TOKEN_FILE}). ${sites.length} propriété(s) Search Console accessibles.`);
}
