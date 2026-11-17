/**
 * Kit citations : où inscrire un client (annuaires, fiches, liens locaux) et
 * avec quelles informations, exactement les mêmes partout (cohérence NAP :
 * nom, adresse, téléphone). Généré depuis le JSON-LD du site, donc sans rien
 * inventer : un champ absent du site reste « à compléter ».
 *
 * Ce qui ne s'automatise pas (et ne doit pas l'être) : la création des comptes.
 * Elle demande souvent un SMS ou un courrier au client, un CAPTCHA et
 * l'acceptation de conditions. Une fois par client, à faire avec lui.
 */

export type Family = 'batiment' | 'taxi' | 'hebergement' | 'bien-etre' | 'services' | 'commerce';

export const FAMILY_LABEL: Record<Family, string> = {
  batiment: 'artisan du bâtiment',
  taxi: 'taxi / VTC',
  hebergement: 'hébergement touristique',
  'bien-etre': 'bien-être',
  services: 'services et conseil',
  commerce: 'commerce en ligne',
};

export type Directory = {
  name: string;
  url?: string;
  /** Pour qui : toutes les familles si absent. */
  families?: Family[];
  /** essentiel = à faire au lancement ; utile = ensuite ; si = seulement si la condition est remplie. */
  priority: 'essentiel' | 'utile' | 'si';
  /** Ce que ça apporte, en une phrase. */
  why: string;
  /** Ce qu'il faut avoir sous la main. */
  needs?: string;
};

export const DIRECTORIES: Directory[] = [
  // Socle, pour tous les clients locaux
  { name: 'Google Business Profile', url: 'https://business.google.com', priority: 'essentiel', why: 'La source n°1 du référencement local et des réponses des IA (carte, avis, horaires).', needs: 'Accès du client, vérification par vidéo ou courrier.' },
  { name: 'Apple Business Connect', url: 'https://businessconnect.apple.com', priority: 'essentiel', why: 'Fiche dans Plans, Siri et Spotlight, sur tous les iPhone, iPad et Mac.', needs: 'Identifiant Apple (idéalement celui du client), SIRET, vérification par téléphone ou document.' },
  { name: 'Bing Places', url: 'https://www.bingplaces.com', priority: 'essentiel', why: 'Alimente Bing, Copilot et ChatGPT (recherche web) ; import de la fiche Google en quelques clics.', needs: 'Accès à la fiche Google du client.' },
  { name: 'PagesJaunes', url: 'https://www.pagesjaunes.fr', priority: 'essentiel', why: 'Annuaire le plus consulté en France, ses données sont reprises par de nombreux sites.', needs: 'SIRET, téléphone du client (code de vérification). Refuser les options payantes proposées.' },
  { name: 'Annuaire des Entreprises (État)', url: 'https://annuaire-entreprises.data.gouv.fr', priority: 'essentiel', why: 'Fiche officielle tirée du répertoire SIRENE, lue par Google et les IA : vérifier que nom, adresse et activité sont justes.', needs: 'Rien à créer. Une erreur se corrige au guichet unique (INPI).' },
  { name: 'Page Facebook professionnelle', url: 'https://www.facebook.com/pages/create', priority: 'utile', why: 'Profil de marque souvent cité par Google (sameAs) ; à remplir même si le client ne publie pas.' },
  { name: 'Hoodspot', url: 'https://www.hoodspot.fr', priority: 'utile', why: 'Annuaire local gratuit, fiche avec lien vers le site.' },
  { name: 'Mairie de la commune', priority: 'utile', why: 'Beaucoup de communes listent les entreprises locales : lien local très crédible.', needs: 'Un courriel au secrétariat de mairie (modèle plus bas).' },

  // Bâtiment
  { name: 'Houzz', url: 'https://www.houzz.fr', families: ['batiment'], priority: 'utile', why: 'Plateforme travaux et rénovation : profil pro gratuit avec photos de chantiers et lien vers le site.', needs: 'Photos de chantiers réels.' },
  { name: 'Annuaire France Rénov\' (RGE)', url: 'https://france-renov.gouv.fr/annuaire-rge', families: ['batiment'], priority: 'si', why: 'Si l\'entreprise est RGE : fiche officielle automatique, à vérifier.', needs: 'Qualification RGE en cours de validité.' },
  { name: 'Qualibat', url: 'https://www.qualibat.com', families: ['batiment'], priority: 'si', why: 'Si l\'entreprise est qualifiée : annuaire des entreprises qualifiées.' },
  { name: 'CAPEB ou FFB du département', families: ['batiment'], priority: 'si', why: 'Si le client est adhérent : annuaire des adhérents, lien de fédération professionnelle.' },
  { name: 'Chambre de Métiers et de l\'Artisanat', families: ['batiment', 'bien-etre'], priority: 'utile', why: 'Annuaire ou vitrine des artisans de la chambre départementale (selon la CMA).' },
  { name: 'Fournisseurs et fabricants', families: ['batiment'], priority: 'utile', why: 'Pages « installateurs / poseurs agréés » des marques utilisées (menuiseries, couverture, isolation) : liens de qualité et du métier.', needs: 'Liste des marques posées par le client.' },

  // Taxi / VTC
  { name: 'Taxis conventionnés de l\'Assurance Maladie', url: 'https://www.ameli.fr', families: ['taxi'], priority: 'si', why: 'Si le taxi est conventionné CPAM : vérifier sa présence et ses coordonnées dans la liste de la caisse.' },
  { name: 'Page « taxis » de la commune de l\'ADS', families: ['taxi'], priority: 'utile', why: 'Beaucoup de mairies listent les taxis autorisés de la commune : lien local fort.', needs: 'Numéro d\'ADS.' },
  { name: 'Office de tourisme', families: ['taxi', 'hebergement'], priority: 'essentiel', why: 'Rubrique transports ou hébergements de l\'office de tourisme : lien très crédible et visiteurs qualifiés.' },

  // Hébergement
  { name: 'Gîtes de France ou Clévacances', families: ['hebergement'], priority: 'si', why: 'Si le gîte est labellisé : fiche du label avec lien.' },
  { name: 'Agence départementale du tourisme', families: ['hebergement'], priority: 'utile', why: 'Souvent alimentée par l\'office de tourisme : vérifier que la fiche du gîte y remonte.' },

  // Bien-être
  { name: 'Resalib', url: 'https://www.resalib.fr', families: ['bien-etre'], priority: 'utile', why: 'Annuaire et prise de rendez-vous des praticiens du bien-être, fiche avec lien.' },

  // Services, conseil
  { name: 'Page entreprise LinkedIn', url: 'https://www.linkedin.com/company/setup/new', families: ['services', 'commerce'], priority: 'essentiel', why: 'Profil de marque très lu par les IA pour une activité B2B.' },
  { name: 'CCI et réseaux d\'entrepreneurs', families: ['services'], priority: 'utile', why: 'Annuaires des membres (clubs d\'entreprises, réseaux d\'affaires locaux) : liens locaux et B2B.' },

  // Commerce en ligne
  { name: 'Google Merchant Center', url: 'https://merchants.google.com', families: ['commerce'], priority: 'essentiel', why: 'Fiches produits gratuites dans Google Shopping et Images.', needs: 'Flux produits (le site doit pouvoir le générer).' },
];

