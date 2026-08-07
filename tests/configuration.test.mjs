import assert from 'node:assert/strict';
import { configure, currentBaseUrl, isDemo, isDryRun } from '../scripts/okx.mjs';

const names = ['OKX_DEMO', 'DRY_RUN', 'OKX_BASE_URL'];
const saved = Object.fromEntries(names.map((name) => [name, process.env[name]]));
function clear() { for (const name of names) delete process.env[name]; }

try {
  clear();
  process.env.DRY_RUN = '0';
  configure({ demo: true, live: false, site: 'eea', baseUrl: 'https://my.okx.com' });
  assert.equal(isDemo(), true);
  assert.equal(isDryRun(), true, 'DRY_RUN=0 must not arm a non-live plan');

  clear();
  process.env.OKX_DEMO = '0';
  assert.throws(
    () => configure({ demo: true, live: false, site: 'eea', baseUrl: 'https://my.okx.com' }),
    /ne correspond pas au mode du plan/,
    'a demo plan must never be redirected to a real account',
  );

  clear();
  configure({ demo: false, live: true, site: 'eea', baseUrl: 'https://my.okx.com' });
  assert.equal(isDemo(), false);
  assert.equal(isDryRun(), false);

  clear();
  process.env.OKX_DEMO = '1';
  assert.throws(
    () => configure({ demo: false, live: true, site: 'eea', baseUrl: 'https://my.okx.com' }),
    /ne correspond pas au mode du plan/,
    'account mode must not change underneath stable operation identifiers',
  );

  clear();
  process.env.OKX_BASE_URL = 'https://www.okx.com';
  assert.throws(
    () => configure({ demo: true, live: false, site: 'eea', baseUrl: 'https://my.okx.com' }),
    /ne correspond pas au site/,
  );

  clear();
  configure({ demo: true, live: false, site: 'us', baseUrl: 'https://us.okx.com' });
  assert.equal(currentBaseUrl(), 'https://us.okx.com');
} finally {
  clear();
  for (const [name, value] of Object.entries(saved)) if (value !== undefined) process.env[name] = value;
}

console.log('configuration safety tests OK');
