import type { Site, Business, Service, ArticleRef } from './schemas';

/**
 * Couche GEO partagée — graphe JSON-LD relié par @id (SUPERSET définitif).
 * Voir schemas.ts pour l'inventaire des champs supportés.
 */

const businessId = (site: Site, b: Business) => `${site.url}/#${b.slug}`;
const founderId = (site: Site, b: Business) => `${site.url}/#${b.slug}-founder`;
const websiteId = (site: Site) => `${site.url}/#website`;
const serviceId = (site: Site, s: Service) => `${site.url}/#service-${s.id}`;

function businessNode(site: Site, b: Business, services: readonly Service[], anchor: boolean) {
  // Les tableaux optionnels peuvent être absents des données brutes (Zod ne
  // les remplit qu'à la validation, pas sur l'objet source) → on sécurise.
  const alternateName = b.alternateName ?? [];
  const areaServed = b.areaServed ?? [];
  const hours = b.hours ?? [];
  const sameAs = b.sameAs ?? [];
  return {
    '@type': b.type,
    '@id': businessId(site, b),
    name: b.name,
    ...(alternateName.length ? { alternateName } : {}),
    ...(b.legalName ? { legalName: b.legalName } : {}),
    description: b.description,
    url: b.url,
    ...(b.phoneHref ? { telephone: b.phoneHref.replace('tel:', '') } : {}),
    ...(b.email ? { email: b.email } : {}),
    ...(site.ogImage ? { image: site.ogImage } : {}),
    ...(b.logo ? { logo: { '@type': 'ImageObject', url: b.logo } } : {}),
    ...(b.priceRange ? { priceRange: b.priceRange } : {}),
    ...(b.siret
      ? { identifier: { '@type': 'PropertyValue', propertyID: 'SIRET', value: b.siret.replace(/\s/g, '') } }
      : {}),
    ...(b.address
      ? {
          address: {
            '@type': 'PostalAddress',
            ...(b.address.street ? { streetAddress: b.address.street } : {}),
            addressLocality: b.address.city,
            postalCode: b.address.postalCode,
            ...(b.address.region ? { addressRegion: b.address.region } : {}),
            addressCountry: 'FR',
          },
        }
      : {}),
    ...(b.geo ? { geo: { '@type': 'GeoCoordinates', latitude: b.geo.lat, longitude: b.geo.lng } } : {}),
    ...(b.hasMap ? { hasMap: b.hasMap } : {}),
    ...(areaServed.length
      ? { areaServed: areaServed.map((a) => ({ '@type': a.type, name: a.name })) }
      : {}),
    ...(hours.length
      ? {
          openingHoursSpecification: hours.map((h) => ({
            '@type': 'OpeningHoursSpecification',
            dayOfWeek: h.days,
            opens: h.opens,
            closes: h.closes,
          })),
        }
      : {}),
    ...(b.founder ? { founder: { '@id': founderId(site, b) } } : {}),
    ...(anchor && services.length
      ? {
          hasOfferCatalog: {
            '@type': 'OfferCatalog',
            name: `Prestations — ${b.name}`,
            itemListElement: services.map((s) => ({
              '@type': 'Offer',
              itemOffered: { '@id': serviceId(site, s) },
            })),
          },
        }
      : {}),
    ...(sameAs.length ? { sameAs } : {}),
  };
}

function founderNode(site: Site, b: Business) {
  const f = b.founder!;
  const fSameAs = f.sameAs ?? [];
  return {
    '@type': 'Person',
    '@id': founderId(site, b),
    name: f.name,
    ...(f.jobTitle ? { jobTitle: f.jobTitle } : {}),
    ...(f.phone ? { telephone: f.phone } : {}),
    ...(f.email ? { email: f.email } : {}),
    ...(fSameAs.length ? { sameAs: fSameAs } : {}),
    worksFor: { '@id': businessId(site, b) },
  };
}

function websiteNode(site: Site, anchorBiz: Business, locale: string) {
  return {
    '@type': 'WebSite',
    '@id': websiteId(site),
    url: site.url,
    name: site.name,
    inLanguage: locale,
    publisher: { '@id': businessId(site, anchorBiz) },
  };
}

