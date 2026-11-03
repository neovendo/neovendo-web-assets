import { vi } from 'vitest';
import jobschmiede from '../demo/jobschmiede.config.mjs';
import type { ConsentState, NeovendoConsentConfig } from '../src/types';

type Module = typeof import('../src/index');

export function jobschmiedeConfig(overrides: Partial<NeovendoConsentConfig> = {}): NeovendoConsentConfig {
  const config = JSON.parse(JSON.stringify(jobschmiede)) as NeovendoConsentConfig;
  return { ...config, proofEndpoint: undefined, hideFromBots: false, reloadOnRevoke: false, ...overrides };
}

/** Frische Modulinstanz, damit auch der Zustand von vanilla-cookieconsent zurückgesetzt ist. */
export async function freshModule(): Promise<Module> {
  vi.resetModules();
  return import('../src/index');
}

export function clearPage(): void {
  document.body.innerHTML = '';
  // Die Bibliothek hängt das Banner an <html>, nicht an <body>.
  document.querySelectorAll('#cc-main').forEach((element) => element.remove());
  document.documentElement.className = '';
  for (const entry of document.cookie.split(';')) {
    const name = entry.split('=')[0].trim();
    if (name) document.cookie = `${name}=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/`;
  }
  // vanilla-cookieconsent startet pro Fenster nur einmal.
  delete (window as { _ccRun?: boolean })._ccRun;
  delete window.dataLayer;
  delete window.gtag;
}

export async function startWith(mod: Module, config: NeovendoConsentConfig, html: string): Promise<ConsentState | null> {
  document.body.innerHTML = html;
  const ready = new Promise<ConsentState | null>((resolve) =>
    window.addEventListener('neovendo-consent:ready', (e) => resolve((e as CustomEvent).detail.state), { once: true }),
  );
  mod.initConsent(config);
  return ready;
}

export const JOBSCHMIEDE_PAGE = `
  <div id="map" data-consent-placeholder data-service="openfreemap" style="height: 300px"></div>
  <script type="text/plain" data-category="external_media" data-service="openfreemap">
    var map = document.getElementById('map');
    map.dataset.loaded = String(Number(map.dataset.loaded || 0) + 1);
  </script>
  <a id="badge-link" href="https://www.google.com/search?q=Die+Jobschmiede+GmbH+Rezensionen">
    <div id="badge" class="elfsight-app-test" data-consent-placeholder="compact" data-service="elfsight"></div>
  </a>
  <script type="text/plain" data-category="external_media" data-service="elfsight"
    data-src="https://elfsightcdn.com/platform.js" async></script>
`;

/** Wie oft das gesperrte Karten-Skript gelaufen ist. jsdom führt Skripte im eigenen Fenster aus, daher über das DOM. */
export const mapLoaded = (): number => Number(document.getElementById('map')?.dataset.loaded ?? 0);

export function nextChange(): Promise<void> {
  return new Promise((resolve) => window.addEventListener('neovendo-consent:change', () => resolve(), { once: true }));
}

/** Alle URLs auf der Seite, die einen der Dienste ansprechen würden. */
export function thirdPartySources(): string[] {
  return Array.from(document.querySelectorAll('[src]'))
    .map((element) => element.getAttribute('src') ?? '')
    .filter((src) => /openfreemap|elfsight|youtube/.test(src));
}

export const bannerVisible = () => document.documentElement.classList.contains('show--consent');

export function clickBanner(role: 'all' | 'necessary'): void {
  const button = document.querySelector<HTMLButtonElement>(`#cc-main .cm [data-role="${role}"]`);
  if (!button) throw new Error(`Banner-Knopf ${role} fehlt`);
  button.click();
}

export function placeholderButton(serviceId: string): HTMLButtonElement {
  const button = document.querySelector<HTMLButtonElement>(`[data-nvc-service="${serviceId}"] .nvc-placeholder__button`);
  if (!button) throw new Error(`Platzhalter für ${serviceId} fehlt`);
  return button;
}
