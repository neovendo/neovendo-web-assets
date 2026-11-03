import { describe, expect, it } from 'vitest';
import { buildLibraryConfig, buildTranslation, ConsentConfigError, normalizeConfig, toCookieItem } from '../src/config';
import { DEFAULT_TEXTS } from '../src/texts';
import type { ConsentService, NeovendoConsentConfig } from '../src/types';
import { VERSION } from '../src/version';
import pkg from '../package.json';
import { jobschmiedeConfig } from './helpers';

const analytics: ConsentService = {
  id: 'matomo',
  name: 'Matomo',
  category: 'analytics',
  purpose: 'Reichweitenmessung',
  provider: 'neovendo GmbH',
  hosts: ['stats.example.com'],
  cookies: [{ name: '_pk_*', duration: '13 Monate' }],
};

function issuesOf(config: unknown): string[] {
  try {
    normalizeConfig(config as NeovendoConsentConfig);
  } catch (error) {
    if (error instanceof ConsentConfigError) return error.issues;
    throw error;
  }
  return [];
}

describe('normalizeConfig', () => {
  it('übernimmt die Jobschmiede-Konfiguration mit Standardwerten', () => {
    const config = normalizeConfig(jobschmiedeConfig());
    expect(config.categories.map((c) => c.id)).toEqual(['necessary', 'external_media']);
    expect(config.categories[1].services.map((s) => s.id)).toEqual(['openfreemap', 'elfsight']);
    expect(config.cookie).toEqual({ name: 'nv_consent', expiresAfterDays: 182, domain: undefined });
    expect(config.revision).toBe(0);
    expect(config.gcm).toBeNull();
    expect(config.proofEndpoint).toBeNull();
    expect(config.privacyPolicyUrl).toBe('/datenschutz');
  });

  it('zeigt Statistik und Marketing nur, wenn es dort Dienste gibt', () => {
    const marketing: ConsentService = { ...analytics, id: 'ads', category: 'marketing' };
    const config = normalizeConfig(jobschmiedeConfig({ services: [marketing, analytics] }));
    expect(config.categories.map((c) => c.id)).toEqual(['necessary', 'analytics', 'marketing']);
    expect(config.categories[1].title).toBe('Statistik');
  });

  it('erlaubt eigene Kategorien mit Titel und Beschreibung', () => {
    const config = normalizeConfig(
      jobschmiedeConfig({
        categories: { chat: { title: 'Chat', description: 'Live-Chat mit dem Team' } },
        services: [{ ...analytics, id: 'chat-tool', category: 'chat' }],
      }),
    );
    expect(config.categories.map((c) => c.id)).toEqual(['necessary', 'chat']);
  });

  it('sammelt alle Fehler in einer Meldung', () => {
    const issues = issuesOf({
      textVersion: '',
      revision: 1.5,
      proofEndpoint: 'ftp://example.com',
      categories: { chat: {} },
      services: [
        { ...analytics, id: 'Matomo' },
        { ...analytics, provider: '' },
        { ...analytics },
        { ...analytics, id: 'x', category: 'unbekannt', hosts: 'stats.example.com' },
      ],
    });
    expect(issues).toEqual([
      'textVersion fehlt',
      'revision muss eine ganze Zahl ab 0 sein',
      'proofEndpoint muss ein Pfad wie /api/consent oder eine http(s)-URL sein',
      'Kategorie "chat": eigene Kategorien brauchen title und description',
      'Dienst "Matomo": id fehlt oder enthält andere Zeichen als a-z, 0-9, _ und -',
      'Dienst "matomo": provider fehlt',
      'Dienst "matomo": id ist doppelt vergeben',
      'Dienst "x": Kategorie "unbekannt" ist unbekannt, bitte unter categories anlegen',
      'Dienst "x": hosts muss eine Liste von Hostnamen sein',
    ]);
  });

  it('verlangt eine Liste von Diensten', () => {
    expect(issuesOf({ textVersion: '1' })).toEqual(['services muss eine Liste sein']);
    expect(() => normalizeConfig(undefined as unknown as NeovendoConsentConfig)).toThrow(ConsentConfigError);
  });

  it('akzeptiert relative und absolute Endpunkte', () => {
    expect(normalizeConfig(jobschmiedeConfig({ proofEndpoint: '/api/consent' })).proofEndpoint).toBe('/api/consent');
    expect(normalizeConfig(jobschmiedeConfig({ proofEndpoint: 'https://example.com/c' })).proofEndpoint).toBeTruthy();
    expect(issuesOf(jobschmiedeConfig({ proofEndpoint: '//example.com/c' }))).toHaveLength(1);
  });

  it('schaltet Google Consent Mode nur auf Wunsch ein', () => {
    expect(normalizeConfig(jobschmiedeConfig({ googleConsentMode: false })).gcm).toBeNull();
    const gcm = normalizeConfig(jobschmiedeConfig({ googleConsentMode: true })).gcm;
    expect(gcm?.mapping.ad_storage).toBe('marketing');
    expect(gcm?.waitForUpdate).toBe(500);
    const custom = normalizeConfig(
      jobschmiedeConfig({ googleConsentMode: { enabled: true, mapping: { analytics_storage: 'external_media' } } }),
    ).gcm;
    expect(custom?.mapping.analytics_storage).toBe('external_media');
  });

  it('ergänzt Texte, statt sie zu ersetzen', () => {
    const config = normalizeConfig(jobschmiedeConfig({ texts: { banner: { title: 'Datenschutz' } } }));
    expect(config.texts.banner.title).toBe('Datenschutz');
    expect(config.texts.banner.rejectAll).toBe('Alle ablehnen');
  });
});

