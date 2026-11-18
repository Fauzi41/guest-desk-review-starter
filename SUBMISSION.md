# Guest desk handoff

## Decision
Kept the existing server, API, and browser architecture. Repository: https://github.com/Fauzi41/guest-desk-review-starter

Focused diff: https://github.com/Fauzi41/guest-desk-review-starter/compare/c1883cf..5b121259343171075f8914b3df511ed02b3175cc

### Stage 3 changes

- `/api/next-request` reads `snoozedUntil` as an eligibility field.
- Valid ISO timestamps later than the server's current time exclude that open request.
- Missing values, invalid text, impossible calendar dates, and expired timestamps keep the request eligible.
- Impossible dates are rejected explicitly by validating year, month, day, hour, minute, second, and timezone before using `Date.parse`.
- Non-ISO text is rejected by an anchored ISO format check, so values such as `March 1 2099` do not snooze a request.
- The empty reason now distinguishes the queue states:
  - Empty queue: `No open requests remain.`
  - Open-but-all-snoozed queue: `No open requests are eligible; they are currently snoozed.`
  - Only resolved records, including resolved snoozed records: `No open requests remain.` because resolved records are not counted as open.

### What stayed the same

- The server remains in-memory; no database or scheduling service was added.
- The resolved-request rule still excludes resolved requests.
- Recommendation order remains urgent, normal, low; oldest `createdAt`; ascending request ID.
- Browser handling still uses the backend decision, PATCHes the existing request API, and refreshes the recommendation afterward.

Updated `public/app.js` so the status text is cleared when a handle/reopen update starts, preventing a stale success message. The “Handle next” panel in `public/index.html` and `public/style.css` now shows guest, room, and urgency text. Urgency has red, blue, and gray text-and-badge styles for urgent, normal, and low.

Added API regression coverage in `test/server.test.js`.

## Why
The original endpoint could recommend a resolved request and used descending IDs for exact timestamp ties. The server fix directly satisfies the open-only and ordering rules. The UI uses the backend recommendation, handles it through the existing PATCH API, then refreshes the list and next recommendation. The guest/room/urgency details are a small usability improvement that helps an operator act on the recommendation.

Snoozing changes only eligibility. It preserves the existing urgency, `createdAt`, ascending-ID, resolved-request, API response, and browser handling rules. No scheduling service or new storage system was added.

Strict validation prevents `Date.parse` normalization or non-ISO text from accidentally snoozing a request: the value must match an ISO date-time shape, have a real calendar date and valid clock/offset fields, and include `Z` or a numeric offset.
Assumption: because the application needs an absolute comparison time, timezone-less ISO text is treated as invalid rather than interpreted in a local timezone.

## How I checked
Ran the baseline `npm test` before implementation: 4 tests passed. The current final suite has 13 tests; resolved-only-snoozed coverage was added inside the existing queue-reason test, so it does not increase the test count.

The pinned-clock case is the standalone test `next request treats a snoozedUntil exactly equal to current time as eligible` in `test/server.test.js`.
✔ the starter serves its page, script, and fictional request inbox (62.3311ms)
✔ handling a request is reflected by the next read and is safe to repeat (30.4465ms)
✔ invalid updates and unknown paths do not mutate the inbox or expose source (26.2431ms)
✔ an empty inbox remains a successful response (8.0859ms)
✔ next request selects an open request by urgency, age, then ascending ID (7.6935ms)
✔ next request is null when all requests are resolved (5.9363ms)
✔ next request is null for an empty queue (6.2805ms)
✔ next request handles future, missing, invalid, and expired snoozedUntil values (44.0044ms)
✔ next request uses oldest createdAt within the same urgency (7.3693ms)
✔ next request distinguishes snoozed open, empty, and resolved-only queues (9.2425ms)
✔ next request treats a snoozedUntil exactly equal to current time as eligible (12.4963ms)
✔ next request skips a future-snoozed urgent request and preserves urgency and tie ordering (8.9644ms)
✔ resolved requests stay excluded regardless of expired or invalid snoozedUntil (5.4982ms)

API coverage:

- `next request selects an open request by urgency, age, then ascending ID` verifies that resolved `GD-104` is not recommended, urgent requests beat normal requests, and `GD-201` wins an exact urgency/timestamp/ID tie before `GD-202`.
- `GD-201` and `GD-202` are test-only fixture records and do not appear in `requests.json`.
- The same test verifies the reason is `Open urgent request; oldest createdAt, then ascending ID.`
- `next request is null when all requests are resolved` verifies the all-resolved queue.
- `next request is null for an empty queue` verifies the empty queue.
- `next request handles future, missing, invalid, and expired snoozedUntil values` verifies future, missing, invalid text, non-ISO text, impossible future dates, and expired values independently.
- `next request uses oldest createdAt within the same urgency` verifies `GD-102` is selected before `GD-106`.
- `next request distinguishes snoozed open, empty, and resolved-only queues` verifies the distinct snoozed, empty, and resolved-only-snoozed reasons.
- `next request treats a snoozedUntil exactly equal to current time as eligible` verifies exact equality and one second after exclusion.
- `next request skips a future-snoozed urgent request and preserves urgency and tie ordering` verifies `GD-400` is skipped and `GD-401` wins over `GD-402` and normal `GD-403`.
- `resolved requests stay excluded regardless of expired or invalid snoozedUntil` verifies expired/invalid snooze values do not override the resolved-request rule.
- Existing update and validation tests verify PATCH handling, repeat handling, and invalid payloads.

