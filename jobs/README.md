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

## Externe Daten

Das Script laedt eine CSV mit diesem Format:

```txt
postcode;city;suburb;display_name;longitude;latitude;state
```

Aktuell ist im Script diese URL hinterlegt:

```js
const csvUrl = "https://raw.githubusercontent.com/neovendo/neovendo/refs/heads/main/PLZ_STREETCODE_GEO.csv";
```

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
- Vorschlaege suchen ueber:
  - `display_name`
  - `city`
  - `suburb`
  - `PLZ + Ort`
- Reine PLZ werden nur dann automatisch uebernommen, wenn sie eindeutig sind
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
