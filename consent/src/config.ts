import type * as CookieConsent from 'vanilla-cookieconsent';
import { DEFAULT_CATEGORY_TEXTS, escapeHtml, fill, joinList, mergeTexts, type Texts } from './texts';
import type {
  CategoryId,
  ConsentCookie,
  ConsentService,
  GoogleConsentType,
  LayoutOptions,
  NeovendoConsentConfig,
} from './types';

export const KNOWN_CATEGORIES = ['necessary', 'external_media', 'analytics', 'marketing'] as const;

export const DEFAULT_GCM_MAPPING: Record<GoogleConsentType, CategoryId> = {
  ad_storage: 'marketing',
  ad_user_data: 'marketing',
  ad_personalization: 'marketing',
  analytics_storage: 'analytics',
  functionality_storage: 'necessary',
  personalization_storage: 'marketing',
  security_storage: 'necessary',
};

const ID_PATTERN = /^[a-z0-9_-]+$/;
const ENDPOINT_PATTERN = /^(\/(?!\/)|https?:\/\/)/;

export interface NormalizedService extends ConsentService {
  cookies: ConsentCookie[];
}

export interface NormalizedCategory {
  id: string;
  title: string;
  description: string;
  readOnly: boolean;
  services: NormalizedService[];
}

export interface NormalizedGcm {
  mapping: Record<GoogleConsentType, CategoryId>;
  waitForUpdate: number;
  adsDataRedaction: boolean;
  urlPassthrough: boolean;
}

export interface NormalizedConfig {
  textVersion: string;
  revision: number;
  privacyPolicyUrl: string;
  imprintUrl: string;
  proofEndpoint: string | null;
  gcm: NormalizedGcm | null;
  texts: Texts;
  cookie: { name: string; expiresAfterDays: number; domain?: string };
  layout: LayoutOptions;
  reloadOnRevoke: boolean;
  hideFromBots: boolean;
  autoShow: boolean;
  /** Anzeigereihenfolge: `necessary`, bekannte Kategorien, dann eigene. Nur Kategorien mit Diensten. */
  categories: NormalizedCategory[];
  services: Map<string, NormalizedService>;
  onChange?: NeovendoConsentConfig['onChange'];
}

export class ConsentConfigError extends Error {
  readonly issues: string[];

  constructor(issues: string[]) {
    super(`neovendo-consent: Konfiguration ungültig\n- ${issues.join('\n- ')}`);
    this.name = 'ConsentConfigError';
    this.issues = issues;
  }
}

const isNonEmptyString = (value: unknown): value is string => typeof value === 'string' && value.trim() !== '';

