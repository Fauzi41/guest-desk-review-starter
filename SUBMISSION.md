# Guest desk handoff

## Decision
Kept the existing server, API, and browser architecture. Changed the recommendation logic in `server.js` so only open requests are eligible, with urgency, oldest `createdAt`, and ascending ID ordering. Added API regression tests in `test/server.test.js`.

Improved the “Handle next” panel in `public/index.html`, `public/app.js`, and `public/style.css` to show the guest, room, and urgency. Urgency is rendered as a badge with red urgent, blue normal, and gray low styling.

## Why
The original recommendation endpoint could return a resolved request and used descending request IDs for exact timestamp ties. The requirement calls for existing open requests only and ascending request IDs. The UI also did not show guest and room context in the recommendation panel, so that context was added without changing the API contract.

## How I checked
Ran `npm test`; all 6 tests passed.

Browser verification was performed against clean local instances on ports 43212, 43213, and 43214. Verified that:

- The initial recommendation displayed Jules, Room 310, and urgent.
- The recommendation reason displayed “Open urgent request; oldest at this urgency.”
- Handling the recommendation loaded the next recommendation and displayed a success status.
- The All requests and Handled filters displayed the expected request groups.
- The urgent badge and normal badge rendered in the recommendation panel.

The low badge styling was implemented in `public/style.css` but was not separately observed in the browser.

## Working with AI
AI-assisted review identified the recommendation filtering and tie-breaking defects. The implementation was checked with focused API tests and local browser verification before being recorded here.

## Remaining work
The worktree still contains a pre-existing formatting-only modification to `requests.json`; it was preserved and not included in the requested implementation changes. No persistent database, authentication, external AI service, or deployment work was added.
