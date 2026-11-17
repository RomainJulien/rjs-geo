import type { Site, Business, Service, ArticleRef } from './schemas.js';

/**
 * Couche GEO partagée — génération de `llms.txt` (SUPERSET définitif).
 */

export type LlmsLink = { label: string; href: string; description?: string };
export type RealisationRef = { title: string; city?: string; date?: Date | string; href: string };

export type BuildLlmsInput = {
  site: Site;
  businesses: readonly Business[];
  services?: readonly Service[];
  articles?: readonly ArticleRef[];
  /** Réalisations/chantiers documentés (portfolio). */
  realisations?: readonly RealisationRef[];
  blogBase?: string;
  keyPages?: LlmsLink[];
};

function abs(url: string, href: string): string {
  return href.startsWith('http') ? href : `${url}${href.startsWith('/') ? '' : '/'}${href}`;
}

function ymd(d: Date | string): string {
  const date = d instanceof Date ? d : new Date(d);
  return date.toISOString().slice(0, 10);
}

const DAY_FR: Record<string, string> = {
  Monday: 'Lun',
  Tuesday: 'Mar',
  Wednesday: 'Mer',
  Thursday: 'Jeu',
  Friday: 'Ven',
  Saturday: 'Sam',
  Sunday: 'Dim',
};

function hoursLine(b: Business): string | null {
  if (!b.hours?.length) return null;
  return b.hours
    .map((h) => `${h.days.map((d) => DAY_FR[d] ?? d).join('/')} ${h.opens}-${h.closes}`)
    .join(', ');
}

export function buildLlmsTxt({
  site,
  businesses,
  services = [],
  articles = [],
  realisations = [],
  blogBase = '/blog',
  keyPages = [],
}: BuildLlmsInput): string {
  const lines: string[] = [];

  lines.push(`# ${site.name}`);
  lines.push('');
  lines.push(`> ${site.description}`);
  lines.push('');

  lines.push('## Contact');
  for (const b of businesses) {
    if (businesses.length > 1) {
      lines.push('');
      lines.push(`### ${b.name}`);
    }
    const founders = !b.founder ? [] : Array.isArray(b.founder) ? b.founder : [b.founder];
    if (founders.length) {
      lines.push(
        `- Interlocuteur : ${founders.map((f) => `${f.name}${f.jobTitle ? ` (${f.jobTitle})` : ''}`).join(', ')}`,
      );
    }
    if (b.phone) lines.push(`- Téléphone : ${b.phone}`);
    if (b.email) lines.push(`- Email : ${b.email}`);
    if (b.address) {
      const addr = [b.address.street, `${b.address.postalCode} ${b.address.city}`, b.address.region]
        .filter(Boolean)
        .join(', ');
      lines.push(`- Adresse : ${addr}`);
    }
    if (b.areaServed?.length) lines.push(`- Zone : ${b.areaServed.map((a) => a.name).join(', ')}.`);
    const hl = hoursLine(b);
    if (hl) lines.push(`- Horaires : ${hl}`);
    lines.push(`- Site : ${b.url}`);
    if (b.sameAs?.length) lines.push(`- Réseaux : ${b.sameAs.join(', ')}`);
  }
  lines.push('');

  if (services.length) {
    lines.push('## Prestations');
    for (const s of services) {
      const link = s.href ? `[${s.title}](${abs(site.url, s.href)})` : s.title;
      lines.push(`- ${link} : ${s.description}`);
    }
    lines.push('');
  }

  if (realisations.length) {
    lines.push('## Réalisations');
    for (const r of realisations) {
      const meta = [r.city, r.date ? ymd(r.date) : null].filter(Boolean).join(', ');
      lines.push(`- [${r.title}](${abs(site.url, r.href)})${meta ? ` (${meta})` : ''}`);
    }
    lines.push('');
  }

  if (articles.length) {
    lines.push('## Articles');
    for (const a of articles) {
      lines.push(`- [${a.title}](${site.url}${blogBase}/${a.slug}) (${ymd(a.pubDate)}) : ${a.description}`);
    }
    lines.push('');
  }

  if (keyPages.length) {
    lines.push('## Pages clés');
    for (const p of keyPages) {
      const desc = p.description ? ` : ${p.description}` : '';
      lines.push(`- [${p.label}](${abs(site.url, p.href)})${desc}`);
    }
    lines.push('');
  }

  return lines.join('\n');
}
