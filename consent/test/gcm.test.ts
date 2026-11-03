import { beforeEach, expect, it, vi } from 'vitest';
import { clearPage, clickBanner, freshModule, JOBSCHMIEDE_PAGE, jobschmiedeConfig, nextChange, startWith } from './helpers';

beforeEach(clearPage);

const consentCalls = () =>
  (window.dataLayer ?? [])
    .map((entry) => Array.from(entry as ArrayLike<unknown>))
    .filter((args) => args[0] === 'consent');

it('setzt ohne Option nichts in den dataLayer', async () => {
  const mod = await freshModule();
  await startWith(mod, jobschmiedeConfig(), JOBSCHMIEDE_PAGE);
  const changed = nextChange();
  clickBanner('all');
  await changed;
  expect(window.dataLayer).toBeUndefined();
});

it('setzt Standardwerte sofort und aktualisiert nach der Entscheidung', async () => {
  const mod = await freshModule();
  const services = [
    ...jobschmiedeConfig().services,
    {
      id: 'ga',
      name: 'Google Analytics',
      category: 'analytics',
      purpose: 'Reichweitenmessung',
      provider: 'Google Ireland Limited',
      hosts: ['www.googletagmanager.com'],
    },
  ];
  document.body.innerHTML = '';
  mod.initConsent(jobschmiedeConfig({ googleConsentMode: true, services }));

  // Synchron, also vor jedem Google-Tag
  expect(consentCalls()).toEqual([
    [
      'consent',
      'default',
      {
        ad_storage: 'denied',
        ad_user_data: 'denied',
        ad_personalization: 'denied',
        analytics_storage: 'denied',
        functionality_storage: 'granted',
        personalization_storage: 'denied',
        security_storage: 'granted',
        wait_for_update: 500,
      },
    ],
  ]);

  await vi.waitFor(() => expect(document.querySelector('#cc-main .cm')).not.toBeNull());
  mod.api.acceptService('ga');

  const update = consentCalls().at(-1)!;
  expect(update[1]).toBe('update');
  expect(update[2]).toMatchObject({ analytics_storage: 'granted', ad_storage: 'denied' });
});
