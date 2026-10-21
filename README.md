# Common Ground

Common Ground is a desktop 3D office where visitors can explore rooms, meet other candidates, choose a role, and complete a chat-based application. The world includes live visitor avatars, ambient characters, lounge seating, job desks, and a shared information area.

## Run locally

Requires Node.js 20.19+ or 22+.

```bash
git clone https://github.com/mayank12-dotcom/c24-playground.git
cd c24-playground
npm ci
npm run dev
```

Open the address printed by the development server, normally `http://localhost:4173`. The development server runs the website and visitor API together. Visitors using that server share movement and seat occupancy. `npm run build` creates the production frontend in `dist/`; `npm run preview` serves only the static frontend and uses local characters instead of shared visitors.

## Explore the office

The world fills the desktop screen, with navigation along the top, movement and zoom controls at the left, and the opportunities button at the right. The opportunities panel can be opened while seated. Choosing a role walks the visitor to its chair; the job description appears after they sit. Apply starts a scripted chat, and answers remain in the current browser.

The office has connected work lounges, social rooms, and an information room. Visitors can sit on available job chairs, couches, armchairs, beanbags, and ottomans. Bots walk, talk, play table tennis, and occupy some seats. The Product Manager recruiter can be challenged nearby: **J** punches, **K** kicks, and **L** performs a close-range choke slam after three landed strikes. **Esc** ends the encounter.

The scene is designed for viewports at least 1280 CSS pixels wide. Smaller viewports show a desktop-use notice.

## Controls

- **WASD** or **arrow keys**: walk.
- **Double-click** a clear place on the ground: walk to it. A single click does not move the character.
- **Mouse or trackpad drag**: turn the character and trailing camera.
- **Scroll** or use the zoom controls: adjust camera distance.
- **Space** near an eligible seated bot: push it from its chair and take the seat.
- **J**, **K**, **L** near the Product Manager recruiter: punch, kick, or choke slam when available.
- **Enter** in the application chat: send an answer. **Shift+Enter** adds a line.

Characters turn as they walk. Furniture, walls, bots, and other visitors are solid; steer around them when blocked. Approaching a free seat starts a smooth seating animation. Movement keys begin a gradual get-up before walking away.

## Shared visitors

Vercel functions need a shared Redis REST database to synchronize visitors and seat ownership across browsers. Set one complete server-side pair in the Vercel project:

```text
UPSTASH_REDIS_REST_URL=
UPSTASH_REDIS_REST_TOKEN=
```

The API also accepts `KV_REST_API_URL` and `KV_REST_API_TOKEN`. Keep these values server-side; never use a `VITE_` prefix or commit populated credentials. Without Redis, the world still runs with local characters and bots, but real visitors do not share their state between computers. See [DEPLOYMENT.md](DEPLOYMENT.md) for deployment setup.

## Scripts

```bash
npm run dev                 # Website and local visitor API
npm run build               # Production frontend build
npm run preview             # Preview static frontend output
npm test                    # Automated test suite
npm run export:standalone -- /absolute/path/output.html
```

The standalone export packages the client experience into one HTML file. It runs locally with bots; live visitors and shared seat ownership require the API and Redis service.

## Project structure

- `src/world.js`: 3D scene, movement, camera, characters, and seating.
- `src/garden-layout.js` and `src/garden-space.js`: rooms, paths, furniture, and scenery.
- `src/character.js` and `src/character-motion.js`: character mesh, rig, and animation.
- `src/presence.js` and `api/world.js`: visitor state and shared world API.
- `src/recruiter-combat.js`: Product Manager encounter rules.
- `src/crowd.js` and `src/fight-choreography.js`: ambient characters and their activities.
- `tests/`: automated behavior and integration checks.
