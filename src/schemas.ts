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
  founder: FounderSchema.optional(),
  logo: z.string().url().optional(),
  /** SIRET/SIREN — devient un identifier PropertyValue. */
  siret: z.string().min(1).optional(),
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
