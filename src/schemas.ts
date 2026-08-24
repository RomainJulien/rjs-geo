import { z } from 'zod';

/**
 * Couche GEO partagée — schémas Zod (SUPERSET définitif, base de @rjs/geo).
 *
 * Cumule les besoins des 4 métiers portés (couvreur, taxi multi-entités,
 * conseil+blog, cabinet bien-être) :
 *   · plusieurs entités par site (`primary`) ;
 *   · `@type` chaîne ou tableau ;
 *   · `founder` Person (E-E-A-T), `alternateName` ;
 *   · `areaServed` typé (City / AdministrativeArea / State / Country) ;
 *   · `geo`, `streetAddress`, `region` optionnels ;
 *   · horaires par jour (`hours`), `logo`, `siret` (identifier) ;
 *   · services (page optionnelle) et articles de blog.
 */

export const GeoSchema = z.object({
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
});

export const AddressSchema = z.object({
  street: z.string().min(1).optional(),
  city: z.string().min(1),
  postalCode: z.string().regex(/^\d{5}$/, 'Code postal FR à 5 chiffres attendu'),
  region: z.string().min(1).optional(),
});

export const AreaSchema = z.object({
  name: z.string().min(1),
  type: z.enum(['City', 'AdministrativeArea', 'State', 'Country']).default('City'),
});

/** Une plage horaire : un ou plusieurs jours, mêmes heures. */
export const OpeningHoursSchema = z.object({
  days: z.array(z.string().min(1)).min(1),
  opens: z.string().regex(/^\d{2}:\d{2}$/, 'Format HH:MM attendu'),
  closes: z.string().regex(/^\d{2}:\d{2}$/, 'Format HH:MM attendu'),
});

export const FounderSchema = z.object({
  name: z.string().min(1),
  jobTitle: z.string().min(1).optional(),
  phone: z.string().optional(),
  email: z.string().email().optional(),
  sameAs: z.array(z.string().url()).default([]),
});

/** Un avis client. `date` accepte AAAA-MM (précision au mois, cas Google Maps qui
 * n'affiche que des dates relatives) ou AAAA-MM-JJ si le jour exact est connu. */
export const ReviewSchema = z.object({
  author: z.string().min(1),
  date: z.string().regex(/^\d{4}-\d{2}(-\d{2})?$/, 'Format AAAA-MM ou AAAA-MM-JJ attendu'),
  rating: z.number().min(1).max(5),
  text: z.string().min(1),
});

/**
 * Note moyenne + avis d'une entité. Champ `reviews` optionnel : `value`/`count`
 * seuls suffisent à émettre un `AggregateRating` sans le détail des avis.
 *
 * ⚠️ Un `aggregateRating` déclaré ici sur un LocalBusiness n'affiche PAS
 * d'étoiles dans les résultats Google (politique anti « self-serving reviews »,
 * en vigueur depuis septembre 2019) — Google ignore ce balisage pour ce type
 * d'entité. L'intérêt reste réel : cohérence de l'entité pour le Knowledge
 * Graph, et citation par les IA (GEO), pas le rich snippet.
 */
export const AggregateRatingSchema = z.object({
  value: z.number().min(1).max(5),
  count: z.number().int().min(1),
  reviews: z.array(ReviewSchema).default([]),
});

export const BusinessSchema = z.object({
  slug: z.string().regex(/^[a-z0-9-]+$/),
  primary: z.boolean().default(false),
  name: z.string().min(1),
  alternateName: z.array(z.string().min(1)).default([]),
  legalName: z.string().min(1).optional(),
  type: z.union([z.string().min(1), z.array(z.string().min(1)).min(1)]),
  description: z.string().min(1),
  phone: z.string().optional(),
  phoneHref: z.string().startsWith('tel:').optional(),
  email: z.string().email().optional(),
  url: z.string().url(),
  address: AddressSchema.optional(),
  geo: GeoSchema.optional(),
  hasMap: z.string().url().optional(),
  hours: z.array(OpeningHoursSchema).default([]),
  priceRange: z.string().min(1).optional(),
  areaServed: z.array(AreaSchema).default([]),
  sameAs: z.array(z.string().url()).default([]),
  /** Un·e fondateur·rice, ou plusieurs (co-fondateurs). */
  founder: z.union([FounderSchema, z.array(FounderSchema).min(1)]).optional(),
  logo: z.string().url().optional(),
  /** SIRET/SIREN — devient un identifier PropertyValue. */
  siret: z.string().min(1).optional(),
  /** Note moyenne + avis. Voir AggregateRatingSchema pour la limite Google. */
  rating: AggregateRatingSchema.optional(),
});

export const SiteSchema = z.object({
  name: z.string().min(1),
  url: z.string().url(),
  email: z.string().email().optional(),
  description: z.string().min(1),
  ogImage: z.string().url().optional(),
});

export const ServiceSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1),
  description: z.string().min(1),
  href: z.string().startsWith('/').optional(),
});

export type ArticleRef = {
  slug: string;
  title: string;
  description: string;
  pubDate: Date | string;
  author?: string;
  image?: string;
};

export type Geo = z.infer<typeof GeoSchema>;
export type Address = z.infer<typeof AddressSchema>;
export type Area = z.infer<typeof AreaSchema>;
export type OpeningHours = z.infer<typeof OpeningHoursSchema>;
export type Founder = z.infer<typeof FounderSchema>;
export type Review = z.infer<typeof ReviewSchema>;
export type AggregateRating = z.infer<typeof AggregateRatingSchema>;
export type Business = z.infer<typeof BusinessSchema>;
export type Site = z.infer<typeof SiteSchema>;
export type Service = z.infer<typeof ServiceSchema>;

export function parseOrThrow<T>(schema: z.ZodType<T>, data: unknown, label: string): T {
  const result = schema.safeParse(data);
  if (!result.success) {
    const issues = result.error.issues
      .map((i) => `  · ${i.path.join('.') || '(racine)'} — ${i.message}`)
      .join('\n');
    throw new Error(`[GEO] Données « ${label} » invalides :\n${issues}`);
  }
  return result.data;
}
