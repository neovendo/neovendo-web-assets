import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { beforeEach, describe, expect, it } from 'vitest';
import { clearPage, JOBSCHMIEDE_PAGE, jobschmiedeConfig, placeholderButton, thirdPartySources } from './helpers';

// Prüft die ausgelieferten Dateien, nicht die Quellen. Vorher `npm run build`.
const distFile = (name: string) => join(import.meta.dirname, '../dist', name);

beforeEach(clearPage);

describe('dist', () => {
  it('IIFE startet mit window.neovendoConsentConfig von selbst', async () => {
    document.body.innerHTML = JOBSCHMIEDE_PAGE;
    window.neovendoConsentConfig = jobschmiedeConfig();
    const ready = new Promise((resolve) => window.addEventListener('neovendo-consent:ready', resolve, { once: true }));

    new Function(readFileSync(distFile('neovendo-consent.iife.js'), 'utf8'))();
    await ready;

    expect(window.neovendoConsent?.version).toBe('0.1.0');
    expect(thirdPartySources()).toEqual([]);
    placeholderButton('elfsight').click();
    expect(thirdPartySources()).toEqual(['https://elfsightcdn.com/platform.js']);
    delete window.neovendoConsentConfig;
  });

  it('ESM lässt sich ohne DOM importieren, etwa beim Server-Rendering', () => {
    const script = `import('${distFile('neovendo-consent.mjs')}').then((m) => console.log(typeof m.initConsent, m.VERSION))`;
    expect(execFileSync(process.execPath, ['-e', script], { encoding: 'utf8' }).trim()).toBe('function 0.1.0');
  });

  it('Typen zeigen auf die Deklarationen', () => {
    expect(readFileSync(distFile('neovendo-consent.d.mts'), 'utf8')).toContain("from './types/index.js'");
    expect(readFileSync(distFile('types/index.d.ts'), 'utf8')).toContain('initConsent');
  });

  it('CSS enthält Bibliothek und Platzhalter', () => {
    const css = readFileSync(distFile('neovendo-consent.css'), 'utf8');
    expect(css).toContain('#cc-main');
    expect(css).toContain('.nvc-placeholder');
  });
});
