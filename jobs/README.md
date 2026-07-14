# Jobs Filter Assets

## Zweck

`jobs-filter.js` uebernimmt:

- Textsuche nach Jobtitel, Kategorien, PLZ und Ort
- Ortsvorschlaege auf Basis der PLZ-Datei
- Umkreissuche ueber `latitude`/`longitude`
- Filter nach Vermittlungsart
- Ergebniszaehler und "Mehr laden"
- Leaflet-Karte mit Markern fuer sichtbare Jobs
- eigenen Empty State bei `0` Treffern

`jobs-filter.css` liefert die Minimalstile fuer:

- Empty State
- aktiven Vorschlag im Orts-Dropdown

## Externe Daten (PLZ)

Das Script laedt `data/plz-data.json` (relativ zum Script-`src`). Jede Zeile:

```json
{ "plz": "24534", "city": "Neumünster", "ort": "Neumünster, Holstein", "lat": 54.07, "lon": 9.98 }
```

- `city` = saubere Stadt -> PLZ-unabhaengige Ortssuche
- `ort`  = Anzeigename (Ortsteil/Region) fuer die Vorschlaege
- `lat`/`lon` = Zentrum fuer die Umkreissuche

`plz-data.json` wird aus der massgeblichen Dashboard-CSV generiert
(`ba-admin-dashboard/public/data/PLZ_STREETCODE_FINAL.csv` = Single Source of Truth,
Format `postcode;city;suburb;display_name;longitude;latitude;state`):

```sh
node jobs/build/generate-plz-data.mjs /pfad/zu/PLZ_STREETCODE_FINAL.csv
```

So landen Korrekturen an der PLZ-Liste (z. B. neu ergaenzte Orte) automatisch auch auf der Website.

## Einbindung

Beispiel:

```html
<link rel="stylesheet" href="https://cdn.jsdelivr.net/gh/<user>/<repo>@main/jobs/jobs-filter.css">
<script src="https://cdn.jsdelivr.net/gh/<user>/<repo>@main/jobs/jobs-filter.js" defer></script>
```

## Benoetigte IDs

Diese Elemente werden direkt ueber `getElementById(...)` angesprochen:

- `job-search`
- `location-input`
- `location-suggestions`
- `employment-type-select`
- `radius-select`
- `btn-reset`
- `load-more-btn`
- `results-visible`
- `results-count`
- `results-total`
- `results-summary`
- `jobs-map`

Optional:

- `jobs-empty-state`
  Wenn dieses Element existiert, benutzt das Script es als Empty State.
  Falls nicht, erzeugt das Script selbst ein Element mit dieser ID.

## Benoetigte Klassen

- `.job-item`
  Jede Stellenkarte / jedes Listenelement muss diese Klasse tragen.

Optional als Fallback fuer Job-Links:

- `.job-link`

## Benoetigte Wrapper / Container

Fuer die Beobachtung der Liste und den Empty State sucht das Script einen dieser Container:

- `[fs-list-element="list"]`
- `.w-dyn-items`
- `.jobs-list`

Fuer das Schliessen des Orts-Dropdowns ausserhalb des Feldes wird geprueft auf:

- `#location-wrapper`
- `#location-suggestions`
- `#location-input`

## Benoetigte `data-*`-Attribute auf `.job-item`

Pflicht fuer die Filtersuche:

- `data-jobtitle`
- `data-plz`
- `data-ort`
- `data-vermittlungsart`

Optional fuer erweiterte Suche:

- `data-category1`
- `data-category2`

Pflicht fuer Karte und Umkreissuche:

- `data-latitude`
- `data-longitude`

Optional fuer Marker-Link:

- `data-url`

Wenn `data-url` fehlt, sucht das Script als Fallback:

- erstes `a[href]` im Job-Item
- sonst `.job-link[href]`

## Optionales `data-*`-Attribut auf der Karte

Auf `#jobs-map` kann gesetzt werden:

- `data-marker-icon-url`

Alternativ kann global gesetzt werden:

```html
<script>
  window.JOBS_MAP_MARKER_ICON_URL = "https://example.com/pin.svg";
</script>
```

## Query-Parameter

Das Script liest beim Laden diese URL-Parameter:

- `job`
- `location`
- `radius`
- `employmentType`

Beispiel:

```txt
?job=elektriker&location=luebeck&radius=25&employmentType=personalvermittlung
```

## Verhalten der Ortssuche

- Suche ist diakritik-tolerant (`Luebeck` findet `Lübeck`)
- Zwei Modi:
  - **Stadt-Modus** (Ortsname eingegeben/gewaehlt): matcht **alle PLZ** der Stadt
    ueber `data-ort`. Die Vorschlagsliste bietet dafuer oben einen Eintrag
    „<Stadt> – alle PLZ" an. So laesst sich z. B. „ganz Hamburg" durchsuchen.
  - **PLZ-Modus** (reine PLZ eingegeben/gewaehlt): matcht die **exakte PLZ**.
- Vorschlaege suchen ueber `display_name`, `city`, `suburb`, `PLZ + Ort`
- Eine erkannte PLZ wird auch bei mehreren Anzeigenamen als PLZ-Modus uebernommen
- Auswahl per Tap funktioniert auf Touch-Geraeten (`pointerdown`)
- Tastatursteuerung:
  - `ArrowDown`
  - `ArrowUp`
  - `Enter`
  - `Escape`

## Leaflet

Leaflet wird dynamisch geladen:

- JS: `https://unpkg.com/leaflet@1.9.4/dist/leaflet.js`
- CSS: `https://unpkg.com/leaflet@1.9.4/dist/leaflet.css`

## Hinweise

- Der native Webflow-CMS-Empty-State greift bei JS-gefilterten Ergebnissen nicht, weil vorhandene Items nur ausgeblendet werden.
- Deshalb hat das Script einen eigenen Empty State.
- Fuer kleine Radien haengt die Genauigkeit direkt von den gespeicherten Job-Koordinaten ab.
- Fuer die Karte werden die Koordinaten aus den Jobdaten verwendet, nicht aus der CSV.
