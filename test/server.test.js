import test from 'node:test';
import assert from 'node:assert/strict';
import { createStarterServer } from '../server.js';

async function fixture(t, options) {
  const server = createStarterServer(options);
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(() => { server.closeAllConnections(); server.close(); });
  return (path, options) => fetch(`http://127.0.0.1:${server.address().port}${path}`, options);
}

test('the starter serves its page, script, and fictional request inbox', async t => {
  const call = await fixture(t);
  assert.match(await (await call('/')).text(), /Small requests/);
  assert.match((await call('/app.js')).headers.get('content-type'), /javascript/);
  const response = await call('/api/requests');
  assert.equal(response.status, 200);
  const { requests } = await response.json();
  assert.equal(requests.length, 6);
  assert.equal(requests.filter(item => item.status === 'open').length, 5);
});

test('handling a request is reflected by the next read and is safe to repeat', async t => {
  const call = await fixture(t);
  for (let i = 0; i < 2; i++) {
    const response = await call('/api/requests/GD-103', { method: 'PATCH', body: JSON.stringify({ status: 'resolved' }) });
    assert.equal(response.status, 200);
  }
  assert.equal((await (await call('/api/requests')).json()).requests.find(item => item.id === 'GD-103').status, 'resolved');
  const other = await fixture(t);
  assert.equal((await (await other('/api/requests')).json()).requests.find(item => item.id === 'GD-103').status, 'open');
});

test('invalid updates and unknown paths do not mutate the inbox or expose source', async t => {
  const call = await fixture(t);
  for (const body of ['null', '{}', 'not-json', '{"status":"missing"}']) assert.equal((await call('/api/requests/GD-103', { method: 'PATCH', body })).status, 400);
  assert.equal((await call('/api/requests/GD-999', { method: 'PATCH', body: '{"status":"resolved"}' })).status, 404);
  assert.equal((await call('/server.js')).status, 404);
  assert.equal((await call('/package.json')).status, 404);
  assert.equal((await call('/api/requests/GD-103', { method: 'PATCH', body: ' '.repeat(4097) })).status, 413);
});

test('an empty inbox remains a successful response', async t => {
  const call = await fixture(t, { requests: [] });
  assert.deepEqual(await (await call('/api/requests')).json(), { requests: [] });
});

test('next request selects an open request by urgency, age, then ascending ID', async t => {
  const call = await fixture(t, {
    requests: [
      { id: 'GD-200', urgency: 'normal', status: 'open', createdAt: '2026-11-03T08:00:00Z' },
      { id: 'GD-202', urgency: 'urgent', status: 'open', createdAt: '2026-11-03T08:30:00Z' },
      { id: 'GD-201', urgency: 'urgent', status: 'open', createdAt: '2026-11-03T08:30:00Z' },
      { id: 'GD-199', urgency: 'urgent', status: 'resolved', createdAt: '2026-11-03T07:00:00Z' }
    ]
  });

  const response = await call('/api/next-request');
  assert.equal(response.status, 200);
  const result = await response.json();
  assert.equal(result.request.id, 'GD-201');
  assert.equal(result.reason, 'Open urgent request; oldest at this urgency.');
});

test('next request is null when all requests are resolved', async t => {
  const call = await fixture(t, {
    requests: [{ id: 'GD-200', urgency: 'urgent', status: 'resolved', createdAt: '2026-11-03T08:00:00Z' }]
  });

  assert.deepEqual(await (await call('/api/next-request')).json(), {
    request: null,
    reason: 'No open requests remain.'
  });
});
