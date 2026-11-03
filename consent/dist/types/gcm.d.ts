import type { NormalizedGcm } from './config';
import type { GoogleConsentType } from './types';
type ConsentValue = 'granted' | 'denied';
declare global {
    interface Window {
        dataLayer?: unknown[];
        gtag?: (...args: unknown[]) => void;
    }
}
export declare function consentValues(gcm: NormalizedGcm, acceptedCategories: string[]): Record<GoogleConsentType, ConsentValue>;
/** Muss laufen, bevor das Google-Tag lädt. */
export declare function setConsentDefaults(gcm: NormalizedGcm): void;
export declare function updateConsent(gcm: NormalizedGcm, acceptedCategories: string[]): void;
export {};
