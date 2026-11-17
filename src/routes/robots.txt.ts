import { buildRobotsTxt } from '../robots.js';
import { siteConfig, text } from './config.js';

export const prerender = true;
export const GET = () => {
  const c = siteConfig();
  return text(buildRobotsTxt({ siteUrl: c.site.url, live: c.live, aiBots: c.seo.aiBots }));
};
