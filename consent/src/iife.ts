// Einstieg für das IIFE-Bundle: setzt window.neovendoConsent und startet sofort,
// wenn die Site vorher window.neovendoConsentConfig gesetzt hat.
import { api } from './index';

if (window.neovendoConsentConfig) api.init(window.neovendoConsentConfig);
