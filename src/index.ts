/**
 * @rjs/geo — Couche GEO/SEO partagée pour les sites Astro de RJS Studio.
 *
 * Éprouvée sur 7 métiers (couvreur, taxi multi-entités, conseil+blog, bien-être,
 * nettoyage drone, zinguerie/portfolio, agence bilingue). Le package fournit la
 * mécanique ; chaque site écrit un petit `data/site.ts` (ou un adaptateur qui
 * mappe ses données existantes) vers les schémas ci-dessous.
 *
 * Composant Astro : importer directement `@rjs/geo/AnswerBlock.astro`.
 */
export * from './schemas';
export * from './graph';
export * from './llms';
export * from './audit';
