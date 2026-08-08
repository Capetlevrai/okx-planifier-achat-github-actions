import assert from 'node:assert/strict';

process.env.OKX_API_KEY = 'fake-test-key';
process.env.OKX_SECRET_KEY = 'fake-test-secret';
process.env.OKX_PASSPHRASE = 'fake-test-passphrase';
process.env.OKX_HTTP_TIMEOUT_MS = '1000';
delete process.env.OKX_DEMO;
delete process.env.OKX_BASE_URL;
delete process.env.ALLOW_REAL_TRADING;

globalThis.fetch = undefined;
const { keepaliveCurrency, runKeepalive } = await import('../scripts/keepalive.mjs?keepalive-behaviour-tests');

assert.equal(keepaliveCurrency({ strategy: { quoteCcy: 'usdc' } }), 'USDC');
assert.equal(keepaliveCurrency({ strategy: { instIds: ['BTC-EUR'] } }), 'EUR');
assert.equal(keepaliveCurrency({ risk: { allowedInstIds: ['ETH-USDC'] } }), 'USDC');

const basePlan = {
  live: true,
  site: 'eea',
  baseUrl: 'https://my.okx.com',
  strategy: { quoteCcy: 'USDC', instIds: ['BTC-USDC'] },
};

async function exercise(plan, expectedSimulatedHeader) {
  const calls = [];
  globalThis.fetch = async (url, options = {}) => {
    calls.push({ url: String(url), options });
    assert.equal(options.method, 'GET');
    assert.equal(options.body, undefined);
    assert.ok(!String(url).includes('/api/v5/trade/'), `keepalive must not call trade endpoints: ${url}`);
    return new Response(JSON.stringify({ code: '0', data: [{ details: [{ ccy: 'USDC', availBal: '123.45' }] }] }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    });
  };

  await runKeepalive(plan);
  assert.equal(calls.length, 1, 'keepalive must perform exactly one authenticated API call');
  assert.equal(calls[0].url, 'https://my.okx.com/api/v5/account/balance?ccy=USDC');
  assert.equal(calls[0].options.headers['OK-ACCESS-KEY'], 'fake-test-key');
  assert.equal(Boolean(calls[0].options.headers['x-simulated-trading']), expectedSimulatedHeader);
}

await exercise({ ...basePlan, demo: true }, true);
await exercise({ ...basePlan, demo: false }, false);

for (const name of ['OKX_API_KEY', 'OKX_SECRET_KEY', 'OKX_PASSPHRASE', 'OKX_HTTP_TIMEOUT_MS']) delete process.env[name];
console.log('keepalive behavior tests OK');
