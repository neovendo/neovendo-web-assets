// Deutsche Standardtexte. Platzhalter in geschweiften Klammern werden beim Start ersetzt.
// Banner- und Dialogtexte dürfen HTML enthalten, Platzhaltertexte nicht.

export interface Texts {
  banner: {
    title: string;
    /** `{categories}` wird zur Liste der Kategorien mit ihren Diensten. */
    description: string;
    acceptAll: string;
    rejectAll: string;
    settings: string;
    /** `{privacyPolicyUrl}`, `{imprintUrl}` */
    footer: string;
  };
  preferences: {
    title: string;
    intro: string;
    acceptAll: string;
    rejectAll: string;
    save: string;
    close: string;
    /** Einzahl und Mehrzahl, getrennt durch `|`. */
    serviceCounter: string;
    moreTitle: string;
    /** `{privacyPolicyUrl}` */
    moreDescription: string;
  };
  table: {
    service: string;
    provider: string;
    purpose: string;
    hosts: string;
    cookies: string;
    none: string;
    privacyLink: string;
  };
  /** Zeile für das eigene Cookie unter „Notwendig". `{cookieName}`, `{days}` */
  consentCookie: {
    service: string;
    provider: string;
    purpose: string;
    cookie: string;
  };
  placeholder: {
    /** `{service}`, `{provider}`, `{purpose}`, `{hosts}` */
    title: string;
    description: string;
    button: string;
    /** `{service}`, `{settings}` wird zum Knopf für den Einstellungsdialog. */
    note: string;
    settings: string;
  };
}

export type TextOverrides = { [K in keyof Texts]?: Partial<Texts[K]> };

export const DEFAULT_TEXTS: Texts = {
  banner: {
    title: 'Ihre Einwilligung',
    description:
      'Wir möchten auf dieser Website Dienste anderer Anbieter nutzen: {categories}. ' +
      'Dabei erhalten die Anbieter Daten wie Ihre IP-Adresse. Wir laden diese Dienste nur mit Ihrer Einwilligung. ' +
      'Sie ist freiwillig und jederzeit über „Datenschutz-Einstellungen“ am Seitenende widerrufbar.',
    acceptAll: 'Alle akzeptieren',
    rejectAll: 'Alle ablehnen',
    settings: 'Einstellungen',
    footer: '<a href="{privacyPolicyUrl}">Datenschutzerklärung</a>\n<a href="{imprintUrl}">Impressum</a>',
  },
  preferences: {
    title: 'Datenschutz-Einstellungen',
    intro:
      'Hier legen Sie fest, welche Dienste wir nutzen dürfen. ' +
      'Sie können Ihre Auswahl jederzeit ändern, ein Widerruf wirkt für die Zukunft.',
    acceptAll: 'Alle akzeptieren',
    rejectAll: 'Alle ablehnen',
    save: 'Auswahl speichern',
    close: 'Schließen',
    serviceCounter: 'Dienst|Dienste',
    moreTitle: 'Weitere Informationen',
    moreDescription: 'Einzelheiten finden Sie in unserer <a href="{privacyPolicyUrl}">Datenschutzerklärung</a>.',
  },
  table: {
    service: 'Dienst',
    provider: 'Anbieter',
    purpose: 'Zweck',
    hosts: 'Server',
    cookies: 'Cookies',
    none: 'keine',
    privacyLink: 'Datenschutzhinweise',
  },
  consentCookie: {
    service: 'Einwilligung',
    provider: 'Betreiber dieser Website',
    purpose: 'Speichert Ihre Auswahl aus diesem Dialog',
    cookie: '{cookieName} ({days} Tage)',
  },
  placeholder: {
    title: 'Externer Inhalt: {service}',
    description: '{purpose}. Anbieter: {provider}. Beim Laden erhält der Anbieter Ihre IP-Adresse.',
    button: 'Inhalt laden',
    note: 'Damit willigen Sie nur in {service} ein. Ändern können Sie das in den {settings}.',
    settings: 'Datenschutz-Einstellungen',
  },
};

export const DEFAULT_CATEGORY_TEXTS: Record<string, { title: string; description: string }> = {
  necessary: {
    title: 'Notwendig',
    description:
      'Speichert Ihre Auswahl aus diesem Dialog. Dafür ist keine Einwilligung nötig, ' +
      'deshalb lässt sich diese Kategorie nicht abwählen.',
  },
  external_media: {
    title: 'Externe Medien',
    description:
      'Inhalte anderer Anbieter, etwa Karten oder Bewertungen. ' +
      'Beim Laden erhält der Anbieter Ihre IP-Adresse und technische Angaben zu Ihrem Browser.',
  },
  analytics: {
    title: 'Statistik',
    description:
      'Dienste, die erfassen, wie die Website genutzt wird. Die Auswertung hilft uns, Inhalte und Technik zu verbessern.',
  },
  marketing: {
    title: 'Marketing',
    description:
      'Dienste, die den Erfolg von Werbung messen oder Werbung an Ihre Interessen anpassen, auch auf anderen Websites.',
  },
};

export function mergeTexts(overrides: TextOverrides = {}): Texts {
  const merged = {} as Record<keyof Texts, unknown>;
  for (const key of Object.keys(DEFAULT_TEXTS) as (keyof Texts)[]) {
    merged[key] = { ...DEFAULT_TEXTS[key], ...overrides[key] };
  }
  return merged as Texts;
}

/** Ersetzt `{name}` durch den Wert aus `vars`. Unbekannte Platzhalter bleiben stehen. */
export function fill(template: string, vars: Record<string, string | number>): string {
  return template.replace(/\{(\w+)\}/g, (match, name: string) =>
    Object.prototype.hasOwnProperty.call(vars, name) ? String(vars[name]) : match,
  );
}

export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/** „A“, „A und B“, „A, B und C“ */
export function joinList(items: string[]): string {
  if (items.length <= 1) return items.join('');
  return `${items.slice(0, -1).join(', ')} und ${items[items.length - 1]}`;
}
