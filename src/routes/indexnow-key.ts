import { siteConfig, text } from './config.js';

export const prerender = true;
export const GET = () => text(siteConfig().indexing.indexnowKey ?? '');
