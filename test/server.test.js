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
  assert.equal(result.reason, 'Open urgent request; oldest createdAt, then ascending ID.');
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

test('next request is null for an empty queue', async t => {
  const call = await fixture(t, { requests: [] });

  assert.deepEqual(await (await call('/api/next-request')).json(), {
    request: null,
    reason: 'No open requests remain.'
  });
});

test('next request handles future, missing, invalid, and expired snoozedUntil values', async t => {
  const cases = [
    { name: 'future', snoozedUntil: '2099-01-01T00:00:00Z', expectedId: null },
    { name: 'missing', expectedId: 'GD-SNOOZE' },
    { name: 'invalid', snoozedUntil: 'not-a-date', expectedId: 'GD-SNOOZE' },
    { name: 'non-ISO text', snoozedUntil: 'March 1 2099', expectedId: 'GD-SNOOZE' },
    { name: 'impossible future date', snoozedUntil: '2099-02-30T00:00:00Z', expectedId: 'GD-SNOOZE' },
    { name: 'ISO milliseconds', snoozedUntil: '2099-01-01T00:00:00.000Z', expectedId: null },
    { name: 'ISO offset', snoozedUntil: '2099-01-01T02:00:00+02:00', expectedId: null },
    { name: 'no timezone', snoozedUntil: '2099-01-01T00:00:00', expectedId: 'GD-SNOOZE' },
    { name: 'at or before current time', snoozedUntil: new Date(Date.now() - 1000).toISOString(), expectedId: 'GD-SNOOZE' },
    { name: 'expired', snoozedUntil: '2000-01-01T00:00:00Z', expectedId: 'GD-SNOOZE' }
  ];

  for (const { name, snoozedUntil, expectedId } of cases) {
    const request = {
      id: 'GD-SNOOZE',
      urgency: 'urgent',
      status: 'open',
      createdAt: '2026-11-03T08:00:00Z'
    };
    if (name !== 'missing') request.snoozedUntil = snoozedUntil;

    const call = await fixture(t, { requests: [request] });
    const result = await (await call('/api/next-request')).json();
    assert.equal(result.request?.id ?? null, expectedId, name);
  }
});

test('next request uses oldest createdAt within the same urgency', async t => {
  const call = await fixture(t, {
    requests: [
      { id: 'GD-106', urgency: 'normal', status: 'open', createdAt: '2026-11-03T08:20:00Z' },
      { id: 'GD-102', urgency: 'normal', status: 'open', createdAt: '2026-11-03T08:10:00Z' }
    ]
  });

  const result = await (await call('/api/next-request')).json();
  assert.equal(result.request.id, 'GD-102');
});

test('next request distinguishes all-snoozed open records from an empty queue', async t => {
  const snoozedCall = await fixture(t, {
    requests: [{ id: 'GD-SNOOZED', urgency: 'urgent', status: 'open', createdAt: '2026-11-03T08:00:00Z', snoozedUntil: '2099-01-01T00:00:00Z' }]
  });
  assert.deepEqual(await (await snoozedCall('/api/next-request')).json(), {
    request: null,
    reason: 'No open requests are eligible; they are currently snoozed.'
  });

  const emptyCall = await fixture(t, { requests: [] });
  assert.deepEqual(await (await emptyCall('/api/next-request')).json(), {
    request: null,
    reason: 'No open requests remain.'
  });
});

test('next request treats a snoozedUntil exactly equal to current time as eligible', async t => {
  const now = Date.UTC(2026, 10, 18, 10, 30, 0);
  const originalDateNow = Date.now;
  Date.now = () => now;
  t.after(() => { Date.now = originalDateNow; });

  const call = await fixture(t, {
    requests: [{ id: 'GD-BOUNDARY', urgency: 'urgent', status: 'open', createdAt: '2026-11-03T08:00:00Z', snoozedUntil: '2026-11-18T10:30:00.000Z' }]
  });

  const result = await (await call('/api/next-request')).json();
  assert.equal(result.request.id, 'GD-BOUNDARY');

  const afterCall = await fixture(t, {
    requests: [{ id: 'GD-AFTER', urgency: 'urgent', status: 'open', createdAt: '2026-11-03T08:00:00Z', snoozedUntil: '2026-11-18T10:30:01.000Z' }]
  });

  const afterResult = await (await afterCall('/api/next-request')).json();
  assert.equal(afterResult.request, null);
  assert.equal(afterResult.reason, 'No open requests are eligible; they are currently snoozed.');
});

test('next request skips a future-snoozed urgent request and preserves urgency and tie ordering', async t => {
  const call = await fixture(t, {
    requests: [
      { id: 'GD-400', urgency: 'urgent', status: 'open', createdAt: '2026-11-03T07:00:00Z', snoozedUntil: '2099-01-01T00:00:00Z' },
      { id: 'GD-402', urgency: 'urgent', status: 'open', createdAt: '2026-11-03T08:30:00Z' },
      { id: 'GD-401', urgency: 'urgent', status: 'open', createdAt: '2026-11-03T08:30:00Z' },
      { id: 'GD-403', urgency: 'normal', status: 'open', createdAt: '2026-11-03T07:00:00Z' }
    ]
  });

  const result = await (await call('/api/next-request')).json();
  assert.equal(result.request.id, 'GD-401');
});
