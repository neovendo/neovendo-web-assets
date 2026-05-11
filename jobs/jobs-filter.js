const csvUrl = "https://raw.githubusercontent.com/neovendo/neovendo/refs/heads/main/PLZ_STREETCODE_GEO.csv";
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

let plzList = [];
let selectedLocation = null;
let filteredItems = [];
let visibleCount = VISIBLE_STEP;
let jobsListObserver = null;
let currentLocationSuggestions = [];
let highlightedSuggestionIndex = -1;
let filterDebounceTimeout = null;

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

  return {
    job: (params.get("job") || "").trim(),
    location: (params.get("location") || "").trim(),
    radius: (params.get("radius") || "").trim(),
    employmentType: (params.get("employmentType") || "").trim(),
  };
}

async function loadPLZData() {
  try {
    const res = await fetch(csvUrl);
    const text = await res.text();

    plzList = text
      .split("\n")
      .map((line) => line.replace(/"/g, "").trim())
      .filter(Boolean)
      .map((line) => {
        const parts = line.split(";");
        if (parts.length < 6) return null;

        const plz = parts[0].trim().padStart(5, "0");
        const city = parts[1].trim();
        const suburb = (parts[2] || "").trim();
        const displayName = (parts[3] || "").trim() || [city, suburb].filter(Boolean).join("-");
        const lon = parseFloat(parts[4]);
        const lat = parseFloat(parts[5]);
        const state = (parts[6] || "").trim();

        if (Number.isNaN(lat) || Number.isNaN(lon)) return null;

        return {
          plz,
          ort: displayName || city,
          city,
          suburb,
          displayName: displayName || city,
          state,
          lat,
          lon,
        };
      })
      .filter(Boolean);
  } catch (error) {
    console.error("[jobs-filter] CSV load failed", error);
    plzList = [];
  }
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
    .trim()
    .replace(/\s+/g, " ");
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
  return document.getElementById("tag-select");
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

function matchesJobFilter(row, searchTerm) {
  if (!searchTerm) return true;

  const jobTitle = normalizeText(row.dataset.jobtitle || "");
  const category1 = normalizeText(row.dataset.category1 || "");
  const category2 = normalizeText(row.dataset.category2 || "");
  const plz = normalizeText(row.dataset.plz || "");
  const ort = normalizeText(row.dataset.ort || "");

  const searchableText = `${jobTitle} ${category1} ${category2} ${plz} ${ort}`;
  return searchableText.includes(searchTerm);
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

function matchesSelectedLocation(row, location) {
  if (!location) return true;

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

function itemMatches(row, jobTerm, selectedCategory, radius, employmentType) {
  const jobMatch = matchesJobFilter(row, jobTerm);
  const categoryMatch = matchesCategoryFilter(row, selectedCategory);
  const employmentTypeMatch = matchesEmploymentTypeFilter(row, employmentType);

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

  return jobMatch && categoryMatch && employmentTypeMatch && locationMatch && radiusMatch;
}

function hasAnyActiveFilter() {
  const jobTerm = normalizeText(document.getElementById("job-search")?.value || "");
  const locationValue = normalizeText(document.getElementById("location-input")?.value || "");
  const selectedCategory = normalizeText(getCategorySelect()?.value || "");
  const employmentType = normalizeText(
    document.getElementById("employment-type-select")?.value || ""
  );
  const radius = parseInt(
    document.getElementById("radius-select")?.value || "",
    10
  );

  return Boolean(
    jobTerm ||
    locationValue ||
    selectedCategory ||
    employmentType ||
    (!Number.isNaN(radius) && radius > 0) ||
    selectedLocation
  );
}

function filterItems() {
  const items = getAllJobItems();
  const jobTerm = normalizeText(document.getElementById("job-search")?.value || "");
  const selectedCategory = normalizeText(getCategorySelect()?.value || "");
  const employmentType = normalizeText(
    document.getElementById("employment-type-select")?.value || ""
  );
  const radius = parseInt(
    document.getElementById("radius-select")?.value || "",
    10
  );

  filteredItems = items.filter((row) =>
    itemMatches(row, jobTerm, selectedCategory, radius, employmentType)
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
  const items = getAllJobItems();
  if (!items.length) return;

  if (resetVisible) {
    visibleCount = VISIBLE_STEP;
  }

  filterItems();
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
  const query = normalizeText(value);
  if (!query) return null;

  const digitsOnly = query.replace(/\D/g, "");

  if (digitsOnly.length >= 5) {
    const postcode = digitsOnly.slice(0, 5);
    const postcodeMatches = plzList.filter((item) => item.plz === postcode);
    const exactByPlzAndText = postcodeMatches.find((item) => {
      return [
        item.ort,
        item.city,
        item.suburb,
        item.displayName,
        `${item.plz} ${item.ort}`,
        `${item.plz} - ${item.ort}`,
        `${item.plz} – ${item.ort}`,
      ].some((candidate) => normalizeText(candidate) === query);
    });
    if (exactByPlzAndText) return exactByPlzAndText;

    const exactByPlz = postcodeMatches.length === 1 ? postcodeMatches[0] : null;
    if (exactByPlz) return exactByPlz;
  }

  return (
    plzList.find((item) => {
      return (
        [
          item.ort,
          item.city,
          item.suburb,
          item.displayName,
          `${item.plz} ${item.ort}`,
          `${item.plz} - ${item.ort}`,
          `${item.plz} – ${item.ort}`,
        ].some((candidate) => normalizeText(candidate) === query)
      );
    }) || null
  );
}

function getSuggestionLabel(item) {
  return `${item.plz} - ${item.ort}`;
}

function dedupeLocationSuggestions(items) {
  const seen = new Set();
  return items.filter((item) => {
    const key = normalizeText(`${item.plz}|${item.ort}|${item.city}|${item.suburb}`);
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
    if (index === highlightedSuggestionIndex) {
      div.classList.add("is-active");
      div.setAttribute("aria-selected", "true");
    }
    div.addEventListener("mouseenter", () => {
      highlightedSuggestionIndex = index;
      updateSuggestionHighlight();
    });
    div.addEventListener("mousedown", (event) => {
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

  const matches = dedupeLocationSuggestions(plzList
    .filter((item) => {
      const searchableValues = [
        item.ort,
        item.city,
        item.suburb,
        item.displayName,
        `${item.plz} ${item.ort}`,
        `${item.plz} - ${item.ort}`,
        `${item.plz} – ${item.ort}`,
      ].map(normalizeText);

      return (
        (digitsOnly.length >= 1 && item.plz.startsWith(digitsOnly)) ||
        searchableValues.some((value) => value.includes(query))
      );
    })
    .slice(0, 12));

  if (!matches.length) return;
  renderLocationSuggestions(matches);
}

function selectLocation(item) {
  selectedLocation = item;

  const locationInput = document.getElementById("location-input");

  if (locationInput) {
    locationInput.value = getSuggestionLabel(item);
  }

  closeLocationSuggestions();
  runFilters(true);
}

function applyInitialQueryParams() {
  const { job, location, radius, employmentType } = getQueryParams();

  const jobSearch = document.getElementById("job-search");
  const locationInput = document.getElementById("location-input");
  const radiusSelect = document.getElementById("radius-select");
  const employmentTypeSelect = document.getElementById("employment-type-select");

  if (job && jobSearch) {
    jobSearch.value = job;
  }

  if (radius && radiusSelect) {
    radiusSelect.value = radius;
  }

  if (employmentType && employmentTypeSelect) {
    employmentTypeSelect.value = employmentType;
  }

  if (location && locationInput) {
    const match = findExactLocationMatch(location);

    if (match) {
      selectedLocation = match;
      locationInput.value = getSuggestionLabel(match);
    } else {
      locationInput.value = location;
    }
  }
}

function resetFilter() {
  const jobSearch = document.getElementById("job-search");
  const locationInput = document.getElementById("location-input");
  const categorySelect = getCategorySelect();
  const employmentTypeSelect = document.getElementById("employment-type-select");
  const radiusSelect = document.getElementById("radius-select");

  selectedLocation = null;

  if (jobSearch) jobSearch.value = "";
  if (locationInput) locationInput.value = "";
  if (categorySelect) categorySelect.value = categorySelect.options[0]?.value || "";
  if (employmentTypeSelect) employmentTypeSelect.value = "";
  if (radiusSelect) radiusSelect.value = "";
  closeLocationSuggestions();

  runFilters(true);
}

function useGPSFallback() {
  const radius = parseInt(
    document.getElementById("radius-select")?.value || "",
    10
  );

  if (Number.isNaN(radius) || radius <= 0) {
    runFilters(true);
    return;
  }

  if (!navigator.geolocation) {
    runFilters(true);
    return;
  }

  navigator.geolocation.getCurrentPosition(
    (pos) => {
      const nearest = findNearestPLZ(pos.coords.latitude, pos.coords.longitude);

      if (nearest) {
        selectedLocation = nearest;

        const locationInput = document.getElementById("location-input");
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
}

function autoRunFilter() {
  const radius = parseInt(
    document.getElementById("radius-select")?.value || "",
    10
  );

  if (!selectedLocation && !Number.isNaN(radius) && radius > 0) {
    useGPSFallback();
    return;
  }

  runFilters(true);
}

function handleLocationInputKeydown(event) {
  const input = event.currentTarget;
  if (!currentLocationSuggestions.length && input?.value?.trim()) {
    showLocationSuggestions(input.value.trim());
  }
  if (!currentLocationSuggestions.length) {
    if (event.key === "Enter") {
      const exactMatch = findExactLocationMatch(input?.value?.trim() || "");
      if (exactMatch) {
        event.preventDefault();
        selectLocation(exactMatch);
      }
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

function observeJobListChanges() {
  const listRoot =
    document.querySelector('[fs-list-element="list"]') ||
    document.querySelector(".w-dyn-items") ||
    document.querySelector(".jobs-list");

  if (!listRoot) return;
  if (jobsListObserver) return;

  jobsListObserver = new MutationObserver(() => {
    if (jobsMapRenderFrame) {
      window.cancelAnimationFrame(jobsMapRenderFrame);
    }

    jobsMapRenderFrame = window.requestAnimationFrame(() => {
      jobsMapRenderFrame = null;
      populateCategorySelect();
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
  observeJobListChanges();
  bootJobsMap();

  const jobSearch = document.getElementById("job-search");
  const locationInput = document.getElementById("location-input");
  const categorySelect = getCategorySelect();
  const employmentTypeSelect = document.getElementById("employment-type-select");
  const radiusSelect = document.getElementById("radius-select");
  const resetBtn = document.getElementById("btn-reset");
  const loadMoreBtn = document.getElementById("load-more-btn");

  populateCategorySelect();

  if (jobSearch) {
    jobSearch.addEventListener("input", () => {
      scheduleFilterRun(true);
    });
  }

  if (locationInput) {
    locationInput.addEventListener("input", () => {
      selectedLocation = null;
      showLocationSuggestions(locationInput.value.trim());
      scheduleFilterRun(true);
    });

    locationInput.addEventListener("focus", () => {
      showLocationSuggestions(locationInput.value.trim());
    });

    locationInput.addEventListener("keydown", handleLocationInputKeydown);

    locationInput.addEventListener("blur", () => {
      window.setTimeout(() => {
        const match = findExactLocationMatch(locationInput.value.trim());

        if (match) {
          selectedLocation = match;
          locationInput.value = getSuggestionLabel(match);
        } else if (!locationInput.value.trim()) {
          selectedLocation = null;
        }

        closeLocationSuggestions();
        scheduleFilterRun(true);
      }, 120);
    });
  }

  if (categorySelect) {
    categorySelect.addEventListener("change", () => {
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

  runFilters(true);
  loadPLZData().then(() => {
    applyInitialQueryParams();
    runFilters(true);
  });
  window.setTimeout(bootJobsMap, 150);
  window.setTimeout(bootJobsMap, 500);
  window.setTimeout(() => {
    populateCategorySelect();
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
