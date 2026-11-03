import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { buildProofPayload, sendProof } from '../src/proof';
import type { ConsentState, ProofPayload } from '../src/types';
import {
  clearPage,
  clickBanner,
  freshModule,
  JOBSCHMIEDE_PAGE,
  jobschmiedeConfig,
  placeholderButton,
  startWith,
} from './helpers';

const state: ConsentState = {
  id: '8d3c5d0e-5c1f-4f3c-9a5e-2f4b6f1e7a10',
  timestamp: '2026-11-03T09:00:00.000Z',
  firstTimestamp: '2026-11-03T08:00:00.000Z',
  textVersion: '2026-10-01',
  revision: 0,
  acceptType: 'custom',
  categories: ['necessary', 'external_media'],
  rejectedCategories: [],
  services: { external_media: ['openfreemap'] },
};

beforeEach(clearPage);
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('buildProofPayload', () => {
  it('enthält ID, Zeitpunkte, Textversion und Auswahl, sonst nichts', () => {
    const payload = buildProofPayload(state, '2026-11-03', 'change');
    expect(payload).toEqual({
      id: state.id,
      timestamp: '2026-11-03T09:00:00.000Z',
      firstTimestamp: '2026-11-03T08:00:00.000Z',
      textVersion: '2026-11-03',
      revision: 0,
      event: 'change',
      acceptType: 'custom',
      categories: ['necessary', 'external_media'],
      rejectedCategories: [],
      services: { external_media: ['openfreemap'] },
    });
    const json = JSON.stringify(payload);
    expect(json).not.toMatch(/ip|userAgent|navigator|href|referrer|screen|language/i);
  });

  it('kopiert Listen, statt den Zustand zu teilen', () => {
    const payload = buildProofPayload(state, '1', 'first');
    payload.services.external_media.push('elfsight');
    expect(state.services.external_media).toEqual(['openfreemap']);
  });
});

describe('sendProof', () => {
  const payload = buildProofPayload(state, '2026-11-03', 'first');

  it('sendet JSON per POST ohne Cookies und Referrer', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 204 }));
    await expect(sendProof('/api/consent', payload, fetchMock)).resolves.toBe(true);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('/api/consent');
    expect(init).toMatchObject({
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      keepalive: true,
      credentials: 'omit',
      referrerPolicy: 'no-referrer',
    });
    expect(JSON.parse(init.body)).toEqual(payload);
  });

  it('meldet Fehler, ohne zu werfen', async () => {
    await expect(sendProof('/api/consent', payload, vi.fn().mockRejectedValue(new TypeError('offline')))).resolves.toBe(false);
    await expect(sendProof('/api/consent', payload, vi.fn().mockResolvedValue(new Response(null, { status: 500 })))).resolves.toBe(false);
    await expect(sendProof('/api/consent', payload, undefined as unknown as typeof fetch)).resolves.toBe(false);
  });
});

describe('Nachweis im Ablauf', () => {
  it('sendet bei der ersten Entscheidung und bei jeder Änderung', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 204 }));
    vi.stubGlobal('fetch', fetchMock);
    const mod = await freshModule();
    await startWith(mod, jobschmiedeConfig({ proofEndpoint: '/api/consent' }), JOBSCHMIEDE_PAGE);
    expect(fetchMock).not.toHaveBeenCalled();

    const proofs: { ok: boolean; payload: ProofPayload }[] = [];
    mod.api.on('proof', (detail) => proofs.push(detail));

    placeholderButton('openfreemap').click();
    mod.api.acceptService('elfsight');
    await vi.waitFor(() => expect(proofs).toHaveLength(2));

    const sent = fetchMock.mock.calls.map(([, init]) => JSON.parse(init.body) as ProofPayload);
    expect(sent.map((p) => p.event)).toEqual(['first', 'change']);
    expect(sent[0]).toMatchObject({
      textVersion: '2026-11-03',
      categories: expect.arrayContaining(['necessary', 'external_media']),
      services: { external_media: ['openfreemap'] },
    });
    expect(sent[1].services).toEqual({ external_media: ['openfreemap', 'elfsight'] });
    expect(sent[0].id).toBe(sent[1].id);
    expect(sent[0].id).toMatch(/^[0-9a-f-]{36}$/);
    expect(proofs.every((p) => p.ok)).toBe(true);
  });

  it('sendet auch die Ablehnung', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 204 }));
    vi.stubGlobal('fetch', fetchMock);
    const mod = await freshModule();
    await startWith(mod, jobschmiedeConfig({ proofEndpoint: '/api/consent' }), JOBSCHMIEDE_PAGE);

    clickBanner('necessary');
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toMatchObject({
      acceptType: 'necessary',
      categories: ['necessary'],
      rejectedCategories: ['external_media'],
      services: { external_media: [] },
    });
  });

  it('läuft ohne Endpunkt und bei ausgefallenem Endpunkt weiter', async () => {
    const fetchMock = vi.fn().mockRejectedValue(new TypeError('offline'));
    vi.stubGlobal('fetch', fetchMock);

    let mod = await freshModule();
    await startWith(mod, jobschmiedeConfig(), JOBSCHMIEDE_PAGE);
    placeholderButton('openfreemap').click();
    expect(fetchMock).not.toHaveBeenCalled();
    expect(mod.api.acceptedService('openfreemap')).toBe(true);

    clearPage();
    mod = await freshModule();
    await startWith(mod, jobschmiedeConfig({ proofEndpoint: '/api/consent' }), JOBSCHMIEDE_PAGE);
    const proof = new Promise((resolve) => mod.api.on('proof', resolve));
    placeholderButton('openfreemap').click();
    await expect(proof).resolves.toMatchObject({ ok: false });
    expect(mod.api.acceptedService('openfreemap')).toBe(true);
  });
});
