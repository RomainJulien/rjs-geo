import config from 'virtual:rjs-geo/config';
import type { RjsSiteConfig } from '../config.js';

/** Config du site, ou erreur claire si l'intégration n'a pas reçu `site`. */
export function siteConfig(): RjsSiteConfig & { _format?: string } {
  if (!config) throw new Error("@rjs/geo : passer la config du site à l'intégration, rjsGeo({ site }) dans astro.config.");
  return config;
}

export const text = (body: string) => new Response(body, { headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