export function normalizeConfig(input: NeovendoConsentConfig): NormalizedConfig {
  const issues: string[] = [];
  const config = (input ?? {}) as Partial<NeovendoConsentConfig>;

  if (!isNonEmptyString(config.textVersion)) issues.push('textVersion fehlt');

  const revision = config.revision ?? 0;
  if (!Number.isInteger(revision) || revision < 0) issues.push('revision muss eine ganze Zahl ab 0 sein');

  const proofEndpoint = config.proofEndpoint ?? null;
  if (proofEndpoint !== null && (!isNonEmptyString(proofEndpoint) || !ENDPOINT_PATTERN.test(proofEndpoint))) {
    issues.push('proofEndpoint muss ein Pfad wie /api/consent oder eine http(s)-URL sein');
  }

  const expiresAfterDays = config.cookie?.expiresAfterDays ?? 182;
  if (!Number.isInteger(expiresAfterDays) || expiresAfterDays < 1) {
    issues.push('cookie.expiresAfterDays muss eine ganze Zahl ab 1 sein');
  }

  const categoryOptions = config.categories ?? {};
  for (const [id, options] of Object.entries(categoryOptions)) {
    if (!ID_PATTERN.test(id)) issues.push(`Kategorie "${id}": erlaubt sind a-z, 0-9, _ und -`);
    const known = (KNOWN_CATEGORIES as readonly string[]).includes(id);
    if (!known && (!isNonEmptyString(options?.title) || !isNonEmptyString(options?.description))) {
      issues.push(`Kategorie "${id}": eigene Kategorien brauchen title und description`);
    }
  }
  const isKnownCategory = (id: string) =>
    (KNOWN_CATEGORIES as readonly string[]).includes(id) || Object.prototype.hasOwnProperty.call(categoryOptions, id);

  const services = new Map<string, NormalizedService>();
  if (!Array.isArray(config.services)) {
    issues.push('services muss eine Liste sein');
  } else {
    config.services.forEach((service, index) => {
      const label = isNonEmptyString(service?.id) ? `Dienst "${service.id}"` : `Dienst #${index + 1}`;
      if (!isNonEmptyString(service?.id) || !ID_PATTERN.test(service.id)) {
        issues.push(`${label}: id fehlt oder enthält andere Zeichen als a-z, 0-9, _ und -`);
        return;
      }
      if (services.has(service.id)) issues.push(`${label}: id ist doppelt vergeben`);
      for (const field of ['name', 'purpose', 'provider'] as const) {
        if (!isNonEmptyString(service[field])) issues.push(`${label}: ${field} fehlt`);
      }
      if (!isNonEmptyString(service.category)) {
        issues.push(`${label}: category fehlt`);
      } else if (!isKnownCategory(service.category)) {
        issues.push(`${label}: Kategorie "${service.category}" ist unbekannt, bitte unter categories anlegen`);
      }
      if (!Array.isArray(service.hosts) || !service.hosts.every(isNonEmptyString)) {
        issues.push(`${label}: hosts muss eine Liste von Hostnamen sein`);
      }
      if (service.cookies !== undefined && !Array.isArray(service.cookies)) {
        issues.push(`${label}: cookies muss eine Liste sein`);
      }
      services.set(service.id, { ...service, hosts: service.hosts ?? [], cookies: service.cookies ?? [] });
    });
  }

  if (issues.length > 0) throw new ConsentConfigError(issues);

  const categoryIds = [
    ...KNOWN_CATEGORIES,
    ...Object.keys(categoryOptions).filter((id) => !(KNOWN_CATEGORIES as readonly string[]).includes(id)),
  ];
  const categories: NormalizedCategory[] = categoryIds
    .map((id) => {
      const defaults = DEFAULT_CATEGORY_TEXTS[id];
      const options = categoryOptions[id] ?? {};
      return {
        id,
        title: options.title ?? defaults?.title ?? id,
        description: options.description ?? defaults?.description ?? '',
        readOnly: id === 'necessary',
        services: [...services.values()].filter((service) => service.category === id),
      };
    })
    .filter((category) => category.readOnly || category.services.length > 0);

  const gcmInput = config.googleConsentMode;
  const gcmOptions = typeof gcmInput === 'object' ? gcmInput : { enabled: gcmInput === true };
  const gcm: NormalizedGcm | null = gcmOptions.enabled
    ? {
        mapping: { ...DEFAULT_GCM_MAPPING, ...gcmOptions.mapping },
        waitForUpdate: gcmOptions.waitForUpdate ?? 500,
        adsDataRedaction: gcmOptions.adsDataRedaction ?? false,
        urlPassthrough: gcmOptions.urlPassthrough ?? false,
      }
    : null;

  return {
    textVersion: config.textVersion as string,
    revision,
    privacyPolicyUrl: config.privacyPolicyUrl ?? '/datenschutz',
    imprintUrl: config.imprintUrl ?? '/impressum',
    proofEndpoint,
    gcm,
    texts: mergeTexts(config.texts),
    cookie: { name: config.cookie?.name ?? 'nv_consent', expiresAfterDays, domain: config.cookie?.domain },
    layout: config.layout ?? {},
    reloadOnRevoke: config.reloadOnRevoke ?? true,
    hideFromBots: config.hideFromBots ?? true,
    autoShow: config.autoShow ?? true,
    categories,
    services,
    onChange: config.onChange,
  };
}

const escapeRegExp = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** `_ga*` wird zum Präfix-Muster, alles andere bleibt exakt. */
export function toCookieItem(cookie: ConsentCookie): CookieConsent.CookieItem {
  const { name } = cookie;
  const pattern = typeof name === 'string' && name.endsWith('*') ? new RegExp(`^${escapeRegExp(name.slice(0, -1))}`) : name;
  return { name: pattern, ...(cookie.domain && { domain: cookie.domain }), ...(cookie.path && { path: cookie.path }) };
}

function describeCookies(cookies: ConsentCookie[], texts: Texts): string {
  if (cookies.length === 0) return escapeHtml(texts.table.none);
  return cookies
    .map(({ name, duration }) => {
      const label = typeof name === 'string' ? name : `/${name.source}/`;
      return escapeHtml(duration ? `${label} (${duration})` : label);
    })
    .join('<br>');
}

function serviceRow(service: NormalizedService, texts: Texts): Record<string, string> {
  const link = service.privacyUrl
    ? `<br><a href="${escapeHtml(service.privacyUrl)}" target="_blank" rel="noopener">${escapeHtml(texts.table.privacyLink)}</a>`
    : '';
  return {
    service: escapeHtml(service.name) + link,
    provider: escapeHtml(service.provider),
    purpose: escapeHtml(service.purpose),
    hosts: service.hosts.length > 0 ? service.hosts.map(escapeHtml).join('<br>') : escapeHtml(texts.table.none),
    cookies: describeCookies(service.cookies, texts),
  };
}

