/**
 * robots.txt généré depuis la config du site.
 * - site pas encore lancé (`live: false`) : tout est interdit ;
 * - en ligne : tout est autorisé, robots des IA nommés explicitement (GEO),
 *   ou bloqués si `seo.aiBots: 'block'` (choix du client).
 */

/** Robots qui alimentent les réponses des IA (recherche et entraînement). */
export const AI_BOTS = [
  'GPTBot',
  'OAI-SearchBot',
  'ChatGPT-User',
  'ClaudeBot',
  'Claude-SearchBot',
  'Claude-User',
  'PerplexityBot',
  'Perplexity-User',
  'Google-Extended',
  'Applebot-Extended',
  'Meta-ExternalAgent',
  'MistralAI-User',
];

export function buildRobotsTxt(opts: { siteUrl: string; live: boolean; aiBots?: 'allow' | 'block' }): string {
  const origin = opts.siteUrl.replace(/\/+$/, '');
  if (!opts.live) {
    return ['# Site en préparation : indexation interdite jusqu\'au lancement (live: true dans rjs.config).', 'User-agent: *', 'Disallow: /', ''].join('\n');
  }
  const rule = opts.aiBots === 'block' ? 'Disallow: /' : 'Allow: /';
  const lines = ['User-agent: *', 'Allow: /', ''];
  lines.push(opts.aiBots === 'block' ? '# Robots des IA : bloqués à la demande du client' : '# Robots des IA : autorisés à lire et à citer le site (GEO)');
  for (const bot of AI_BOTS) lines.push(`User-agent: ${bot}`, rule, '');
  lines.push(`Sitemap: ${origin}/sitemap-index.xml`, '');
  return lines.join('\n');
}
