const VISIBLE_STEP = 20;
const LEAFLET_JS_URL = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.js";
const LEAFLET_CSS_URL = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.css";
const JOBS_MAP_DEFAULT_CENTER = [51.1657, 10.4515];
const JOBS_MAP_DEFAULT_ZOOM = 6;
const JOBS_MAP_TILE_URL = "https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png";
const JOBS_MAP_TILE_ATTRIBUTION = "&copy; OpenStreetMap contributors &copy; CARTO";
const MOBILE_MARKER_INITIAL_LIMIT = 20;
const MOBILE_MARKER_POST_INTERACTION_LIMIT = 100;
const FILTER_INPUT_DEBOUNCE_MS = 150;
const FILTER_URL_PARAMS = {
  job: "job",
  location: "location",
  radius: "radius",
  category: "category",
  employmentType: "employmentType",
  branch: "niederlassung",
};
const FILTER_SELECTORS = {
  jobSearch: "#job-search",
  locationInput: "#location-input",
  radiusSelect: "#radius-select",
  categorySelect: "#tag-select",
  employmentTypeSelect: "#employment-type-select",
  branchFilterContainer: "#niederlassung-filter, #branch-filter",
};
const DEBUG_ENABLED = Boolean(window.jobsFilterDebug);

let plzList = [];
let selectedLocation = null;
let filteredItems = [];
let visibleCount = VISIBLE_STEP;
let jobsListObserver = null;
let observedListRoot = null;
let currentLocationSuggestions = [];
let highlightedSuggestionIndex = -1;
let filterDebounceTimeout = null;
let plzDataPromise = null;

let jobsMap = null;
let jobsMapMarkersLayer = null;
let jobsMapInitialized = false;
let hasActiveMapFilter = false;
let jobsMapBootRetries = 0;
let leafletLoader = null;
let jobsMapMarkerIcon = null;
let jobsMapRenderFrame = null;
let jobsMapInteractionFrame = null;
let jobsMapHasUserInteracted = false;
let jobsMapSuppressInteractionEvents = false;
let hasInitializedFilterState = false;

function getJobsListContainer() {
  return (
    document.querySelector('[fs-list-element="list"]') ||
    document.querySelector(".w-dyn-items") ||
    document.querySelector(".jobs-list")
  );
}

function getEmptyStateElement() {
  const existing =
    document.getElementById("jobs-empty-state") ||
    document.querySelector("[data-jobs-empty-state]");
  if (existing) return existing;

  const listContainer = getJobsListContainer();
  if (!listContainer || !listContainer.parentElement) return null;

  const emptyState = document.createElement("div");
  emptyState.id = "jobs-empty-state";
  emptyState.setAttribute("data-jobs-empty-state", "true");
  emptyState.style.display = "none";
  emptyState.style.padding = "24px 0";
  emptyState.innerHTML = `
    <div class="jobs-empty-state__inner">
      <strong>Keine passenden Jobs gefunden.</strong>
      <div>Bitte passe die Filter an oder setze sie zurück.</div>
    </div>
  `;

  listContainer.parentElement.appendChild(emptyState);
  return emptyState;
}

function updateEmptyState() {
  const emptyState = getEmptyStateElement();
  if (!emptyState) return;
  emptyState.style.display = filteredItems.length ? "none" : "block";
}

function getQueryParams() {
  const params = new URLSearchParams(window.location.search);
  const branches = params
    .getAll(FILTER_URL_PARAMS.branch)
    .flatMap((value) => value.split(","))
    .map((value) => value.trim())
    .filter(Boolean);

  return {
    job: (params.get(FILTER_URL_PARAMS.job) || "").trim(),
    location: (params.get(FILTER_URL_PARAMS.location) || "").trim(),
    radius: (params.get(FILTER_URL_PARAMS.radius) || "").trim(),
    category: (params.get(FILTER_URL_PARAMS.category) || "").trim(),
    employmentType: (params.get(FILTER_URL_PARAMS.employmentType) || "").trim(),
    branches,
  };
}

function debugLog(label, payload) {
  if (!DEBUG_ENABLED) return;
  console.log(`[jobs-filter] ${label}`, payload);
}

async function loadPLZData() {
  if (plzList.length) return plzList;
  if (plzDataPromise) return plzDataPromise;

  const jsonUrl = getPlzDataUrl();

  if (!jsonUrl) {
    plzList = [];
    return plzList;
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
          // Optional clean city (e.g. "Neumünster") for PLZ-independent search.
          // Falls back to the display name when the dataset has no dedicated field.
          const city = String(item.city || "").trim();
          const lat = parseFloat(item.lat);
          const lon = parseFloat(item.lon);

          if (!plz || !ort || Number.isNaN(lat) || Number.isNaN(lon)) return null;

          // Normalisierte Suchfelder EINMALIG beim Laden vorberechnen. Ohne das
          // müsste jede Tastatureingabe normalizeText() (mehrere Regex + teure
          // NFD-Normalisierung) über ~89k Einträge laufen lassen -> Ortssuche
          // extrem langsam. Die drei "PLZ - Ort"-Varianten kollabieren nach der
          // Normalisierung zum selben String, deshalb genügt ein searchLabel.
          return {
            plz,
            ort,
            city,
            lat,
            lon,
            cityKey: getCityKey({ city, ort }),
            searchOrt: normalizeText(ort),
            searchCity: normalizeText(city),
            searchLabel: normalizeText(`${plz} ${ort}`),
          };
        })
        .filter(Boolean);
    } catch (error) {
      console.error("[jobs-filter] PLZ JSON load failed", error);
      plzList = [];
    }

    return plzList;
  })();

  return plzDataPromise;
}

function getPlzDataUrl() {
  const currentScript = Array.from(document.scripts).find((script) =>
    (script.src || "").includes("jobs-filter.js")
  );

  const scriptSrc = currentScript?.src || "";
  if (!scriptSrc) return "";

  try {
    const url = new URL(scriptSrc, window.location.href);
    return url.href.replace(/jobs-filter\.js(?:\?.*)?$/, "data/plz-data.json");
  } catch (error) {
    console.error("[jobs-filter] Could not resolve PLZ data URL", error);
    return "";
  }
}

