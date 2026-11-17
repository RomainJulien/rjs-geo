import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join, relative } from 'node:path';
import { randomBytes } from 'node:crypto';
import { METIER_PAGES } from './config.js';
import { type Registry, saveRegistry, workdev } from './registry.js';
import { packageVersion } from './ops.js';

/**
 * Prépare un site Astro pour le pack : écrit src/rjs.config.ts (pré-rempli,
 * site en préparation, clé IndexNow générée) et affiche les 3 branchements.
 * Avec un registre, ajoute aussi le site (statut dev).
 */
export function init(cwd: string, opts: { metier?: string; host?: string; id?: string; registryFile?: string; registry?: Registry }) {
  const pkgFile = join(cwd, 'package.json');
  if (!existsSync(pkgFile)) throw new Error('Pas de package.json ici : lancer init à la racine du site Astro.');
  const target = join(cwd, 'src', 'rjs.config.ts');
  if (existsSync(target)) throw new Error('src/rjs.config.ts existe déjà : rien à faire.');

  const cfgFile = ['astro.config.mjs', 'astro.config.ts', 'astro.config.js'].map((f) => join(cwd, f)).find(existsSync);
  const astroSite = cfgFile ? readFileSync(cfgFile, 'utf8').match(/site:\s*['"`]([^'"`]+)['"`]/)?.[1] : undefined;
  const host = opts.host ?? (astroSite ? new URL(astroSite).host : undefined);
  const url = host ? `https://${host}` : 'https://www.A-COMPLETER.fr';
  const pkg = JSON.parse(readFileSync(pkgFile, 'utf8'));
  const key = randomBytes(16).toString('hex');
  const metier = opts.metier;

  mkdirSync(join(cwd, 'src'), { recursive: true });
  writeFileSync(
    target,
    `import { defineSite } from '@rjs/geo';

/**
 * Config SEO/GEO du site (@rjs/geo) : SEO des pages, JSON-LD, robots.txt,
 * llms.txt, sitemap, redirections, lien RJS Studio et garde-fou au build.
 * Une valeur invalide casse le build (c'est voulu). Textes sans tiret cadratin.
 */
export default defineSite({
  site: {
    name: 'À COMPLÉTER', // ${pkg.name}
    url: '${url}',
    description: 'À COMPLÉTER : activité, ville, zone, en une ou deux phrases (155 caractères max).',
    ogImage: '${url}/og.jpg', // 1200 × 630
  },
  businesses: [
    {
      slug: 'business',
      primary: true,
      name: 'À COMPLÉTER',
      type: 'LocalBusiness', // le type le plus précis : RoofingContractor, Plumber, TaxiService, LodgingBusiness…
      description: 'À COMPLÉTER',
      url: '${url}',
      // phone: '06 00 00 00 00', phoneHref: 'tel:+33600000000', email: '',
      // address: { street: '', postalCode: '22000', city: '' },
      // geo: { lat: 0, lng: 0 },
      // founder: { name: '', jobTitle: '' },
      // siret: '',
      // areaServed: [{ name: '', type: 'City' }],
      // sameAs: ['https://maps.google.com/?cid=…'],
      // rating: { value: 4.9, count: 12, reviews: [] },
    },
  ],
  services: [
    // { id: 'toiture', title: 'Réfection de toiture', description: '…', href: '/toiture' },
  ],
  // false tant que le site n'est pas lancé : noindex partout, robots.txt qui interdit tout.
  live: false,
  rjs: { metier: ${metier ? `'${metier}'` : 'undefined'} }, // ${Object.keys(METIER_PAGES).join(', ')}
  indexing: {
    indexnowKey: '${key}',
    // google: '', // jeton google-site-verification (si propriété « préfixe d'URL »)
    // bing: '',   // code msvalidate.01 (donné par rjs-geo launch si Bing le demande)
  },
  llms: {
    keyPages: [
      // { label: 'Contact', href: '/contact', description: '…' },
    ],
  },
});
`,
  );
  console.log(`✅ src/rjs.config.ts créé (@rjs/geo ${packageVersion()}, clé IndexNow ${key}).

Reste 3 branchements :

1. astro.config.mjs
     import rjsGeo from '@rjs/geo/integration';
     import site from './src/rjs.config.ts';
     export default defineConfig({ site: site.site.url, integrations: [rjsGeo({ site })], … });

2. Layout : dans le <head>, remplacer title, description, canonical, Open Graph et JSON-LD par
     import SeoHead from '@rjs/geo/SeoHead.astro';
     <SeoHead title={title} description={description} />
   et dans le footer :
     import RjsCredit from '@rjs/geo/RjsCredit.astro';
     <RjsCredit class="credit" />

3. netlify.toml
     [[plugins]]
     package = "./node_modules/@rjs/geo/netlify-plugin"

Supprimer public/robots.txt, src/pages/robots.txt.* et src/pages/llms.txt.* s'ils existent (le pack les sert).
Puis : npm run build, et le jour J : live: true, déploiement, rjs-geo launch <site>.`);

  if (opts.registry && opts.registryFile && opts.id) {
    const reg = opts.registry;
    if (reg.sites.some((s) => s.id === opts.id)) console.log(`\n(registre : ${opts.id} existe déjà, non modifié)`);
    else {
      reg.sites.push({ id: opts.id, client: '', host: host ?? '', repo: '', branch: 'main', path: relative(workdev(opts.registryFile), cwd), status: 'dev', indexnowKey: key, notes: '' });
      saveRegistry(opts.registryFile, reg);
      console.log(`\n✅ Ajouté au registre (statut dev) : ${opts.id}`);
    }
  }
}
