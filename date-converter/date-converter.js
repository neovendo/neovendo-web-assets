document.addEventListener("DOMContentLoaded", () => {
  const config = {
    months: {
      long: {
        january: "Januar",
        february: "Februar",
        march: "März",
        april: "April",
        may: "Mai",
        june: "Juni",
        july: "Juli",
        august: "August",
        september: "September",
        october: "Oktober",
        november: "November",
        december: "Dezember",
      },
      short: {
        jan: "Jan",
        feb: "Feb",
        mar: "Mär",
        apr: "Apr",
        may: "Mai",
        jun: "Jun",
        jul: "Jul",
        aug: "Aug",
        sep: "Sep",
        oct: "Okt",
        nov: "Nov",
        dec: "Dez",
      }
    },
    weekdays: {
      long: {
        monday: "Montag",
        tuesday: "Dienstag",
        wednesday: "Mittwoch",
        thursday: "Donnerstag",
        friday: "Freitag",
        saturday: "Samstag",
        sunday: "Sonntag",
      },
      short: {
        mon: "Mo",
        tue: "Di",
        wed: "Mi",
        thu: "Do",
        fri: "Fr",
        sat: "Sa",
        sun: "So",
      }
    }
  };

  const SKIP_TAGS = new Set([
    "SCRIPT",
    "STYLE",
    "NOSCRIPT",
    "TEXTAREA",
    "INPUT",
    "OPTION",
    "CODE",
    "PRE"
  ]);

  const processedTextNodes = new WeakSet();

  function translateMonth(value) {
    if (!value) return value;
    const key = value.toLowerCase();
    return config.months.long[key] || config.months.short[key] || value;
  }

  function translateWeekday(value) {
    if (!value) return value;
    const cleaned = value.replace(/\.$/, "");
    const key = cleaned.toLowerCase();
    const translated =
      config.weekdays.long[key] ||
      config.weekdays.short[key] ||
      value;
    return translated;
  }

  function convertTo24HourFormat(hours, minutes, ampm) {
    let hour = parseInt(hours, 10);
    const min = String(minutes || "00").padStart(2, "0");
    const marker = ampm.toLowerCase();

    if (marker === "pm" && hour < 12) hour += 12;
    if (marker === "am" && hour === 12) hour = 0;

    return `${String(hour).padStart(2, "0")}:${min} Uhr`;
  }

  function transformText(text) {
    let result = text;

    // 1) Vollständiges Datum mit Wochentag:
    // Monday, April 5, 2026
    // Mon, Apr 5, 2026
    result = result.replace(
      /\b(Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday|Mon|Tue|Wed|Thu|Fri|Sat|Sun)\.?,\s+(January|February|March|April|May|June|July|August|September|October|November|December|Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\s+(\d{1,2}),\s+(\d{4})\b/gi,
      (_, weekday, month, day, year) => {
        return `${translateWeekday(weekday)}, ${day}. ${translateMonth(month)} ${year}`;
      }
    );

    // 2) Datum ohne Wochentag:
    // April 5, 2026
    // Apr 5, 2026
    result = result.replace(
      /\b(January|February|March|April|May|June|July|August|September|October|November|December|Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\s+(\d{1,2}),\s+(\d{4})\b/gi,
      (_, month, day, year) => {
        return `${day}. ${translateMonth(month)} ${year}`;
      }
    );

    // 3) Datumsformat ohne Jahr:
    // April 5
    // Apr 5
    result = result.replace(
      /\b(January|February|March|April|May|June|July|August|September|October|November|December|Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\s+(\d{1,2})\b/gi,
      (_, month, day) => {
        return `${day}. ${translateMonth(month)}`;
      }
    );

    // 4) Uhrzeit mit Minuten:
    // 10:30 AM / 2:45 pm
    result = result.replace(
      /\b(\d{1,2}):(\d{2})\s?(AM|PM)\b/gi,
      (_, hours, minutes, ampm) => convertTo24HourFormat(hours, minutes, ampm)
    );

    // 5) Uhrzeit ohne Minuten:
    // 10 AM / 2 pm
    result = result.replace(
      /\b(\d{1,2})\s?(AM|PM)\b/gi,
      (_, hours, ampm) => convertTo24HourFormat(hours, "00", ampm)
    );

    // 6) Nur Wochentage isoliert übersetzen
    // Das ist meist unkritisch und nützlich
    result = result.replace(
      /\b(Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday)\b/gi,
      (match) => translateWeekday(match)
    );

    result = result.replace(
      /\b(Mon|Tue|Wed|Thu|Fri|Sat|Sun)\b\.?/gi,
      (match) => translateWeekday(match)
    );

    // WICHTIG:
    // Isolierte Monate NICHT global ersetzen.
    // Sonst würde z.B. "May I help you?" kaputtgehen.

    return result;
  }

  function shouldSkipElement(el) {
    if (!el || el.nodeType !== 1) return false;
    if (SKIP_TAGS.has(el.tagName)) return true;
    if (el.closest(".no-translate")) return true;
    if (el.isContentEditable) return true;
    return false;
  }

  function processTextNode(node) {
    if (!node || node.nodeType !== Node.TEXT_NODE) return;
    if (processedTextNodes.has(node)) return;

    const parent = node.parentElement;
    if (!parent || shouldSkipElement(parent)) return;

    const original = node.nodeValue;
    if (!original || !original.trim()) {
      processedTextNodes.add(node);
      return;
    }

    const updated = transformText(original);

    if (updated !== original) {
      node.nodeValue = updated;
    }

    processedTextNodes.add(node);
  }

  function walk(node) {
    if (!node) return;

    if (node.nodeType === Node.TEXT_NODE) {
      processTextNode(node);
      return;
    }

    if (node.nodeType !== Node.ELEMENT_NODE) return;
    if (shouldSkipElement(node)) return;

    for (const child of node.childNodes) {
      walk(child);
    }
  }

  walk(document.body);

  const observer = new MutationObserver((mutations) => {
    for (const mutation of mutations) {
      if (mutation.type === "characterData") {
        processedTextNodes.delete(mutation.target);
        processTextNode(mutation.target);
      }

      if (mutation.type === "childList") {
        for (const node of mutation.addedNodes) {
          walk(node);
        }
      }
    }
  });

  observer.observe(document.body, {
    childList: true,
    subtree: true,
    characterData: true
  });
});