function shouldPreloadPlzData() {
  const { location, radius } = getQueryParams();
  return Boolean(location || radius);
}

function ensurePLZDataLoaded() {
  return loadPLZData();
}

async function ensurePLZDataForLocationInteraction() {
  if (plzList.length) return plzList;
  return ensurePLZDataLoaded();
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

function normalizeTextToTokens(str) {
  const normalized = normalizeText(str);
  return normalized ? normalized.split(" ") : [];
}

// Normalized clean city name for an entry: prefers an explicit `city` field,
// otherwise derives it from the display name by dropping a trailing region
// (e.g. "Neumünster, Holstein" -> "neumunster").
function getCityKey(source) {
  const raw =
    typeof source === "string"
      ? source
      : (source && (source.city || source.ort)) || "";
  return normalizeText(raw.split(",")[0]);
}

// Human-readable clean city label (for the "… – alle PLZ" suggestion).
function getCityLabel(item) {
  const raw = (item && (item.city || item.ort)) || "";
  return raw.split(",")[0].trim();
}

// Unifies every selectedLocation into one shape: { mode, plz, cityKey, lat, lon }.
// mode "city" matches all PLZ of a city; mode "plz" matches one exact PLZ.
function toSelectedLocation(item) {
  if (!item) return null;
  if (item.__mode === "city") {
    return {
      mode: "city",
      cityKey: item.cityKey,
      plz: item.plz || "",
      lat: item.lat,
      lon: item.lon,
    };
  }
  return {
    mode: "plz",
    cityKey: getCityKey(item),
    plz: item.plz,
    lat: item.lat,
    lon: item.lon,
  };
}

function getDistance(lat1, lon1, lat2, lon2) {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;

  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) ** 2;

  return 2 * R * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function getAllJobItems() {
  return Array.from(document.querySelectorAll(".job-item"));
}

function getCategorySelect() {
  return document.querySelector(FILTER_SELECTORS.categorySelect);
}

function getBranchFilterContainer() {
  return document.querySelector(FILTER_SELECTORS.branchFilterContainer);
}

function getJobSearchInput() {
  return document.querySelector(FILTER_SELECTORS.jobSearch);
}

function getLocationInput() {
  return document.querySelector(FILTER_SELECTORS.locationInput);
}

function getRadiusSelect() {
  return document.querySelector(FILTER_SELECTORS.radiusSelect);
}

function getEmploymentTypeSelect() {
  return document.querySelector(FILTER_SELECTORS.employmentTypeSelect);
}

function collectJobCategories() {
  const categories = new Map();

  getAllJobItems().forEach((row) => {
    [row.dataset.category1, row.dataset.category2].forEach((value) => {
      const label = (value || "").trim();
      const key = normalizeText(label);

      if (!label || !key || categories.has(key)) return;
      categories.set(key, label);
    });
  });

  return Array.from(categories.values()).sort((a, b) =>
    a.localeCompare(b, "de", { sensitivity: "base" })
  );
}

function collectJobBranches() {
  const branches = new Map();

  getAllJobItems().forEach((row) => {
    const label = (row.dataset.niederlassung || "").trim();
    const key = normalizeText(label);

    if (!label || !key || branches.has(key)) return;
    branches.set(key, label);
  });

  return Array.from(branches.values()).sort((a, b) =>
    a.localeCompare(b, "de", { sensitivity: "base" })
  );
}

function populateCategorySelect() {
  const select = getCategorySelect();
  if (!select) return;

  const categories = collectJobCategories();
  const currentValue = select.value;
  const firstOption = select.options[0];
  const defaultLabel = firstOption?.textContent?.trim() || "Alle Kategorien";
  const defaultValue = firstOption ? firstOption.value : "";

  select.innerHTML = "";

  const defaultOption = document.createElement("option");
  defaultOption.value = defaultValue;
  defaultOption.textContent = defaultLabel;
  select.appendChild(defaultOption);

  categories.forEach((category) => {
    const option = document.createElement("option");
    option.value = category;
    option.textContent = category;
    select.appendChild(option);
  });

  const hasCurrentValue = Array.from(select.options).some(
    (option) => option.value === currentValue
  );
  select.value = hasCurrentValue ? currentValue : defaultValue;
}

function getBranchFilterState() {
  const container = getBranchFilterContainer();
  if (!container) {
    return {
      allChecked: true,
      selectedBranches: [],
    };
  }

  const allCheckbox = container.querySelector('[data-branch-filter-all]');
  const branchCheckboxes = Array.from(
    container.querySelectorAll('input[type="checkbox"][data-branch-filter-value]')
  );

  const selectedBranches = branchCheckboxes
    .filter((checkbox) => checkbox.checked)
    .map((checkbox) =>
      normalizeText(checkbox.dataset.branchFilterValue || checkbox.value || "")
    )
    .filter(Boolean);

  return {
    allChecked: Boolean(allCheckbox?.checked),
    selectedBranches,
  };
}

function getBranchCheckboxes() {
  const container = getBranchFilterContainer();
  if (!container) return [];

  return Array.from(
    container.querySelectorAll('input[type="checkbox"][data-branch-filter-value]')
  );
}

function getSelectedBranchLabels() {
  return getBranchCheckboxes()
    .filter((checkbox) => checkbox.checked)
    .map((checkbox) => (checkbox.dataset.branchFilterValue || checkbox.value || "").trim())
    .filter(Boolean);
}

function setCheckboxChecked(checkbox, isChecked) {
  if (!(checkbox instanceof HTMLInputElement)) return;

  checkbox.checked = isChecked;

  const label = checkbox.closest(".w-checkbox, .w-radio, label");
  const visual = label?.querySelector(".w-checkbox-input");

  if (visual) {
    visual.classList.toggle("w--redirected-checked", isChecked);
    visual.setAttribute("aria-checked", isChecked ? "true" : "false");
  }
}

function setSelectedBranchLabels(branchLabels) {
  const normalizedLabels = new Set(branchLabels.map((value) => normalizeText(value)).filter(Boolean));
  const branchCheckboxes = getBranchCheckboxes();
  const container = getBranchFilterContainer();
  if (!container) return;

  const allCheckbox = container.querySelector('[data-branch-filter-all]');

  branchCheckboxes.forEach((checkbox) => {
    const label = normalizeText(checkbox.dataset.branchFilterValue || checkbox.value || "");
    setCheckboxChecked(checkbox, normalizedLabels.has(label));
  });

  if (allCheckbox) {
    setCheckboxChecked(allCheckbox, normalizedLabels.size === 0);
  }

  syncBranchFilterState();
}

function hasCustomBranchCheckboxes(container) {
  if (!container) return false;

  return Boolean(
    container.querySelector('[data-branch-filter-all]') ||
    container.querySelector('[data-branch-filter-value]')
  );
}

function syncBranchFilterState(changedInput = null) {
  const container = getBranchFilterContainer();
  if (!container) return;

  const allCheckbox = container.querySelector('[data-branch-filter-all]');
  const branchCheckboxes = Array.from(
    container.querySelectorAll('input[type="checkbox"][data-branch-filter-value]')
  );

  if (changedInput === allCheckbox && allCheckbox) {
    if (allCheckbox.checked) {
      branchCheckboxes.forEach((checkbox) => {
        setCheckboxChecked(checkbox, false);
      });
    }
    return;
  }

  const checkedBranchCount = branchCheckboxes.filter((checkbox) => checkbox.checked).length;

  if (checkedBranchCount > 0 && allCheckbox) {
    setCheckboxChecked(allCheckbox, false);
    return;
  }

  if (allCheckbox) {
    setCheckboxChecked(allCheckbox, true);
  }
}

function populateBranchCheckboxes() {
  const container = getBranchFilterContainer();
  if (!container) return;

  if (hasCustomBranchCheckboxes(container)) {
    syncBranchFilterState();
    return;
  }

  const branches = collectJobBranches();
  const { allChecked, selectedBranches } = getBranchFilterState();
  const allLabel = container.dataset.allLabel?.trim() || "Alle Niederlassungen";

  container.innerHTML = "";

  const allWrapper = document.createElement("label");
  const allCheckbox = document.createElement("input");
  const allText = document.createElement("span");

  allCheckbox.type = "checkbox";
  allCheckbox.value = "";
  allCheckbox.checked = allChecked || selectedBranches.length === 0;
  allCheckbox.setAttribute("data-branch-filter-all", "true");
  allText.textContent = allLabel;

  allWrapper.appendChild(allCheckbox);
  allWrapper.appendChild(allText);
  container.appendChild(allWrapper);

  branches.forEach((branch) => {
    const wrapper = document.createElement("label");
    const checkbox = document.createElement("input");
    const text = document.createElement("span");

    checkbox.type = "checkbox";
    checkbox.value = branch;
    checkbox.checked = selectedBranches.includes(normalizeText(branch));
    checkbox.setAttribute("data-branch-filter-value", branch);
    text.textContent = branch;

    wrapper.appendChild(checkbox);
    wrapper.appendChild(text);
    container.appendChild(wrapper);
  });

  syncBranchFilterState();
}

function getCurrentFilterState() {
  return {
    job: (getJobSearchInput()?.value || "").trim(),
    location: (getLocationInput()?.value || "").trim(),
    radius: (getRadiusSelect()?.value || "").trim(),
    category: (getCategorySelect()?.value || "").trim(),
    employmentType: (getEmploymentTypeSelect()?.value || "").trim(),
    branches: getSelectedBranchLabels(),
  };
}

function updateFilterUrl() {
  if (!hasInitializedFilterState) return;

  const state = getCurrentFilterState();
  const params = new URLSearchParams();

  if (state.job) params.set(FILTER_URL_PARAMS.job, state.job);
  if (state.location) params.set(FILTER_URL_PARAMS.location, state.location);
  if (state.radius) params.set(FILTER_URL_PARAMS.radius, state.radius);
  if (state.category) params.set(FILTER_URL_PARAMS.category, state.category);
  if (state.employmentType) {
    params.set(FILTER_URL_PARAMS.employmentType, state.employmentType);
  }
  state.branches.forEach((branch) => {
    params.append(FILTER_URL_PARAMS.branch, branch);
  });

  const nextQuery = params.toString();
  const nextUrl = `${window.location.pathname}${nextQuery ? `?${nextQuery}` : ""}${window.location.hash}`;
  const currentUrl = `${window.location.pathname}${window.location.search}${window.location.hash}`;

  if (nextUrl !== currentUrl) {
    window.history.replaceState({}, "", nextUrl);
  }

  debugLog("state", state);
}

function updateCountElements() {
  const totalCount = getAllJobItems().length;
  const filteredCount = filteredItems.length;
  const visibleFilteredCount = Math.min(visibleCount, filteredCount);

  const visibleEl = document.getElementById("results-visible");
  if (visibleEl) {
    visibleEl.textContent = String(visibleFilteredCount);
  }

  const filteredEl = document.getElementById("results-count");
  if (filteredEl) {
    filteredEl.textContent = String(filteredCount);
  }

  const totalEl = document.getElementById("results-total");
  if (totalEl) {
    totalEl.textContent = String(totalCount);
  }

  const summaryEl = document.getElementById("results-summary");
  if (summaryEl) {
    summaryEl.textContent =
      `${visibleFilteredCount} von insgesamt ${totalCount} Jobs gefiltert`;
  }
}

const jobSearchTextCache = new WeakMap();

// Job-item data-* Attribute sind nach dem Rendern statisch, daher ist ein
// WeakMap-Cache pro Element sicher und spart bei jedem Tastendruck N normalizeText-Aufrufe.
function getJobSearchText(row) {
  if (jobSearchTextCache.has(row)) return jobSearchTextCache.get(row);

  const searchText = normalizeText(
    `${row.dataset.jobtitle || ""} ${row.dataset.category1 || ""} ` +
      `${row.dataset.category2 || ""} ${row.dataset.plz || ""} ${row.dataset.ort || ""}`
  );

  jobSearchTextCache.set(row, searchText);
  return searchText;
}

function matchesJobFilter(row, searchTokens) {
  if (!searchTokens.length) return true;

  const searchableText = getJobSearchText(row);
  return searchTokens.every((token) => searchableText.includes(token));
}

function matchesCategoryFilter(row, category) {
  if (!category) return true;

  const rowCategory1 = normalizeText(row.dataset.category1 || "");
  const rowCategory2 = normalizeText(row.dataset.category2 || "");

  return rowCategory1 === category || rowCategory2 === category;
}

function matchesEmploymentTypeFilter(row, employmentType) {
  if (!employmentType) return true;

  const rowEmploymentType = normalizeText(row.dataset.vermittlungsart || "");
  return rowEmploymentType === employmentType;
}

function matchesBranchFilter(row, selectedBranches) {
  if (!selectedBranches.length) return true;

  const rowBranch = normalizeText(row.dataset.niederlassung || "");
  return selectedBranches.includes(rowBranch);
}

function matchesSelectedLocation(row, location) {
  if (!location) return true;

  // City mode: match every PLZ that belongs to the selected city.
  if (location.mode === "city" && location.cityKey) {
    const rowCity = getCityKey(row.dataset.ort || "");
    if (!rowCity) return false;
    return (
      rowCity === location.cityKey ||
      rowCity.startsWith(location.cityKey + " ")
    );
  }

  // PLZ mode: exact postcode (unchanged behaviour).
  const rowPlz = (row.dataset.plz || "").trim();
  return rowPlz === location.plz;
}

function matchesRadiusFilter(row, centerLat, centerLon, radius) {
  if (
    centerLat == null ||
    centerLon == null ||
    Number.isNaN(radius) ||
    radius <= 0
  ) {
    return true;
  }

  const lat = parseFloat(row.dataset.latitude);
  const lon = parseFloat(row.dataset.longitude);

  if (Number.isNaN(lat) || Number.isNaN(lon)) {
    return false;
  }

  return getDistance(centerLat, centerLon, lat, lon) <= radius;
}

function itemMatches(row, jobTokens, selectedCategory, radius, employmentType, selectedBranches) {
  const jobMatch = matchesJobFilter(row, jobTokens);
  const categoryMatch = matchesCategoryFilter(row, selectedCategory);
  const employmentTypeMatch = matchesEmploymentTypeFilter(row, employmentType);
  const branchMatch = matchesBranchFilter(row, selectedBranches);

  let locationMatch = true;
  let radiusMatch = true;

  if (selectedLocation && !Number.isNaN(radius) && radius > 0) {
    radiusMatch = matchesRadiusFilter(
      row,
      selectedLocation.lat,
      selectedLocation.lon,
      radius
    );
  } else if (selectedLocation) {
    locationMatch = matchesSelectedLocation(row, selectedLocation);
  }

  return (
    jobMatch &&
    categoryMatch &&
    employmentTypeMatch &&
    branchMatch &&
    locationMatch &&
    radiusMatch
  );
}

function hasAnyActiveFilter() {
  const jobTerm = normalizeText(getJobSearchInput()?.value || "");
  const locationValue = normalizeText(getLocationInput()?.value || "");
  const selectedCategory = normalizeText(getCategorySelect()?.value || "");
  const { selectedBranches } = getBranchFilterState();
  const employmentType = normalizeText(
    getEmploymentTypeSelect()?.value || ""
  );
  const radius = parseInt(getRadiusSelect()?.value || "", 10);

  return Boolean(
    jobTerm ||
    locationValue ||
    selectedCategory ||
    selectedBranches.length ||
    employmentType ||
    (!Number.isNaN(radius) && radius > 0) ||
    selectedLocation
  );
}

function filterItems() {
  const items = getAllJobItems();
  const jobTokens = normalizeTextToTokens(getJobSearchInput()?.value || "");
  const selectedCategory = normalizeText(getCategorySelect()?.value || "");
  const { selectedBranches } = getBranchFilterState();
  const employmentType = normalizeText(
    getEmploymentTypeSelect()?.value || ""
  );
  const radius = parseInt(getRadiusSelect()?.value || "", 10);

  filteredItems = items.filter((row) =>
    itemMatches(
      row,
      jobTokens,
      selectedCategory,
      radius,
      employmentType,
      selectedBranches
    )
  );

  hasActiveMapFilter = hasAnyActiveFilter();
}

function renderItems() {
  const allItems = getAllJobItems();
  if (!allItems.length) return;

  allItems.forEach((row) => {
    row.style.display = "none";
  });

  filteredItems.slice(0, visibleCount).forEach((row) => {
    row.style.display = "";
  });

  updateCountElements();
  updateEmptyState();

  const loadMoreBtn = document.getElementById("load-more-btn");
  if (loadMoreBtn) {
    loadMoreBtn.style.display =
      filteredItems.length > visibleCount ? "block" : "none";
  }

  renderJobsMap();
}

function runFilters(resetVisible = true) {
  // Muss vor dem items-Check laufen: Hat Finsweet einen unserer Inputwerte als
  // eigenen Textfilter uebernommen, ist die Liste komplett leer.
  if (guardFinsweetFilters()) return;

  const items = getAllJobItems();
  if (!items.length) return;

  if (resetVisible) {
    visibleCount = VISIBLE_STEP;
  }

  filterItems();
  updateFilterUrl();
  renderItems();
}

function scheduleFilterRun(resetVisible = true) {
  if (filterDebounceTimeout) {
    window.clearTimeout(filterDebounceTimeout);
  }
  filterDebounceTimeout = window.setTimeout(() => {
    window.requestAnimationFrame(() => {
      runFilters(resetVisible);
    });
    filterDebounceTimeout = null;
  }, FILTER_INPUT_DEBOUNCE_MS);
}

function loadMoreResults() {
  visibleCount += VISIBLE_STEP;
  renderItems();
}

function findNearestPLZ(latUser, lonUser) {
  let best = null;
  let bestDist = Infinity;

  plzList.forEach((item) => {
    const dist = getDistance(latUser, lonUser, item.lat, item.lon);
    if (dist < bestDist) {
      bestDist = dist;
      best = item;
    }
  });

  return best;
}

function findExactLocationMatch(value) {
  // "… – alle PLZ" ist der Anzeigetext des Stadt-Vorschlags – und genau der
  // Wert, den updateFilterUrl() selbst in die URL schreibt. Ohne dieses
  // Abschneiden liesse sich eine geteilte oder neu geladene URL nicht mehr
  // aufloesen und der Ortsfilter fiele still weg.
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

    // Any recognized postcode resolves to PLZ mode (search a specific PLZ),
    // even when that postcode maps to several display names.
    if (postcodeMatches.length) return postcodeMatches[0];
  }

  // Exact "PLZ - Ort" label -> PLZ mode.
  const exactLabelMatch = plzList.find((item) => item.searchLabel === query);
  if (exactLabelMatch) return exactLabelMatch;

  // Plain city name -> city mode (PLZ-independent, all PLZ of that city).
  const cityMatch = plzList.find((item) => item.cityKey === query);
  if (cityMatch) {
    return {
      __mode: "city",
      cityKey: cityMatch.cityKey,
      cityLabel: getCityLabel(cityMatch),
      plz: cityMatch.plz,
      lat: cityMatch.lat,
      lon: cityMatch.lon,
    };
  }

  return null;
}

