import type { TextOverrides } from './texts';
/** Mitgelieferte Kategorien. Eigene Kategorien brauchen Titel und Beschreibung in `categories`. */
export type KnownCategory = 'necessary' | 'external_media' | 'analytics' | 'marketing';
export type CategoryId = KnownCategory | (string & {});
export interface ConsentCookie {
    /** Exakter Name oder Präfix mit `*` am Ende, zum Beispiel `_ga*`. RegExp geht auch. */
    name: string | RegExp;
    /** Speicherdauer für die Tabelle im Einstellungsdialog, zum Beispiel „2 Jahre". */
    duration?: string;
    domain?: string;
    path?: string;
}
export interface ConsentService {
    /** Kennung für `data-service`, nur a-z, 0-9, `_` und `-`. */
    id: string;
    /** Anzeigename, zum Beispiel „OpenFreeMap". */
    name: string;
    /** Kategorie, in der der Dienst erscheint. Dienste unter `necessary` stehen nur in der Tabelle. */
    category: CategoryId;
    /** Wozu der Dienst auf der Seite dient. */
    purpose: string;
    /** Anbieter mit Firmierung und Sitz. */
    provider: string;
    /** Server, die der Browser nach der Einwilligung anfragt. */
    hosts: string[];
    /** Cookies, die der Dienst setzt. Sie werden beim Widerruf gelöscht, soweit sie zur Domain der Site gehören. */
    cookies?: ConsentCookie[];
    /** Datenschutzhinweise des Anbieters. */
    privacyUrl?: string;
}
export interface CategoryOptions {
    title?: string;
    description?: string;
}
export type GoogleConsentType = 'ad_storage' | 'ad_user_data' | 'ad_personalization' | 'analytics_storage' | 'functionality_storage' | 'personalization_storage' | 'security_storage';
export interface GoogleConsentModeOptions {
    enabled: boolean;
    /** Welche Kategorie welchen Consent-Typ freigibt. Ergänzt die Standardzuordnung. */
    mapping?: Partial<Record<GoogleConsentType, CategoryId>>;
    /** Millisekunden, die Google-Tags auf das Update warten. Standard 500. */
    waitForUpdate?: number;
    adsDataRedaction?: boolean;
    urlPassthrough?: boolean;
}
export interface LayoutOptions {
    consentModal?: {
        layout?: 'box' | 'box wide' | 'box inline' | 'cloud' | 'cloud inline' | 'bar' | 'bar inline';
        position?: 'top' | 'bottom' | 'middle' | 'top left' | 'top center' | 'top right' | 'middle left' | 'middle center' | 'middle right' | 'bottom left' | 'bottom center' | 'bottom right';
    };
    preferencesModal?: {
        layout?: 'box' | 'bar' | 'bar wide';
        position?: 'left' | 'right';
    };
}
export interface NeovendoConsentConfig {
    /** Stand der Texte, landet im Cookie und im Nachweis. Bei jeder Textänderung anpassen, zum Beispiel `2026-11-03`. */
    textVersion: string;
    /** Alle Dienste der Site. Kategorien ohne Dienst erscheinen nicht. */
    services: ConsentService[];
    /** Erhöhen, wenn alle Besucher neu gefragt werden sollen, etwa bei einem neuen Dienst. Standard 0. */
    revision?: number;
    /** Texte bekannter Kategorien überschreiben oder eigene Kategorien anlegen. */
    categories?: Record<string, CategoryOptions>;
    /** Standard `/datenschutz`. */
    privacyPolicyUrl?: string;
    /** Standard `/impressum`. */
    imprintUrl?: string;
    /** Endpunkt für den Nachweis, zum Beispiel `/api/consent`. Ohne Angabe wird nichts gesendet. */
    proofEndpoint?: string;
    /** Google Consent Mode v2, standardmäßig aus. */
    googleConsentMode?: boolean | GoogleConsentModeOptions;
    texts?: TextOverrides;
    cookie?: {
        /** Standard `nv_consent`. */
        name?: string;
        /** Standard 182. */
        expiresAfterDays?: number;
        domain?: string;
    };
    layout?: LayoutOptions;
    /** Seite neu laden, wenn ein bereits freigegebener Dienst widerrufen wird. Standard true. */
    reloadOnRevoke?: boolean;
    /** Banner für Crawler und automatisierte Browser ausblenden. Standard true. */
    hideFromBots?: boolean;
    /** Banner ohne Entscheidung automatisch zeigen. Standard true. */
    autoShow?: boolean;
    /** Wird nach jeder Entscheidung aufgerufen, auch nach der ersten. */
    onChange?: (state: ConsentState, change: ConsentChange) => void;
}
export interface ConsentState {
    /** Zufällige ID der Einwilligung, erzeugt im Browser. */
    id: string;
    /** Zeitpunkt der letzten Entscheidung. */
    timestamp: string;
    /** Zeitpunkt der ersten Entscheidung. */
    firstTimestamp: string;
    /** Textversion, die bei der letzten Entscheidung galt. */
    textVersion: string | null;
    revision: number;
    acceptType: 'all' | 'custom' | 'necessary';
    categories: string[];
    rejectedCategories: string[];
    /** Freigegebene Dienste je Kategorie. */
    services: Record<string, string[]>;
}
export interface ConsentChange {
    first: boolean;
    changedCategories: string[];
    changedServices: Record<string, string[]>;
}
export interface ProofPayload {
    id: string;
    timestamp: string;
    firstTimestamp: string;
    textVersion: string;
    revision: number;
    event: 'first' | 'change';
    acceptType: ConsentState['acceptType'];
    categories: string[];
    rejectedCategories: string[];
    services: Record<string, string[]>;
}
export interface ConsentEventMap {
    ready: {
        state: ConsentState | null;
    };
    change: {
        state: ConsentState;
        change: ConsentChange;
    };
    proof: {
        ok: boolean;
        payload: ProofPayload;
    };
}
export type ConsentEventName = keyof ConsentEventMap;
export interface NeovendoConsentApi {
    readonly version: string;
    init(config: NeovendoConsentConfig): NeovendoConsentApi;
    /** Einstellungsdialog öffnen, etwa über den Link im Footer. */
    show(): void;
    /** Banner erneut zeigen. */
    showBanner(): void;
    /** Aktueller Stand, `null` solange keine Entscheidung vorliegt. */
    getState(): ConsentState | null;
    acceptedCategory(category: CategoryId): boolean;
    acceptedService(serviceId: string): boolean;
    /** Gibt nur diesen Dienst frei, alle anderen bleiben, wie sie sind. */
    acceptService(serviceId: string): void;
    /** Ruft `callback` einmal auf, sobald der Dienst freigegeben ist, auch sofort, wenn er es schon ist. */
    onAccept(serviceId: string, callback: () => void): () => void;
    on<E extends ConsentEventName>(event: E, callback: (detail: ConsentEventMap[E]) => void): () => void;
    /** Platzhalter und gesperrte iframes unter `root` erneut prüfen, nach clientseitiger Navigation. */
    scan(root?: ParentNode): void;
    /** Entscheidung löschen und Seite neu laden, danach erscheint das Banner wieder. */
    reset(): void;
}
