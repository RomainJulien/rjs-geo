declare module 'virtual:rjs-geo/config' {
  /** Config du site (rjs.config.ts) exposée par l'intégration, `null` si elle n'est pas passée. */
  const config: (import('./config.js').RjsSiteConfig & { _format?: string }) | null;
  export default config;
}