function getSuggestionLabel(item) {
  if (item && item.__mode === "city") {
    return `${item.cityLabel} – alle PLZ`;
  }
  return `${item.plz} - ${item.ort}`;
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
  const box = document.getElementById("location-suggestions");
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
  const box = document.getElementById("location-suggestions");
  if (!box) return;

  currentLocationSuggestions = [];
  highlightedSuggestionIndex = -1;
  box.innerHTML = "";
  box.style.display = "none";
}

function renderLocationSuggestions(matches) {
  const box = document.getElementById("location-suggestions");
  if (!box) return;

  currentLocationSuggestions = matches;
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
    // pointerdown covers mouse, touch and pen — fixes suggestion taps on mobile
    // (mousedown alone is unreliable on touch devices).
    div.addEventListener("pointerdown", (event) => {
      event.preventDefault();
      selectLocation(item);
    });
    box.appendChild(div);
  });
}

function showLocationSuggestions(value) {
  const box = document.getElementById("location-suggestions");
  if (!box) return;

  closeLocationSuggestions();

  const query = normalizeText(value);
  if (query.length < 2) return;

  const digitsOnly = query.replace(/\D/g, "");

  const rawMatches = dedupeLocationSuggestions(plzList
    .filter((item) => {
      if (digitsOnly.length >= 1 && item.plz.startsWith(digitsOnly)) return true;
      // Billiges .includes gegen die in loadPLZData vorberechneten Felder
      // (kein normalizeText pro Tastendruck mehr).
      return (
        item.searchOrt.includes(query) ||
        (item.searchCity && item.searchCity.includes(query)) ||
        item.searchLabel.includes(query)
      );
    }));

  if (!rawMatches.length) return;

  // Prepend "Stadt – alle PLZ" entries for the distinct cities in the result
  // set, so an Ort can be searched PLZ-independently. Skipped for pure PLZ input.
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
        plz: item.plz,
        lat: item.lat,
        lon: item.lon,
      });
    });
  }

  const combined = [...citySuggestions.slice(0, 3), ...rawMatches].slice(0, 12);
  renderLocationSuggestions(combined);
}

