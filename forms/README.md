# Formular-Assets

## Upload-Feld (`file-upload.js`)

### Zweck

Die Bewerbungsformulare der Jobschmiede haben ein eigenes Upload-Feld (HTML-Embed
`.file-upload-wrap` mit `<input type="file" multiple>`). Ein natives Datei-Input
ersetzt bei jeder neuen Auswahl die vorherige: Wer Lebenslauf und Zeugnis
nacheinander auswaehlt, schickt nur die zuletzt gewaehlte Datei ab. Mehrere
Anhaenge kamen nur an, wenn alle Dateien auf einmal im Dialog markiert wurden.

`file-upload.js` uebernimmt:

- Dateien sammeln statt ersetzen (Dateidialog und Drag & Drop)
- "x"-Button pro Datei zum Entfernen (per Tastatur bedienbar)
- Pruefung schon bei der Auswahl: max. 3 Dateien, je max. 10 MB, nur PDF/DOC/DOCX,
  mit Meldung direkt unter der Liste statt `alert()` beim Absenden
- doppelt gewaehlte Dateien werden ignoriert
- knapp neben das Feld fallengelassene Dateien oeffnet der Browser nicht mehr
  (sonst waere das ausgefuellte Formular weg)

Die Styles fuer Liste, "x" und Fehlermeldung bringt das Script selbst mit. Das
Grund-Design des Feldes bleibt im Embed und ist dort in Webflow pflegbar.

### Zusammenspiel mit dem Upload-Server

Hochgeladen und versendet wird weiterhin von den Scripts auf
`files.die-jobschmiede.com` (nicht in diesem Repo):

- `webflow-upload.js` liest beim Absenden `input.files`, laedt alles an
  `upload.php` und schreibt die Links in das Hidden-Feld `anlagen_file_url`.
- `webflow-submit.js` schickt Formulare mit `data-submit-with-attachments="true"`
  an `form-submit/submit.php`.

`file-upload.js` schreibt die gesammelte Liste deshalb nur zurueck in
`input.files`. **Die Grenzen (`MAX_FILES`, `MAX_FILE_SIZE`, `ALLOWED_EXTENSIONS`)
muessen zu `webflow-upload.js` passen**, sonst lehnt der Upload beim Absenden ab,
was das Feld vorher angenommen hat.

### Einbindung

Einmal site-weit im Head (Site Settings > Custom Code), auf einen **Commit
gepinnt** wie bei den Jobs-Assets (Grund siehe `jobs/README.md`):

```html
<script src="https://cdn.jsdelivr.net/gh/neovendo/neovendo-web-assets@<commit>/forms/file-upload.js" defer></script>
```

Das Script tut nichts auf Seiten ohne `.file-upload-wrap`.

Das Upload-Feld steckt aktuell in drei Formularen:

- „Bewerbungsformular Stelle" auf dem CMS-Template „Stellenanzeigen Template"
- „Bewerbungsformular Kontaktseite" auf „Kontakt - Arbeitnehmer"
- „Initiativbewerbung" in der Komponente `section_contact1`
  (verwendet auf „Job" und „Bewerbung (Initiativ)")

### Benoetigtes Markup

Innerhalb von `.file-upload-wrap`:

- `[data-name="file_upload"]` – das Datei-Input
- `.file-upload-box` – Klick- und Drop-Flaeche um das Input
- `[data-file-upload-list]` – leere Liste fuer die gewaehlten Dateien

Optional `[data-file-upload-error]` fuer die Fehlermeldung. Fehlt es, legt das
Script es direkt unter der Liste an.

### Altes Inline-Script in den Embeds

Die Embeds enthalten noch ein eigenes `<script>`, das die Liste bei jeder
Auswahl neu schreibt. `file-upload.js` faengt das `change`-Event vorher ab, das
alte Script kommt also nicht mehr zum Zug. Es kann beim naechsten Anfassen der
Embeds entfernt werden (nur den `<script>`-Block, `<style>` und Markup bleiben).

### Hinweise

- Safari < 14.1 kann `input.files` nicht setzen. Dort bleibt das native
  Verhalten (letzte Auswahl gewinnt), die Liste zeigt die Dateien ohne "x".
- Das Formular „Initiativbewerbung" hat kein `data-submit-with-attachments="true"`
  und geht deshalb nicht ueber `submit.php`, sondern ueber den normalen
  Webflow-Versand (Links in `anlagen_file_url`).
