import { buildLlmsTxt } from '../llms.js';
import { siteConfig, text } from './config.js';

export const prerender = true;
export const GET = () => {
  const c = siteConfig();
  return text(
    buildLlmsTxt({
      site: c.site,
      businesses: c.businesses,
      services: c.services,
      articles: c.llms.articles,
      realisations: c.llms.realisations,
      blogBase: c.llms.blogBase,
      keyPages: c.llms.keyPages,
    }),
  );
};