Snooze results:

- Future `2099-01-01T00:00:00Z`: excluded; the live API returned `request: null` when no other eligible request existed.
- Missing `snoozedUntil`: eligible; the test recommendation was `GD-SNOOZE`.
- Invalid `not-a-date`: treated as invalid and eligible; the test recommendation was `GD-SNOOZE`.
- Non-ISO text `March 1 2099`: rejected by the anchored ISO format check and eligible; the test recommendation was `GD-SNOOZE`.
- Impossible future date `2099-02-30T00:00:00Z`: rejected explicitly as invalid and eligible, recommending `GD-SNOOZE`.
- Expired `2000-01-01T00:00:00Z`: eligible; the test recommendation was `GD-SNOOZE`.
- ISO milliseconds `2099-01-01T00:00:00.000Z`: accepted and excluded, so `request: null` was returned with no other eligible record.
- ISO offset `2099-01-01T02:00:00+02:00`: accepted and excluded, so `request: null` was returned with no other eligible record.
- No timezone `2099-01-01T00:00:00`: rejected as invalid and eligible, recommending `GD-SNOOZE`.
- Timestamp exactly equal to the current time: eligible, recommending `GD-BOUNDARY`. The test saved the original `Date.now`, replaced it with a fixed millisecond value, and restored it with `t.after(...)`; the timestamp one second before was eligible, and one second after returned `request: null` with `No open requests are eligible; they are currently snoozed.`.
- Mixed snooze ordering: `GD-400` would win unsnoozed because its `07:00` timestamp is older than every other eligible urgent request. It is future-snoozed, so it is skipped; `GD-401` and `GD-402` tie at urgent/08:30, and ascending ID selects `GD-401` before normal `GD-403`.
- Resolved snooze rule: `GD-EXPIRED-RESOLVED` with an expired snooze and `GD-INVALID-RESOLVED` with an invalid snooze remain excluded; open `GD-OPEN` is returned.

Browser verification used clean local servers on ports 43212-43219:

- Initial recommendation displayed Jules, Room 310, urgent, and `Open urgent request; oldest createdAt, then ascending ID.`
- Handling Jules reduced the open count and loaded Casey (`GD-105`), helping verify the browser used the ascending ID tie-break.
- Handling Casey loaded Alex (`GD-102`) before Robin (`GD-106`), confirming oldest `createdAt` within normal urgency.
- Samira (`GD-101`) was the low-urgency recommendation after all normal and urgent open requests were handled. The low badge displayed text `low`, CSS class `urgency-badge low`, gray background `rgb(236, 238, 237)`, and dark-gray text `rgb(95, 105, 99)`.
- The Open, All, and Handled filters were checked; each showed the appropriate records.
- Urgent, normal, and low badge text/colors were observed.
- Handling all five open requests verified the “All caught up” state, with `0 open`, `All caught up.`, and `No open requests remain.`
- An all-snoozed browser fixture showed `1 open` in the inbox while Handle next showed `No open requests are eligible; they are currently snoozed.` This distinguishes an open-but-snoozed queue from a truly empty queue.

For the failed-update check, first handled Jules and Casey successfully. Casey's successful handle loaded Alex and left `3 open`. Then blocked `PATCH /api/requests/GD-102` in browser network conditions and attempted to handle Alex. The status became empty, the open count stayed `3 open`, and the page showed `We could not reach the inbox. Check your connection, then refresh.`; no stale success text remained.

For the recommendation-error check, blocked `GET /api/next-request` while Samira remained the sole open request. The panel displayed `Recommendation unavailable.`, showed `Failed to fetch`, and hid the handle button. The inbox still showed `1 open`.
The inbox list and Open/All/Handled filters continued to work while this recommendation error was displayed.

## Working with AI
Prompted: “You are a senior engineer handling this guest desk application. Read all sources, identify existing functionality, bugs and missing requirements, files to change, tests to add, and propose a prioritized plan without modifying anything.” I used its finding that `/api/next-request` lacked an open-status filter and reversed ID tie-break. I rejected a suggested ranking-helper extraction because the rule is small and the existing server is already the correct ownership boundary.

Stage 3 AI interaction: prompted to validate future snooze handling against missing, invalid, impossible, expired, milliseconds, offset, timezone-less, and boundary values. I accepted the strict ISO and impossible-calendar-date checks, and rejected treating `2099-02-30T00:00:00Z` as valid based on `Date.parse()` normalization.

## Remaining work
No `requests.json` content change is included; `git status` shows no modification to it. All browser flows are manual and have no automated browser-test coverage. The recommendation-error path currently exposes raw `error.message` text (`Failed to fetch`) rather than the friendlier `showError()` wording. The reason text is the same for every recommendation, including no-tie cases; it is accurate but could be more specific about the decisive tie-break. No persistent database, authentication, external AI service, or deployment work was added.