/** Famille du client : métier RJS d'abord, sinon @type schema.org du site. */
export function familyOf(opts: { metier?: string; types?: string[] }): Family {
  const m = opts.metier ?? '';
  if (/couvreur|zingueur|charpentier|artisan|elag|serrur|plomb|electric|menuis|macon|construct|batiment/.test(m)) return 'batiment';
  if (/taxi|vtc/.test(m)) return 'taxi';
  if (/gite|location|heberg/.test(m)) return 'hebergement';
  const t = (opts.types ?? []).join(' ');
  if (/RoofingContractor|Locksmith|GeneralContractor|HomeAndConstruction|Plumber|Electrician|HVAC|Roofing/.test(t)) return 'batiment';
  if (/TaxiService/.test(t)) return 'taxi';
  if (/Lodging|Accommodation|BedAndBreakfast|Campground/.test(t)) return 'hebergement';
  if (/HealthAndBeauty|DaySpa|BeautySalon/.test(t)) return 'bien-etre';
  if (/OnlineStore|Store/.test(t)) return 'commerce';
  return 'services';
}

export const directoriesFor = (f: Family) => DIRECTORIES.filter((d) => !d.families || d.families.includes(f));

/* ─── Données de la fiche, lues dans le JSON-LD du site ─────────────────── */

export type Nap = {
  name?: string;
  legalName?: string;
  types: string[];
  description?: string;
  url: string;
  phone?: string;
  email?: string;
  street?: string;
  postalCode?: string;
  city?: string;
  region?: string;
  areas: string[];
  hours: string[];
  siret?: string;
  sameAs: string[];
  services: string[];
  founder?: string;
};

type Node = Record<string, any>;