function selectLocation(item) {
  selectedLocation = toSelectedLocation(item);

  const locationInput = getLocationInput();

  if (locationInput) {
    locationInput.value = getSuggestionLabel(item);
  }

  closeLocationSuggestions();
  runFilters(true);
}

function applyInitialQueryParams() {
  const { job, location, radius, category, employmentType, branches } = getQueryParams();

  const jobSearch = getJobSearchInput();
  const locationInput = getLocationInput();
  const radiusSelect = getRadiusSelect();
  const categorySelect = getCategorySelect();
  const employmentTypeSelect = getEmploymentTypeSelect();

  if (job && jobSearch) {
    jobSearch.value = job;
  }

  if (radius && radiusSelect) {
    radiusSelect.value = radius;
  }

  if (employmentType && employmentTypeSelect) {
    employmentTypeSelect.value = employmentType;
  }

  if (category && categorySelect) {
    categorySelect.value = category;
  }

  if (branches.length) {
    setSelectedBranchLabels(branches);
  }

  if (location && locationInput) {
    const match = findExactLocationMatch(location);

    if (match) {
      selectedLocation = toSelectedLocation(match);
      locationInput.value = getSuggestionLabel(match);
    } else {
      locationInput.value = location;
    }
  }

  hasInitializedFilterState = true;
}

