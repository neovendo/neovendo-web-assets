import type { ConsentState, ProofPayload } from './types';

// Der Nachweis enthält nur, was die Bibliothek ohnehin im Cookie speichert: zufällige ID,
// Zeitpunkte, Version und Auswahl. Keine IP, kein User-Agent, keine Seiten-URL.
export function buildProofPayload(state: ConsentState, textVersion: string, event: ProofPayload['event']): ProofPayload {
  return {
    id: state.id,
    timestamp: state.timestamp,
    firstTimestamp: state.firstTimestamp,
    textVersion,
    revision: state.revision,
    event,
    acceptType: state.acceptType,
    categories: [...state.categories],
    rejectedCategories: [...state.rejectedCategories],
    services: Object.fromEntries(Object.entries(state.services).map(([category, ids]) => [category, [...ids]])),
  };
}

/** Sendet den Nachweis und meldet nur Erfolg oder Misserfolg zurück, wirft nie. */
export async function sendProof(
  endpoint: string,
  payload: ProofPayload,
  fetchImpl: typeof fetch = globalThis.fetch,
): Promise<boolean> {
  if (typeof fetchImpl !== 'function') return false;
  try {
    const response = await fetchImpl(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      // Übersteht ein Neuladen der Seite, etwa nach einem Widerruf.
      keepalive: true,
      credentials: 'omit',
      referrerPolicy: 'no-referrer',
      cache: 'no-store',
    });
    return response.ok;
  } catch {
    return false;
  }
}
