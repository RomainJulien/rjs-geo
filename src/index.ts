/**
 * @rjs/geo — Couche GEO/SEO partagée pour les sites Astro de RJS Studio.
 *
 * Éprouvée sur 7 métiers (couvreur, taxi multi-entités, conseil+blog, bien-être,
 * nettoyage drone, zinguerie/portfolio, agence bilingue). Le package fournit la
 * mécanique ; chaque site écrit un petit `data/site.ts` (ou un adaptateur qui
 * mappe ses données existantes) vers les schémas ci-dessous.
 *
 * Composants Astro : `@rjs/geo/SeoHead.astro`, `RjsCredit.astro`, `Faq.astro`,
 * `AnswerBlock.astro` (importer directement).
 */
export * from './schemas.js';
export * from './graph.js';
export * from './llms.js';
export * from './audit.js';
export * from './config.js';
export * from './robots.js';
export { scanDist, reportScan, readPages, type ScanFinding, type ScanOptions } from './scan.js';
export { checkLive, type LiveSite, type LiveResult } from './live.js';
export { SearchConsole, searchConsole } from './google.js';
export { BingWebmaster } from './bing.js';
export * from './citations.js';
