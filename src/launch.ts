import { checkLive, formatLive, sitemapUrls } from './live.js';
import { indexnow } from './ops.js';
import { searchConsole } from './google.js';
import { BingWebmaster } from './bing.js';
import { bingKey, BING_KEY_FILE } from './creds.js';
import { type Registry, type RegistrySite, saveRegistry } from './registry.js';

/**
 * Mise en ligne d'un site, en une commande (playbook indexation §0bis : rien
 * n'est soumis tant que le contrôle en production n'est pas vert).
 *   1. contrôle en production (bloquant) ;
 *   2. Google : sitemap soumis à la propriété Search Console ;
 *   3. Bing : propriété ajoutée si besoin, vérifiée, sitemap soumis, URL envoyées dans la limite du quota ;
 *   4. IndexNow : tout le sitemap ;
 *   5. date de chaque étape notée dans le registre (champ launch).
 * Relançable sans risque : chaque étape déjà faite est simplement refaite.
 */
const today = () => new Date().toISOString().slice(0, 10);

export async function launch(file: string, reg: Registry, s: RegistrySite, opts: { force?: boolean } = {}) {
  const h = s.host;
  const sitemap = `https://${h}/sitemap-index.xml`;
  const done: Record<string, string> = { ...(s.launch ?? {}) };
  const todo: string[] = [];
  console.log(`🚀 Lancement de ${s.id} (${h})\n`);

  const live = await checkLive(s);
  console.log(formatLive(live, h));
  if (!live.ok && !opts.force) {
    console.log('\n⛔ Contrôle en production non vert : rien n\'est soumis (corriger, redéployer, relancer). --force pour passer outre.');
    return false;
  }

  // Google
  const { gsc, missing } = searchConsole();
  if (!gsc) todo.push(`Google : ${missing}.`);
  else {
    try {
      const prop = await gsc.propertyFor(h);
      if (!prop) {
        todo.push(`Google : aucune propriété Search Console pour ${h} accessible à ${gsc.who}. Crée-la (propriété de domaine) ou ajoute ${gsc.who} comme propriétaire de la propriété ${h.replace(/^www\./, '')} (Search Console > Paramètres > Utilisateurs et autorisations), puis relance.`);
      } else {
        await gsc.submitSitemap(prop.siteUrl, sitemap);
        done.google = today();
        console.log(`\n✅ Google : sitemap soumis à ${prop.siteUrl}`);
      }
    } catch (e) { todo.push(`Google : ${(e as Error).message}`); }
  }

  // Bing
  const key = bingKey();
  if (!key) todo.push(`Bing : clé API absente (${BING_KEY_FILE}).`);
  else {
    try {
      const bing = new BingWebmaster(key);
      let site = await bing.siteFor(h, s.bingProperty);
      if (!site) {
        await bing.addSite(`https://${h}/`);
        site = await bing.siteFor(h);
        console.log(`\n➕ Bing : propriété https://${h}/ ajoutée.`);
      }
      if (site && !site.IsVerified) {
        const ok = await bing.verifySite(site.Url).catch(() => false);
        if (ok) site.IsVerified = true;
        else todo.push(`Bing : propriété non vérifiée. Mets indexing: { bing: '${site.AuthenticationCode ?? '<code>'}' } dans src/rjs.config.ts (balise msvalidate.01), déploie, puis relance.`);
      }
      if (site?.IsVerified) {
        await bing.submitFeed(site.Url, sitemap);
        const urls = await sitemapUrls(h);
        const q = await bing.quota(site.Url).catch(() => ({ DailyQuota: 0, MonthlyQuota: 0 }));
        const batch = urls.slice(0, Math.min(500, q.DailyQuota));
        if (batch.length) await bing.submitUrls(site.Url, batch);
        done.bing = today();
        console.log(`\n✅ Bing : sitemap soumis à ${site.Url}, ${batch.length}/${urls.length} URL envoyées (quota du jour ${q.DailyQuota}).`);
      }
    } catch (e) { todo.push(`Bing : ${(e as Error).message}`); }
  }

  // IndexNow
  console.log('');
  if (await indexnow(s)) done.indexnow = today();

  s.launch = done;
  saveRegistry(file, reg);
  if (todo.length) {
    console.log(`\n📋 Reste à faire :\n${todo.map((t) => `   · ${t}`).join('\n')}`);
    return false;
  }
  console.log('\n🎉 Site soumis à Google, Bing et IndexNow. Dates notées dans le registre (champ launch).');
  return true;
}

/** État de l'indexation côté Google et Bing (lecture seule). */
export async function status(s: RegistrySite) {
  console.log(`════ ${s.id} (${s.host}) ════`);
  const { gsc, missing } = searchConsole();
  if (!gsc) console.log(`   Google : ${missing}`);
  else {
    try {
      const prop = await gsc.propertyFor(s.host);
      if (!prop) console.log(`   Google : aucune propriété accessible à ${gsc.who}`);
      else {
        const maps = await gsc.sitemaps(prop.siteUrl);
        if (!maps.length) console.log(`   Google : ${prop.siteUrl}, aucun sitemap soumis`);
        for (const m of maps) {
          const n = m.contents?.reduce((t, c) => t + Number(c.submitted ?? 0), 0) ?? 0;
          console.log(`   Google : ${m.path} : ${n} URL, lu le ${m.lastDownloaded?.slice(0, 10) ?? 'jamais'}${Number(m.errors) ? `, ${m.errors} erreur(s)` : ''}${Number(m.warnings) ? `, ${m.warnings} avertissement(s)` : ''}${m.isPending ? ' (en attente)' : ''}`);
        }
      }
    } catch (e) { console.log(`   Google : ${(e as Error).message}`); }
  }
  const key = bingKey();
  if (!key) console.log(`   Bing : clé absente (${BING_KEY_FILE})`);
  else {
    try {
      const bing = new BingWebmaster(key);
      const site = await bing.siteFor(s.host, s.bingProperty);
      if (!site) console.log('   Bing : propriété absente');
      else {
        const links = await bing.links(site.Url).catch(() => undefined);
        const total = links?.Links?.reduce((t, l) => t + l.Count, 0);
        console.log(`   Bing : ${site.Url} ${site.IsVerified ? 'vérifiée' : 'NON vérifiée'}${links ? `, liens entrants : ${total} sur la 1re page (${links.TotalPages} page(s))` : ''}`);
      }
    } catch (e) { console.log(`   Bing : ${(e as Error).message}`); }
  }
  if (s.launch) console.log(`   Lancement : ${Object.entries(s.launch).map(([k, v]) => `${k} ${v}`).join(', ')}`);
}
