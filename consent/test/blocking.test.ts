import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  bannerVisible,
  clearPage,
  clickBanner,
  freshModule,
  JOBSCHMIEDE_PAGE,
  jobschmiedeConfig,
  mapLoaded,
  nextChange,
  placeholderButton,
  startWith,
  thirdPartySources,
} from './helpers';

beforeEach(clearPage);
afterEach(() => vi.restoreAllMocks());

describe('vor der Einwilligung', () => {
  it('lädt nichts von OpenFreeMap oder Elfsight und zeigt das Banner', async () => {
    const mod = await freshModule();
    const state = await startWith(mod, jobschmiedeConfig(), JOBSCHMIEDE_PAGE);

    expect(state).toBeNull();
    expect(thirdPartySources()).toEqual([]);
    expect(mapLoaded()).toBe(0);
    expect(bannerVisible()).toBe(true);
    expect(document.querySelectorAll('.nvc-placeholder')).toHaveLength(2);
    expect(document.querySelector('#badge .nvc-placeholder--compact')).not.toBeNull();
    expect(window.neovendoConsent).toBe(mod.api);
  });

  it('beschriftet den Platzhalter mit Dienst, Zweck und Anbieter', async () => {
    const mod = await freshModule();
    await startWith(mod, jobschmiedeConfig(), JOBSCHMIEDE_PAGE);
    const box = document.querySelector('#map .nvc-placeholder')!;
    expect(box.querySelector('.nvc-placeholder__title')?.textContent).toBe('Externer Inhalt: OpenFreeMap');
    expect(box.querySelector('.nvc-placeholder__text')?.textContent).toBe(
      'Kartenhintergrund für die Standort- und Stellenkarten. Anbieter: Hyperknot Software Kft., Ungarn. ' +
        'Beim Laden erhält der Anbieter Ihre IP-Adresse.',
    );
    expect(box.querySelector('.nvc-placeholder__button')?.textContent).toBe('Inhalt laden');
  });

  it('lässt gesperrte iframes ohne src', async () => {
    const mod = await freshModule();
    const config = jobschmiedeConfig({
      services: [
        ...jobschmiedeConfig().services,
        {
          id: 'youtube',
          name: 'YouTube',
          category: 'external_media',
          purpose: 'Video',
          provider: 'Google Ireland Limited',
          hosts: ['www.youtube-nocookie.com'],
        },
      ],
    });
    await startWith(
      mod,
      config,
      '<iframe id="video" data-service="youtube" data-src="https://www.youtube-nocookie.com/embed/x" width="640" height="360"></iframe>',
    );
    const iframe = document.getElementById('video') as HTMLIFrameElement;
    expect(iframe.hasAttribute('src')).toBe(false);
    expect(iframe.hidden).toBe(true);
    const box = iframe.previousElementSibling as HTMLElement;
    expect(box.classList.contains('nvc-placeholder')).toBe(true);
    expect(box.style.aspectRatio).toBe('640 / 360');

    placeholderButton('youtube').click();
    expect(iframe.getAttribute('src')).toBe('https://www.youtube-nocookie.com/embed/x');
    expect(iframe.hidden).toBe(false);
    expect(document.querySelector('.nvc-placeholder')).toBeNull();
  });
});

