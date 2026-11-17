# @rjs/geo

> **Mode d'emploi complet : [`GUIDE.md`](GUIDE.md)** (nouveau site, config, garde-fou,
> indexation, mise en ligne Google/Bing, pièges des pages villes, citations, suivi).
> Ce README garde l'historique des versions.

Couche **GEO/SEO** partagée pour les sites Astro de RJS Studio. Développée une
fois, éprouvée sur **10 sites en production** et autant de métiers différents.

Elle produit, à partir des données d'un site :

- un **graphe JSON-LD unique relié par `@id`** (LocalBusiness/Organization +
  Person founder + WebSite + Services + FAQ/Article/CreativeWork de page) ;
- un endpoint **`llms.txt`** (contacts, prestations, articles, réalisations) ;
- des **schémas Zod** qui valident la saisie au build ;
- le composant **`<AnswerBlock>`** (réponses courtes auto-portantes 40-80 mots) ;
- des **conseils SEO/GEO au build** (`auditGeo`) : image OG manquante, pas de
  fiche Google, pas de founder, etc.

## Principe : le package s'adapte au site

Le package ne fournit que la **mécanique**. Chaque site expose ses données via un
petit `src/data/site.ts` :

- **site vierge** → on écrit `SITE` / `BUSINESSES` / `SERVICES` directement ;
- **site avec ses propres données** (ex. `company.ts`) → on écrit un **adaptateur**
  qui les mappe. Le package ne remplace jamais les données du site.

```ts
// src/data/site.ts
import { buildGraph, auditGeo, reportGeoAudit } from '@rjs/geo';
import { SiteSchema, BusinessSchema, parseOrThrow, type Business } from '@rjs/geo';

export const SITE = { name: '…', url: 'https://…', description: '…', ogImage: '…' };
export const BUSINESSES: Business[] = [ /* … */ ];
export const SERVICES = [ /* … */ ];

parseOrThrow(SiteSchema, SITE, 'SITE');
BUSINESSES.forEach((b) => parseOrThrow(BusinessSchema, b, `BUSINESS ${b.slug}`));

export function buildSiteGraph(extraNodes: object[] = [], locale = 'fr-FR') {
  return buildGraph({ site: SITE, businesses: BUSINESSES, services: SERVICES, extraNodes, locale });
}
```

```astro
---
// src/layouts/BaseLayout.astro
import { buildSiteGraph } from '../data/site';
const graph = buildSiteGraph(pageNodes);
---
<script type="application/ld+json" set:html={JSON.stringify(graph)} />
```

```ts
// src/pages/llms.txt.ts
import { buildLlmsTxt, auditGeo, reportGeoAudit } from '@rjs/geo';
import { SITE, BUSINESSES, SERVICES } from '../data/site';

export const GET = () => {
  reportGeoAudit(SITE, auditGeo({ site: SITE, businesses: BUSINESSES, services: SERVICES }));
  return new Response(buildLlmsTxt({ site: SITE, businesses: BUSINESSES, services: SERVICES }),
    { headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
};
```

## Ce que la couche gère (superset validé en prod)

| Besoin | Support |
|---|---|
| Plusieurs entreprises par site | `BUSINESSES[]`, une entité `primary` |
| Type schema.org | chaîne **ou** tableau (`['LocalBusiness','TaxiService']`) |
| Founder (E-E-A-T) | nœud `Person` séparé relié par `@id` |
| Zones desservies | typées `City` / `AdministrativeArea` / `State` / `Country` |
| Horaires | par jour (`hours[]` → `OpeningHoursSpecification`) |
| Identité | `logo`, `siret` (→ `identifier`), `alternateName` |
| Avis clients | `rating: { value, count, reviews[] }` → `aggregateRating` + `review[]` (⚠️ Google n'affiche pas d'étoiles pour un LocalBusiness auto-déclaré depuis 2019 — l'intérêt est GEO/Knowledge Graph, pas le rich snippet) |
| Blog | `buildArticleNode` (BlogPosting) + section llms « Articles » |
| Portfolio | `buildProjectNode` (CreativeWork daté/localisé) + section « Réalisations » |
| Bilingue | paramètre `locale` (`inLanguage` du WebSite), `data/site.ts` par langue |
| Champs absents | `geo`, `address`, `street`, `email`, `ogImage`… tous optionnels |

## Conseils au build

`auditGeo()` renvoie une liste de findings (`warn` / `info`) ; `reportGeoAudit()`
les affiche. À appeler dans l'endpoint `llms.txt` (s'exécute une fois au build) :

