import { readFileSync, writeFileSync, existsSync, readdirSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';

/**
 * Règles ajoutées à dist/_redirects (Netlify) :
 * - adresse *.netlify.app → domaine du site (contenu dupliqué), en production
 *   et seulement si le site est lancé ;
 * - anciennes URL en .html → URL propre (format `directory` d'Astro, où
 *   /page.html n'existe pas : utile après une refonte WordPress, Wix…).
 * Les règles déjà présentes (public/_redirects) sont gardées, sans doublon.
 */
export function writeRedirects(opts: { distDir: string; site: string; format?: string; live: boolean; env?: NodeJS.ProcessEnv }): string[] {
  const { distDir, live, env = process.env } = opts;
  const origin = opts.site.replace(/\/+$/, '');
  const file = join(distDir, '_redirects');
  const existing = existsSync(file) ? readFileSync(file, 'utf8') : '';
  const sources = new Set(
    existing.split('\n').map((l) => l.trim()).filter((l) => l && !l.startsWith('#')).map((l) => l.split(/\s+/)[0]),
  );
  const head: string[] = [];
  const tail: string[] = [];

  if (live && env.NETLIFY === 'true' && env.CONTEXT === 'production' && env.SITE_NAME) {
    const src = `https://${env.SITE_NAME}.netlify.app/*`;
    if (!sources.has(src) && new URL(origin).host !== `${env.SITE_NAME}.netlify.app`) head.push(`${src}  ${origin}/:splat  301!`);
  }

  if ((opts.format ?? 'directory') === 'directory') {
    const walk = (d: string): string[] =>
      readdirSync(d).flatMap((n) => {
        const p = join(d, n);
        return statSync(p).isDirectory() ? walk(p) : n === 'index.html' ? [p] : [];
      });
    for (const f of walk(distDir)) {
      const rel = relative(distDir, f).split(sep).join('/');
      if (rel === 'index.html' || /^404\//.test(rel)) continue;
      const dir = '/' + rel.slice(0, -'/index.html'.length);
      const src = `${dir}.html`;
      if (!sources.has(src)) tail.push(`${src}  ${dir}/  301`);
    }
  }

  if (head.length || tail.length) {
    const block = (title: string, l: string[]) => (l.length ? [`# @rjs/geo : ${title}`, ...l, ''] : []);
    const out = [...block('adresse Netlify vers le domaine', head), existing.trimEnd(), '', ...block('anciennes URL .html', tail)];
    writeFileSync(file, out.join('\n').replace(/^\n+/, '').replace(/\n{3,}/g, '\n\n'));
  }
  return [...head, ...tail];
}
