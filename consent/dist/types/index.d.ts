import type { NeovendoConsentApi, NeovendoConsentConfig } from './types';
import { VERSION } from './version';
export { ConsentConfigError, normalizeConfig } from './config';
export { DEFAULT_CATEGORY_TEXTS, DEFAULT_TEXTS } from './texts';
export type { Texts, TextOverrides } from './texts';
export type * from './types';
export { VERSION };
declare global {
    interface Window {
        neovendoConsent?: NeovendoConsentApi;
        neovendoConsentConfig?: NeovendoConsentConfig;
    }
}
export declare function initConsent(input: NeovendoConsentConfig): NeovendoConsentApi;
export declare const api: NeovendoConsentApi;