function resetFilter() {
  const jobSearch = getJobSearchInput();
  const locationInput = getLocationInput();
  const categorySelect = getCategorySelect();
  const branchFilterContainer = getBranchFilterContainer();
  const employmentTypeSelect = getEmploymentTypeSelect();
  const radiusSelect = getRadiusSelect();

  selectedLocation = null;

  if (jobSearch) jobSearch.value = "";
  if (locationInput) locationInput.value = "";
  if (categorySelect) categorySelect.value = categorySelect.options[0]?.value || "";
  if (branchFilterContainer) {
    const allCheckbox = branchFilterContainer.querySelector('[data-branch-filter-all]');
    const branchCheckboxes = branchFilterContainer.querySelectorAll(
      'input[type="checkbox"][data-branch-filter-value]'
    );

    branchCheckboxes.forEach((checkbox) => {
      setCheckboxChecked(checkbox, false);
    });

    if (allCheckbox) {
      setCheckboxChecked(allCheckbox, true);
    }
  }
  if (employmentTypeSelect) employmentTypeSelect.value = "";
  if (radiusSelect) radiusSelect.value = "";
  closeLocationSuggestions();

  runFilters(true);
}

function useGPSFallback() {
  const radius = parseInt(getRadiusSelect()?.value || "", 10);

  if (Number.isNaN(radius) || radius <= 0) {
    runFilters(true);
    return;
  }

  if (!navigator.geolocation) {
    runFilters(true);
    return;
  }

  ensurePLZDataForLocationInteraction().then(() => {
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const nearest = findNearestPLZ(pos.coords.latitude, pos.coords.longitude);

        if (nearest) {
          selectedLocation = toSelectedLocation(nearest);

          const locationInput = getLocationInput();
          if (locationInput) {
            locationInput.value = getSuggestionLabel(nearest);
          }
        }

        runFilters(true);
      },
      () => {
        runFilters(true);
      }
    );
  }).catch(() => {
      runFilters(true);
  });
}

