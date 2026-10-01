// Upload-Feld der Bewerbungsformulare (Webflow-Embed ".file-upload-wrap").
//
// Ein natives <input type="file" multiple> ersetzt bei jeder neuen Auswahl die
// vorherige. Wer Lebenslauf und Zeugnis nacheinander auswaehlt, schickt deshalb
// nur die zuletzt gewaehlte Datei ab. Dieses Script sammelt die Dateien
// stattdessen, uebernimmt Drag & Drop, zeigt jede Datei mit einem "x" zum
// Entfernen und schreibt die gesammelte Liste zurueck in input.files.
//
// Hochgeladen wird weiterhin von webflow-upload.js aus dem form-submit-addon.
// Es liest input.files erst beim Absenden.
(function () {
  "use strict";

  // Gelten, solange am Upload-Feld nichts anderes steht. Sonst kommen die
  // Grenzen aus data-max-files, data-max-file-size-mb und
  // data-allowed-extensions am Input oder einem Eltern-Element (meist
  // .file-upload-wrap). webflow-upload.js liest dieselben Attribute,
  // upload.php prueft zusaetzlich gegen seine config.php.
  const DEFAULT_CONFIG = {
    maxFiles: 3,
    maxFileSizeMb: 10,
    allowedExtensions: ["pdf", "doc", "docx"],
  };

  const SELECTORS = {
    wrap: ".file-upload-wrap",
    input: '[data-name="file_upload"]',
    box: ".file-upload-box",
    list: "[data-file-upload-list]",
    error: "[data-file-upload-error]",
    remove: ".file-upload-remove",
  };

  const REMOVE_ICON =
    '<svg viewBox="0 0 24 24" fill="none" aria-hidden="true" focusable="false">' +
    '<path d="M6 6l12 12M18 6L6 18" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>' +
    "</svg>";

  // Nur die neuen Teile (Zeilen mit "x", Fehlermeldung, Fokus). Das Grund-Design
  // des Feldes steht im Embed und bleibt dort in Webflow pflegbar. Farben lassen
  // sich pro Seite ueber die --file-upload-*-Variablen setzen, die Standardwerte
  // passen zum Jobschmiede-Embed.
  const STYLES = `
    .file-upload-box:has(.file-upload-input:focus-visible) {
      border-color: var(--file-upload-accent, #f0a63a);
      outline: 2px solid var(--file-upload-accent, #f0a63a);
      outline-offset: 2px;
    }
    .file-upload-wrap .file-upload-item {
      display: flex;
      align-items: center;
      gap: 0.75rem;
    }
    .file-upload-item-name {
      flex: 1 1 auto;
      min-width: 0;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .file-upload-item-size {
      flex: none;
      font-size: 0.82rem;
      color: var(--file-upload-muted, #7a746a);
    }
    .file-upload-wrap .file-upload-remove {
      flex: none;
      display: inline-grid;
      place-items: center;
      width: 2rem;
      height: 2rem;
      margin: -0.35rem -0.4rem -0.35rem 0;
      padding: 0;
      border: 0;
      border-radius: 999px;
      background: transparent;
      color: var(--file-upload-icon, #4e4a43);
      cursor: pointer;
    }
    .file-upload-wrap .file-upload-remove:hover {
      background: var(--file-upload-hover-bg, #f6f1e8);
      color: var(--file-upload-text, #1f1f1f);
    }
    .file-upload-wrap .file-upload-remove:focus-visible {
      outline: 2px solid var(--file-upload-accent, #f0a63a);
      outline-offset: 1px;
    }
    .file-upload-remove svg {
      width: 1rem;
      height: 1rem;
    }
    .file-upload-error {
      display: grid;
      gap: 0.25rem;
      font-size: 0.85rem;
      line-height: 1.4;
      color: var(--file-upload-error, #b42318);
    }
    .file-upload-error[hidden] {
      display: none;
    }
  `;

  function injectStyles() {
    if (document.getElementById("file-upload-styles")) return;

    const style = document.createElement("style");
    style.id = "file-upload-styles";
    style.textContent = STYLES;
    document.head.appendChild(style);
  }

  function toFileList(files) {
    const transfer = new DataTransfer();
    files.forEach((file) => transfer.items.add(file));
    return transfer.files;
  }

  function isSameFile(a, b) {
    return a.name === b.name && a.size === b.size && a.lastModified === b.lastModified;
  }

  function getExtension(fileName) {
    const parts = fileName.split(".");
    return parts.length > 1 ? parts.pop().toLowerCase() : "";
  }

  function readConfig(input) {
    const read = (name) => input.closest(`[${name}]`)?.getAttribute(name) || "";

    const maxFiles = parseInt(read("data-max-files"), 10);
    const maxFileSizeMb = parseFloat(read("data-max-file-size-mb").replace(",", "."));
    const allowedExtensions = read("data-allowed-extensions")
      .split(",")
      .map((extension) => extension.trim().toLowerCase().replace(/^\./, ""))
      .filter(Boolean);

    return {
      maxFiles: maxFiles > 0 ? maxFiles : DEFAULT_CONFIG.maxFiles,
      maxFileSizeMb: maxFileSizeMb > 0 ? maxFileSizeMb : DEFAULT_CONFIG.maxFileSizeMb,
      allowedExtensions: allowedExtensions.length
        ? allowedExtensions
        : DEFAULT_CONFIG.allowedExtensions,
    };
  }

  // ["pdf", "doc", "docx"] -> "PDF, DOC oder DOCX"
  function describeExtensions(extensions) {
    const names = extensions.map((extension) => extension.toUpperCase());
    if (names.length === 1) return names[0];
    return `${names.slice(0, -1).join(", ")} oder ${names[names.length - 1]}`;
  }

  function validateFile(file, config) {
    if (!config.allowedExtensions.includes(getExtension(file.name))) {
      return `„${file.name}“ wurde nicht hinzugefügt: Erlaubt sind nur ${describeExtensions(config.allowedExtensions)}.`;
    }

    if (file.size > config.maxFileSizeMb * 1024 * 1024) {
      const limit = String(config.maxFileSizeMb).replace(".", ",");
      return `„${file.name}“ wurde nicht hinzugefügt: Die Datei ist größer als ${limit} MB.`;
    }

    return "";
  }

  function formatSize(bytes) {
    if (bytes < 1024 * 1024) {
      return `${Math.max(1, Math.round(bytes / 1024))} KB`;
    }

    return `${(bytes / (1024 * 1024)).toFixed(1).replace(".", ",")} MB`;
  }

  function hasDraggedFiles(event) {
    return Array.from(event.dataTransfer?.types || []).includes("Files");
  }

  function createItem(file, index, removable) {
    const item = document.createElement("li");
    item.className = "file-upload-item";

    const name = document.createElement("span");
    name.className = "file-upload-item-name";
    name.textContent = file.name;
    name.title = file.name;
    item.appendChild(name);

    const size = document.createElement("span");
    size.className = "file-upload-item-size";
    size.textContent = formatSize(file.size);
    item.appendChild(size);

    if (removable) {
      const remove = document.createElement("button");
      remove.type = "button";
      remove.className = "file-upload-remove";
      remove.dataset.index = String(index);
      remove.setAttribute("aria-label", `„${file.name}“ entfernen`);
      remove.innerHTML = REMOVE_ICON;
      item.appendChild(remove);
    }

    return item;
  }

  function renderList(list, files, removable) {
    list.textContent = "";
    files.forEach((file, index) => {
      list.appendChild(createItem(file, index, removable));
    });
  }

  function getErrorElement(wrap, list) {
    let element = wrap.querySelector(SELECTORS.error);
    if (element) return element;

    element = document.createElement("div");
    element.className = "file-upload-error";
    element.setAttribute("data-file-upload-error", "");
    element.setAttribute("role", "alert");
    element.hidden = true;
    list.insertAdjacentElement("afterend", element);
    return element;
  }

  // Liefert true, wenn das Feld voll aktiviert wurde (Sammeln, "x", Drop).
  function setup(wrap) {
    if (wrap.dataset.fileUploadEnhanced === "true") return false;

    const input = wrap.querySelector(SELECTORS.input);
    const box = wrap.querySelector(SELECTORS.box);
    const list = wrap.querySelector(SELECTORS.list);
    if (!input || !box || !list) return false;

    wrap.dataset.fileUploadEnhanced = "true";

    // Browser koennen eine Auswahl nach "Zurueck" wiederherstellen.
    let files = Array.from(input.files || []);

    try {
      input.files = toFileList(files);
    } catch (error) {
      // Ohne DataTransfer-Konstruktor (Safari < 14.1) laesst sich input.files
      // nicht setzen. Dann bleibt die native Auswahl, nur ohne Sammeln und "x".
      wrap.addEventListener(
        "change",
        (event) => {
          if (event.target !== input) return;
          event.stopPropagation();
          renderList(list, Array.from(input.files || []), false);
        },
        true
      );
      return false;
    }

    const config = readConfig(input);
    const errorElement = getErrorElement(wrap, list);

    function showProblems(problems) {
      errorElement.textContent = "";
      problems.forEach((problem) => {
        const line = document.createElement("div");
        line.textContent = problem;
        errorElement.appendChild(line);
      });
      errorElement.hidden = problems.length === 0;
    }

    function update(problems) {
      input.files = toFileList(files);
      renderList(list, files, true);
      showProblems(problems);
    }

    function addFiles(incoming) {
      const problems = [];

      incoming.forEach((file) => {
        if (files.some((known) => isSameFile(known, file))) return;

        const problem = validateFile(file, config);
        if (problem) {
          problems.push(problem);
          return;
        }

        if (files.length >= config.maxFiles) {
          problems.push(
            config.maxFiles === 1
              ? `„${file.name}“ wurde nicht hinzugefügt: Es ist nur eine Datei möglich.`
              : `„${file.name}“ wurde nicht hinzugefügt: Es sind maximal ${config.maxFiles} Dateien möglich.`
          );
          return;
        }

        files.push(file);
      });

      update(problems);
    }

    // Capture auf dem Wrapper: Die neue Auswahl wird hier uebernommen, bevor
    // Listener am Input sie sehen. stopPropagation haelt das alte Inline-Script
    // im Embed davon ab, die Liste danach mit nur der letzten Auswahl zu
    // ueberschreiben. webflow-upload.js haengt nicht an "change".
    wrap.addEventListener(
      "change",
      (event) => {
        if (event.target !== input) return;
        event.stopPropagation();
        addFiles(Array.from(input.files || []));
      },
      true
    );

    ["dragenter", "dragover"].forEach((eventName) => {
      box.addEventListener(eventName, (event) => {
        if (!hasDraggedFiles(event)) return;
        event.preventDefault();
        event.dataTransfer.dropEffect = "copy";
        box.classList.add("is-dragover");
      });
    });

    box.addEventListener("dragleave", (event) => {
      if (box.contains(event.relatedTarget)) return;
      box.classList.remove("is-dragover");
    });

    // preventDefault, sonst ersetzt der Browser die Auswahl im Input durch die
    // abgelegten Dateien, statt sie anzuhaengen.
    box.addEventListener("drop", (event) => {
      event.preventDefault();
      box.classList.remove("is-dragover");
      addFiles(Array.from(event.dataTransfer?.files || []));
    });

    list.addEventListener("click", (event) => {
      const button = event.target.closest(SELECTORS.remove);
      if (!button || !list.contains(button)) return;

      event.preventDefault();
      const index = Number(button.dataset.index);
      files.splice(index, 1);
      update([]);

      // Fokus nicht verlieren: naechster "x"-Button, sonst das Upload-Feld.
      const buttons = list.querySelectorAll(SELECTORS.remove);
      const next = buttons[Math.min(index, buttons.length - 1)];
      (next || input).focus();
    });

    return true;
  }

  // Knapp neben das Feld fallengelassene Dateien wuerde der Browser sonst
  // oeffnen und dabei das ausgefuellte Formular verlassen.
  function guardPageDrops() {
    ["dragover", "drop"].forEach((eventName) => {
      window.addEventListener(eventName, (event) => {
        if (event.defaultPrevented || !hasDraggedFiles(event)) return;
        event.preventDefault();
        event.dataTransfer.dropEffect = "none";
      });
    });
  }

  function init() {
    const wraps = Array.from(document.querySelectorAll(SELECTORS.wrap));
    if (!wraps.length) return;

    injectStyles();
    const enhanced = wraps.filter(setup);

    // Im Rueckfall-Modus (siehe setup) wuerde der Schutz auch das native Drop
    // aufs Input blockieren.
    if (enhanced.length) guardPageDrops();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
