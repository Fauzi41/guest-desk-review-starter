# Guest desk handoff

## Decision
Kept the existing server, API, and browser architecture. Repository: https://github.com/Fauzi41/guest-desk-review-starter

Focused diff: https://github.com/Fauzi41/guest-desk-review-starter/compare/c1883cf..f87bfc6b6a5943ffdbf942e0dc53f41f688502ca

### Stage 3 changes

- `/api/next-request` reads `snoozedUntil` as an eligibility field.
- Valid ISO timestamps later than the server's current time exclude that open request.
- Missing values, invalid text, impossible calendar dates, and expired timestamps keep the request eligible.
- Impossible dates are rejected explicitly by validating year, month, day, hour, minute, second, and timezone before using `Date.parse`.
- Non-ISO text is rejected by an anchored ISO format check, so values such as `March 1 2099` do not snooze a request.
- The empty reason now distinguishes the queue states:
  - Empty queue: `No open requests remain.`
  - Open-but-all-snoozed queue: `No open requests are eligible; they are currently snoozed.`

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

## How I checked
Ran the baseline `npm test` before implementation: 4 tests passed. Ran `npm test` after the original recommendation/UX changes: 8 tests passed. Ran `npm test` after adding snooze support: 10 tests passed.
✔ the starter serves its page, script, and fictional request inbox (66.4769ms)
✔ handling a request is reflected by the next read and is safe to repeat (28.3913ms)
✔ invalid updates and unknown paths do not mutate the inbox or expose source (21.9759ms)
✔ an empty inbox remains a successful response (6.91ms)
✔ next request selects an open request by urgency, age, then ascending ID (8.7301ms)
✔ next request is null when all requests are resolved (6.75ms)
✔ next request is null for an empty queue (5.557ms)
✔ next request handles future, missing, invalid, and expired snoozedUntil values (19.1543ms)
✔ next request uses oldest createdAt within the same urgency (7.0615ms)
✔ next request distinguishes all-snoozed open records from an empty queue (11.6827ms)

API coverage:

- `next request selects an open request by urgency, age, then ascending ID` verifies that resolved `GD-104` is not recommended, urgent requests beat normal requests, and `GD-201` wins an exact urgency/timestamp/ID tie before `GD-202`.
- `GD-201` and `GD-202` are test-only fixture records and do not appear in `requests.json`.
- The same test verifies the reason is `Open urgent request; oldest createdAt, then ascending ID.`
- `next request is null when all requests are resolved` verifies the all-resolved queue.
- `next request is null for an empty queue` verifies the empty queue.
- `next request handles future, missing, invalid, and expired snoozedUntil values` verifies future, missing, invalid text, non-ISO text, impossible future dates, and expired values independently.
- `next request uses oldest createdAt within the same urgency` verifies `GD-102` is selected before `GD-106`.
- Existing update and validation tests verify PATCH handling, repeat handling, and invalid payloads.

Snooze results:

- Future `2099-01-01T00:00:00Z`: excluded; the live API returned `request: null` when no other eligible request existed.
- Missing `snoozedUntil`: eligible; the test recommendation was `GD-SNOOZE`.
- Invalid `not-a-date`: treated as invalid and eligible; the test recommendation was `GD-SNOOZE`.
- Non-ISO text `March 1 2099`: rejected by the anchored ISO format check and eligible; the test recommendation was `GD-SNOOZE`.
- Impossible future date `2099-02-30T00:00:00Z`: rejected explicitly as invalid and eligible.
- Expired `2000-01-01T00:00:00Z`: eligible; the test recommendation was `GD-SNOOZE`.
- ISO milliseconds `2099-01-01T00:00:00.000Z`: accepted and excluded.
- ISO offset `2099-01-01T02:00:00+02:00`: accepted and excluded.
- No timezone `2099-01-01T00:00:00`: rejected as invalid and eligible.
- Timestamp exactly equal to the current time: eligible. This was verified by pinning `Date.now()` in the test to `2026-11-18T10:30:00.000Z` and setting the same exact snooze timestamp. Timestamp one second before the current time was also eligible.

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

## Remaining work
No `requests.json` content change is included; `git status` shows no modification to it. All browser flows are manual and have no automated browser-test coverage. The recommendation-error path currently exposes raw `error.message` text (`Failed to fetch`) rather than the friendlier `showError()` wording. The reason text is the same for every recommendation, including no-tie cases; it is accurate but could be more specific about the decisive tie-break. No persistent database, authentication, external AI service, or deployment work was added.