function autoRunFilter() {
  const radius = parseInt(getRadiusSelect()?.value || "", 10);

  if (!selectedLocation && !Number.isNaN(radius) && radius > 0) {
    useGPSFallback();
    return;
  }

  runFilters(true);
}

function handleLocationInputKeydown(event) {
  const input = event.currentTarget;
  if (!currentLocationSuggestions.length && input?.value?.trim()) {
    ensurePLZDataForLocationInteraction().then(() => {
      showLocationSuggestions(input.value.trim());
    });
  }
  if (!currentLocationSuggestions.length) {
    if (event.key === "Enter") {
      ensurePLZDataForLocationInteraction().then(() => {
        const exactMatch = findExactLocationMatch(input?.value?.trim() || "");
        if (exactMatch) {
          event.preventDefault();
          selectLocation(exactMatch);
        }
      });
    }
    return;
  }

  if (event.key === "ArrowDown") {
    event.preventDefault();
    highlightedSuggestionIndex =
      highlightedSuggestionIndex >= currentLocationSuggestions.length - 1
        ? 0
        : highlightedSuggestionIndex + 1;
    updateSuggestionHighlight();
    return;
  }

  if (event.key === "ArrowUp") {
    event.preventDefault();
    highlightedSuggestionIndex =
      highlightedSuggestionIndex <= 0
        ? currentLocationSuggestions.length - 1
        : highlightedSuggestionIndex - 1;
    updateSuggestionHighlight();
    return;
  }

  if (event.key === "Enter") {
    const selectedSuggestion = currentLocationSuggestions[highlightedSuggestionIndex];
    if (!selectedSuggestion) return;
    event.preventDefault();
    selectLocation(selectedSuggestion);
    return;
  }

  if (event.key === "Escape") {
    closeLocationSuggestions();
  }
}

/* =========================
   FINSWEET
========================= */

// Die Filter-Inputs tragen in Webflow zusaetzlich Finsweet-Attribute
// (fs-list-field="title, tag" / "ort, plz" / "distance"). Finsweet liest deren
// Werte beim Start – also genau das, was dieses Script kurz zuvor aus den
// Query-Parametern in #job-search bzw. #location-input geschrieben hat – und
// filtert die Liste im Volltext dagegen. Die Job-Items markieren diese Felder
// aber gar nicht, deshalb passt kein einziges Item und Finsweet entfernt die
// komplette Liste aus dem DOM: Ein Link wie ?location=24534 - Neumünster landet
// im leeren Ergebnis, obwohl hier zwei Treffer gezaehlt werden.
// Gefiltert wird in diesem Script, Finsweet soll die Liste nur laden. Also die
// Feld-Attribute abnehmen, bevor Finsweet sie liest.
const FINSWEET_FILTER_INPUT_IDS = [
  "job-search",
  "location-input",
  "radius-filter-value",
];
const FINSWEET_MIRRORED_FIELD_KEYS = ["title, tag", "ort, plz", "distance"];

let finsweetListInstances = [];
let finsweetRestarted = false;

function detachFinsweetFilterFields() {
  let detached = false;

  FINSWEET_FILTER_INPUT_IDS.forEach((id) => {
    const input = document.getElementById(id);
    if (!input || !input.hasAttribute("fs-list-field")) return;
    input.removeAttribute("fs-list-field");
    input.removeAttribute("fs-list-operator");
    input.removeAttribute("fs-list-fieldtype");
    detached = true;
  });

  return detached;
}

function hasMirroredFinsweetFilter(list) {
  const groups = list?.filters?.value?.groups;
  if (!Array.isArray(groups)) return false;

  return groups.some((group) =>
    (group.conditions || []).some((condition) =>
      FINSWEET_MIRRORED_FIELD_KEYS.includes(condition.fieldKey)
    )
  );
}

// Finsweet laedt als async-Modul und kann diesem Script zuvorkommen. Dann sind
// die Bedingungen schon gebaut und nur ein Neustart raeumt sie weg.
function guardFinsweetFilters() {
  if (finsweetRestarted) return false;
  if (!finsweetListInstances.some(hasMirroredFinsweetFilter)) return false;

  detachFinsweetFilterFields();

  const restart = window.FinsweetAttributes?.modules?.list?.restart;
  if (typeof restart !== "function") return false;

  finsweetRestarted = true;
  debugLog("finsweet list restart", FINSWEET_MIRRORED_FIELD_KEYS);
  restart();

  return true;
}

function bindFinsweetFilters() {
  detachFinsweetFilterFields();

  window.FinsweetAttributes = window.FinsweetAttributes || [];
  window.FinsweetAttributes.push([
    "list",
    (listInstances) => {
      finsweetListInstances = Array.isArray(listInstances)
        ? listInstances
        : [listInstances].filter(Boolean);

      if (guardFinsweetFilters()) return;

      finsweetListInstances.forEach((list) => {
        // Laeuft nach jedem Finsweet-Render erneut: Der MutationObserver haengt
        // dann ggf. am ausgetauschten Container, und nachgeladene Items sind
        // noch ungefiltert sichtbar.
        list.effect?.(() => {
          void list.items?.value?.length;
          observeJobListChanges();
          scheduleFilterRun(false);
        });
      });

      scheduleFilterRun(true);
    },
  ]);
}

function observeJobListChanges() {
  const listRoot = getJobsListContainer();

  if (!listRoot) return;
  // Finsweet tauscht den Listen-Container beim Rendern aus. Haengt der Observer
  // noch am alten Knoten, bleiben nachgeladene Items ungefiltert sichtbar.
  if (jobsListObserver && observedListRoot === listRoot) return;

  if (jobsListObserver) {
    jobsListObserver.disconnect();
  }
  observedListRoot = listRoot;

  jobsListObserver = new MutationObserver(() => {
    if (jobsMapRenderFrame) {
      window.cancelAnimationFrame(jobsMapRenderFrame);
    }

    jobsMapRenderFrame = window.requestAnimationFrame(() => {
      jobsMapRenderFrame = null;
      populateCategorySelect();
      populateBranchCheckboxes();
      scheduleFilterRun(false);
    });
  });

  jobsListObserver.observe(listRoot, {
    childList: true,
    subtree: true,
  });
}

/* =========================
   MAP
========================= */

