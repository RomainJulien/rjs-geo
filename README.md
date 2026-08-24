# @rjs/geo

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

Voir `GEO-TUTO.md` (racine de `WORKS AGENCE/`), section « Leçons apprises » :
cannibalisation home/page-ville-siège, quasi-duplication de contenu sur des
pages villes templatées, distances approximatives, cohérence NAP visible.