describe('„Inhalt laden" im Platzhalter', () => {
  it('gibt nur diesen Dienst frei und schließt das Banner', async () => {
    const mod = await freshModule();
    await startWith(mod, jobschmiedeConfig(), JOBSCHMIEDE_PAGE);

    placeholderButton('openfreemap').click();

    expect(mapLoaded()).toBe(1);
    expect(thirdPartySources()).toEqual([]);
    expect(document.querySelector('#map .nvc-placeholder')).toBeNull();
    expect(document.querySelector('#badge .nvc-placeholder')).not.toBeNull();
    expect(bannerVisible()).toBe(false);
    expect(mod.api.getState()?.services).toEqual({ external_media: ['openfreemap'] });
    expect(mod.api.acceptedService('elfsight')).toBe(false);
  });

  it('behält bereits freigegebene Dienste', async () => {
    const mod = await freshModule();
    await startWith(mod, jobschmiedeConfig(), JOBSCHMIEDE_PAGE);

    placeholderButton('openfreemap').click();
    placeholderButton('elfsight').click();

    expect(mod.api.getState()?.services.external_media.sort()).toEqual(['elfsight', 'openfreemap']);
    expect(thirdPartySources()).toEqual(['https://elfsightcdn.com/platform.js']);
    expect(mapLoaded()).toBe(1);
  });

  it('folgt nicht dem Link, in dem das Badge steckt', async () => {
    const mod = await freshModule();
    await startWith(mod, jobschmiedeConfig(), JOBSCHMIEDE_PAGE);
    const followed = vi.fn();
    document.getElementById('badge-link')!.addEventListener('click', followed);

    placeholderButton('elfsight').click();

    expect(followed).not.toHaveBeenCalled();
    expect(mod.api.acceptedService('elfsight')).toBe(true);
  });
});

describe('Banner', () => {
  it('„Alle ablehnen" lädt nichts und merkt sich die Entscheidung', async () => {
    const mod = await freshModule();
    await startWith(mod, jobschmiedeConfig(), JOBSCHMIEDE_PAGE);

    const changed = nextChange();
    clickBanner('necessary');
    await changed;

    expect(mod.api.getState()?.categories).toEqual(['necessary']);
    expect(mod.api.getState()?.acceptType).toBe('necessary');
    expect(thirdPartySources()).toEqual([]);
    expect(mapLoaded()).toBe(0);
    expect(document.querySelectorAll('.nvc-placeholder')).toHaveLength(2);
  });

  it('„Alle akzeptieren" gibt alles frei', async () => {
    const mod = await freshModule();
    await startWith(mod, jobschmiedeConfig(), JOBSCHMIEDE_PAGE);

    const changed = nextChange();
    clickBanner('all');
    await changed;

    expect(mod.api.getState()?.categories.sort()).toEqual(['external_media', 'necessary']);
    expect(thirdPartySources()).toEqual(['https://elfsightcdn.com/platform.js']);
    expect(mapLoaded()).toBe(1);
    expect(document.querySelectorAll('.nvc-placeholder')).toHaveLength(0);
  });
});

describe('mit gespeicherter Einwilligung', () => {
  it('lädt freigegebene Dienste sofort beim nächsten Aufruf', async () => {
    let mod = await freshModule();
    await startWith(mod, jobschmiedeConfig(), JOBSCHMIEDE_PAGE);
    placeholderButton('openfreemap').click();
    const { id } = mod.api.getState()!;
    const cookie = document.cookie;

    clearPage();
    document.cookie = cookie;
    mod = await freshModule();
    const state = await startWith(mod, jobschmiedeConfig(), JOBSCHMIEDE_PAGE);

    expect(state?.id).toBe(id);
    expect(state?.textVersion).toBe('2026-11-03');
    expect(mapLoaded()).toBe(1);
    expect(bannerVisible()).toBe(false);
    expect(document.querySelector('#map .nvc-placeholder')).toBeNull();
    expect(document.querySelector('#badge .nvc-placeholder')).not.toBeNull();
  });

  it('fragt neu, wenn die revision steigt', async () => {
    let mod = await freshModule();
    await startWith(mod, jobschmiedeConfig(), JOBSCHMIEDE_PAGE);
    placeholderButton('openfreemap').click();
    const cookie = document.cookie;

    clearPage();
    document.cookie = cookie;
    mod = await freshModule();
    const state = await startWith(mod, jobschmiedeConfig({ revision: 1 }), JOBSCHMIEDE_PAGE);
    expect(state).toBeNull();
    expect(bannerVisible()).toBe(true);
  });
});