```
🔍 GEO/SEO — conseils pour SPOKE  (2 à corriger, 3 à envisager)
   ⚠️  Image OG absente : aucun aperçu lors des partages…
   ·  Pas de founder (Person) : renforce l'E-E-A-T…
```

## Distribution

Repo public sur GitHub (aucune donnée client dedans — uniquement la mécanique) :
`npm install github:RomainJulien/rjs-geo`. Aucun token requis, ça marche aussi
sur Netlify (le script `prepare` recompile `dist/` à l'installation). Les 10
sites actuels consomment tous le package de cette façon — plus de copie locale.

## Pièges connus (retours d'expérience)

Voir `GUIDE.md` §8 :
cannibalisation home/page-ville-siège, quasi-duplication de contenu sur des
pages villes templatées, distances approximatives, cohérence NAP visible.


## 0.2.0 : garde-fou au build + IndexNow automatique

- `@rjs/geo/integration` : intégration Astro qui analyse `dist/` à la fin du build
  (4 signaux d'indexation, meta, alt, pièges 1, 2 et 4 du GUIDE.md §8).
  `rjsGeo({ strict: true })` fait échouer le build sur un problème bloquant.
- `netlify-plugin/` : après chaque déploiement de production, envoie à IndexNow
  les seules pages modifiées (clé lue dans `public/<clé>.txt`).

Mode d'emploi complet : `GUIDE.md` §5 et §7.


## 0.3.0 : le pack complet, piloté par un seul fichier

Les sites ≤ 0.2 continuent de marcher tels quels (`rjsGeo()` sans config =
garde-fou seul, mêmes seuils qu'avant). La migration se fait site par site.

### Nouveau site (ou migration) : 1 fichier + 3 branchements

```ts
// src/rjs.config.ts : LA config SEO/GEO du site
import { defineSite } from '@rjs/geo';
export default defineSite({
  site: { name, url, description, ogImage },
  businesses: [/* comme avant (BusinessSchema) */],
  services: [/* … */],
  live: false,                       // false = en préparation : noindex + robots qui interdit tout
  rjs: { metier: 'couvreur' },       // lien RJS Studio vers la page métier
  indexing: { indexnowKey: '…' },    // la clé est servie toute seule (plus de public/<clé>.txt)
  llms: { keyPages: [/* … */] },
  // seo: { maxTitle: 60, maxDescription: 155, lengths: 'block', aiBots: 'allow' }  (valeurs par défaut)
});
```

```js
// astro.config.mjs
import rjsGeo from '@rjs/geo/integration';
import site from './src/rjs.config.ts';
export default defineConfig({ site: site.site.url, integrations: [rjsGeo({ site })] });
```

```astro
---
import SeoHead from '@rjs/geo/SeoHead.astro';      // dans le <head> du layout
import RjsCredit from '@rjs/geo/RjsCredit.astro';  // dans le footer
import Faq from '@rjs/geo/Faq.astro';              // FAQ visible + FAQPage, même liste
---
<SeoHead title="Couvreur à Lannion" description="…" schema={[breadcrumb]} />
<RjsCredit class="credit" />
<Faq items={faq} />
```

```toml
# netlify.toml (inchangé)
[[plugins]]
package = "./node_modules/@rjs/geo/netlify-plugin"
```

### Ce que l'intégration fait alors toute seule

| Quoi | Comment |
|---|---|
| robots.txt | servi depuis la config (robots des IA autorisés, tout interdit si `live: false`) |
| llms.txt | servi depuis la config |
| Clé IndexNow | `/<clé>.txt` servi si `indexing.indexnowKey` |
| Sitemap | écrit depuis les pages indexables générées, si `@astrojs/sitemap` est absent |
| Redirections | `*.netlify.app` → domaine (prod, site lancé) et `/page.html` → `/page/` |
| Conseils données | `auditGeo` à chaque build (plus besoin de l'appeler dans llms.txt) |
| Garde-fou | strict par défaut : title > 60 et description > 155 bloquent, H1 unique, FAQ balisée visible, lien RJS présent et vers la bonne page, tiret cadratin |

Un fichier du site (`public/robots.txt`, `src/pages/llms.txt.ts`…) reste
prioritaire : le pack ne l'écrase pas, il le signale.

`<SeoHead>` calcule la canonical dans la forme servie par Netlify (`/page` en
format `file`, `/page/` en format `directory`), applique le gabarit de title,
pose noindex hors lancement, Open Graph, Twitter, balises de vérification
Search Console et Bing, et le graphe JSON-LD (prop `graph` pour fournir le
sien, `schema` pour ajouter des nœuds de page). Helpers : `buildFaqNode`,
`buildBreadcrumbNode`.

### Checklist en ligne de commande

```
npx rjs-geo check                                   # dernier build, mêmes règles qu'au build
npx rjs-geo check --live www.exemple.fr --key <clé>  # le site en production
npx rjs-geo check --registry sites.json all --quiet  # tout le portefeuille (tâche du lundi)
```

Code de sortie 1 s'il reste un problème bloquant. Le contrôle en production
est le portage de `rjs check` (RJS-OPS/rjs.py), avec les seuils du pack.

### Pages métiers connues (lien RJS Studio)

`METIER_PAGES` dans `src/config.ts` : couvreur (zingueur, charpentier), taxi
(vtc), gite (location-saisonniere), artisan. Un métier inconnu pointe vers
l'accueil (signalé au build). Ajouter une ligne à chaque nouvelle page métier.


## 0.4.0 : lancement automatique et CLI unique

`rjs-geo` remplace `RJS-OPS/rjs.py` (même commandes, même registre). Le
lanceur `RJS-OPS/rjs` appelle désormais ce CLI.

| Commande | Rôle |
|---|---|
| `init [--metier m] [--host h] [--id x]` | écrit `src/rjs.config.ts` (clé IndexNow générée, `live: false`), affiche les 3 branchements, ajoute le site au registre avec `--id` |
| `check` / `check --live <host>` / `check <id\|all>` | garde-fou du dernier build / contrôle en production |
| `launch <id> [--force]` | contrôle en production (bloquant), puis sitemap à Google, propriété Bing ajoutée, vérifiée, sitemap et URL soumis, IndexNow ; dates notées dans le registre (`launch`) |
| `status <id\|all>` | sitemaps Search Console, propriété Bing, liens entrants |
| `list`, `indexnow`, `versions`, `conseils`, `sync`, `newkey` | portefeuille, comme avant |

Un champ « À COMPLÉTER » laissé dans `rjs.config` bloque le build dès que `live: true`.

### Accès aux APIs (une seule fois, jamais dans un dépôt)

Dans `~/.config/rjs-geo/` :

- **Google (recommandé : OAuth en ton nom)** : `google-oauth-client.json`, client
  OAuth « Application de bureau » d'un projet Google Cloud où l'API Google Search
  Console est activée (écran de consentement en type **Interne**). Puis une fois :
  `rjs-geo google-login` (navigateur, ton compte). Le CLI accède alors à toutes
  tes propriétés Search Console, sans rien à faire par site. Alternative si
  l'organisation l'autorise : `google-service-account.json` (clé de compte de
  service, à ajouter comme propriétaire de chaque propriété).
- **Bing** : `bing-api-key.txt`, clé API Bing Webmaster (Paramètres > Accès API),
  valable pour toutes les propriétés du compte.

Variables possibles : `RJS_GOOGLE_SA` (chemin d'une clé de compte de service), `RJS_BING_KEY` (clé).


## 0.5.0 : citations et liens

Les liens qui comptent pour un artisan : des **citations** (fiches identiques
dans Apple Plans, Bing Places, PagesJaunes, annuaires du métier) et de **vrais
liens locaux** (mairie, office de tourisme, fournisseurs, partenaires, presse).
Rien n'est acheté, rien n'est relié artificiellement entre sites clients.

| Commande | Rôle |
|---|---|
| `citations <id> [--famille f]` | kit Markdown dans le dossier du client : fiche NAP à recopier (lue dans le JSON-LD du site, sans rien inventer), descriptions courte et longue, annuaires adaptés au métier (essentiels, ensuite, sous condition), modèle de courriel pour les liens partenaires |
| `links add <id> <url> --source "Annuaire"` | suit une page qui fait un lien vers le site |
| `links <id\|all>` | vérifie que chaque page existe et contient toujours le lien ; `check` le signale aussi |
| `sitemaps <id> [--remove <url>]` | sitemaps déclarés dans Search Console, avec les obsolètes (http, www, doublons, page déclarée par erreur) ; retrait sur demande |

Familles : `batiment`, `taxi`, `hebergement`, `bien-etre`, `services`,
`commerce`, déduites du métier RJS ou du type schema.org (`--famille` pour forcer).
La liste des annuaires est dans `src/citations.ts` (`DIRECTORIES`) : une ligne à
ajouter pour un nouvel annuaire ou un nouveau métier.

Ce qui reste manuel, une fois par client et avec lui : la création des comptes
(SMS ou courrier de vérification, CAPTCHA, conditions d'utilisation).

Bing (`status`) n'a pas encore de données de liens pour les propriétés importées
en novembre 2026 : le suivi `links` ne dépend pas de lui.
