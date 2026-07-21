// Jobsuche-Formular auf der Startseite. Es filtert selbst nichts, sondern baut
// nur die Ergebnis-URL fuer /jobs (job, location, radius).
//
// Die Ortslogik (normalizeText, getCityKey, findExactLocationMatch,
// showLocationSuggestions, renderLocationSuggestions, Tastatursteuerung) ist
// eine bewusste Kopie aus jobs-filter.js und nutzt dieselbe data/plz-data.json.
// Beide Seiten muessen exakt dieselben Orte kennen: Die Startseite darf keinen
// Ort anbieten, den /jobs anschliessend nicht mehr aufloesen kann. Aenderungen
// an der Ortslogik in jobs-filter.js hier mitziehen.
(function () {
  "use strict";

  const JOBS_PAGE_URL = "/jobs";
  const SCRIPT_FILENAME = "home-job-search.js";
  const PLZ_DATA_PATH = "data/plz-data.json";
  const MAX_SUGGESTIONS = 12;
  const MAX_CITY_SUGGESTIONS = 3;
  const BLUR_RESOLVE_DELAY_MS = 120;

  const IDS = {
    form: "home-job-filter-form",
    submit: "home-job-filter-submit",
    jobSearch: "home-job-search",
    locationInput: "home-location-input",
    locationSuggestions: "home-location-suggestions",
    locationWrapper: "home-location-wrapper",
    radiusSelect: "home-radius-select",
  };

  // Visuell identisch zu jobs-filter.css, aber selbst injiziert: So braucht die
  // Startseite nur ein einziges zusaetzliches Tag in Webflow.
  const SUGGESTION_STYLES = `
    #${IDS.locationSuggestions} [data-suggestion-index] {
      cursor: pointer;
    }
    #${IDS.locationSuggestions} [data-suggestion-index].is-active {
      background: rgba(15, 23, 42, 0.08);
      color: #0f172a;
    }
    #${IDS.locationSuggestions} [data-suggestion-index].is-city-suggestion {
      font-weight: 700;
      background: rgba(15, 23, 42, 0.05);
      border-bottom: 1px solid rgba(15, 23, 42, 0.12);
    }
    #${IDS.locationSuggestions} [data-suggestion-index].is-city-suggestion::before {
      content: "📍 ";
    }
    #${IDS.locationSuggestions} [data-suggestion-index].is-city-suggestion.is-active {
      background: rgba(15, 23, 42, 0.12);
    }
  `;

  const scriptElement = document.currentScript;

  let plzList = [];
  let plzDataPromise = null;
  let selectedLocation = null;
  let currentSuggestions = [];
  let highlightedSuggestionIndex = -1;

  function getForm() {
    return document.getElementById(IDS.form);
  }

  function getJobSearchInput() {
    return document.getElementById(IDS.jobSearch);
  }

  function getLocationInput() {
    return document.getElementById(IDS.locationInput);
  }

  function getSuggestionBox() {
    return document.getElementById(IDS.locationSuggestions);
  }

  function getRadiusSelect() {
    return document.getElementById(IDS.radiusSelect);
  }

  function getPlzDataUrl() {
    const scriptSrc =
      scriptElement?.src ||
      Array.from(document.scripts).find((script) =>
        (script.src || "").includes(SCRIPT_FILENAME)
      )?.src ||
      "";

    if (!scriptSrc) return "";

    try {
      const url = new URL(scriptSrc, window.location.href);
      return url.href.replace(
        new RegExp(`${SCRIPT_FILENAME.replace(".", "\\.")}(?:\\?.*)?$`),
        PLZ_DATA_PATH
      );
    } catch (error) {
      console.error("[home-job-search] Could not resolve PLZ data URL", error);
      return "";
    }
  }

  // Die PLZ-Datei ist gross (gzip ~800 KB). Auf der Startseite wird sie deshalb
  // erst geladen, wenn jemand das Ortsfeld ueberhaupt anfasst.
  function ensurePlzData() {
    if (plzList.length) return Promise.resolve(plzList);
    if (plzDataPromise) return plzDataPromise;

    const jsonUrl = getPlzDataUrl();
    if (!jsonUrl) {
      plzList = [];
      return Promise.resolve(plzList);
    }

    plzDataPromise = (async () => {
      try {
        const res = await fetch(jsonUrl);
        if (!res.ok) {
          throw new Error(`PLZ data request failed with status ${res.status}`);
        }

        const data = await res.json();
        if (!Array.isArray(data)) {
          throw new Error("PLZ data is not an array");
        }

        plzList = data
          .map((item) => {
            const plz = String(item.plz || "").trim().padStart(5, "0");
            const ort = String(item.ort || "").trim();
            const city = String(item.city || "").trim();
            const lat = parseFloat(item.lat);
            const lon = parseFloat(item.lon);

            // Dieselbe Gueltigkeitspruefung wie in jobs-filter.js: Eintraege
            // ohne Koordinaten wirft /jobs weg, also darf die Startseite sie
            // gar nicht erst vorschlagen.
            if (!plz || !ort || Number.isNaN(lat) || Number.isNaN(lon)) {
              return null;
            }

            // Suchfelder einmalig vorberechnen – sonst laeuft normalizeText()
            // bei jedem Tastendruck ueber ~89k Eintraege.
            return {
              plz,
              ort,
              city,
              cityKey: getCityKey({ city, ort }),
              searchOrt: normalizeText(ort),
              searchCity: normalizeText(city),
              searchLabel: normalizeText(`${plz} ${ort}`),
            };
          })
          .filter(Boolean);
      } catch (error) {
        console.error("[home-job-search] PLZ data load failed", error);
        plzList = [];
      }

      return plzList;
    })();

    return plzDataPromise;
  }

  function normalizeText(str) {
    return (str || "")
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/ß/g, "ss")
      .replace(/ae/g, "a")
      .replace(/oe/g, "o")
      .replace(/ue/g, "u")
      .replace(/[^a-z0-9]+/g, " ")
      .trim();
  }

  // Normalisierter Stadtname: bevorzugt das city-Feld, sonst der Anzeigename
  // ohne angehaengte Region ("Neumünster, Holstein" -> "neumunster").
  function getCityKey(source) {
    const raw =
      typeof source === "string"
        ? source
        : (source && (source.city || source.ort)) || "";
    return normalizeText(raw.split(",")[0]);
  }

  function getCityLabel(item) {
    const raw = (item && (item.city || item.ort)) || "";
    return raw.split(",")[0].trim();
  }

  function getSuggestionLabel(item) {
    if (item && item.__mode === "city") {
      return `${item.cityLabel} – alle PLZ`;
    }
    return `${item.plz} - ${item.ort}`;
  }

  // Was spaeter als ?location= an /jobs geht. Der Stadt-Modus schickt bewusst
  // nur den sauberen Stadtnamen: Den loest findExactLocationMatch() auf /jobs
  // wieder zum Stadt-Modus auf, das Label "… – alle PLZ" waere Anzeigetext.
  function toSelectedLocation(item) {
    if (!item) return null;

    if (item.__mode === "city") {
      return {
        mode: "city",
        label: getSuggestionLabel(item),
        param: item.cityLabel,
      };
    }

    return {
      mode: "plz",
      label: getSuggestionLabel(item),
      param: `${item.plz} - ${item.ort}`,
    };
  }

  function findExactLocationMatch(value) {
    // "… – alle PLZ" ist reiner Anzeigetext (eigene Vorschlagszeile und der
    // Wert, den /jobs in seine URL schreibt) und darf das Matching nicht stoeren.
    const query = normalizeText(value).replace(/\s*alle\s+plz$/, "").trim();
    if (!query) return null;

    const digitsOnly = query.replace(/\D/g, "");

    if (digitsOnly.length >= 5) {
      const postcode = digitsOnly.slice(0, 5);
      const postcodeMatches = plzList.filter((item) => item.plz === postcode);
      const exactByPlzAndText = postcodeMatches.find(
        (item) => item.searchOrt === query || item.searchLabel === query
      );
      if (exactByPlzAndText) return exactByPlzAndText;

      if (postcodeMatches.length) return postcodeMatches[0];
    }

    const exactLabelMatch = plzList.find((item) => item.searchLabel === query);
    if (exactLabelMatch) return exactLabelMatch;

    const cityMatch = plzList.find((item) => item.cityKey === query);
    if (cityMatch) {
      return {
        __mode: "city",
        cityKey: cityMatch.cityKey,
        cityLabel: getCityLabel(cityMatch),
      };
    }

    return null;
  }

  function dedupeLocationSuggestions(items) {
    const seen = new Set();
    return items.filter((item) => {
      const key = normalizeText(`${item.plz}|${item.ort}`);
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }

  function updateSuggestionHighlight() {
    const box = getSuggestionBox();
    if (!box) return;

    Array.from(box.children).forEach((child, index) => {
      const isActive = index === highlightedSuggestionIndex;
      child.classList.toggle("is-active", isActive);
      if (isActive) {
        child.setAttribute("aria-selected", "true");
        child.scrollIntoView({ block: "nearest" });
      } else {
        child.removeAttribute("aria-selected");
      }
    });
  }

  function closeLocationSuggestions() {
    const box = getSuggestionBox();
    if (!box) return;

    currentSuggestions = [];
    highlightedSuggestionIndex = -1;
    box.innerHTML = "";
    box.style.display = "none";
  }

  function renderLocationSuggestions(matches) {
    const box = getSuggestionBox();
    if (!box) return;

    currentSuggestions = matches;
    highlightedSuggestionIndex = matches.length ? 0 : -1;
    box.innerHTML = "";
    box.style.display = matches.length ? "block" : "none";

    matches.forEach((item, index) => {
      const div = document.createElement("div");
      div.textContent = getSuggestionLabel(item);
      div.setAttribute("data-suggestion-index", String(index));
      if (item.__mode === "city") {
        div.classList.add("is-city-suggestion");
      }
      if (index === highlightedSuggestionIndex) {
        div.classList.add("is-active");
        div.setAttribute("aria-selected", "true");
      }
      div.addEventListener("mouseenter", () => {
        highlightedSuggestionIndex = index;
        updateSuggestionHighlight();
      });
      // pointerdown deckt Maus, Touch und Pen ab – mit click/mousedown allein
      // laesst sich auf Touch-Geraeten kein Vorschlag zuverlaessig waehlen.
      div.addEventListener("pointerdown", (event) => {
        event.preventDefault();
        selectLocation(item);
      });
      box.appendChild(div);
    });
  }

  function showLocationSuggestions(value) {
    const box = getSuggestionBox();
    if (!box) return;

    closeLocationSuggestions();

    const query = normalizeText(value);
    if (query.length < 2) return;

    const digitsOnly = query.replace(/\D/g, "");

    const rawMatches = dedupeLocationSuggestions(
      plzList.filter((item) => {
        if (digitsOnly.length >= 1 && item.plz.startsWith(digitsOnly)) return true;
        return (
          item.searchOrt.includes(query) ||
          (item.searchCity && item.searchCity.includes(query)) ||
          item.searchLabel.includes(query)
        );
      })
    );

    if (!rawMatches.length) return;

    // "Stadt – alle PLZ" nach oben stellen, damit sich ein Ort PLZ-unabhaengig
    // suchen laesst. Bei reiner PLZ-Eingabe ergibt das keinen Sinn.
    const citySuggestions = [];
    if (digitsOnly.length === 0) {
      const seenCities = new Set();
      rawMatches.forEach((item) => {
        const cityKey = item.cityKey;
        if (!cityKey || seenCities.has(cityKey)) return;
        if (!cityKey.includes(query) && !query.includes(cityKey)) return;
        seenCities.add(cityKey);
        citySuggestions.push({
          __mode: "city",
          cityKey,
          cityLabel: getCityLabel(item),
        });
      });
    }

    const combined = [
      ...citySuggestions.slice(0, MAX_CITY_SUGGESTIONS),
      ...rawMatches,
    ].slice(0, MAX_SUGGESTIONS);

    renderLocationSuggestions(combined);
  }

  function selectLocation(item) {
    selectedLocation = toSelectedLocation(item);

    const locationInput = getLocationInput();
    if (locationInput) {
      locationInput.value = getSuggestionLabel(item);
    }

    closeLocationSuggestions();
  }

  function getRadiusValue() {
    const radius = parseInt(getRadiusSelect()?.value || "", 10);
    return Number.isNaN(radius) || radius <= 0 ? null : radius;
  }

  // In Webflow hat die Platzhalter-Option "Radius wählen" einen echten Wert
  // (value="10"). Dadurch reist ein 10-KM-Radius mit, den niemand gewaehlt hat –
  // auf /jobs schneidet der dann Treffer weg. Hier defensiv auf "" ziehen.
  function normalizeRadiusPlaceholder() {
    const select = getRadiusSelect();
    const placeholder = select?.options?.[0];
    if (!placeholder || !placeholder.value) return;
    if (!/radius|umkreis/i.test(placeholder.textContent || "")) return;

    const wasSelected = select.selectedIndex === 0;
    placeholder.value = "";
    if (wasSelected) {
      select.value = "";
    }
  }

  function buildJobsUrl() {
    const params = new URLSearchParams();

    const jobValue = (getJobSearchInput()?.value || "").trim();
    const locationValue = (getLocationInput()?.value || "").trim();
    const radius = getRadiusValue();

    if (jobValue) {
      params.set("job", jobValue);
    }

    if (selectedLocation) {
      params.set("location", selectedLocation.param);
    } else if (locationValue) {
      // Freitext geht so, wie er ist, an /jobs: Dort laeuft dieselbe
      // Aufloesung noch einmal.
      params.set("location", locationValue);
    }

    // Ohne Ort hat der Radius auf /jobs kein Zentrum. Er wuerde dort entweder
    // wirkungslos bleiben oder – bei gesetztem Ort – ungewollt Treffer
    // wegschneiden. Deshalb nur zusammen mit einem Ort mitgeben.
    if (radius && (selectedLocation || locationValue)) {
      params.set("radius", String(radius));
    }

    const query = params.toString();
    return query ? `${JOBS_PAGE_URL}?${query}` : JOBS_PAGE_URL;
  }

  function resolveLocationFromInput() {
    const locationInput = getLocationInput();
    const value = (locationInput?.value || "").trim();

    if (!value) {
      selectedLocation = null;
      return;
    }

    const match = findExactLocationMatch(value);
    if (!match) return;

    selectedLocation = toSelectedLocation(match);
    if (locationInput) {
      locationInput.value = getSuggestionLabel(match);
    }
  }

  function openJobsResults() {
    // Synchron bleiben: window.open() verliert nach einem await den
    // Nutzer-Gestus und wird dann vom Popup-Blocker kassiert. Sind die
    // PLZ-Daten noch nicht da, geht der Freitext raus – /jobs loest ihn selbst auf.
    if (plzList.length) {
      resolveLocationFromInput();
    }

    closeLocationSuggestions();
    window.open(buildJobsUrl(), "_blank", "noopener");
  }

  function handleLocationInputKeydown(event) {
    const input = event.currentTarget;

    if (!currentSuggestions.length) {
      if (input?.value?.trim()) {
        ensurePlzData().then(() => {
          showLocationSuggestions(input.value.trim());
        });
      }
      return;
    }

    if (event.key === "ArrowDown") {
      event.preventDefault();
      highlightedSuggestionIndex =
        highlightedSuggestionIndex >= currentSuggestions.length - 1
          ? 0
          : highlightedSuggestionIndex + 1;
      updateSuggestionHighlight();
      return;
    }

    if (event.key === "ArrowUp") {
      event.preventDefault();
      highlightedSuggestionIndex =
        highlightedSuggestionIndex <= 0
          ? currentSuggestions.length - 1
          : highlightedSuggestionIndex - 1;
      updateSuggestionHighlight();
      return;
    }

    if (event.key === "Enter") {
      const suggestion = currentSuggestions[highlightedSuggestionIndex];
      if (!suggestion) return;
      // Erstes Enter waehlt den Vorschlag aus, erst das zweite sendet ab.
      event.preventDefault();
      selectLocation(suggestion);
      return;
    }

    if (event.key === "Escape") {
      closeLocationSuggestions();
    }
  }

  function injectSuggestionStyles() {
    if (document.getElementById("home-job-search-styles")) return;

    const style = document.createElement("style");
    style.id = "home-job-search-styles";
    style.textContent = SUGGESTION_STYLES;
    document.head.appendChild(style);
  }

  function init() {
    const form = getForm();
    const locationInput = getLocationInput();

    injectSuggestionStyles();
    normalizeRadiusPlaceholder();

    if (locationInput) {
      locationInput.addEventListener("input", () => {
        selectedLocation = null;
        ensurePlzData().then(() => {
          showLocationSuggestions(locationInput.value.trim());
        });
      });

      locationInput.addEventListener("focus", () => {
        ensurePlzData().then(() => {
          showLocationSuggestions(locationInput.value.trim());
        });
      });

      locationInput.addEventListener("keydown", handleLocationInputKeydown);

      locationInput.addEventListener("blur", () => {
        // Kurz warten, damit ein pointerdown auf einem Vorschlag zuerst greift.
        window.setTimeout(() => {
          ensurePlzData().then(() => {
            resolveLocationFromInput();
            closeLocationSuggestions();
          });
        }, BLUR_RESOLVE_DELAY_MS);
      });
    }

    document.addEventListener("click", (event) => {
      if (
        !event.target.closest(`#${IDS.locationWrapper}`) &&
        !event.target.closest(`#${IDS.locationSuggestions}`) &&
        event.target.id !== IDS.locationInput
      ) {
        closeLocationSuggestions();
      }
    });

    if (!form) return;

    form.addEventListener("submit", (event) => {
      event.preventDefault();
      event.stopPropagation();
      openJobsResults();
    });

    const submitBtn = document.getElementById(IDS.submit);
    if (submitBtn) {
      submitBtn.addEventListener("click", (event) => {
        event.preventDefault();
        event.stopPropagation();
        openJobsResults();
      });
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