function serviceNodes(site: Site, services: readonly Service[], anchorBiz: Business) {
  return services.map((s) => ({
    '@type': 'Service',
    '@id': serviceId(site, s),
    name: s.title,
    description: s.description,
    ...(s.href ? { url: `${site.url}${s.href}` } : {}),
    serviceType: s.title,
    provider: { '@id': businessId(site, anchorBiz) },
  }));
}

export function buildArticleNode(opts: { site: Site; business: Business; article: ArticleRef; path: string }) {
  const { site, business, article, path } = opts;
  const date =
    article.pubDate instanceof Date ? article.pubDate.toISOString() : new Date(article.pubDate).toISOString();
  const authorIsFounder = business.founder && article.author === business.founder.name;
  return {
    '@type': 'BlogPosting',
    '@id': `${site.url}${path}#article`,
    headline: article.title,
    description: article.description,
    datePublished: date,
    inLanguage: 'fr-FR',
    author: authorIsFounder
      ? { '@id': founderId(site, business) }
      : { '@type': 'Person', name: article.author ?? business.name },
    publisher: { '@id': businessId(site, business) },
    mainEntityOfPage: `${site.url}${path}`,
    ...(article.image ? { image: article.image } : {}),
  };
}

/** Une réalisation/chantier documenté (portfolio). */
export type ProjectRef = {
  id: string;
  title: string;
  description: string;
  date: Date | string;
  city?: string;
  postalCode?: string;
  region?: string;
  serviceType?: string;
  keywords?: string[];
};

/**
 * Nœud CreativeWork pour une réalisation datée et localisée — la matière
 * « indéboulonnable » : elle n'existe nulle part ailleurs. Reliée à l'entité
 * (creator) par @id. À passer en `extraNodes` depuis la page projet.
 */
export function buildProjectNode(opts: { site: Site; business: Business; project: ProjectRef; path: string }) {
  const { site, business, project, path } = opts;
  const date = project.date instanceof Date ? project.date.toISOString() : new Date(project.date).toISOString();
  return {
    '@type': 'CreativeWork',
    '@id': `${site.url}${path}#project`,
    name: project.title,
    description: project.description,
    dateCreated: date,
    ...(project.serviceType ? { about: project.serviceType } : {}),
    ...(project.city
      ? {
          locationCreated: {
            '@type': 'Place',
            name: project.city,
            address: {
              '@type': 'PostalAddress',
              addressLocality: project.city,
              ...(project.postalCode ? { postalCode: project.postalCode } : {}),
              ...(project.region ? { addressRegion: project.region } : {}),
              addressCountry: 'FR',
            },
          },
        }
      : {}),
    creator: { '@id': `${site.url}/#${business.slug}` },
    ...(project.keywords?.length ? { keywords: project.keywords.join(', ') } : {}),
    mainEntityOfPage: `${site.url}${path}`,
  };
}

export type BuildGraphInput = {
  site: Site;
  businesses: readonly Business[];
  services?: readonly Service[];
  extraNodes?: object[];
  /** Langue de la page (BCP-47, ex. 'fr-FR' / 'en-US') → inLanguage du WebSite. */
  locale?: string;
};

export function buildGraph({ site, businesses, services = [], extraNodes = [], locale = 'fr-FR' }: BuildGraphInput) {
  if (!businesses.length) {
    throw new Error('[GEO] buildGraph : au moins une entité (business) est requise.');
  }
  const anchor = businesses.find((b) => b.primary) ?? businesses[0];

  const entityNodes = [
    ...businesses.map((b) => businessNode(site, b, services, b.slug === anchor.slug)),
    ...businesses.filter((b) => b.founder).map((b) => founderNode(site, b)),
    websiteNode(site, anchor, locale),
    ...serviceNodes(site, services, anchor),
  ];

  const pageNodes = extraNodes.map((node) => {
    const { '@context': _drop, ...rest } = node as Record<string, unknown>;
    return rest;
  });

  return {
    '@context': 'https://schema.org',
    '@graph': [...entityNodes, ...pageNodes],
  };
}