export function buildTranslation(config: NormalizedConfig): CookieConsent.Translation {
  const { texts, cookie } = config;
  const urls = {
    privacyPolicyUrl: escapeHtml(config.privacyPolicyUrl),
    imprintUrl: escapeHtml(config.imprintUrl),
  };
  const consentCategories = config.categories.filter((category) => !category.readOnly);
  const categoryList = joinList(
    consentCategories.map(
      (category) => `${escapeHtml(category.title)} (${category.services.map((s) => escapeHtml(s.name)).join(', ')})`,
    ),
  );
  const headers = {
    service: texts.table.service,
    provider: texts.table.provider,
    purpose: texts.table.purpose,
    hosts: texts.table.hosts,
    cookies: texts.table.cookies,
  };
  const consentCookieRow = {
    service: escapeHtml(texts.consentCookie.service),
    provider: escapeHtml(texts.consentCookie.provider),
    purpose: escapeHtml(texts.consentCookie.purpose),
    hosts: escapeHtml(texts.table.none),
    cookies: escapeHtml(fill(texts.consentCookie.cookie, { cookieName: cookie.name, days: cookie.expiresAfterDays })),
  };

  return {
    consentModal: {
      title: texts.banner.title,
      description: fill(texts.banner.description, { categories: categoryList }),
      acceptAllBtn: texts.banner.acceptAll,
      acceptNecessaryBtn: texts.banner.rejectAll,
      showPreferencesBtn: texts.banner.settings,
      footer: fill(texts.banner.footer, urls),
    },
    preferencesModal: {
      title: texts.preferences.title,
      acceptAllBtn: texts.preferences.acceptAll,
      acceptNecessaryBtn: texts.preferences.rejectAll,
      savePreferencesBtn: texts.preferences.save,
      closeIconLabel: texts.preferences.close,
      serviceCounterLabel: texts.preferences.serviceCounter,
      sections: [
        { description: texts.preferences.intro },
        ...config.categories.map((category) => ({
          title: escapeHtml(category.title),
          description: escapeHtml(category.description),
          linkedCategory: category.id,
          cookieTable: {
            headers,
            body: [
              ...(category.readOnly ? [consentCookieRow] : []),
              ...category.services.map((service) => serviceRow(service, texts)),
            ],
          },
        })),
        { title: texts.preferences.moreTitle, description: fill(texts.preferences.moreDescription, urls) },
      ],
    },
  };
}

type Callbacks = Pick<CookieConsent.CookieConsentConfig, 'onFirstConsent' | 'onConsent' | 'onChange'>;

export function buildLibraryConfig(config: NormalizedConfig, callbacks: Callbacks): CookieConsent.CookieConsentConfig {
  const categories: Record<string, CookieConsent.Category> = {};
  for (const category of config.categories) {
    if (category.readOnly) {
      // Dienste unter „Notwendig" stehen nur in der Tabelle, ohne Schalter.
      categories[category.id] = { enabled: true, readOnly: true };
      continue;
    }
    const services: Record<string, CookieConsent.Service> = {};
    for (const service of category.services) {
      services[service.id] = { label: escapeHtml(service.name), cookies: service.cookies.map(toCookieItem) };
    }
    categories[category.id] = { enabled: false, readOnly: false, services };
  }

  return {
    mode: 'opt-in',
    revision: config.revision,
    autoShow: config.autoShow,
    hideFromBots: config.hideFromBots,
    manageScriptTags: true,
    autoClearCookies: true,
    lazyHtmlGeneration: true,
    disablePageInteraction: false,
    cookie: {
      name: config.cookie.name,
      expiresAfterDays: config.cookie.expiresAfterDays,
      sameSite: 'Lax',
      ...(config.cookie.domain && { domain: config.cookie.domain }),
    },
    guiOptions: {
      consentModal: {
        layout: 'box',
        position: 'bottom right',
        ...config.layout.consentModal,
        // „Alle ablehnen" muss so sichtbar sein wie „Alle akzeptieren".
        equalWeightButtons: true,
        flipButtons: false,
      },
      preferencesModal: {
        layout: 'box',
        ...config.layout.preferencesModal,
        equalWeightButtons: true,
        flipButtons: false,
      },
    },
    categories,
    language: { default: 'de', translations: { de: buildTranslation(config) } },
    ...callbacks,
  };
}
