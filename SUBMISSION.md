# Guest desk handoff

## Decision
Kept the existing server, API, and browser architecture. Repository: https://github.com/Fauzi41/guest-desk-review-starter

Updated [server.js](https://github.com/Fauzi41/guest-desk-review-starter/commit/d9a9176d657cf05b05a65b70596673380d58561e#diff-a4c65ede64197e1a112899a68bf994485b889c4b143198bac4af53425b38406f) so `/api/next-request` excludes resolved requests and orders open requests by urgency, oldest `createdAt`, then ascending request ID. It returns `Open <urgency> request; oldest createdAt, then ascending ID.` for a recommendation and `No open requests remain.` for an empty or all-resolved queue.

Updated [public/app.js](https://github.com/Fauzi41/guest-desk-review-starter/commit/d9a9176d657cf05b05a65b70596673380d58561e#diff-2e26cfed7509767f2d1cd3952d2fa7931097bf6ff9a0e4a704186edd03c52d45) so the status text is cleared when a handle/reopen update starts, preventing a stale success message. The “Handle next” panel in [public/index.html](https://github.com/Fauzi41/guest-desk-review-starter/commit/d9a9176d657cf05b05a65b70596673380d58561e#diff-c2cc24bc9001b11b6add48a4cd8f893d5d6c6e4d1bd254158bd14ab997f552cd) and [public/style.css](https://github.com/Fauzi41/guest-desk-review-starter/commit/d9a9176d657cf05b05a65b70596673380d58561e#diff-46467272678c3da621692b13b96d47ed25128fa8027d8dbedd84684c6336fb51) now shows guest, room, and urgency text. Urgency has red, blue, and gray text-and-badge styles for urgent, normal, and low.

Added API regression coverage in [test/server.test.js](https://github.com/Fauzi41/guest-desk-review-starter/commit/d9a9176d657cf05b05a65b70596673380d58561e#diff-af5f1314428ae23b9f98be976209c616281f2f1f7159ddcabb24b3aa23b9529e , https://github.com/Fauzi41/guest-desk-review-starter/commit/d3f106a1e861e7d12c95ce991470c90be7e05b3f#diff-af5f1314428ae23b9f98be976209c616281f2f1f7159ddcabb24b3aa23b9529e).

## Why
The original endpoint could recommend a resolved request and used descending IDs for exact timestamp ties. The server fix directly satisfies the open-only and ordering rules. The UI uses the backend recommendation, handles it through the existing PATCH API, then refreshes the list and next recommendation. The guest/room/urgency details are a small usability improvement that helps an operator act on the recommendation.

## How I checked
Ran the baseline `npm test` before implementation: 4 tests passed. Ran `npm test` after implementation: 8 tests passed.
✔ the starter serves its page, script, and fictional request inbox (66.177ms)
✔ handling a request is reflected by the next read and is safe to repeat (28.0125ms)
✔ invalid updates and unknown paths do not mutate the inbox or expose source (25.7425ms)
✔ an empty inbox remains a successful response (8.1077ms)
✔ next request selects an open request by urgency, age, then ascending ID (5.3558ms)
✔ next request is null when all requests are resolved (8.76ms)
✔ next request is null for an empty queue (4.849ms)
✔ next request uses oldest createdAt within the same urgency (6.2012ms)

API coverage:

- `next request selects an open request by urgency, age, then ascending ID` verifies that resolved `GD-104` is not recommended, urgent requests beat normal requests, and `GD-201` wins an exact urgency/timestamp/ID tie before `GD-202`.
- The same test verifies the reason is `Open urgent request; oldest createdAt, then ascending ID.`
- `next request is null when all requests are resolved` verifies the all-resolved queue.
- `next request is null for an empty queue` verifies the empty queue.
- `next request uses oldest createdAt within the same urgency` verifies `GD-102` is selected before `GD-106`.
- Existing update and validation tests verify PATCH handling, repeat handling, and invalid payloads.

Browser verification used clean local servers on ports 43212-43219:

- Initial recommendation displayed Jules, Room 310, urgent, and `Open urgent request; oldest createdAt, then ascending ID.`
- Handling Jules reduced the open count and loaded Casey (`GD-105`), helping verify the browser used the ascending ID tie-break.
- Handling Casey loaded Alex (`GD-102`) before Robin (`GD-106`), confirming oldest `createdAt` within normal urgency.
- Samira (`GD-101`) was the low-urgency recommendation after all normal and urgent open requests were handled. The low badge displayed text `low`, CSS class `urgency-badge low`, gray background `rgb(236, 238, 237)`, and dark-gray text `rgb(95, 105, 99)`.
- The Open, All, and Handled filters were checked; each showed the appropriate records.
- Urgent, normal, and low badge text/colors were observed.
- Handling all five open requests verified the “All caught up” state, with `0 open`, `All caught up.`, and `No open requests remain.`

For the failed-update check, first handled Jules and Casey successfully. Casey's successful handle loaded Alex and left `3 open`. Then blocked `PATCH /api/requests/GD-102` in browser network conditions and attempted to handle Alex. The status became empty, the open count stayed `3 open`, and the page showed `We could not reach the inbox. Check your connection, then refresh.`; no stale success text remained.

For the recommendation-error check, blocked `GET /api/next-request` while Samira remained the sole open request. The panel displayed `Recommendation unavailable.`, showed `Failed to fetch`, and hid the handle button. The inbox still showed `1 open`.

## Working with AI
Prompted: “You are a senior engineer handling this guest desk application. Read all sources, identify existing functionality, bugs and missing requirements, files to change, tests to add, and propose a prioritized plan without modifying anything.” I used its finding that `/api/next-request` lacked an open-status filter and reversed ID tie-break. I rejected a suggested ranking-helper extraction because the rule is small and the existing server is already the correct ownership boundary.

## Remaining work
No `requests.json` content change is included; `git status` shows no modification to it. All browser flows are manual and have no automated browser-test coverage. The recommendation-error path currently exposes raw `error.message` text (`Failed to fetch`) rather than the friendlier `showError()` wording. The reason text is the same for every recommendation, including no-tie cases; it is accurate but could be more specific about the decisive tie-break. No persistent database, authentication, external AI service, or deployment work was added.
