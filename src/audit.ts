import type { Site, Business, Service } from './schemas';

/**
 * Couche GEO partagée — CONSEILS (audit SEO/GEO au build).
 *
 * Passe en revue les données d'un site et signale ce qui manque ou affaiblit
 * le référencement classique ET la citabilité par les IA. Rien de bloquant :
 * ce sont des recommandations affichées dans la console de build, pour qu'un
 * oubli (image OG, fiche Google, founder…) saute aux yeux avant la mise en ligne.
 */

export type AuditLevel = 'warn' | 'info';
export type Finding = { level: AuditLevel; code: string; message: string };

export type AuditInput = {
  site: Site;
  businesses: readonly Business[];
  services?: readonly Service[];
  /** Le site publie-t-il des articles de blog ? */
  hasArticles?: boolean;
  /** Le site publie-t-il des réalisations/chantiers documentés ? */
  hasProjects?: boolean;
};

const typesOf = (b: Business) => (Array.isArray(b.type) ? b.type : [b.type]);
const isOrganizationOnly = (b: Business) => {
  const t = typesOf(b);
  return t.length === 1 && t[0] === 'Organization';
};
const hasGBP = (urls: string[]) => urls.some((u) => /google|maps|g\.page|goo\.gl/i.test(u));

/** Analyse les données GEO d'un site et renvoie la liste des conseils. */
export function auditGeo({ site, businesses, services = [], hasArticles, hasProjects }: AuditInput): Finding[] {
  const f: Finding[] = [];

  if (!site.ogImage) {
    f.push({
      level: 'warn',
      code: 'og-image',
      message:
        "Image OG absente : aucun aperçu ne s'affichera lors des partages (Facebook, LinkedIn, WhatsApp, iMessage). Ajoute une image 1200×630 (JPG/PNG).",
    });
  }

  for (const b of businesses) {
    const who = businesses.length > 1 ? `[${b.name}] ` : '';
    const local = !isOrganizationOnly(b);
    const same = b.sameAs ?? [];

    if (!b.founder) {
      f.push({
        level: 'info',
        code: 'founder',
        message: `${who}Pas de founder (Person) : nommer le dirigeant/artisan renforce l'E-E-A-T — le visage humain derrière la marque, très lu par les IA.`,
      });
    }
    if (!same.length) {
      f.push({
        level: 'warn',
        code: 'sameas',
        message: `${who}Aucun sameAs : relie l'entité à sa fiche Google Business et ses réseaux — clé pour que l'IA reconnaisse l'entreprise.`,
      });
    } else if (!hasGBP(same)) {
      f.push({
        level: 'info',
        code: 'gbp',
        message: `${who}Pas de fiche Google Business dans sameAs : c'est LA source locale lue en priorité par l'IA.`,
      });
    }
    if (!b.description || b.description.length < 40) {
      f.push({
        level: 'warn',
        code: 'description',
        message: `${who}Description très courte (< 40 caractères) : détaille l'activité, les prestations et la zone.`,
      });
    }
    if (!b.phone && !b.email) {
      f.push({
        level: 'warn',
        code: 'contact',
        message: `${who}Ni téléphone ni email : ajoute au moins un moyen de contact structuré.`,
      });
    }

    if (local) {
      if (!b.address) {
        f.push({ level: 'warn', code: 'address', message: `${who}Pas d'adresse postale : indispensable pour le SEO local et le pack Google.` });
      }
      if (!b.geo) {
        f.push({ level: 'info', code: 'geo', message: `${who}Pas de coordonnées géo (lat/lng) : améliore le rattachement local.` });
      }
      if (!(b.hours?.length)) {
        f.push({ level: 'info', code: 'hours', message: `${who}Pas d'horaires d'ouverture : Google et l'IA les affichent volontiers.` });
      }
      if (!(b.areaServed?.length)) {
        f.push({ level: 'warn', code: 'area', message: `${who}Aucune zone desservie (areaServed) : liste les villes/départements couverts.` });
      }
      if (!b.siret) {
        f.push({ level: 'info', code: 'siret', message: `${who}Pas de SIRET/SIREN : un identifiant officiel fiabilise l'entité aux yeux de Google.` });
      }
    }
  }

  if (!services.length) {
    f.push({ level: 'info', code: 'services', message: 'Aucune prestation listée : un catalogue de services enrichit le graphe et le llms.txt.' });
  }
  if (!hasArticles && !hasProjects) {
    f.push({
      level: 'info',
      code: 'content',
      message:
        "Aucun contenu propriétaire (articles ou réalisations datées) : c'est la matière que l'IA ne peut synthétiser ailleurs — le vrai différenciateur GEO.",
    });
  }

  return f;
}

/** Affiche les conseils dans la console de build, groupés par priorité. */
export function reportGeoAudit(site: Site, findings: Finding[]): void {
  const warns = findings.filter((x) => x.level === 'warn');
  const infos = findings.filter((x) => x.level === 'info');

  if (!findings.length) {
    console.log(`\n✅ GEO/SEO — ${site.name} : rien à signaler, tout y est.\n`);
    return;
  }

  console.log(`\n🔍 GEO/SEO — conseils pour ${site.name}  (${warns.length} à corriger, ${infos.length} à envisager)`);
  for (const x of warns) console.log(`   ⚠️  ${x.message}`);
  for (const x of infos) console.log(`   ·  ${x.message}`);
  console.log('');
}