function ensureLeafletCss() {
  const existing = document.querySelector('link[data-jobs-map-leaflet-css="true"]');
  if (existing) return;

  const link = document.createElement("link");
  link.rel = "stylesheet";
  link.href = LEAFLET_CSS_URL;
  link.setAttribute("data-jobs-map-leaflet-css", "true");
  document.head.appendChild(link);
}

function loadScript(src) {
  return new Promise((resolve, reject) => {
    const existing = document.querySelector(`script[src="${src}"]`);

    if (existing) {
      existing.addEventListener("load", resolve, { once: true });
      existing.addEventListener("error", reject, { once: true });

      if (
        typeof L !== "undefined" ||
        existing.getAttribute("data-loaded") === "true"
      ) {
        resolve();
      }
      return;
    }

    const script = document.createElement("script");
    script.src = src;
    script.async = true;
    script.onload = () => {
      script.setAttribute("data-loaded", "true");
      resolve();
    };
    script.onerror = reject;
    document.head.appendChild(script);
  });
}

function ensureLeaflet() {
  if (typeof L !== "undefined") return Promise.resolve();
  if (leafletLoader) return leafletLoader;

  ensureLeafletCss();
  leafletLoader = loadScript(LEAFLET_JS_URL).catch((error) => {
    console.error("[jobs-map] Leaflet load failed", error);
    throw error;
  });

  return leafletLoader;
}

function getCustomMarkerIconUrl() {
  const mapEl = document.getElementById("jobs-map");

  return (
    mapEl?.dataset.markerIconUrl ||
    window.JOBS_MAP_MARKER_ICON_URL ||
    ""
  ).trim();
}

function getJobsMapMarkerIcon() {
  if (jobsMapMarkerIcon) return jobsMapMarkerIcon;

  const iconUrl = getCustomMarkerIconUrl();
  if (!iconUrl || typeof L === "undefined") return null;

  jobsMapMarkerIcon = L.icon({
    iconUrl,
    iconSize: [44, 56],
    iconAnchor: [22, 56],
    popupAnchor: [0, -48],
    className: "job-map-pin",
  });

  return jobsMapMarkerIcon;
}

function isMobileViewport() {
  return window.matchMedia("(max-width: 767px)").matches;
}

function initJobsMap() {
  const mapEl = document.getElementById("jobs-map");
  if (!mapEl || jobsMapInitialized || typeof L === "undefined") return false;

  if (!mapEl.style.minHeight && !mapEl.offsetHeight) {
    mapEl.style.minHeight = "420px";
  }

  jobsMap = L.map("jobs-map", {
    scrollWheelZoom: false,
    dragging: !isMobileViewport(),
    tap: !isMobileViewport(),
    touchZoom: true,
    doubleClickZoom: !isMobileViewport(),
  }).setView(JOBS_MAP_DEFAULT_CENTER, JOBS_MAP_DEFAULT_ZOOM);

  L.tileLayer(JOBS_MAP_TILE_URL, {
    subdomains: "abcd",
    maxZoom: 20,
    attribution: JOBS_MAP_TILE_ATTRIBUTION,
  }).addTo(jobsMap);

  jobsMapMarkersLayer = L.layerGroup().addTo(jobsMap);
  jobsMapInitialized = true;
  return true;
}

function getJobItemUrl(row) {
  if (row.dataset.url) return row.dataset.url;

  const link =
    row.querySelector("a[href]") ||
    row.querySelector(".job-link[href]");

  return link ? link.href : "#";
}

