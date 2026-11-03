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
export type TextOverrides = {
    [K in keyof Texts]?: Partial<Texts[K]>;
};
export declare const DEFAULT_TEXTS: Texts;
export declare const DEFAULT_CATEGORY_TEXTS: Record<string, {
    title: string;
    description: string;
}>;
export declare function mergeTexts(overrides?: TextOverrides): Texts;
/** Ersetzt `{name}` durch den Wert aus `vars`. Unbekannte Platzhalter bleiben stehen. */
export declare function fill(template: string, vars: Record<string, string | number>): string;
export declare function escapeHtml(value: string): string;
/** „A“, „A und B“, „A, B und C“ */
export declare function joinList(items: string[]): string;
