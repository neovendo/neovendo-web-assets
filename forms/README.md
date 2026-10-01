# Formular-Assets

## Upload-Feld (`file-upload.js`)

### Zweck

Fuer Formulare mit eigenem Upload-Feld (HTML-Embed `.file-upload-wrap` mit
`<input type="file" multiple>`). Ein natives Datei-Input ersetzt bei jeder
neuen Auswahl die vorherige: Wer Lebenslauf und Zeugnis nacheinander auswaehlt,
schickt nur die zuletzt gewaehlte Datei ab.

`file-upload.js` uebernimmt:

- Dateien sammeln statt ersetzen (Dateidialog und Drag & Drop)
- "x"-Button pro Datei zum Entfernen (per Tastatur bedienbar)
- Pruefung schon bei der Auswahl (Anzahl, Groesse, Dateityp, siehe
  [Konfiguration](#konfiguration)), mit Meldung direkt unter der Liste statt
  `alert()` beim Absenden
- doppelt gewaehlte Dateien werden ignoriert
- knapp neben das Feld fallengelassene Dateien oeffnet der Browser nicht mehr
  (sonst waere das ausgefuellte Formular weg)

Die Styles fuer Liste, "x" und Fehlermeldung bringt das Script selbst mit. Das
Grund-Design des Feldes bleibt im Embed und ist dort in Webflow pflegbar.

### Ablauf mit dem form-submit-addon

Hochgeladen und versendet wird vom form-submit-addon auf dem Server der
jeweiligen Seite (nicht in diesem Repo):

1. **Auswahl:** `file-upload.js` sammelt die Dateien und schreibt die Liste in
   `input.files`. Hochgeladen wird hier noch nichts.
2. **Absenden, 1. Durchlauf:** `webflow-upload.js` liest `input.files`, laedt
   alles an `upload.php`, schreibt die Download-Links in das Hidden-Feld
   `anlagen_file_url` und loest das Absenden erneut aus.
3. **Absenden, 2. Durchlauf:** `webflow-submit.js` schickt Formulare mit
   `data-submit-with-attachments="true"` an `form-submit/submit.php`. Das holt
   die Dateien anhand der Links und des `upload_binding_token` selbst aus dem
   Upload-Speicher und verschickt eine Mail mit echten Anhaengen. In Webflow
   wird dabei nichts gespeichert.

Fehlt `data-submit-with-attachments`, geht das Formular nach Schritt 2 ueber den
normalen Webflow-Versand (nur Links in `anlagen_file_url`).

### Konfiguration

Grenzen als Data-Attribute am Input oder einem Eltern-Element, ueblicherweise
`.file-upload-wrap`:

| Attribut | Standard | Beispiel |
|---|---|---|
| `data-max-files` | `3` | `data-max-files="5"` |
| `data-max-file-size-mb` | `10` | `data-max-file-size-mb="2,5"` |
| `data-allowed-extensions` | `pdf,doc,docx` | `data-allowed-extensions="pdf,docx"` |

`webflow-upload.js` liest ab der Version mit Attribut-Unterstuetzung dieselben
Attribute, auch fuer das `accept` des Inputs. **Massgeblich bleibt `config.php`
von `upload.php`**: Die Attribute duerfen nicht grosszuegiger sein, sonst lehnt
der Server beim Absenden ab, was das Feld vorher angenommen hat. Den Hinweistext
im Embed ("Max. 3 Dateien, ...") bei Aenderungen mitziehen.

Farben als CSS-Variablen, z. B. im `<style>` des Embeds auf `.file-upload-wrap`.
Die Standardwerte passen zum Jobschmiede-Embed:

| Variable | Standard | Wofuer |
|---|---|---|
| `--file-upload-accent` | `#f0a63a` | Fokusrahmen |
| `--file-upload-text` | `#1f1f1f` | "x" bei Hover |
| `--file-upload-icon` | `#4e4a43` | "x" |
| `--file-upload-muted` | `#7a746a` | Dateigroesse |
| `--file-upload-hover-bg` | `#f6f1e8` | Hintergrund "x" bei Hover |
| `--file-upload-error` | `#b42318` | Fehlermeldung |

### Einbindung

Einmal site-weit im Head (Site Settings > Custom Code), auf einen **Commit
gepinnt** wie bei den Jobs-Assets (Grund siehe `jobs/README.md`):

```html
<script src="https://cdn.jsdelivr.net/gh/neovendo/neovendo-web-assets@<commit>/forms/file-upload.js" defer></script>
```

Das Script tut nichts auf Seiten ohne `.file-upload-wrap`.

### Benoetigtes Markup

Innerhalb von `.file-upload-wrap`:

- `[data-name="file_upload"]` – das Datei-Input
- `.file-upload-box` – Klick- und Drop-Flaeche um das Input
- `[data-file-upload-list]` – leere Liste fuer die gewaehlten Dateien

Optional `[data-file-upload-error]` fuer die Fehlermeldung. Fehlt es, legt das
Script es direkt unter der Liste an.

### Einsatz: Jobschmiede

Eingebunden im Head der Jobschmiede-Site. Das Upload-Feld steckt in drei
Formularen, alle mit `data-submit-with-attachments="true"`:

- „Bewerbungsformular Stelle" auf dem CMS-Template „Stellenanzeigen Template"
- „Bewerbungsformular Kontaktseite" auf „Kontakt - Arbeitnehmer"
- „Initiativbewerbung" in der Komponente `section_contact1`
  (verwendet auf „Job" und „Bewerbung (Initiativ)")

Die Embeds enthalten noch ihr altes Inline-`<script>`, das die Liste bei jeder
Auswahl neu schreibt. `file-upload.js` faengt das `change`-Event vorher ab, das
alte Script kommt also nicht mehr zum Zug. Es kann beim naechsten Anfassen der
Embeds entfernt werden (nur den `<script>`-Block, `<style>` und Markup bleiben).

### Hinweise

- Safari < 14.1 kann `input.files` nicht setzen. Dort bleibt das native
  Verhalten (letzte Auswahl gewinnt), die Liste zeigt die Dateien ohne "x".
