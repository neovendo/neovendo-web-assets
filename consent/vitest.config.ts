import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'jsdom',
    include: ['test/**/*.test.ts'],
    // Inline statt extern, damit vi.resetModules() auch den Zustand der Bibliothek zurücksetzt.
    server: { deps: { inline: ['vanilla-cookieconsent'] } },
  },
});
