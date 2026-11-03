import type { NormalizedGcm } from './config';
import type { GoogleConsentType } from './types';

type ConsentValue = 'granted' | 'denied';

declare global {
  interface Window {
    dataLayer?: unknown[];
    gtag?: (...args: unknown[]) => void;
  }
}

function gtag(...args: unknown[]): void {
  window.dataLayer = window.dataLayer || [];
  if (typeof window.gtag !== 'function') {
    // Google erwartet das arguments-Objekt, kein Array.
    window.gtag = function () {
      window.dataLayer!.push(arguments);
    };
  }
  window.gtag(...args);
}

export function consentValues(gcm: NormalizedGcm, acceptedCategories: string[]): Record<GoogleConsentType, ConsentValue> {
  const values = {} as Record<GoogleConsentType, ConsentValue>;
  for (const [type, category] of Object.entries(gcm.mapping) as [GoogleConsentType, string][]) {
    values[type] = category === 'necessary' || acceptedCategories.includes(category) ? 'granted' : 'denied';
  }
  return values;
}

/** Muss laufen, bevor das Google-Tag lädt. */
export function setConsentDefaults(gcm: NormalizedGcm): void {
  gtag('consent', 'default', { ...consentValues(gcm, []), wait_for_update: gcm.waitForUpdate });
  if (gcm.adsDataRedaction) gtag('set', 'ads_data_redaction', true);
  if (gcm.urlPassthrough) gtag('set', 'url_passthrough', true);
}

export function updateConsent(gcm: NormalizedGcm, acceptedCategories: string[]): void {
  gtag('consent', 'update', consentValues(gcm, acceptedCategories));
}
