import * as CookieConsent from 'vanilla-cookieconsent';
import { buildLibraryConfig, normalizeConfig, type NormalizedConfig } from './config';
import { setConsentDefaults, updateConsent } from './gcm';
import { lintScripts, scanPlaceholders } from './placeholder';
import { buildProofPayload, sendProof } from './proof';
import type {
  ConsentChange,
  ConsentEventMap,
  ConsentEventName,
  ConsentState,
  NeovendoConsentApi,
  NeovendoConsentConfig,
} from './types';
import { VERSION } from './version';

export { ConsentConfigError, normalizeConfig } from './config';
export { DEFAULT_CATEGORY_TEXTS, DEFAULT_TEXTS } from './texts';
export type { Texts, TextOverrides } from './texts';
export type * from './types';
export { VERSION };

declare global {
  interface Window {
    neovendoConsent?: NeovendoConsentApi;
    neovendoConsentConfig?: NeovendoConsentConfig;
  }
}

const EVENT_PREFIX = 'neovendo-consent:';

let config: NormalizedConfig | null = null;
let initInput: NeovendoConsentConfig | null = null;
let started = false;
const afterStart: (() => void)[] = [];
const acceptCallbacks = new Map<string, Set<() => void>>();
const firedServices = new Set<string>();
let lastServices: Record<string, string[]> = {};

function safeCall(callback: () => void): void {
  try {
    callback();
  } catch (error) {
    console.error('neovendo-consent:', error);
  }
}

function whenStarted(action: () => void): void {
  if (started) action();
  else afterStart.push(action);
}

function dispatch<E extends ConsentEventName>(event: E, detail: ConsentEventMap[E]): void {
  window.dispatchEvent(new CustomEvent(EVENT_PREFIX + event, { detail }));
}

function categoryOf(serviceId: string): string | undefined {
  return config?.services.get(serviceId)?.category;
}

function isAccepted(serviceId: string): boolean {
  const category = categoryOf(serviceId);
  if (!category || !started) return false;
  return category === 'necessary' || CookieConsent.acceptedService(serviceId, category);
}

function readState(): ConsentState | null {
  if (!config || !started || !CookieConsent.validConsent()) return null;
  const cookie = CookieConsent.getCookie();
  const preferences = CookieConsent.getUserPreferences();
  const services: Record<string, string[]> = {};
  for (const category of config.categories) {
    if (!category.readOnly) services[category.id] = [...(preferences.acceptedServices[category.id] ?? [])];
  }
  // Die Bibliothek wertet nur Kategorien aus. Ist ein Dienst einer Kategorie abgewählt, war es nicht „alle".
  const consentCategories = config.categories.filter((category) => !category.readOnly);
  const none = consentCategories.every((category) => services[category.id].length === 0);
  const all = consentCategories.every((category) =>
    category.services.every((service) => services[category.id].includes(service.id)),
  );
  const data = cookie.data as { textVersion?: unknown } | null;
  return {
    id: cookie.consentId,
    timestamp: cookie.lastConsentTimestamp,
    firstTimestamp: cookie.consentTimestamp,
    textVersion: typeof data?.textVersion === 'string' ? data.textVersion : null,
    revision: cookie.revision,
    acceptType: none ? 'necessary' : all ? 'all' : 'custom',
    categories: [...preferences.acceptedCategories],
    rejectedCategories: [...preferences.rejectedCategories],
    services,
  };
}

function scan(root: ParentNode = document): void {
  if (!config || !started) return;
  scanPlaceholders(root, {
    config,
    isAccepted,
    accept: api.acceptService,
    showPreferences: api.show,
  });
}

function notifyAccepted(): void {
  for (const [serviceId, callbacks] of acceptCallbacks) {
    if (firedServices.has(serviceId) || !isAccepted(serviceId)) continue;
    firedServices.add(serviceId);
    callbacks.forEach(safeCall);
  }
}

function revokedServices(before: Record<string, string[]>, after: Record<string, string[]>): string[] {
  return Object.entries(before).flatMap(([category, ids]) => ids.filter((id) => !(after[category] ?? []).includes(id)));
}

