import { fileURLToPath } from 'node:url';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { scanDist, reportScan, readPages, type ScanOptions } from './scan.js';
import { auditGeo, reportGeoAudit } from './audit.js';
import { creditUrl, isKnownMetier, type RjsSiteConfig } from './config.js';
import { hasSitemap, writeSitemap } from './sitemap.js';
import { writeRedirects } from './redirects.js';

/**
 * Intégration Astro du pack @rjs/geo.
 *
 * Ancien branchement (≤ 0.2, toujours valable) : garde-fou seul sur dist/.
 *   integrations: [sitemap(), rjsGeo({ strict: true })]
 *
 * Branchement complet (≥ 0.3) : la config du site pilote tout.
 *   import site from './src/rjs.config';
 *   integrations: [rjsGeo({ site })]
 * → robots.txt, llms.txt et clé IndexNow servis automatiquement (sauf si le
 *   site a déjà son propre fichier), sitemap généré si @astrojs/sitemap est
 *   absent, redirections .html et *.netlify.app, conseils sur les données,
 *   garde-fou avec les seuils de la config, strict par défaut.
 *
 * `strict` fait échouer le build sur un problème bloquant (❌) : Netlify garde
 * alors l'ancienne version en ligne.
 */
export type RjsGeoIntegrationOptions = Omit<ScanOptions, 'site'> & {
  strict?: boolean;
  name?: string;
  /** Config du site (defineSite). Active le pack complet. */
  site?: RjsSiteConfig;
};

const VIRTUAL = 'virtual:rjs-geo/config';
const RESOLVED = '\0' + VIRTUAL;

type Logger = { info: (m: string) => void; warn: (m: string) => void };

export default function rjsGeo(options: RjsGeoIntegrationOptions = {}) {
  const { site: cfg, strict, name, ...scanOpts } = options;
  let site = '';
  let format = 'directory';
  let root: URL | undefined;
  let sitemapIntegration = false;

  return {
    name: '@rjs/geo',
    hooks: {
      'astro:config:setup': ({
        config,
        injectRoute,
        updateConfig,
        logger,
      }: {
        config: { root: URL; site?: string; integrations: { name: string }[] };
        injectRoute: (r: { pattern: string; entrypoint: string; prerender?: boolean }) => void;
        updateConfig: (c: object) => void;
        logger: Logger;
      }) => {
        root = config.root;
        updateConfig({
          vite: {
            plugins: [
              {
                name: 'rjs-geo-config',
                resolveId: (id: string) => (id === VIRTUAL ? RESOLVED : undefined),
                load: (id: string) =>
                  id === RESOLVED ? `export default ${JSON.stringify(cfg ? { ...cfg, _format: format } : null)};` : undefined,
              },
            ],
            ssr: { noExternal: ['@rjs/geo'] },
          },
        });
        if (!cfg) return;

        if (config.site && config.site.replace(/\/+$/, '') !== cfg.site.url) {
          logger.warn(`\`site\` d'astro.config (${config.site}) différent de rjs.config (${cfg.site.url}) : aligner les deux.`);
        }
        const has = (...rel: string[]) => rel.some((r) => existsSync(new URL(r, config.root)));
        const route = (file: string) => fileURLToPath(new URL(`./routes/${file}`, import.meta.url));
        const own = (f: string) => [`public/${f}`, ...['ts', 'js', 'mjs', 'astro'].map((x) => `src/pages/${f}.${x}`)];

        if (has(...own('robots.txt'))) logger.info('robots.txt du site conservé (le supprimer pour utiliser celui du pack).');
        else injectRoute({ pattern: '/robots.txt', entrypoint: route('robots.txt.js'), prerender: true });

        if (has(...own('llms.txt'))) logger.info('llms.txt du site conservé (le supprimer pour utiliser celui du pack).');
        else injectRoute({ pattern: '/llms.txt', entrypoint: route('llms.txt.js'), prerender: true });

        const key = cfg.indexing.indexnowKey;
        if (key && !has(`public/${key}.txt`)) injectRoute({ pattern: `/${key}.txt`, entrypoint: route('indexnow-key.js'), prerender: true });

        sitemapIntegration = config.integrations.some((i) => i.name === '@astrojs/sitemap');
      },

      'astro:config:done': ({ config }: { config: { site?: string; build: { format: string } } }) => {
        site = (config.site ?? cfg?.site.url ?? '').replace(/\/+$/, '');
        format = config.build.format;
      },

      'astro:build:done': ({ dir }: { dir: URL }) => {
        if (!site) {
          console.warn('⚠️  @rjs/geo : `site` absent de astro.config, garde-fou ignoré.');
          return;
        }
        const distDir = fileURLToPath(dir);
        const opts: ScanOptions = { ...scanOpts, site };

        if (cfg) {
          reportGeoAudit(
            cfg.site,
            auditGeo({
              site: cfg.site,
              businesses: cfg.businesses,
              services: cfg.services,
              hasArticles: cfg.llms.articles.length > 0,
              hasProjects: cfg.llms.realisations.length > 0,
            }),
          );
          const holes = (JSON.stringify(cfg).match(/À COMPLÉTER/g) ?? []).length;
          if (holes && cfg.live) throw new Error(`@rjs/geo : ${holes} champ(s) « À COMPLÉTER » dans rjs.config alors que live: true. Déploiement annulé.`);
          if (holes) console.warn(`\n📋 rjs.config : ${holes} champ(s) « À COMPLÉTER » (bloquant le jour où live passe à true).`);
          if (!cfg.live) {
            console.warn('\n🚧 Site en préparation (live: false dans rjs.config) : noindex partout, robots.txt interdit tout. Passer à true le jour du lancement.\n');
          }
          if (!isKnownMetier(cfg.rjs.metier)) {
            console.warn(`⚠️  @rjs/geo : métier « ${cfg.rjs.metier} » sans page sur romainjulien.studio, le lien RJS pointe vers l'accueil.`);
          }
          if (!sitemapIntegration && !hasSitemap(distDir)) {
            writeSitemap(distDir, site, readPages(distDir, site).filter((p) => !p.noindex).map((p) => p.url));
          }
          writeRedirects({ distDir, site, format, live: cfg.live });
          Object.assign(opts, {
            maxTitle: cfg.seo.maxTitle,
            maxDescription: cfg.seo.maxDescription,
            lengthLevel: cfg.seo.lengths,
            creditUrl: cfg.rjs.credit ? creditUrl(cfg.rjs.metier) : undefined,
            ...scanOpts,
          });
        }

        // Réglages repris par `rjs-geo check` (CLI) pour analyser le même dist/ hors build.
        if (root) {
          try {
            const cache = new URL('./.astro/', root);
            mkdirSync(cache, { recursive: true });
            writeFileSync(new URL('rjs-geo.json', cache), JSON.stringify({ ...opts, distDir }, null, 2));
          } catch { /* sans conséquence */ }
        }

        const findings = scanDist(distDir, opts);
        reportScan(name ?? new URL(site).host, findings);
        if ((strict ?? !!cfg) && findings.some((x) => x.level === 'block')) {
          throw new Error('@rjs/geo : problème(s) bloquant(s) dans le HTML généré (voir le rapport ci-dessus). Déploiement annulé.');
        }
      },
    },
  };
}
