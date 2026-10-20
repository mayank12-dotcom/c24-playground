# Vercel deployment

The project is configured for Vercel: `npm ci` installs dependencies,
`npm run build` creates `dist/`, and `api/world.js` runs as a Node.js
function. No SPA fallback rewrite is needed; `/api/world` must remain an
API route. The function is not included in Vite's static build.

## Shared visitors and seats

Configure these server-side environment variables in the Vercel project:

- `UPSTASH_REDIS_REST_URL`
- `UPSTASH_REDIS_REST_TOKEN`

The function also accepts the integration aliases `KV_REST_API_URL` and
`KV_REST_API_TOKEN`. Use one complete pair. The example file contains only
variable names; never expose credentials through `VITE_` variables or
include a populated environment file in an export.

Use the same Redis database for every deployment intended to share the
same world. Separate preview and production credentials if those worlds
should remain independent. Redis is required because Vercel functions
cannot keep reliable shared state in process memory. Bots and the local
game can render without Redis; cross-browser visitor presence and shared
seat ownership require the connected service.

The user confirmed that no Redis resource is connected yet. To enable the
existing shared visitor system:

1. Install https://vercel.com/integrations/upstash in the Vercel account.
2. Create a Redis database and connect it to the project serving
   https://c24-playground.vercel.app/ with Production enabled.
3. Confirm the project receives one accepted complete environment-variable pair
   above. Use the HTTPS REST endpoint and standard read/write REST token; the
   synchronization script needs both reads and writes. A redis:// URL or
   read-only token will not work. Do not use a custom variable prefix unless
   the resulting names match one of the supported pairs.
4. Redeploy the project so the serverless function receives the variables.
5. GET /api/world should return HTTP 200 with status "shared" and storage
   "redis". Multiple visitors opening this deployment then use the same store.

Official integration instructions:
https://upstash.com/docs/redis/howto/vercelintegration
No further game-code or dependency change is required. The database is not
created or connected by this source package.

## Release procedure

When authenticated Vercel access is available:

1. Create or link a Vercel project with this directory as its root.
2. Add the Redis environment variable pair for the desired deployment
   environments.
3. Deploy the project. Vercel reads `vercel.json` and discovers the API
   function automatically.
4. Open the returned HTTPS URL and verify the actual deployment in two
   browser sessions. Check walking, approaching or selecting a job to sit,
   Apply and answering questions, visible visitors, seat occupancy, and
   the desktop notice below a 1280-pixel viewport.

The ordinary local command remains `npm run dev`. A Vite-only
`npm run preview` serves static production files; it does not execute
Vercel API functions.

## Current deployment status

The public GitHub repository is
https://github.com/mayank12-dotcom/c24-playground, branch `main`, connected to
Vercel at https://c24-playground.vercel.app/. Before the current fix, version 52
commit `9eda261f223a4c983325fd34d56f03efaa415303` received a successful Vercel
GitHub deployment status. The user subsequently reported that the site was not
running. Real Chromium reproduced an external Google Fonts CSS @import failure
that aborted Vite's CSS preload before the main world module started; a green
deployment status alone did not catch this browser startup failure.

Version 53 serves the original DM Sans and Space Grotesk families from four
local WOFF2 assets under `public/fonts/`, with their licenses. Its standalone
HTML embeds those font bytes along with all ten sounds. The remaining UI rules,
gameplay and shared API are unchanged. The release target is
`common-ground-v53-vercel.zip`, containing complete deployable source and fonts.
The font fix commit `b1bb3c137f13a5008136e66c500ed4b0dd38b75d` has a
successful Vercel GitHub status: "Deployment has completed." Dashboard:
https://vercel.com/mayank12-4351/c24-playground/9Lez4YJZteYmppQbwCskGnCd7Tv8.
The version 53 browser results in `design-qa.md` describe a separate local
production-build test. A local boot check does not establish public API
reachability or production Redis.

A production Redis connection has not been independently verified. Local tests
execute the actual production Lua script on an isolated Redis instance and
verify contention, ownership and combat relay. That does not prove the hosted
project has received its Redis credentials. Both the frontend and API must be
deployed for shared encounter poses and named visitors.

The following records describe earlier releases and direct-tool limitations:

The user independently deployed version 48 at
https://common-ground-v48-vercel.vercel.app/ and reports seeing another visitor
walking when testing on two computers. This has not been independently inspected
from the workspace. Version 49 adds a cached first-visit name dialog and named
visitor presence; the updated source package still needs deployment to that project.
Deploy both the frontend and `api/world.js` so names appear on other computers.
The existing Redis namespace and credentials remain compatible with older visitors.

Version 50 clarifies the navbar's shared-connection status. “Live visitors
connected” means the visitor API is returning shared snapshots. “Live visitors
unavailable” means that the client is in its local fallback and real candidates
cannot currently see one another through this connection. It retries automatically.
This status change does not provision or connect a Redis database.

Rechecked on 2026-10-19 for the version 48 office release. Direct Vercel
deployment was unavailable at that check; GitHub deployment status later confirmed the version 51 publication. Vercel CLI
64.5.0 is installed, but an authenticated deployment session is not available.
The current plugin discovery reports `DISABLED_BY_ADMIN` and
`NOT_AVAILABLE` for Vercel. The enforced network allowlist excludes Vercel;
automatic approval review rejected a request for additional network access
to check its API because that would bypass the allowlist. Do not retry by
bypassing the proxy or using another service as an indirect route.

The Vite build and serverless API configuration have been reviewed. Focused
presence, seating-presence, and office-layout checks pass. `.vercelignore`
excludes local rendering artifacts (including the large offline scene),
tests, tools, dependencies, output, documentation, and environment files.
The deployable source consists of `src/`, `public/`, `api/`, `index.html`,
the package manifest and lockfile, and the Vite/Vercel configuration.

Deployment needs permitted access to Vercel's website and API. Shared
visitor presence also needs the configured Redis integration described
above. The prepared files are not evidence of a live public URL.
