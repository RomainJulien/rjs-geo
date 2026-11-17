import { z } from 'zod';
import { SiteSchema, BusinessSchema, ServiceSchema, parseOrThrow } from './schemas.js';

/**
 * Config unique d'un site (≥ 0.3.0) : `src/rjs.config.ts`.
 *
 *   import { defineSite } from '@rjs/geo';
 *   export default defineSite({ site: {...}, businesses: [...], rjs: { metier: 'couvreur' } });
 *
 * Elle pilote tout le pack : <SeoHead>, JSON-LD, robots.txt, llms.txt, clé
 * IndexNow, sitemap, redirections, lien RJS Studio et seuils du garde-fou.
 * Les anciens sites (`src/data/site.ts` + adaptateur) continuent de marcher
 * sans elle : la migration se fait site par site.
 */

const LlmsLinkSchema = z.object({
  label: z.string().min(1),
  href: z.string().min(1),
  description: z.string().optional(),
});

const RealisationSchema = z.object({
  title: z.string().min(1),
  city: z.string().optional(),
  date: z.string().optional(),
  href: z.string().min(1),
});

const ArticleSchema = z.object({
  slug: z.string().min(1),
  title: z.string().min(1),
  description: z.string().min(1),
  pubDate: z.string().min(1),
  author: z.string().optional(),
  image: z.string().optional(),
});

export const SiteConfigSchema = z.object({
  site: SiteSchema.extend({
    /** Langue BCP-47 (inLanguage du WebSite, og:locale). */
    locale: z.string().optional(),
  }),
  businesses: z.array(BusinessSchema).min(1),
  services: z.array(ServiceSchema).optional(),
  /**
   * `false` = site en préparation : noindex sur toutes les pages, robots.txt
   * qui interdit tout, pas de redirection *.netlify.app. Passer à `true` le
   * jour du lancement.
   */
  live: z.boolean().optional(),
  rjs: z
    .object({
      /** Clé métier (couvreur, taxi, gite, artisan…) ou slug d'une page de romainjulien.studio. */
      metier: z.string().optional(),
      /** `false` pour un site sans lien « Site réalisé par RJS Studio » (choix du client). */
      credit: z.boolean().optional(),
    })
    .optional(),
  seo: z
    .object({
      /** `%s` = titre de la page, `{name}` = nom du site. Ignoré si le titre contient déjà le nom. */
      titleTemplate: z.string().optional(),
      maxTitle: z.number().int().positive().optional(),
      maxDescription: z.number().int().positive().optional(),
      /** Gravité d'un title ou d'une description trop longs : `block` refuse le build en strict. */
      lengths: z.enum(['block', 'warn']).optional(),
      /** Robots des IA (GPTBot, ClaudeBot, PerplexityBot…) : autorisés par défaut (GEO). */
      aiBots: z.enum(['allow', 'block']).optional(),
    })
    .optional(),
  indexing: z
    .object({
      /** Clé IndexNow (32 caractères hexadécimaux) : le fichier <clé>.txt est servi automatiquement. */
      indexnowKey: z.string().regex(/^[0-9a-f]{32}$/, 'Clé IndexNow : 32 caractères hexadécimaux').optional(),
      /** Jeton de vérification Search Console (balise google-site-verification). */
      google: z.string().optional(),
      /** Jeton de vérification Bing Webmaster (balise msvalidate.01). */
      bing: z.string().optional(),
    })
    .optional(),
  llms: z
    .object({
      keyPages: z.array(LlmsLinkSchema).optional(),
      realisations: z.array(RealisationSchema).optional(),
      articles: z.array(ArticleSchema).optional(),
      blogBase: z.string().optional(),
    })
    .optional(),
});

export type SiteConfigInput = z.input<typeof SiteConfigSchema>;
type Parsed = z.output<typeof SiteConfigSchema>;

/** Config normalisée : toutes les valeurs par défaut sont posées. */
export type RjsSiteConfig = Omit<Parsed, 'services' | 'live' | 'rjs' | 'seo' | 'indexing' | 'llms' | 'site'> & {
  site: Parsed['site'] & { locale: string };
  services: NonNullable<Parsed['services']>;
  live: boolean;
  rjs: { metier?: string; credit: boolean };
  seo: {
    titleTemplate: string;
    maxTitle: number;
    maxDescription: number;
    lengths: 'block' | 'warn';
    aiBots: 'allow' | 'block';
  };
  indexing: { indexnowKey?: string; google?: string; bing?: string };
  llms: {
    keyPages: NonNullable<NonNullable<Parsed['llms']>['keyPages']>;
    realisations: NonNullable<NonNullable<Parsed['llms']>['realisations']>;
    articles: NonNullable<NonNullable<Parsed['llms']>['articles']>;
    blogBase: string;
  };
};

/** Valide la config d'un site (le build casse sur une saisie invalide) et pose les valeurs par défaut. */
export function defineSite(input: SiteConfigInput): RjsSiteConfig {
  const c = parseOrThrow(SiteConfigSchema, input, 'rjs.config') as Parsed;
  return {
    ...c,
    site: { ...c.site, url: c.site.url.replace(/\/+$/, ''), locale: c.site.locale ?? 'fr-FR' },
    services: c.services ?? [],
    live: c.live ?? true,
    rjs: { metier: c.rjs?.metier, credit: c.rjs?.credit ?? true },
    seo: {
      titleTemplate: c.seo?.titleTemplate ?? '%s | {name}',
      maxTitle: c.seo?.maxTitle ?? 60,
      maxDescription: c.seo?.maxDescription ?? 155,
      lengths: c.seo?.lengths ?? 'block',
      aiBots: c.seo?.aiBots ?? 'allow',
    },
    indexing: { ...c.indexing },
    llms: {
      keyPages: c.llms?.keyPages ?? [],
      realisations: c.llms?.realisations ?? [],
      articles: c.llms?.articles ?? [],
      blogBase: c.llms?.blogBase ?? '/blog',
    },
  };
}

/* ─── Lien « Site réalisé par RJS Studio » ─────────────────────────────── */

export const RJS_STUDIO_URL = 'https://romainjulien.studio';

/**
 * Pages métiers en ligne sur romainjulien.studio. À compléter à chaque
 * nouvelle page métier (puis nouvelle version du package) : les sites qui
 * déclarent ce métier pointeront dessus à leur prochaine mise à jour.
 */
export const METIER_PAGES: Record<string, string> = {
  couvreur: 'site-internet-couvreur',
  zingueur: 'site-internet-couvreur',
  charpentier: 'site-internet-couvreur',
  taxi: 'site-internet-taxi-vtc',
  vtc: 'site-internet-taxi-vtc',
  gite: 'site-internet-gite-location-saisonniere',
  'location-saisonniere': 'site-internet-gite-location-saisonniere',
  artisan: 'site-internet-artisan',
};

/** URL cible du lien RJS : la page métier si elle existe, sinon l'accueil. */
export function creditUrl(metier?: string): string {
  if (!metier) return `${RJS_STUDIO_URL}/`;
  const slug = METIER_PAGES[metier] ?? (metier.startsWith('site-internet-') ? metier : undefined);
  return slug ? `${RJS_STUDIO_URL}/${slug}` : `${RJS_STUDIO_URL}/`;
}

/** Le métier déclaré correspond-il à une page connue ? (sinon le lien part vers l'accueil) */
export const isKnownMetier = (metier?: string) =>
  !metier || metier in METIER_PAGES || metier.startsWith('site-internet-');
