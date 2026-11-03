# neovendo-consent

Consent-Modul für die Kundenseiten von neovendo. Es ersetzt CCM19 und läuft ohne Backend und ohne
Cloud-Dienst. Grundlage ist [vanilla-cookieconsent](https://github.com/orestbida/cookieconsent) 3.2.1
(MIT), das ins Bundle eingebaut ist. Jede Site liefert die Dateien selbst aus, kein CDN.

Was das Modul übernimmt:

- Banner und Einstellungsdialog mit deutschen Texten, „Alle ablehnen“ gleichwertig zu „Alle akzeptieren“
- Kategorien `necessary` (immer an) und `external_media`, dazu `analytics`, `marketing` und eigene
- Dienste je Site mit Name, Zweck, Anbieter, Servern und Cookies, sichtbar als Tabelle im Dialog
- Skripte sperren über `type="text/plain" data-category="…"`
- Platzhalter mit „Inhalt laden“ für iframes und Widgets, der nur diesen einen Dienst freigibt
- `window.neovendoConsent.show()` für den Widerrufs-Link im Footer, Events bei jeder Änderung
- optional Nachweis per `POST` an einen eigenen Endpunkt, ohne IP und ohne Fingerprint
- optional Google Consent Mode v2, standardmäßig aus

Umami setzt keine Cookies und gehört deshalb nicht hinter das Banner.

## Dateien

`dist/` ist eingecheckt, damit Sites einen bestimmten Commit übernehmen können.

| Datei | Zweck | Größe | gzip |
|---|---|---|---|
| `neovendo-consent.mjs` | ESM für Astro, Next.js und andere Bundler | 39,2 KB | 16,6 KB |
| `neovendo-consent.iife.js` | klassisches Skript für reine HTML-Seiten, setzt `window.neovendoConsent` | 39,2 KB | 16,5 KB |
| `neovendo-consent.css` | Banner, Dialog und Platzhalter | 33,1 KB | 5,7 KB |
| `neovendo-consent.d.mts`, `types/` | TypeScript-Typen | | |
| `THIRD_PARTY_LICENSES.txt` | MIT-Lizenz von vanilla-cookieconsent, gehört zu den ausgelieferten Dateien | | |

Vom Skript entfallen gzip rund 10,5 KB auf vanilla-cookieconsent, der Rest sind Konfiguration, Texte, Platzhalter und Nachweis.

## In eine Site übernehmen

Die Dateien kommen als Kopie in die Site, festgelegt auf einen Commit dieses Repos. Ein Update ist
damit eine bewusste Änderung im Site-Repo.

```bash
REF=<voller Commit-Hash>
mkdir -p src/vendor/neovendo-consent
curl -fsSL "https://codeload.github.com/neovendo/neovendo-web-assets/tar.gz/$REF" \
  | tar -xz --strip-components=3 -C src/vendor/neovendo-consent "neovendo-web-assets-$REF/consent/dist"
```

## Konfiguration

Eine Datei je Site. Die Vorlage für die Jobschmiede liegt in [`demo/jobschmiede.config.mjs`](demo/jobschmiede.config.mjs).

```ts
import type { NeovendoConsentConfig } from './vendor/neovendo-consent/neovendo-consent.mjs';

const config: NeovendoConsentConfig = {
  textVersion: '2026-11-03',
  proofEndpoint: '/api/consent',
  services: [
    {
      id: 'openfreemap',
      name: 'OpenFreeMap',
      category: 'external_media',
      purpose: 'Kartenhintergrund für die Standort- und Stellenkarten',
      provider: 'Hyperknot Software Kft., Ungarn',
      hosts: ['tiles.openfreemap.org'],
      cookies: [],
      privacyUrl: 'https://openfreemap.org/privacy/',
    },
  ],
};

export default config;
```

| Feld | Pflicht | Bedeutung |
|---|---|---|
| `textVersion` | ja | Stand der Texte, landet im Cookie und im Nachweis. Bei jeder Textänderung anpassen. |
| `services` | ja | Alle Dienste. `id` nur aus `a-z`, `0-9`, `_`, `-`. Kategorien ohne Dienst erscheinen nicht. |
| `services[].cookies` | | `{ name, duration }`. `_ga*` steht für alle Cookies mit diesem Anfang. Beim Widerruf werden sie gelöscht, soweit sie zur Domain der Site gehören. |
| `revision` | | Ganze Zahl, Standard `0`. Erhöhen, wenn alle Besucher neu gefragt werden sollen, etwa bei einem neuen Dienst. |
| `categories` | | Texte bekannter Kategorien ändern oder eigene anlegen: `{ chat: { title, description } }`. Nur Text, kein HTML. |
| `privacyPolicyUrl`, `imprintUrl` | | Standard `/datenschutz` und `/impressum` |
| `proofEndpoint` | | Pfad oder http(s)-URL für den Nachweis. Ohne Angabe wird nichts gesendet. |
| `googleConsentMode` | | `true` oder `{ enabled, mapping, waitForUpdate, adsDataRedaction, urlPassthrough }` |
| `texts` | | Einzelne Texte überschreiben, siehe `DEFAULT_TEXTS` in [`src/texts.ts`](src/texts.ts) |
| `cookie` | | `{ name, expiresAfterDays, domain }`, Standard `nv_consent` und 182 Tage |
| `layout` | | Lage von Banner und Dialog. Die Gleichwertigkeit der Knöpfe lässt sich nicht abschalten. |
| `reloadOnRevoke` | | Standard `true`: Seite neu laden, wenn ein freigegebener Dienst widerrufen wird. Bereits ausgeführte Skripte lassen sich anders nicht zurücknehmen. |
| `hideFromBots` | | Standard `true`: kein Banner für Crawler und automatisierte Browser, also auch nicht in Playwright. |
| `onChange` | | `(state, change) => void` nach jeder Entscheidung |

Fehler in der Konfiguration werfen beim Start einen `ConsentConfigError` mit allen Punkten auf einmal.

## Markup

**Skripte** werden mit `type="text/plain"` gesperrt. `data-src` statt `src`, sonst lädt der Browser die
Datei trotzdem. Jedes Skript in einer Kategorie mit mehreren Diensten braucht `data-service`, sonst
läuft es schon, wenn nur irgendein Dienst der Kategorie freigegeben ist. Das Modul warnt in der
Konsole bei solchen Skripten und bei Diensten, die in der Konfiguration fehlen.

```html
<script type="text/plain" data-category="external_media" data-service="elfsight"
  data-src="https://elfsightcdn.com/platform.js" async></script>

<script type="text/plain" data-category="external_media" data-service="openfreemap">
  initMap();
</script>
```

**iframes** bekommen `data-src` und `data-service`. Bis zur Freigabe hat das iframe kein `src` und ist
versteckt, davor steht der Platzhalter. Aus `width` und `height` übernimmt er das Seitenverhältnis.

```html
<iframe data-service="youtube" data-src="https://www.youtube-nocookie.com/embed/…" width="640" height="360"></iframe>
```

**Widgets und Karten** bekommen einen Container mit `data-consent-placeholder`. Der Platzhalter
erscheint darin und verschwindet nach der Freigabe. Für kleine Flächen wie ein Badge gibt es
`data-consent-placeholder="compact"`.

```html
<div id="map" data-consent-placeholder data-service="openfreemap"></div>
<div class="elfsight-app-…" data-elfsight-app-lazy data-consent-placeholder="compact" data-service="elfsight"></div>
```

Ein Platzhalter in einem Link, wie beim Bewertungs-Badge der Jobschmiede, folgt dem Link beim Klick
nicht. Ein Knopf in einem `<a>` ist aber kein gültiges HTML, besser steht der Container neben dem Link.

„Inhalt laden“ im Platzhalter gibt nur diesen Dienst frei, bereits freigegebene bleiben bestehen. Ist
das Banner noch offen, schließt es sich, alle anderen Dienste gelten dann als abgelehnt.

**Footer-Link zum Widerruf**, ohne eigenes Skript:

```html
<a href="#" data-cc="show-preferencesModal">Datenschutz-Einstellungen</a>
```

`data-cc` wird beim Start gebunden. Für Links, die später ins DOM kommen, `neovendoConsent.show()` nehmen.

## API

`initConsent(config)` aus dem ESM-Bundle oder `window.neovendoConsent.init(config)` startet das Modul
und gibt die API zurück, die auch unter `window.neovendoConsent` liegt.

| Methode | Zweck |
|---|---|
| `show()` | Einstellungsdialog öffnen |
| `showBanner()` | Banner erneut zeigen |
| `getState()` | aktueller Stand oder `null` ohne Entscheidung |
| `acceptedService(id)`, `acceptedCategory(id)` | Abfrage |
| `acceptService(id)` | nur diesen Dienst freigeben |
| `onAccept(id, callback)` | einmal aufrufen, sobald der Dienst freigegeben ist, auch sofort. Gibt eine Abmeldefunktion zurück. |
| `on('ready' \| 'change' \| 'proof', callback)` | Events, gibt eine Abmeldefunktion zurück |
| `scan(root?)` | Platzhalter neu prüfen, nach clientseitiger Navigation |
| `reset()` | Entscheidung löschen und Seite neu laden |

Die Events kommen zusätzlich als `CustomEvent` auf `window`: `neovendo-consent:ready`,
`neovendo-consent:change` und `neovendo-consent:proof`.

```js
window.addEventListener('neovendo-consent:change', (event) => {
  const { state, change } = event.detail;
  // change.first: erste Entscheidung, change.changedServices: was sich geändert hat
});
```

## Nachweis

Mit `proofEndpoint` sendet das Modul nach der ersten Entscheidung und nach jeder Änderung:

```json
{
  "id": "3d99e345-6d34-43b0-ac76-77a0a81ed7c8",
  "timestamp": "2026-11-03T07:35:07.859Z",
  "firstTimestamp": "2026-11-03T07:33:45.640Z",
  "textVersion": "2026-11-03",
  "revision": 0,
  "event": "change",
  "acceptType": "necessary",
  "categories": ["necessary"],
  "rejectedCategories": ["external_media"],
  "services": { "external_media": [] }
}
```

`id` ist eine zufällige UUID, die der Browser beim ersten Mal erzeugt und im Cookie behält. Der
Request geht ohne Cookies und ohne Referrer und übersteht ein Neuladen der Seite. Fällt der Endpunkt
aus, läuft das Modul normal weiter, das Event `proof` meldet dann `ok: false`.

Der Server sieht die IP-Adresse zwangsläufig. Der Endpunkt darf sie nicht speichern, und das
Access-Log des Proxys sollte für diesen Pfad keine IP enthalten. Beispiel für Astro mit Directus:

```ts
// src/pages/api/consent.ts
import type { APIRoute } from 'astro';

export const prerender = false;

const isList = (value: unknown) => Array.isArray(value) && value.every((v) => typeof v === 'string' && v.length < 64);

export const POST: APIRoute = async ({ request }) => {
  if (request.headers.get('origin') !== new URL(import.meta.env.SITE).origin) {
    return new Response(null, { status: 403 });
  }
  const body = await request.json().catch(() => null);
  const valid =
    body &&
    /^[0-9a-f-]{36}$/.test(body.id) &&
    ['first', 'change'].includes(body.event) &&
    typeof body.textVersion === 'string' &&
    isList(body.categories) &&
    isList(body.rejectedCategories);
  if (!valid) return new Response(null, { status: 400 });

  await fetch(`${import.meta.env.DIRECTUS_URL}/items/consent_log`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${import.meta.env.DIRECTUS_CONSENT_TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      consent_id: body.id,
      event: body.event,
      consented_at: body.timestamp,
      text_version: body.textVersion,
      revision: body.revision,
      accept_type: body.acceptType,
      categories: body.categories,
      services: body.services,
    }),
  });
  return new Response(null, { status: 204 });
};
```

## Google Consent Mode v2

Standardmäßig aus. Mit `googleConsentMode: true` setzt das Modul beim Start synchron
`gtag('consent', 'default', …)` mit allem auf `denied` außer `functionality_storage` und
`security_storage`, nach jeder Entscheidung folgt `gtag('consent', 'update', …)`.

| Consent-Typ | Kategorie |
|---|---|
| `analytics_storage` | `analytics` |
| `ad_storage`, `ad_user_data`, `ad_personalization`, `personalization_storage` | `marketing` |
| `functionality_storage`, `security_storage` | `necessary` |

Die Standardwerte müssen stehen, bevor das Google-Tag lädt. Dafür das IIFE-Bundle synchron im
`<head>` vor dem Google-Tag laden, nicht als Modul.

## Einbau in Astro

```astro
---
// src/layouts/Layout.astro
import '../vendor/neovendo-consent/neovendo-consent.css';
---
<html lang="de">
  <body>
    <slot />
    <footer>
      <a href="#" data-cc="show-preferencesModal">Datenschutz-Einstellungen</a>
    </footer>
    <script>
      import { initConsent } from '../vendor/neovendo-consent/neovendo-consent.mjs';
      import config from '../consent.config';
      initConsent(config);
    </script>
  </body>
</html>
```

Gesperrte Skripte brauchen `is:inline`, sonst bündelt Astro sie:

```astro
<script is:inline type="text/plain" data-category="external_media" data-service="elfsight"
  data-src="https://elfsightcdn.com/platform.js" async></script>
```

Eine Karte mit selbst gebündeltem MapLibre lädt erst nach der Freigabe, auch die Bibliothek selbst:

```astro
<div id="map" data-consent-placeholder data-service="openfreemap"></div>
<script>
  import { api as consent } from '../vendor/neovendo-consent/neovendo-consent.mjs';

  consent.onAccept('openfreemap', async () => {
    const maplibregl = await import('maplibre-gl');
    await import('maplibre-gl/dist/maplibre-gl.css');
    new maplibregl.Map({ container: 'map', style: 'https://tiles.openfreemap.org/styles/liberty', center: [10.496, 53.83], zoom: 13 });
  });
</script>
```

Mit View Transitions nach jedem Seitenwechsel `scan()` aufrufen:

```js
document.addEventListener('astro:page-load', () => window.neovendoConsent?.scan());
```

## Einbau in Next.js (App Router)

```tsx
// app/consent.tsx
'use client';

import { useEffect } from 'react';
import { usePathname } from 'next/navigation';
import { api, initConsent } from '@/vendor/neovendo-consent/neovendo-consent.mjs';
import '@/vendor/neovendo-consent/neovendo-consent.css';
import config from '@/consent.config';

export function Consent() {
  const pathname = usePathname();
  useEffect(() => {
    initConsent(config);
  }, []);
  // Platzhalter auf neu gerenderten Seiten erfassen
  useEffect(() => api.scan(), [pathname]);
  return null;
}

export function ConsentSettingsLink() {
  return (
    <button type="button" onClick={() => api.show()}>
      Datenschutz-Einstellungen
    </button>
  );
}
```

```tsx
// app/layout.tsx
import { Consent, ConsentSettingsLink } from './consent';

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="de">
      <body>
        {children}
        <footer>
          <ConsentSettingsLink />
        </footer>
        <Consent />
      </body>
    </html>
  );
}
```

Der Import ist beim Server-Rendering unbedenklich, das Bundle greift erst in `initConsent` auf das DOM
zu. Skripte von Drittanbietern lädt man in React am besten über `onAccept`, nicht über
`<script type="text/plain">`, denn die Bibliothek erfasst gesperrte Skripte nur einmal beim Start:

```tsx
useEffect(
  () =>
    api.onAccept('elfsight', () => {
      const script = document.createElement('script');
      script.src = 'https://elfsightcdn.com/platform.js';
      script.async = true;
      document.body.append(script);
    }),
  [],
);
```

## Reine HTML-Seite

```html
<link rel="stylesheet" href="/vendor/neovendo-consent/neovendo-consent.css" />
<script>
  window.neovendoConsentConfig = { textVersion: '2026-11-03', services: [/* … */] };
</script>
<script src="/vendor/neovendo-consent/neovendo-consent.iife.js" defer></script>
```

## Aussehen

Banner und Dialog übernehmen die `--cc-*` Variablen von vanilla-cookieconsent, der Platzhalter
übernimmt sie ebenfalls, solange keine `--nvc-*` Variablen gesetzt sind.

```css
:root {
  --cc-font-family: Raleway, sans-serif;
  --cc-btn-primary-bg: #0b2d4f;
  --cc-btn-primary-hover-bg: #061c33;
  --nvc-placeholder-bg: #f2f5f8;
}
```

Klassen am Platzhalter: `.nvc-placeholder`, `.nvc-placeholder--compact`, `__title`, `__text`,
`__button`, `__note`, `__link`. Container mit gesperrtem Inhalt tragen `.nvc-blocked`.

## Entwicklung

```bash
npm install
npm test          # Vitest mit jsdom: Konfiguration, Sperren, Platzhalter, Nachweis, Consent Mode, dist
npm run typecheck
npm run build     # schreibt dist/, danach mit committen
npm run demo      # http://localhost:4400/demo/
```

Die Demo nutzt die Jobschmiede-Konfiguration mit OpenFreeMap-Karte und Elfsight-Badge. Der
Demo-Server nimmt Nachweise unter `/api/consent` an und zeigt sie auf der Seite. Vor der Einwilligung
darf im Netzwerk-Tab keine Anfrage an `openfreemap.org` oder `elfsight` stehen.

Version: `package.json` und `src/version.ts` gemeinsam erhöhen, der Build bricht sonst ab.