describe('API und Events', () => {
  it('meldet die erste Entscheidung und spätere Änderungen', async () => {
    const mod = await freshModule();
    const onChange = vi.fn();
    await startWith(mod, jobschmiedeConfig({ onChange }), JOBSCHMIEDE_PAGE);
    const events: { first: boolean; services: Record<string, string[]> }[] = [];
    mod.api.on('change', ({ state, change }) => events.push({ first: change.first, services: state.services }));

    placeholderButton('openfreemap').click();
    mod.api.acceptService('elfsight');

    expect(events).toEqual([
      { first: true, services: { external_media: ['openfreemap'] } },
      { first: false, services: { external_media: ['openfreemap', 'elfsight'] } },
    ]);
    expect(onChange).toHaveBeenCalledTimes(2);
  });

  it('ruft onAccept auf, sobald der Dienst freigegeben ist', async () => {
    const mod = await freshModule();
    const onMap = vi.fn();
    mod.api.onAccept('openfreemap', onMap);
    await startWith(mod, jobschmiedeConfig(), JOBSCHMIEDE_PAGE);
    expect(onMap).not.toHaveBeenCalled();

    placeholderButton('elfsight').click();
    expect(onMap).not.toHaveBeenCalled();
    placeholderButton('openfreemap').click();
    expect(onMap).toHaveBeenCalledTimes(1);

    const later = vi.fn();
    mod.api.onAccept('openfreemap', later);
    await Promise.resolve();
    expect(later).toHaveBeenCalledTimes(1);
  });

  it('öffnet den Einstellungsdialog über show()', async () => {
    const mod = await freshModule();
    await startWith(mod, jobschmiedeConfig(), JOBSCHMIEDE_PAGE);
    mod.api.show();
    expect(document.documentElement.classList.contains('show--preferences')).toBe(true);
    const dialog = document.querySelector('#cc-main .pm')!;
    expect(dialog.textContent).toContain('Hyperknot Software Kft., Ungarn');
    expect(dialog.textContent).toContain('tiles.openfreemap.org');
  });

  it('prüft Platzhalter nach scan() erneut, etwa nach clientseitiger Navigation', async () => {
    const mod = await freshModule();
    await startWith(mod, jobschmiedeConfig(), '<main></main>');
    const main = document.querySelector('main')!;
    main.innerHTML = '<div id="later" data-consent-placeholder data-service="openfreemap"></div>';
    mod.api.scan(main);
    expect(document.querySelector('#later .nvc-placeholder')).not.toBeNull();
  });

  it('warnt bei Diensten, die nicht konfiguriert sind', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const mod = await freshModule();
    await startWith(
      mod,
      jobschmiedeConfig(),
      `<div data-consent-placeholder data-service="vimeo"></div>
       <script type="text/plain" data-category="analytics" data-service="ga"></script>`,
    );
    mod.api.acceptService('vimeo');
    const messages = warn.mock.calls.map((call) => String(call[0]));
    expect(messages).toEqual(
      expect.arrayContaining([
        expect.stringContaining('Dienst "vimeo" an <div> fehlt in der Konfiguration'),
        expect.stringContaining('data-category="analytics" läuft nie'),
        expect.stringContaining('Dienst "vimeo" ist nicht konfiguriert'),
      ]),
    );
  });
});

describe('init', () => {
  it('ignoriert einen zweiten Aufruf und warnt nur bei anderer Konfiguration', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const mod = await freshModule();
    const config = jobschmiedeConfig();
    await startWith(mod, config, JOBSCHMIEDE_PAGE);
    expect(mod.initConsent(config)).toBe(mod.api);
    expect(warn).not.toHaveBeenCalled();
    mod.initConsent(jobschmiedeConfig());
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('init() lief schon'));
  });

  it('meldet Konfigurationsfehler sofort', async () => {
    const mod = await freshModule();
    expect(() => mod.initConsent({ textVersion: '', services: [] })).toThrow(mod.ConsentConfigError);
  });
});