function escapeHtml(str) {
  return String(str || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function getMarkerDataFromRow(row) {
  const lat = parseFloat(row.dataset.latitude);
  const lon = parseFloat(row.dataset.longitude);

  if (Number.isNaN(lat) || Number.isNaN(lon)) return null;

  return {
    lat,
    lon,
    title: row.dataset.jobtitle || "Job",
    ort: row.dataset.ort || "",
    plz: row.dataset.plz || "",
    url: getJobItemUrl(row),
    row,
  };
}

function getMapSourceItems() {
  if (hasActiveMapFilter) {
    return filteredItems;
  }
  return getAllJobItems();
}

function getVisibleMarkerData(markerData) {
  if (!isMobileViewport()) {
    return markerData;
  }

  if (!jobsMapHasUserInteracted || !jobsMap) {
    return markerData.slice(0, MOBILE_MARKER_INITIAL_LIMIT);
  }

  const bounds = jobsMap.getBounds();
  const inBounds = markerData.filter((item) =>
    bounds.contains([item.lat, item.lon])
  );

  if (inBounds.length) {
    return inBounds.slice(0, MOBILE_MARKER_POST_INTERACTION_LIMIT);
  }

  return markerData.slice(0, MOBILE_MARKER_INITIAL_LIMIT);
}

function renderJobsMap() {
  if (!jobsMapInitialized || !jobsMapMarkersLayer) return;

  const mapEl = document.getElementById("jobs-map");
  const sourceItems = getMapSourceItems();

  jobsMapMarkersLayer.clearLayers();

  const markerData = sourceItems
    .map(getMarkerDataFromRow)
    .filter(Boolean);
  const visibleMarkerData = getVisibleMarkerData(markerData);

  if (mapEl) {
    mapEl.style.display = visibleMarkerData.length ? "block" : "none";
  }

  if (!visibleMarkerData.length) {
    jobsMap.setView(JOBS_MAP_DEFAULT_CENTER, JOBS_MAP_DEFAULT_ZOOM);
    return;
  }

  const bounds = [];
  const markerIcon = getJobsMapMarkerIcon();

  visibleMarkerData.forEach((item) => {
    const marker = markerIcon
      ? L.marker([item.lat, item.lon], { icon: markerIcon })
      : L.marker([item.lat, item.lon]);

    const popupHtml = `
      <div class="job-map-popup">
        <div class="job-map-popup__tag">Jobangebot</div>
        <div class="job-map-popup__title">${escapeHtml(item.title)}</div>
        <div class="job-map-popup__meta">
          ${escapeHtml(item.plz)} ${escapeHtml(item.ort)}
        </div>
        <a class="job-map-popup__button" href="${escapeHtml(item.url)}">Zum Job</a>
      </div>
    `;

    marker.bindPopup(popupHtml, {
      className: "jobs-leaflet-popup",
    });

    marker.on("click", () => {
      if (item.row && item.row.style.display !== "none") {
        item.row.scrollIntoView({
          behavior: isMobileViewport() ? "auto" : "smooth",
          block: "center",
        });
      }
    });

    marker.addTo(jobsMapMarkersLayer);
    bounds.push([item.lat, item.lon]);
  });

  if (!jobsMapHasUserInteracted) {
    jobsMapSuppressInteractionEvents = true;

    if (bounds.length === 1) {
      jobsMap.setView(bounds[0], 10);
    } else {
      jobsMap.fitBounds(bounds, {
        padding: [40, 40],
        maxZoom: 11,
      });
    }

    window.setTimeout(() => {
      jobsMapSuppressInteractionEvents = false;
    }, 0);
  }

  window.setTimeout(() => {
    jobsMap.invalidateSize();
  }, 50);
}

function bindJobsMapInteractionHandlers() {
  if (!jobsMap) return;

  const mapContainer = jobsMap.getContainer();

  const markUserInteraction = () => {
    jobsMapHasUserInteracted = true;
  };

  const handleInteraction = () => {
    if (jobsMapInteractionFrame) {
      window.cancelAnimationFrame(jobsMapInteractionFrame);
    }

    jobsMapInteractionFrame = window.requestAnimationFrame(() => {
      jobsMapInteractionFrame = null;
      renderJobsMap();
    });
  };

  ["touchstart", "pointerdown", "mousedown", "wheel"].forEach((eventName) => {
    mapContainer.addEventListener(eventName, markUserInteraction, {
      passive: true,
    });
  });

  jobsMap.on("zoomend", handleInteraction);
  jobsMap.on("moveend", handleInteraction);
}

function bootJobsMap() {
  ensureLeaflet()
    .then(() => {
      const wasInitialized = jobsMapInitialized;
      initJobsMap();
      if (!wasInitialized && jobsMapInitialized) {
        bindJobsMapInteractionHandlers();
      }
      renderJobsMap();
    })
    .catch(() => {
      if (jobsMapBootRetries >= 10) return;

      jobsMapBootRetries += 1;
      window.setTimeout(bootJobsMap, 1000);
    });
}

document.addEventListener("DOMContentLoaded", () => {
  bindFinsweetFilters();
  observeJobListChanges();
  bootJobsMap();

  const jobSearch = getJobSearchInput();
  const locationInput = getLocationInput();
  const categorySelect = getCategorySelect();
  const branchFilterContainer = getBranchFilterContainer();
  const employmentTypeSelect = getEmploymentTypeSelect();
  const radiusSelect = getRadiusSelect();
  const resetBtn = document.getElementById("btn-reset");
  const loadMoreBtn = document.getElementById("load-more-btn");

  populateCategorySelect();
  populateBranchCheckboxes();

  if (jobSearch) {
    jobSearch.addEventListener("input", () => {
      scheduleFilterRun(true);
    });
  }

  if (locationInput) {
    locationInput.addEventListener("input", () => {
      selectedLocation = null;
      ensurePLZDataForLocationInteraction().then(() => {
        showLocationSuggestions(locationInput.value.trim());
      });
      scheduleFilterRun(true);
    });

    locationInput.addEventListener("focus", () => {
      ensurePLZDataForLocationInteraction().then(() => {
        showLocationSuggestions(locationInput.value.trim());
      });
    });

    locationInput.addEventListener("keydown", handleLocationInputKeydown);

    locationInput.addEventListener("blur", () => {
      window.setTimeout(() => {
        ensurePLZDataForLocationInteraction().then(() => {
          const match = findExactLocationMatch(locationInput.value.trim());

          if (match) {
            selectedLocation = toSelectedLocation(match);
            locationInput.value = getSuggestionLabel(match);
          } else if (!locationInput.value.trim()) {
            selectedLocation = null;
          }

          closeLocationSuggestions();
          scheduleFilterRun(true);
        });
      }, 120);
    });
  }

  if (categorySelect) {
    categorySelect.addEventListener("change", () => {
      scheduleFilterRun(true);
    });
  }

  if (branchFilterContainer) {
    branchFilterContainer.addEventListener("change", (event) => {
      const target = event.target;
      if (!(target instanceof HTMLInputElement) || target.type !== "checkbox") return;
      syncBranchFilterState(target);
      scheduleFilterRun(true);
    });
  }

  if (employmentTypeSelect) {
    employmentTypeSelect.addEventListener("change", () => {
      scheduleFilterRun(true);
    });
  }

  if (radiusSelect) {
    radiusSelect.addEventListener("change", () => {
      autoRunFilter();
    });
  }

  if (resetBtn) {
    resetBtn.addEventListener("click", resetFilter);
  }

  if (loadMoreBtn) {
    loadMoreBtn.addEventListener("click", loadMoreResults);
  }

  document.addEventListener("click", (e) => {
    if (
      !e.target.closest("#location-wrapper") &&
      !e.target.closest("#location-suggestions") &&
      e.target.id !== "location-input"
    ) {
      closeLocationSuggestions();
    }
  });

  if (shouldPreloadPlzData()) {
    loadPLZData().then(() => {
      applyInitialQueryParams();
      runFilters(true);
    });
  } else {
    applyInitialQueryParams();
    runFilters(true);
  }
  window.setTimeout(bootJobsMap, 150);
  window.setTimeout(bootJobsMap, 500);
  window.setTimeout(() => {
    populateCategorySelect();
    populateBranchCheckboxes();
    scheduleFilterRun(true);
  }, 150);
  window.setTimeout(() => {
    populateCategorySelect();
    scheduleFilterRun(true);
  }, 500);
  window.addEventListener("resize", () => {
    if (!jobsMapInitialized || !jobsMap) return;

    window.requestAnimationFrame(() => {
      jobsMap.invalidateSize();
    });
  });
});

// So frueh wie moeglich (das Script laeuft mit defer, das DOM steht also
// bereits): Finsweet die Feld-Attribute unserer Filter-Inputs abnehmen, bevor
// sein async geladenes Modul sie liest. Siehe FINSWEET-Block.
detachFinsweetFilterFields();
