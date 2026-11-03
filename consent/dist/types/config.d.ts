import type * as CookieConsent from 'vanilla-cookieconsent';
import { type Texts } from './texts';
import type { CategoryId, ConsentCookie, ConsentService, GoogleConsentType, LayoutOptions, NeovendoConsentConfig } from './types';
export declare const KNOWN_CATEGORIES: readonly ["necessary", "external_media", "analytics", "marketing"];
export declare const DEFAULT_GCM_MAPPING: Record<GoogleConsentType, CategoryId>;
export interface NormalizedService extends ConsentService {
    cookies: ConsentCookie[];
}
export interface NormalizedCategory {
    id: string;
    title: string;
    description: string;
    readOnly: boolean;
    services: NormalizedService[];
}
export interface NormalizedGcm {
    mapping: Record<GoogleConsentType, CategoryId>;
    waitForUpdate: number;
    adsDataRedaction: boolean;
    urlPassthrough: boolean;
}
export interface NormalizedConfig {
    textVersion: string;
    revision: number;
    privacyPolicyUrl: string;
    imprintUrl: string;
    proofEndpoint: string | null;
    gcm: NormalizedGcm | null;
    texts: Texts;
    cookie: {
        name: string;
        expiresAfterDays: number;
        domain?: string;
    };
    layout: LayoutOptions;
    reloadOnRevoke: boolean;
    hideFromBots: boolean;
    autoShow: boolean;
    /** Anzeigereihenfolge: `necessary`, bekannte Kategorien, dann eigene. Nur Kategorien mit Diensten. */
    categories: NormalizedCategory[];
    services: Map<string, NormalizedService>;
    onChange?: NeovendoConsentConfig['onChange'];
}
export declare class ConsentConfigError extends Error {
    readonly issues: string[];
    constructor(issues: string[]);
}
export declare function normalizeConfig(input: NeovendoConsentConfig): NormalizedConfig;
/** `_ga*` wird zum Präfix-Muster, alles andere bleibt exakt. */
export declare function toCookieItem(cookie: ConsentCookie): CookieConsent.CookieItem;
export declare function buildTranslation(config: NormalizedConfig): CookieConsent.Translation;
type Callbacks = Pick<CookieConsent.CookieConsentConfig, 'onFirstConsent' | 'onConsent' | 'onChange'>;
export declare function buildLibraryConfig(config: NormalizedConfig, callbacks: Callbacks): CookieConsent.CookieConsentConfig;
export {};