describe('buildLibraryConfig', () => {
  const noop = {};

  it('macht „Alle ablehnen" gleichwertig, auch wenn das Layout etwas anderes will', () => {
    const config = normalizeConfig(
      jobschmiedeConfig({ layout: { consentModal: { layout: 'bar', position: 'bottom' } } }),
    );
    const { guiOptions } = buildLibraryConfig(config, noop);
    expect(guiOptions?.consentModal).toEqual({
      layout: 'bar',
      position: 'bottom',
      equalWeightButtons: true,
      flipButtons: false,
    });
    expect(guiOptions?.preferencesModal?.equalWeightButtons).toBe(true);
  });

  it('legt „Notwendig" fest an und alle anderen Kategorien aus', () => {
    const lib = buildLibraryConfig(normalizeConfig(jobschmiedeConfig()), noop);
    expect(lib.mode).toBe('opt-in');
    expect(lib.categories.necessary).toEqual({ enabled: true, readOnly: true });
    expect(lib.categories.external_media.enabled).toBe(false);
    expect(Object.keys(lib.categories.external_media.services ?? {})).toEqual(['openfreemap', 'elfsight']);
    expect(lib.cookie?.name).toBe('nv_consent');
  });

  it('macht aus `name*` ein Präfix-Muster', () => {
    expect(toCookieItem({ name: '_pk_*' }).name).toEqual(/^_pk_/);
    expect(toCookieItem({ name: '_pk_id' }).name).toBe('_pk_id');
    expect(toCookieItem({ name: /^_ga/, domain: '.example.com' })).toEqual({ name: /^_ga/, domain: '.example.com' });
  });
});

describe('buildTranslation', () => {
  it('nennt Kategorien und Dienste im Banner', () => {
    const translation = buildTranslation(normalizeConfig(jobschmiedeConfig()));
    expect(translation.consentModal.description).toContain('Externe Medien (OpenFreeMap, Elfsight)');
    expect(translation.consentModal.acceptAllBtn).toBe('Alle akzeptieren');
    expect(translation.consentModal.acceptNecessaryBtn).toBe('Alle ablehnen');
    expect(translation.consentModal.footer).toContain('href="/datenschutz"');
    expect(translation.consentModal.footer).toContain('href="/impressum"');
  });

  it('listet jeden Dienst mit Anbieter, Zweck, Servern und Cookies', () => {
    const { sections } = buildTranslation(normalizeConfig(jobschmiedeConfig({ services: [analytics] }))).preferencesModal;
    const statistik = sections.find((section) => section.linkedCategory === 'analytics');
    expect(statistik?.cookieTable?.body).toEqual([
      {
        service: 'Matomo',
        provider: 'neovendo GmbH',
        purpose: 'Reichweitenmessung',
        hosts: 'stats.example.com',
        cookies: '_pk_* (13 Monate)',
      },
    ]);
    const notwendig = sections.find((section) => section.linkedCategory === 'necessary');
    expect(notwendig?.cookieTable?.body[0].cookies).toBe('nv_consent (182 Tage)');
  });

  it('maskiert HTML aus der Konfiguration', () => {
    const service = { ...analytics, name: '<img src=x onerror=alert(1)>' };
    const translation = buildTranslation(normalizeConfig(jobschmiedeConfig({ services: [service] })));
    expect(translation.consentModal.description).not.toContain('<img');
    expect(translation.consentModal.description).toContain('&lt;img');
  });

  it('nutzt die deutschen Standardtexte', () => {
    expect(DEFAULT_TEXTS.placeholder.button).toBe('Inhalt laden');
  });
});

it('hält Version und package.json gleich', () => {
  expect(VERSION).toBe(pkg.version);
});
