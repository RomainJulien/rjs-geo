import { writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Sitemap écrit à partir des pages réellement générées : les URL servies des
 * pages indexables, donc identiques aux canonicals par construction. Utilisé
 * seulement quand le site n'a pas @astrojs/sitemap.
 */
export const hasSitemap = (distDir: string) =>
  existsSync(join(distDir, 'sitemap-index.xml')) || existsSync(join(distDir, 'sitemap.xml'));

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

export function writeSitemap(distDir: string, site: string, urls: string[]): void {
  const origin = site.replace(/\/+$/, '');
  const sorted = [...new Set(urls)].sort((a, b) => a.length - b.length || a.localeCompare(b));
  writeFileSync(
    join(distDir, 'sitemap-0.xml'),
    `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${sorted
      .map((u) => `  <url><loc>${esc(u)}</loc></url>`)
      .join('\n')}\n</urlset>\n`,
  );
  writeFileSync(
    join(distDir, 'sitemap-index.xml'),
    `<?xml version="1.0" encoding="UTF-8"?>\n<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n  <sitemap><loc>${esc(origin)}/sitemap-0.xml</loc></sitemap>\n</sitemapindex>\n`,
  );
}