function handleDecision(cfg: NormalizedConfig, first: boolean, changedCategories: string[], changedServices: Record<string, string[]>): void {
  const state = readState();
  if (!state) return;

  // Welche Textfassung galt, steht damit auch im Cookie.
  CookieConsent.setCookieData({ value: { textVersion: cfg.textVersion }, mode: 'update' });
  state.textVersion = cfg.textVersion;

  if (cfg.gcm) updateConsent(cfg.gcm, state.categories);

  const revoked = revokedServices(lastServices, state.services);
  revoked.forEach((id) => firedServices.delete(id));
  lastServices = state.services;

  scan();
  notifyAccepted();

  const change: ConsentChange = first
    ? {
        first,
        changedCategories: state.categories.filter((id) => id !== 'necessary'),
        changedServices: state.services,
      }
    : { first, changedCategories, changedServices };

  if (cfg.proofEndpoint) {
    const payload = buildProofPayload(state, cfg.textVersion, first ? 'first' : 'change');
    void sendProof(cfg.proofEndpoint, payload).then((ok) => dispatch('proof', { ok, payload }));
  }

  if (cfg.onChange) safeCall(() => cfg.onChange!(state, change));
  dispatch('change', { state, change });

  // Bereits ausgeführte Skripte lassen sich nicht zurücknehmen, nur durch Neuladen.
  if (!first && revoked.length > 0 && cfg.reloadOnRevoke) location.reload();
}

async function start(cfg: NormalizedConfig): Promise<void> {
  lintScripts(document, cfg);
  await CookieConsent.run(
    buildLibraryConfig(cfg, {
      onFirstConsent: () => handleDecision(cfg, true, [], {}),
      onChange: ({ changedCategories, changedServices }) =>
        handleDecision(cfg, false, changedCategories, changedServices),
    }),
  );
  started = true;

  const state = readState();
  lastServices = state?.services ?? {};
  if (cfg.gcm && state) updateConsent(cfg.gcm, state.categories);
  scan();
  notifyAccepted();
  afterStart.splice(0).forEach(safeCall);
  dispatch('ready', { state });
}

export function initConsent(input: NeovendoConsentConfig): NeovendoConsentApi {
  if (config) {
    // Derselbe Aufruf zweimal ist normal, etwa unter React StrictMode.
    if (input !== initInput) console.warn('neovendo-consent: init() lief schon, die neue Konfiguration wird ignoriert');
    return api;
  }
  const cfg = normalizeConfig(input);
  config = cfg;
  initInput = input;

  // Google verlangt die Standardwerte, bevor das Google-Tag lädt, deshalb synchron.
  if (cfg.gcm) setConsentDefaults(cfg.gcm);

  // Die Bibliothek sammelt die gesperrten Skripte beim Start ein, das DOM muss also stehen.
  const run = () => void start(cfg).catch((error) => console.error('neovendo-consent:', error));
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', run, { once: true });
  else run();

  return api;
}

export const api: NeovendoConsentApi = {
  version: VERSION,
  init: initConsent,

  show() {
    whenStarted(() => CookieConsent.showPreferences());
  },

  showBanner() {
    whenStarted(() => CookieConsent.show(true));
  },

  getState: readState,

  acceptedCategory(category) {
    return started && CookieConsent.acceptedCategory(category);
  },

  acceptedService: isAccepted,

  acceptService(serviceId) {
    const category = categoryOf(serviceId);
    if (!category) {
      console.warn(`neovendo-consent: Dienst "${serviceId}" ist nicht konfiguriert`);
      return;
    }
    whenStarted(() => {
      if (isAccepted(serviceId)) return;
      // acceptService der Bibliothek setzt die Liste der Kategorie, deshalb die bisherigen mitgeben.
      const current = CookieConsent.validConsent()
        ? (CookieConsent.getUserPreferences().acceptedServices[category] ?? [])
        : [];
      CookieConsent.acceptService([...current, serviceId], category);
      CookieConsent.hide();
    });
  },

  onAccept(serviceId, callback) {
    if (isAccepted(serviceId)) {
      queueMicrotask(() => safeCall(callback));
      return () => {};
    }
    const callbacks = acceptCallbacks.get(serviceId) ?? new Set();
    callbacks.add(callback);
    acceptCallbacks.set(serviceId, callbacks);
    return () => callbacks.delete(callback);
  },

  on(event, callback) {
    const listener = (e: Event) => callback((e as CustomEvent).detail);
    window.addEventListener(EVENT_PREFIX + event, listener);
    return () => window.removeEventListener(EVENT_PREFIX + event, listener);
  },

  scan,

  reset() {
    CookieConsent.reset(true);
    location.reload();
  },
};

if (typeof window !== 'undefined') window.neovendoConsent = api;
