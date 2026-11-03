// Konfiguration für die-jobschmiede.com, zugleich Vorlage für weitere Sites.
// Die Demo und die Tests verwenden sie unverändert.

/** @type {import('../dist/neovendo-consent.d.mts').NeovendoConsentConfig} */
const config = {
  textVersion: '2026-11-03',
  privacyPolicyUrl: '/datenschutz',
  imprintUrl: '/impressum',
  proofEndpoint: '/api/consent',
  services: [
    {
      id: 'openfreemap',
      name: 'OpenFreeMap',
      category: 'external_media',
      purpose: 'Kartenhintergrund für die Standort- und Stellenkarten',
      provider: 'Hyperknot Software Kft., Ungarn',
      hosts: ['tiles.openfreemap.org'],
      cookies: [],
      privacyUrl: 'https://openfreemap.org/privacy/',
    },
    {
      id: 'elfsight',
      name: 'Elfsight',
      category: 'external_media',
      purpose: 'Badge mit Google-Bewertungen auf der FAQ-Seite für Arbeitnehmer',
      provider: 'Elfsight',
      // Beobachtet am 03.11.2026 beim Laden des Badges, kann sich bei Elfsight ändern.
      hosts: [
        'elfsightcdn.com',
        'universe-static.elfsightcdn.com',
        'core.service.elfsight.com',
        'static.elfsight.com',
        'service-reviews-ultimate.elfsight.com',
      ],
      cookies: [],
      privacyUrl: 'https://elfsight.com/privacy-policy/',
    },
  ],
};

export default config;
