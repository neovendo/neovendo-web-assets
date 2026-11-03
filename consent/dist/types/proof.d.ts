import type { ConsentState, ProofPayload } from './types';
export declare function buildProofPayload(state: ConsentState, textVersion: string, event: ProofPayload['event']): ProofPayload;
/** Sendet den Nachweis und meldet nur Erfolg oder Misserfolg zurück, wirft nie. */
export declare function sendProof(endpoint: string, payload: ProofPayload, fetchImpl?: typeof fetch): Promise<boolean>;
