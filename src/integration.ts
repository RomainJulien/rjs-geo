import { fileURLToPath } from 'node:url';
import { scanDist, reportScan, type ScanOptions } from './scan.js';

/**
 * Intégration Astro : lance le garde-fou sur dist/ à la fin de chaque build.
 *
 *   // astro.config.mjs
 *   import rjsGeo from '@rjs/geo/integration';
 *   export default defineConfig({ site: 'https://www.exemple.fr', integrations: [sitemap(), rjsGeo()] });
 *
 * `strict: true` fait échouer le build en cas de problème bloquant (❌) :
 * Netlify garde alors l'ancienne version en ligne. Conseillé sur les nouveaux
 * sites ; à activer sur un site existant seulement une fois son rapport propre.
 */
export type RjsGeoIntegrationOptions = Omit<ScanOptions, 'site'> & { strict?: boolean; name?: string };

export default function rjsGeo(options: RjsGeoIntegrationOptions = {}) {
  let site = '';
  return {
    name: '@rjs/geo',
    hooks: {
      'astro:config:done': ({ config }: { config: { site?: string } }) => { site = config.site ?? ''; },
      'astro:build:done': ({ dir }: { dir: URL }) => {
        if (!site) { console.warn('⚠️  @rjs/geo : `site` absent de astro.config, garde-fou ignoré.'); return; }
        const findings = scanDist(fileURLToPath(dir), { ...options, site });
        reportScan(options.name ?? new URL(site).host, findings);
        if (options.strict && findings.some((x) => x.level === 'block')) {
          throw new Error('@rjs/geo : problème(s) bloquant(s) dans le HTML généré (voir le rapport ci-dessus). Déploiement annulé.');
        }
      },
    },
  };
}
