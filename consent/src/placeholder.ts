import type { NormalizedConfig, NormalizedService } from './config';
import { fill } from './texts';

// Markup auf der Site:
//   <iframe data-service="youtube" data-src="https://…"></iframe>          Platzhalter davor, iframe ohne src
//   <div data-consent-placeholder data-service="openfreemap"></div>        Platzhalter darin, ein Skript füllt den Rest
//   data-consent-placeholder="compact" für kleine Flächen wie ein Badge
const PLACEHOLDER_ATTR = 'data-consent-placeholder';
const HOST_SELECTOR = `[${PLACEHOLDER_ATTR}], iframe[data-service][data-src]`;
const RELEASE_SELECTOR = '[data-service][data-src]:not(script)';
const REPLACED_ELEMENTS = new Set(['IFRAME', 'IMG', 'VIDEO', 'AUDIO', 'EMBED', 'OBJECT']);

export interface PlaceholderDeps {
  config: NormalizedConfig;
  isAccepted(serviceId: string): boolean;
  accept(serviceId: string): void;
  showPreferences(): void;
}

const placeholders = new WeakMap<Element, HTMLElement>();
const warned = new Set<string>();

function warnOnce(message: string): void {
  if (warned.has(message)) return;
  warned.add(message);
  console.warn(`neovendo-consent: ${message}`);
}

function queryAll(root: ParentNode, selector: string): Element[] {
  const found = Array.from(root.querySelectorAll(selector));
  if (root instanceof Element && root.matches(selector)) found.unshift(root);
  return found;
}

function textElement(tag: string, className: string, text: string): HTMLElement {
  const element = document.createElement(tag);
  element.className = className;
  element.textContent = text;
  return element;
}

function button(className: string, text: string, onClick: () => void): HTMLButtonElement {
  const element = textElement('button', className, text) as HTMLButtonElement;
  element.type = 'button';
  element.addEventListener('click', (event) => {
    // Platzhalter können in einem Link stecken, etwa beim Bewertungs-Badge.
    event.preventDefault();
    event.stopPropagation();
    onClick();
  });
  return element;
}

const withoutPeriod = (text: string) => text.trim().replace(/\.$/, '');

function createPlaceholder(host: Element, service: NormalizedService, deps: PlaceholderDeps): HTMLElement {
  const texts = deps.config.texts.placeholder;
  const vars = {
    service: service.name,
    provider: service.provider,
    purpose: withoutPeriod(service.purpose),
    hosts: service.hosts.join(', '),
  };
  const compact = host.getAttribute(PLACEHOLDER_ATTR) === 'compact';
  const box = document.createElement('div');
  box.className = `nvc-placeholder${compact ? ' nvc-placeholder--compact' : ''}`;
  box.setAttribute('data-nvc-service', service.id);
  box.setAttribute('role', 'group');
  box.setAttribute('aria-label', fill(texts.title, vars));

  const description = fill(texts.description, vars);
  box.append(textElement('p', 'nvc-placeholder__title', fill(texts.title, vars)));
  if (compact) {
    box.title = description;
  } else {
    box.append(textElement('p', 'nvc-placeholder__text', description));
  }
  box.append(button('nvc-placeholder__button', texts.button, () => deps.accept(service.id)));

  if (!compact) {
    const note = textElement('p', 'nvc-placeholder__note', '');
    const [before, after = ''] = fill(texts.note, { service: service.name }).split('{settings}');
    note.append(before, button('nvc-placeholder__link', texts.settings, deps.showPreferences), after);
    box.append(note);
  }
  return box;
}

function block(host: Element, service: NormalizedService, deps: PlaceholderDeps): void {
  if (placeholders.has(host)) return;
  const box = createPlaceholder(host, service, deps);
  if (REPLACED_ELEMENTS.has(host.tagName)) {
    const width = Number(host.getAttribute('width'));
    const height = Number(host.getAttribute('height'));
    if (width > 0 && height > 0) {
      box.style.aspectRatio = `${width} / ${height}`;
      box.style.maxWidth = `${width}px`;
    } else if (height > 0) {
      box.style.minHeight = `${height}px`;
    }
    host.before(box);
    (host as HTMLElement).hidden = true;
  } else {
    host.append(box);
    host.classList.add('nvc-blocked');
  }
  placeholders.set(host, box);
}

function release(host: Element): void {
  const box = placeholders.get(host);
  if (!box) return;
  box.remove();
  placeholders.delete(host);
  if (REPLACED_ELEMENTS.has(host.tagName)) (host as HTMLElement).hidden = false;
  host.classList.remove('nvc-blocked');
}

/** Gibt freigegebene Dienste frei und zeigt für alle anderen einen Platzhalter. Mehrfach aufrufbar. */
export function scanPlaceholders(root: ParentNode, deps: PlaceholderDeps): void {
  // Erst Platzhalter, dann src: der Selektor für iframes braucht data-src noch.
  for (const host of queryAll(root, HOST_SELECTOR)) {
    const serviceId = host.getAttribute('data-service') ?? '';
    const service = deps.config.services.get(serviceId);
    if (!service) {
      warnOnce(`Dienst "${serviceId}" an <${host.tagName.toLowerCase()}> fehlt in der Konfiguration und bleibt gesperrt`);
      continue;
    }
    if (deps.isAccepted(serviceId)) {
      release(host);
    } else {
      block(host, service, deps);
    }
  }

  for (const element of queryAll(root, RELEASE_SELECTOR)) {
    const serviceId = element.getAttribute('data-service') ?? '';
    if (!deps.config.services.has(serviceId)) continue;
    if (deps.isAccepted(serviceId)) {
      element.setAttribute('src', element.getAttribute('data-src') ?? '');
      element.removeAttribute('data-src');
    }
  }
}

/** Warnt vor Skripten, die nie laufen würden oder an der Konfiguration vorbei freigegeben würden. */
export function lintScripts(root: ParentNode, config: NormalizedConfig): void {
  const categories = new Set(config.categories.map((category) => category.id));
  for (const script of queryAll(root, 'script[data-category]')) {
    const category = (script.getAttribute('data-category') ?? '').replace(/^!/, '');
    const serviceId = (script.getAttribute('data-service') ?? '').replace(/^!/, '');
    const service = config.services.get(serviceId);
    if (!categories.has(category)) {
      warnOnce(`Skript mit data-category="${category}" läuft nie, weil die Kategorie keinen Dienst hat`);
    } else if (serviceId && !service) {
      warnOnce(`Skript mit data-service="${serviceId}": Dienst fehlt in der Konfiguration`);
    } else if (service && service.category !== category) {
      warnOnce(`Skript mit data-service="${serviceId}" steht in "${category}", der Dienst aber in "${service.category}"`);
    } else if (!serviceId && category !== 'necessary') {
      warnOnce(`Skript mit data-category="${category}" ohne data-service läuft schon, wenn nur ein Dienst der Kategorie freigegeben ist`);
    }
  }
}
