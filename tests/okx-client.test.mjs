import assert from 'node:assert/strict';

process.env.OKX_API_KEY = 'fake-test-key';
process.env.OKX_SECRET_KEY = 'fake-test-secret';
process.env.OKX_PASSPHRASE = 'fake-test-passphrase';
process.env.DRY_RUN = '0';
process.env.OKX_HTTP_TIMEOUT_MS = '1000';
delete process.env.OKX_DEMO;
delete process.env.OKX_BASE_URL;

const { assertSpotMarketReady, configure, marketBuy } = await import('../scripts/okx.mjs?okx-response-tests');
configure({ demo: true, live: true, site: 'eea', baseUrl: 'https://my.okx.com' });

let nextResponse;
let fetchCalls = 0;
let lastRequest;
const previousFetch = globalThis.fetch;
globalThis.fetch = async (url, options) => {
  fetchCalls += 1;
  lastRequest = { url, options };
  return nextResponse;
};
const jsonResponse = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

try {
  nextResponse = jsonResponse({ code: '0', data: [{ sCode: '51000', sMsg: 'bad order' }] });
  await assert.rejects(() => marketBuy('BTC-USDC', 50, 'dcatest00000000000000000001'), (error) => error.okxCode === '51000');

  nextResponse = new Response('<html>failure</html>', { status: 502, headers: { 'content-type': 'text/html' } });
  await assert.rejects(() => marketBuy('BTC-USDC', 50, 'dcatest00000000000000000002'), /réponse non JSON/);

  nextResponse = jsonResponse({ code: '50011', msg: 'rate limited', data: [] }, 429);
  await assert.rejects(() => marketBuy('BTC-USDC', 50, 'dcatest00000000000000000003'), (error) => error.httpStatus === 429 && error.okxCode === '50011');

  nextResponse = jsonResponse({ code: '0', data: [{}] });
  await assert.rejects(() => marketBuy('BTC-USDC', 50, 'dcatest00000000000000000004'), /ordId\/clOrdId manquant/);

  nextResponse = jsonResponse({ code: '0', data: [{ ordId: 'ord-1', clOrdId: 'different' }] });
  await assert.rejects(() => marketBuy('BTC-USDC', 50, 'dcatest00000000000000000005'), /clOrdId différent/);

  const clOrdId = 'dcatest00000000000000000006';
  nextResponse = jsonResponse({ code: '0', data: [{ ordId: 'ord-2', clOrdId, sCode: '0', sMsg: '' }] });
  const result = await marketBuy('BTC-USDC', 50, clOrdId);
  assert.equal(result.ordId, 'ord-2');
  assert.equal(result.clOrdId, clOrdId);
  assert.equal(fetchCalls, 6);
  assert.equal(lastRequest.options.headers['x-simulated-trading'], '1', 'demo orders must always carry the simulated-trading header');
  assert.equal(lastRequest.options.method, 'POST');
  assert.equal(lastRequest.url, 'https://my.okx.com/api/v5/trade/order');

  nextResponse = jsonResponse({ code: '0', data: [{ instId: 'HYPE-USDC', last: '', bidPx: '', askPx: '' }] });
  await assert.rejects(() => assertSpotMarketReady('HYPE-USDC'), /aucune liquidité sur le marché démo/);
  assert.equal(lastRequest.options.headers['x-simulated-trading'], '1', 'demo market validation must inspect the simulated market');

  nextResponse = jsonResponse({ code: '0', data: [{ instId: 'BTC-USDC', last: '65000', bidPx: '64999', askPx: '65001' }] });
  const ticker = await assertSpotMarketReady('BTC-USDC');
  assert.equal(ticker.instId, 'BTC-USDC');
} finally {
  globalThis.fetch = previousFetch;
  for (const name of ['OKX_API_KEY', 'OKX_SECRET_KEY', 'OKX_PASSPHRASE', 'DRY_RUN', 'OKX_HTTP_TIMEOUT_MS']) delete process.env[name];
}

console.log('OKX fake HTTP response tests OK');
