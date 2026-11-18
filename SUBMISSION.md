# Guest desk handoff

## Decision
Kept the existing server, API, and browser architecture. Updated [server.js](https://github.com/Fauzi41/guest-desk-review-starter/blob/master/server.js) so `/api/next-request` excludes resolved requests and orders open requests by urgency, oldest `createdAt`, then ascending request ID. It returns `Open <urgency> request; oldest createdAt, then ascending ID.` for a recommendation and `No open requests remain.` for an empty or all-resolved queue.

Updated [public/app.js](https://github.com/Fauzi41/guest-desk-review-starter/blob/master/public/app.js) so the status text is cleared when a handle/reopen update starts, preventing a stale success message. The “Handle next” panel in [public/index.html](https://github.com/Fauzi41/guest-desk-review-starter/blob/master/public/index.html) and [public/style.css](https://github.com/Fauzi41/guest-desk-review-starter/blob/master/public/style.css) now shows guest, room, and urgency text. Urgency has red, blue, and gray text-and-badge styles for urgent, normal, and low.

Added API regression coverage in [test/server.test.js](https://github.com/Fauzi41/guest-desk-review-starter/blob/master/test/server.test.js).

## Why
The original endpoint could recommend a resolved request and used descending IDs for exact timestamp ties. The server fix directly satisfies the open-only and ordering rules. The UI uses the backend recommendation, handles it through the existing PATCH API, then refreshes the list and next recommendation. The guest/room/urgency details are a small usability improvement that helps an operator act on the recommendation.

## How I checked
Ran the baseline `npm test` before implementation: 4 tests passed. Ran `npm test` after implementation: 7 tests passed.
✔ the starter serves its page, script, and fictional request inbox (74.0409ms)
✔ handling a request is reflected by the next read and is safe to repeat (29.88ms)
✔ invalid updates and unknown paths do not mutate the inbox or expose source (25.1411ms)
✔ an empty inbox remains a successful response (8.1393ms)
✔ next request selects an open request by urgency, age, then ascending ID (9.2023ms)
✔ next request is null when all requests are resolved (15.1823ms)
✔ next request is null for an empty queue (5.7411ms)

API coverage:

- `next request selects an open request by urgency, age, then ascending ID` verifies that resolved `GD-104` is not recommended, urgent requests beat normal requests, and `GD-201` wins an exact urgency/timestamp/ID tie before `GD-202`.
- The same test verifies the reason is `Open urgent request; oldest createdAt, then ascending ID.`
- `next request is null when all requests are resolved` verifies the all-resolved queue.
- `next request is null for an empty queue` verifies the empty queue.
- Existing update and validation tests verify PATCH handling, repeat handling, and invalid payloads.

Browser verification used clean local servers on ports 43212-43216:

- Initial recommendation displayed Jules, Room 310, urgent, and `Open urgent request; oldest createdAt, then ascending ID.`
- Handling Jules reduced the open count and loaded Casey (`GD-105`), helping verify the browser used the ascending ID tie-break.
- The Open, All, and Handled filters were checked; each showed the appropriate records.
- Urgent and normal badge text/colors were visually observed.
- Handling all five open requests verified the “All caught up” state, with `0 open`, `All caught up.`, and `No open requests remain.`

Unverified: the recommendation-error state, low badge rendering, and a repeat failed update after a successful handle. The stale-success fix is present in code. A repeat failed-update browser check can be performed by blocking only the PATCH request URL in DevTools Network conditions, after first completing one successful handle.

## Working with AI
Prompted: “You are a senior engineer handling this guest desk application. Read all sources, identify existing functionality, bugs and missing requirements, files to change, tests to add, and propose a prioritized plan without modifying anything.” I used its finding that `/api/next-request` lacked an open-status filter and reversed ID tie-break. I rejected a suggested ranking-helper extraction because the rule is small and the existing server is already the correct ownership boundary.

## Remaining work
No `requests.json` content change is included; `git status` shows no modification to it. Browser verification for a failed update, recommendation error, and low badge remains to be completed. No persistent database, authentication, external AI service, or deployment work was added.
