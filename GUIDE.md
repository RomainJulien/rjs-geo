# Guide SEO/GEO RJS Studio (`@rjs/geo`)

Le seul document de référence pour le référencement des sites RJS : technique,
données structurées, IA, indexation, citations et suivi. Il remplace
`GEO-TUTO.md`, `audit-indexation-seo.md`, `PASSATION-SESSION-GEO.md` et
`PROCESS-BING.md` (archivés). Ce dépôt est public : aucun nom de client ici.
L'état et les décisions propres à chaque client sont dans `RJS-OPS/SUIVI-CLIENTS.md`
(privé, sur le poste de Romain).

Sommaire :
1. Pourquoi ce pack
2. Nouveau site, de zéro à en ligne
3. La config `rjs.config.ts`
4. Brancher le pack sur un site existant
5. Le garde-fou au build
6. Indexation : la règle d'or et ses pièges
7. Mise en ligne : Google, Bing, IndexNow
8. Pages villes : quatre pièges structurels
9. Citations et liens
10. Suivi du portefeuille
11. Réflexes de travail

---

## 1. Pourquoi ce pack

Depuis l'arrivée des AI Overviews et du Mode IA en France (juillet 2026), on
ne cherche plus seulement à « positionner une page » mais à être **une entité
citable** : l'IA découpe les pages en passages et reprend celui qui répond.

- Les requêtes locales et transactionnelles (« couvreur Lannion »), le pack
  local et la fiche Google restent le terrain des artisans : c'est une
  opportunité plus qu'une menace.
- Le socle, c'est la technique (HTML rendu côté serveur, indexation propre) et
  une entité cohérente partout (JSON-LD relié, NAP identique, avis, fiches).
- `llms.txt` et les balisages IA sont la cerise : coût faible, gain incertain.
- **Ce qui ne se désactive pas** : le contenu propre au client, que l'IA ne
  trouve nulle part ailleurs. Photos réelles, réalisations datées et
  localisées, zones précises, fourchettes de prix réelles quand le métier
  l'accepte, la voix du dirigeant. Un site de couvreur avec 30 chantiers
  documentés est indéboulonnable ; trois pages de généralités seront résumées
  et oubliées. `auditGeo` le rappelle à chaque build (« contenu propriétaire »).

Le pack fournit la mécanique ; le site fournit ses données ; rien n'est inventé.

---

## 2. Nouveau site, de zéro à en ligne

```bash
npm install github:RomainJulien/rjs-geo#v0.5.0
npx rjs-geo init --metier couvreur --id mon-client   # avec RJS_REGISTRY pour l'inscrire au registre
```

`init` écrit `src/rjs.config.ts` (site en préparation, clé IndexNow générée) et
affiche les 3 branchements :

```js
// astro.config.mjs
import rjsGeo from '@rjs/geo/integration';
import site from './src/rjs.config.ts';
export default defineConfig({ site: site.site.url, integrations: [rjsGeo({ site })] });
```

```astro
---
import SeoHead from '@rjs/geo/SeoHead.astro';
import RjsCredit from '@rjs/geo/RjsCredit.astro';
---
<head> … <SeoHead title={title} description={description} schema={pageNodes} /> </head>
<footer> … <RjsCredit class="credit" /> </footer>
```

```toml
# netlify.toml
[[plugins]]
package = "./node_modules/@rjs/geo/netlify-plugin"
```

