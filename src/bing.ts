/**
 * Bing Webmaster Tools, API JSON avec la clé du compte (une seule clé pour
 * toutes les propriétés). Réponses enveloppées dans { d: … }.
 */
const API = 'https://ssl.bing.com/webmaster/api.svc/json';

export type BingSite = { Url: string; IsVerified: boolean; AuthenticationCode?: string; DnsVerificationCode?: string };

export class BingWebmaster {
  constructor(private key: string) {}

  private async call<T>(method: string, opts: { get?: Record<string, string>; post?: object } = {}): Promise<T> {
    const qs = new URLSearchParams({ ...(opts.get ?? {}), apikey: this.key });
    const r = await fetch(`${API}/${method}?${qs}`, {
      method: opts.post ? 'POST' : 'GET',
      headers: { 'Content-Type': 'application/json; charset=utf-8' },
      ...(opts.post ? { body: JSON.stringify(opts.post) } : {}),
    });
    const text = await r.text();
    if (!r.ok) throw new Error(`Bing ${method} : HTTP ${r.status} ${text.slice(0, 200).replace(this.key, '…')}`);
    return (text ? JSON.parse(text).d : undefined) as T;
  }

  sites() { return this.call<BingSite[]>('GetUserSites').then((d) => d ?? []); }

  /** Propriété Bing du site : bingProperty du registre, sinon https://host/ ou sans www. */
  async siteFor(host: string, property?: string): Promise<BingSite | undefined> {
    const bare = host.replace(/^www\./, '');
    const wanted = [property, `https://${host}/`, `https://${bare}/`, `https://www.${bare}/`].filter(Boolean).map((u) => u!.replace(/\/?$/, '/'));
    const all = await this.sites();
    return wanted.map((w) => all.find((s) => s.Url.replace(/\/?$/, '/') === w)).find(Boolean);
  }

  addSite(siteUrl: string) { return this.call<void>('AddSite', { post: { siteUrl } }); }
  verifySite(siteUrl: string) { return this.call<boolean>('VerifySite', { post: { siteUrl } }); }
  submitFeed(siteUrl: string, feedUrl: string) { return this.call<void>('SubmitFeed', { post: { siteUrl, feedUrl } }); }
  submitUrls(siteUrl: string, urlList: string[]) { return this.call<void>('SubmitUrlBatch', { post: { siteUrl, urlList } }); }
  quota(siteUrl: string) { return this.call<{ DailyQuota: number; MonthlyQuota: number }>('GetUrlSubmissionQuota', { get: { siteUrl } }); }
  links(siteUrl: string, page = 0) {
    return this.call<{ Links: { Count: number; Url: string }[]; TotalPages: number }>('GetLinkCounts', { get: { siteUrl, page: String(page) } });
  }
}