const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
const JOURS = ['lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi', 'dimanche'];
/** « Monday, Tuesday… » ou schema.org/Monday → « du lundi au samedi » / « lundi, mercredi ». */
function frenchDays(list: string[]): string {
  const idx = list.map((d) => DAYS.indexOf(String(d).replace(/^https?:\/\/schema\.org\//, ''))).filter((i) => i >= 0).sort((a, b) => a - b);
  if (!idx.length) return list.join(', ');
  const contiguous = idx.every((v, i) => i === 0 || v === idx[i - 1] + 1);
  if (contiguous && idx.length > 2) return `du ${JOURS[idx[0]]} au ${JOURS[idx[idx.length - 1]]}`;
  return idx.map((i) => JOURS[i]).join(', ');
}
/** Pas de tiret cadratin dans les textes du kit (même repris du site du client). */
export const noEmDash = (t?: string) => t?.replace(/\s*—\s*/g, ', ').replace(/,\s*,/g, ',');
const arr = <T>(x: T | T[] | undefined): T[] => (x === undefined ? [] : Array.isArray(x) ? x : [x]);

/** Extrait l'entreprise principale du graphe JSON-LD de l'accueil. */
export function napFromJsonLd(blocks: unknown[], siteUrl: string): Nap | undefined {
  const nodes: Node[] = [];
  const walk = (x: unknown) => {
    if (Array.isArray(x)) x.forEach(walk);
    else if (x && typeof x === 'object') {
      const n = x as Node;
      if (n['@type']) nodes.push(n);
      if (n['@graph']) walk(n['@graph']);
    }
  };
  walk(blocks);
  const typesOf = (n: Node) => arr<string>(n['@type']);
  const isBiz = (n: Node) => typesOf(n).some((t) => !['WebSite', 'WebPage', 'Person', 'Service', 'FAQPage', 'BreadcrumbList', 'BlogPosting', 'CreativeWork', 'Offer', 'OfferCatalog', 'ImageObject', 'Question', 'Answer', 'ListItem', 'PostalAddress'].includes(t));
  const biz = nodes.find((n) => isBiz(n) && n.address) ?? nodes.find(isBiz);
  if (!biz) return undefined;
  const byId = new Map(nodes.filter((n) => n['@id']).map((n) => [n['@id'], n]));
  const addr: Node = biz.address ?? {};
  const founder = arr<Node>(biz.founder).map((f) => (f['@id'] ? byId.get(f['@id']) : f)).find(Boolean);
  const siret = arr<Node>(biz.identifier).find((i) => /SIRE/i.test(String(i.propertyID ?? '')))?.value;
  return {
    name: biz.name,
    legalName: biz.legalName,
    types: typesOf(biz),
    description: noEmDash(biz.description),
    url: biz.url ?? siteUrl,
    phone: biz.telephone,
    email: biz.email,
    street: addr.streetAddress,
    postalCode: addr.postalCode,
    city: addr.addressLocality,
    region: addr.addressRegion,
    areas: arr<Node | string>(biz.areaServed).map((a) => (typeof a === 'string' ? a : a.name)).filter(Boolean),
    hours: arr<Node>(biz.openingHoursSpecification).map((h) => `${frenchDays(arr<string>(h.dayOfWeek))}, ${String(h.opens).slice(0, 5).replace(':', ' h ').replace(/^0/, '')} à ${String(h.closes).slice(0, 5).replace(':', ' h ').replace(/^0/, '')}`),
    siret: siret ? String(siret) : undefined,
    sameAs: arr<string>(biz.sameAs),
    services: nodes.filter((n) => typesOf(n).includes('Service')).map((n) => n.name).filter(Boolean),
    founder: founder?.name,
  };
}

/* ─── Kit au format Markdown ─────────────────────────────────────────────── */

const TODO = '**à compléter**';
const fmtPhone = (p?: string) => {
  if (!p) return { national: undefined, intl: undefined };
  const d = p.replace(/[^\d+]/g, '');
  const nat = d.startsWith('+33') ? '0' + d.slice(3) : d;
  return { national: nat.replace(/(\d{2})(?=\d)/g, '$1 ').trim(), intl: nat.startsWith('0') ? '+33 ' + nat.slice(1).replace(/(\d)(\d{2})(\d{2})(\d{2})(\d{2})/, '$1 $2 $3 $4 $5') : d };
};
const cut = (s: string, n: number) => (s.length <= n ? s : s.slice(0, s.lastIndexOf(' ', n - 1)).replace(/[,;:]$/, '') + '.');

export function buildCitationKit(opts: { nap: Nap; family: Family; host: string; date?: string }): string {
  const { nap, family, host } = opts;
  const phone = fmtPhone(nap.phone);
  const address = [nap.street, [nap.postalCode, nap.city].filter(Boolean).join(' ')].filter(Boolean).join(', ');
  const zone = nap.areas.slice(0, 8).join(', ');
  const short = nap.description ? cut(nap.description.replace(/\s+/g, ' ').trim(), 160) : undefined;
  const long = [
    nap.description?.trim(),
    nap.services.length ? `Prestations : ${nap.services.slice(0, 8).join(', ')}.` : '',
    zone ? `Intervention : ${zone}.` : '',
  ].filter(Boolean).join(' ');
  const dirs = directoriesFor(family);
  const row = (d: Directory) => `| [ ] | ${d.url ? `[${d.name}](${d.url})` : d.name} | ${d.why} | ${d.needs ?? ''} |  |`;
  const section = (title: string, list: Directory[]) =>
    list.length ? [`### ${title}`, '', '| Fait | Où | Pourquoi | Il faut | Adresse de la fiche |', '|---|---|---|---|---|', ...list.map(row), ''] : [];

  return [
    `# Kit citations : ${nap.name ?? host}`,
    '',
    `Généré par @rjs/geo le ${opts.date ?? new Date().toISOString().slice(0, 10)} depuis le JSON-LD de https://${host}/ (famille : ${FAMILY_LABEL[family]}).`,
    'Règle d\'or : **exactement les mêmes informations partout**, copiées depuis ce kit. Une adresse ou un téléphone écrit différemment d\'un annuaire à l\'autre affaiblit la fiche Google.',
    '',
    '## 1. La fiche à recopier partout',
    '',
    '| Champ | Valeur |',
    '|---|---|',
    `| Nom de l'entreprise | ${nap.name ?? TODO} |`,
    ...(nap.legalName && nap.legalName !== nap.name ? [`| Raison sociale | ${nap.legalName} |`] : []),
    `| Adresse | ${address || TODO} |`,
    `| Téléphone | ${phone.national ?? TODO}${phone.intl ? ` (international : ${phone.intl})` : ''} |`,
    `| Site internet | ${nap.url.replace(/\/?$/, '/')} |`,
    `| E-mail | ${nap.email ?? TODO} |`,
    `| SIRET | ${nap.siret ?? TODO} |`,
    `| Horaires | ${nap.hours.length ? nap.hours.join(' ; ') : TODO} |`,
    `| Zone d'intervention | ${zone || TODO} |`,
    `| Dirigeant | ${nap.founder ?? TODO} |`,
    `| Catégorie principale | ${TODO} (la même que sur la fiche Google) |`,
    '',
    '**Description courte (160 caractères max)**',
    '',
    `> ${short ?? TODO}`,
    '',
    '**Description longue**',
    '',
    `> ${long || TODO}`,
    '',
    'Toujours mettre l\'adresse du site telle quelle, sans paramètre de suivi. Photos : logo carré, 3 à 5 photos réelles (chantiers, équipe, locaux), les mêmes partout.',
    '',
    `## 2. Où l'inscrire (${FAMILY_LABEL[family]})`,
    '',
    'Noter dans la dernière colonne l\'adresse de la fiche une fois en ligne, puis l\'enregistrer pour le suivi automatique :',
    '',
    '```bash',
    `./rjs links add <site> <adresse-de-la-fiche> --source "<annuaire>"`,
    '```',
    '',
    ...section('À faire au lancement', dirs.filter((d) => d.priority === 'essentiel')),
    ...section('Ensuite', dirs.filter((d) => d.priority === 'utile')),
    ...section('Seulement si', dirs.filter((d) => d.priority === 'si')),
    '## 3. Liens locaux à demander',
    '',
    'Les meilleurs liens d\'un artisan viennent de vraies relations : fournisseurs, partenaires, clients professionnels, mairie, club sportif sponsorisé, presse locale (article sur un chantier). Modèle de courriel :',
    '',
    '> Objet : lien vers notre site sur votre page partenaires',
    '>',
    `> Bonjour, nous travaillons ensemble depuis [durée]. ${nap.name ?? 'Notre entreprise'} vient de mettre en ligne son nouveau site : ${nap.url.replace(/\/?$/, '/')}. Si vous avez une page partenaires, installateurs ou entreprises locales, accepteriez-vous d'y ajouter un lien vers notre site ? Nous pouvons faire de même de notre côté. Merci d'avance, [prénom], ${phone.national ?? '[téléphone]'}.`,
    '',
    '## 4. À ne pas faire',
    '',
    '- Acheter des liens ou des « packs annuaires » : au mieux inutile, au pire pénalisant.',
    '- Relier entre eux des sites clients qui n\'ont rien en commun.',
    '- Payer les options mises en avant des annuaires (PagesJaunes, plateformes de devis) : la fiche gratuite suffit pour le référencement.',
    '',
  ].join('\n');
}