Le jour J :
1. `live: true` dans la config (le build refuse tant qu'un « À COMPLÉTER » traîne) ;
2. domaine final branché, *Primary domain* Netlify identique à `site.url` (§6) ;
3. déploiement, puis `./rjs launch <id>` (§7) ;
4. `./rjs citations <id>` et les fiches avec le client (§9).

Hors pack, mais à ne pas oublier au lancement : image de partage 1200 × 630,
balises de mesure (GTM, GA4, Clarity) avec bandeau de consentement, fiche
Google Business Profile complète (base du panneau de connaissances).

---

## 3. La config `rjs.config.ts`

Tout champ facultatif s'omet plutôt que de recevoir une valeur inventée :
`auditGeo` signale ce qui manque, c'est son rôle.

| Bloc | Contenu |
|---|---|
| `site` | `name`, `url` (sans slash final), `description`, `ogImage`, `locale` |
| `businesses[]` | une entité `primary` ; `type` schema.org le plus précis ; `phone` + `phoneHref` (`tel:+33…`), `email`, `address` (code postal à 5 chiffres), `geo`, `hours`, `areaServed`, `sameAs` (fiche Google d'abord), `siret`, `founder`, `rating` |
| `services[]` | `id`, `title`, `description`, `href` |
| `live` | `false` = noindex partout, robots.txt qui interdit tout, pas de redirection *.netlify.app |
| `rjs` | `metier` (page métier de romainjulien.studio pour le lien de crédit), `credit: false` si le client refuse le lien |
| `seo` | `titleTemplate`, `maxTitle` (60), `maxDescription` (155), `lengths` (`block`), `aiBots` (`allow`) |
| `indexing` | `indexnowKey`, `google` (jeton de vérification), `bing` (code msvalidate.01) |
| `llms` | `keyPages`, `realisations`, `articles`, `blogBase` |

**Types schema.org courants** : `RoofingContractor` (couvreur), `GeneralContractor`
(construction), `Locksmith`, `Plumber`, `HomeAndConstructionBusiness`,
`TaxiService`, `LodgingBusiness`, `HealthAndBeautyBusiness`,
`ProfessionalService` (conseil), `OnlineStore`, `Organization` (sans local).
En tableau pour cumuler : `['LocalBusiness', 'RoofingContractor']`.

**Zones** (`areaServed`) : objets `{ name, type }`, `type` parmi `City`,
`AdministrativeArea` (département), `State` (région), `Country`.

**Avis** (`rating: { value, count, reviews[] }`) : Google n'affiche **pas**
d'étoiles pour un `LocalBusiness` qui déclare ses propres avis (règle de 2019).
L'intérêt est la cohérence de l'entité et la citation par les IA ; le
présenter ainsi au client. Avis recopiés en entier, date `AAAA-MM` si le jour
est inconnu. Ne jamais baliser des avis repris d'une autre plateforme (Abritel,
Airbnb) : les afficher avec un lien, sans JSON-LD.

**Cas particuliers** :
- plusieurs entreprises sur un site : plusieurs `businesses`, une seule `primary` ;
- blog : `buildArticleNode` sur la page article, `llms.articles` ;
- réalisations : `buildProjectNode` (CreativeWork daté et localisé), `llms.realisations` ;
- bilingue : `locale` et un `llms.txt` par langue ;
- pages villes : un nœud `Service` par commune relié à l'entité par `@id` ;
- FAQ : composant `<Faq items>` (affichage et FAQPage depuis la même liste) ou
  `buildFaqNode` passé en `schema` ; fil d'Ariane : `buildBreadcrumbNode` ;
- réponses citables : `<AnswerBlock>`, question réelle en titre, réponse de
  40 à 80 mots qui se suffit à elle-même, avec le nom de l'entreprise et la ville.

**robots.txt et IA** : les robots des IA sont autorisés par défaut. Les bloquer
(`aiBots: 'block'`) est une décision business à prendre avec le client :
bloquer `PerplexityBot` rend invisible dans Perplexity ; bloquer
`Google-Extended` ne change rien au référencement Google classique.

---

## 4. Brancher le pack sur un site existant

Les sites en 0.2 gardent leur `src/data/site.ts` (ou un adaptateur qui mappe
leurs données existantes, sans les réécrire). La migration se fait à chaque
intervention, comme la mise à jour d'Astro :

1. `npm install github:RomainJulien/rjs-geo#v0.5.0` ;
2. créer `src/rjs.config.ts` qui reprend les données existantes (`defineSite`) ;
3. `rjsGeo({ site })` dans `astro.config.mjs` ;
4. supprimer `public/robots.txt`, `src/pages/robots.txt.*` et `src/pages/llms.txt.*`
   (le pack les sert ; un fichier du site reste prioritaire et le build le signale) ;
5. remplacer le SEO du `<head>` par `<SeoHead>` (prop `graph` si le site
   enrichit son propre graphe) et le lien de crédit par `<RjsCredit>` ;
6. `npm run build` : lire le rapport, corriger les ❌ (titles > 60, descriptions > 155…).

Sans config, `rjsGeo()` garde exactement le comportement 0.2 (garde-fou seul,
seuils 160 et 65). Monter 2 ou 3 sites pilotes avant une vague.

---

## 5. Le garde-fou au build

Il analyse `dist/` à chaque build, en local comme sur Netlify. En `strict`
(par défaut avec une config), un ❌ annule le déploiement : l'ancienne version
reste en ligne.

| Contrôle | Niveau |
|---|---|
| canonical différente de l'URL servie (slash, host, `.html`) | ❌ |
| URL du sitemap qui ne correspond à aucune page servie telle quelle | ❌ |
| lien interne vers une forme qui redirige (slash, www) | ❌ |
| page sans `<title>` ; title > 60 ou description > 155 (avec config) | ❌ |
| page indexable absente du sitemap, page en noindex dans le sitemap | ⚠️ |
| lien interne cassé, title ou description en double ou absents, image sans alt | ⚠️ |
| pas exactement un H1 | ⚠️ |
| FAQ balisée mais pas affichée telle quelle | ⚠️ |
| lien RJS Studio absent ou pas vers la bonne page métier | ⚠️ |
| NAP du JSON-LD absent du texte visible (§8, piège 4) | ⚠️ |
| page dédiée à la commune du siège (§8, piège 1) | ⚠️ |
| pages quasi identiques à 80 % ou plus (§8, piège 2) | ⚠️ |
| tiret cadratin dans un title ou une description, page de moins de 150 mots | · |

Un site entièrement en noindex (préparation, déploiement de test) est reconnu :
les contrôles d'indexation sont alors sautés. `npx rjs-geo check` relance le
même contrôle sur le dernier build. Ce que le build ne peut pas voir (host
servi par Netlify, variables d'environnement Netlify) est contrôlé en ligne (§10).

---

## 6. Indexation : la règle d'or et ses pièges

**Règle d'or** : l'URL qui répond **200**, sa **canonical**, son entrée
**sitemap** et les **liens internes** vers elle sont **strictement
identiques** (slash final, casse, `www` ou non). Sinon Google hésite et
reporte l'indexation, même avec un contenu parfait. Cas typique : 28 pages sur
29 non indexées parce que la canonical (sans slash) pointait vers une URL qui
redirigeait vers la page elle-même (avec slash).

**Le moment compte plus que la gravité.** Un site corrigé *avant* le premier
passage de Google s'indexe en quelques jours ; le même défaut corrigé après
des semaines en ligne met 1 à 4 semaines à remonter (Google doit désapprendre).
D'où l'ordre imposé par `launch` : contrôle vert d'abord, soumission ensuite.

**Convention de slash**, à choisir avant d'écrire le moindre lien :
- *sans slash* : `trailingSlash: 'never'` **et** `build: { format: 'file' }`.
  Sans `format: 'file'`, Astro génère `page/index.html` et Netlify redirige
  `/page` vers `/page/`. Avec, `Astro.url.pathname` vaut `/page.html` : la
  canonical doit retirer `.html` et `/index` (sinon la home sort en `/index`).
  `<SeoHead>` le fait déjà.
- *avec slash* : `trailingSlash: 'always'` (format `directory`).
- Si seuls les liens internes divergent, aligner la convention sur ce que font
  déjà les liens : zéro lien à modifier.

**Pièges de host** :
- *Primary domain Netlify* différent de `site` (www contre sans www) : 100 %
  des URL du sitemap en 301. Correctif côté Netlify (Domain management >
  Primary domain), pas dans le code. DNS : un `A` sur l'apex vers Netlify et un
  `CNAME www` vers `<projet>.netlify.app` suffisent.
- *Variable d'environnement* : un layout qui construit la canonical depuis
  `PUBLIC_SITE_URL` peut être juste en local et faux sur Netlify (variable
  réglée autrement dans le tableau de bord). La preuve se fait sur le HTML en
  ligne ; corriger avec `netlify env:set`, puis un commit vide pour reconstruire.
  `<SeoHead>` lit `site.url`, ce qui évite ce piège.
- *Adresse *.netlify.app* : redirigée en 301 vers le domaine par le pack
  (`_redirects`), en production et une fois le site lancé.

**Lire Search Console** :

| Message | Lecture |
|---|---|
| URL inconnue de Google | jamais découverte : sitemap et liens internes vers cette forme exacte |
| Aucun sitemap référent | cette forme d'URL n'est pas dans le sitemap (slash, casse) |
| Explorée, non indexée | qualité ou canonical jugées insuffisantes |
| Détectée, non indexée | file d'attente, souvent site récent : patienter |
| Autre page avec balise canonique correcte | la canonical pointe ailleurs |
| Page avec redirection | un lien interne ou le sitemap vise une forme qui redirige |

Inspecter `/page/` alors que le site utilise `/page` donne des résultats
trompeurs : ce sont deux URL distinctes pour Google.

**Après correction** : contrôle en ligne vert, sitemap resoumis (`./rjs launch`),
demande d'indexation sur 2 ou 3 pages, suivi de la couverture sur 3 à 10 jours.

---

## 7. Mise en ligne : Google, Bing, IndexNow

`./rjs launch <id>` fait tout, dans l'ordre, et note les dates dans le registre :
1. contrôle en production, bloquant (`--force` pour passer outre, à éviter) ;
2. **Google** : sitemap soumis à la propriété Search Console (de domaine de
   préférence). Google ne prend pas IndexNow et a supprimé le « ping » de
   sitemap : ensuite il relit le sitemap seul ;
3. **Bing** : propriété ajoutée si besoin, vérifiée (sinon le code
   `msvalidate.01` à mettre dans `indexing.bing`), sitemap soumis, URL
   envoyées dans la limite du quota du jour ;
4. **IndexNow** : tout le sitemap (Bing, Yandex, Seznam, Naver…). Ensuite le
   plugin Netlify envoie seul les pages modifiées à chaque déploiement.

Bing : les propriétés sont souvent enregistrées sans `www` alors que le site
redirige vers `www` ; on soumet toujours les URL finales (celles en 200). Le
Site Scan de Bing (outil d'audit) se lance à la main, un seul à la fois sur le
compte.

Accès (une fois, dans `~/.config/rjs-geo/`, jamais dans un dépôt) :
- Google : client OAuth « Application de bureau » d'un projet Google Cloud
  (API Search Console activée, appli publiée), puis `./rjs google-login`. Le
  CLI agit au nom du propriétaire des propriétés : rien à faire par site. Les
  clés de compte de service sont souvent bloquées par les règles des
  organisations Google Workspace ;
- Bing : clé API (Paramètres > Accès API), valable pour tout le compte.

---

## 8. Pages villes : quatre pièges structurels

Ils viennent de l'architecture des pages, pas du package. Le garde-fou en
détecte trois ; le correctif reste humain.

1. **La commune du siège cannibalise l'accueil.** Une page « couvreur à
   [commune du siège] » vise la même requête que l'accueil. Correctif : retirer
   cette commune des pages villes, 301 de l'ancienne URL vers l'accueil, et
   corriger **tous** les liens internes (helper `villeHref` qui renvoie `/`
   pour le siège). Ne jamais le faire pendant qu'une demande d'indexation est
   en cours sur cette page : demander d'abord.
2. **Quasi-doublons.** Des pages villes issues d'un même gabarit, où seul le
   nom de la commune change, sont filtrées par Google (« entrées très
   similaires omises »). Le correctif, c'est 200 à 300 mots réellement locaux
   par commune (chantier sur place, quartier, contrainte particulière).
3. **Distances saisies à la main.** Elles dérivent vite (écarts de 2 à 4 fois
   observés). Les calculer depuis les coordonnées de l'entreprise vers le
   centre de chaque commune (`geo.api.gouv.fr`, formule haversine, × 1,2 à 1,3
   pour une distance routière) et trier les communes par distance.
4. **NAP invisible ou différent.** L'adresse et le téléphone du JSON-LD doivent
   apparaître en texte visible (pied de page, contact) et être identiques à la
   fiche Google, au caractère près.

---

## 9. Citations et liens

Pour un artisan, les liens utiles sont des **citations** cohérentes et de
**vraies relations locales**, pas des liens achetés.

- `./rjs citations <id>` : kit dans le dossier du client. Fiche à recopier
  partout (tirée du JSON-LD, donc sans invention), descriptions courte et
  longue, annuaires adaptés au métier, modèle de courriel pour les partenaires.
  - socle : Google Business Profile, **Apple Business Connect** (Plans, Siri),
    **Bing Places** (import de la fiche Google), PagesJaunes (fiche gratuite,
    refuser les options payantes), Annuaire des Entreprises (vérifier SIRENE) ;
  - ensuite : page Facebook, Hoodspot, mairie ;
  - selon le métier : bâtiment (Houzz, annuaire RGE, Qualibat, CAPEB/FFB, CMA,
    fournisseurs), taxi (liste CPAM des taxis conventionnés, page taxis de la
    commune, office de tourisme), hébergement (office de tourisme, labels,
    agence départementale), bien-être (Resalib, CMA), services (LinkedIn, CCI,
    réseaux d'entrepreneurs), boutique (Merchant Center, LinkedIn).
- Les comptes se créent avec le client, une fois (SMS, courrier, CAPTCHA,
  conditions d'utilisation). Environ une heure par client.
- `./rjs links add <id> <url> --source "…"` puis `./rjs links <id|all>` : suivi
  des liens obtenus ; `check` signale un lien disparu.
- À ne pas faire : acheter des liens ou des « packs annuaires », relier entre
  eux des sites clients sans rapport, ancres « mot-clé » dans les pieds de page.
- Le lien « Site réalisé par RJS Studio » : ancre de marque, vers la page
  métier de romainjulien.studio (`METIER_PAGES` dans `src/config.ts`).

Bing remonte aussi des liens entrants (`status`), mais avec des semaines de retard.

---

## 10. Suivi du portefeuille

Registre unique : `RJS-OPS/sites.json` (privé). Lanceur : `RJS-OPS/rjs`.

| Commande | Quand |
|---|---|
| `./rjs check <id\|all>` | contrôle en production (host, robots, sitemap, 200 + canonical de chaque URL, noindex, clé IndexNow, llms.txt, lien RJS, longueurs, alt, liens suivis) |
| `./rjs status <id\|all>` | sitemaps lus par Google, propriété Bing, liens vus par Bing |
| `./rjs sitemaps <id> [--remove <url>]` | sitemaps obsolètes déclarés dans Search Console |
| `./rjs versions` | version de `@rjs/geo` de chaque site |
| `./rjs conseils <id>` | build propre local : conseils et garde-fou |
| `./rjs sync` | remet les copies locales à jour |

La tâche planifiée « Contrôle SEO lundi » (cloud) lance `check all` chaque
lundi et n'envoie une alerte que pour un ❌. Elle n'a aucun accès Google ou
Bing (aucun secret dans le texte d'une tâche).

---

## 11. Réflexes de travail

- Ne jamais inventer une donnée (SIRET, coordonnées, avis, distance, date).
- Une branche par chantier, jamais directement sur la branche qui déploie ;
  commit et push seulement avec l'accord de Romain.
- Avant de toucher un dossier client, vérifier le chemin complet et le nom du
  dirigeant (deux clients du même métier se confondent vite).
- Un site piloté par une autre session ou en cours de travail ailleurs : ne
  pas y toucher sans demande explicite.
- Textes générés sans tiret cadratin.
- Après un push, ne pas surveiller le déploiement : Romain vérifie lui-même.
