# Common Ground — version 51 handoff

Latest character update, 20 October 2026 (UTC): the user supplied a dimensional
3D mannequin reference and requested its form while retaining the white body
and black outline. Version 51 uses a larger spherical head, compact tapered
body, slimmer relaxed arms, rounded mitten ends and more exposed legs. This
latest form supersedes the older 2D-reference proportion numbers below. Keep
the existing tiny eyes, bald default, optional Fresh Look hair, recruiter ties,
movement and collision-safe seating. No stock-photo texture or external model
asset is used. The current actual-geometry preview is
`artifacts/character-reference-v51.png`; it is an offline render, not browser
verification. The prototype remains separate from the last user-run Vercel site.
The production build and persistent standalone exporter pass. Final character,
fight-motion, footfall-motion and emotion commands all exited zero on identical
before/after source hashes. Their first child-pipe reporter output was lost, so
`verification/version-51/core-verification-summary.json` labels the 46 cases as
declared, not a captured aggregate. A separate descriptor run captured footfall
12/12. Direct collision/shoulder reporters captured 23/23 and coordinator/export
54/54. See the latest QA section for selected actual-world results. The eight
preview poses were re-exported against final source and matched exactly. No
hands-on browser or new Vercel deployment is claimed.
Seven final actual-world cases also passed with unchanged source hashes,
covering all lounge cushions, five-sided chair transfers, both beanbag facings,
remote lowering, the nineteen-bot crowd, bot chair handoffs and a complete fight.
The selected world groups took roughly 13–14 minutes under concurrent CPU load;
run only relevant cases rather than assuming the historical full-suite timing.

GitHub migration completed on 20 October 2026 (Asia/Calcutta). The user approved
publishing the source in the public repository
https://github.com/mayank12-dotcom/c24-playground on branch `main`.
The initial import commit is `30aabec5c2f15e3dc2ff605fa6cf2080e512f79d`.
All 189 tracked project files were uploaded, including ten runtime audio assets,
the serverless API, all tests, source scripts, previews and this memory file.
A fresh checkout passed production compilation, API import and Git integrity
checks. Populated environment files, dependencies, build output, local tools,
portable ZIP/HTML exports and three regenerable geometry dumps are ignored.
The configured Git remote is `origin` at that repository. Source publishing does
not configure the Vercel database or publish a new version of the website.

Deployment access rechecked on 2026-10-19: Vercel plugin discovery still reports
`DISABLED_BY_ADMIN` / `NOT_AVAILABLE`, and the enforced network allowlist excludes
Vercel. Automatic approval review rejected an additional-network API check as an
allowlist bypass. No Vercel deployment was created or updated. A `.vercelignore`
now excludes large offline artifacts, credentials, tool state and other local-only
files. See `DEPLOYMENT.md` for the current release preparation and access blocker.
Use an authenticated deployment session when access becomes available; do not
recover old chat credentials or route around the enforced policy.

Snapshot date: 20 October 2026 (UTC). This file records project context for continuing the same chat from another device. Later user instructions take precedence over these notes.

## What to resume

The current prototype is **version 51**. Its character update is described above.
The latest multiplayer configuration state remains the version 50 state below. The user clarified that real candidates
on separate computers must see one another. The existing visitor API, Redis
store and remote-character renderer already implement that shared presence.
Independent read-only review found no concrete visibility defect. Vercel must
have one complete shared Redis environment-variable pair and the API source;
static-only hosting and the standalone HTML cannot share real visitors. Public
deployment inspection through the web tool was unavailable, so live Redis setup
and two physical computers have not been verified. The user subsequently
confirmed that Redis/Upstash is NOT connected. The next required step is to
install the Upstash integration in Vercel, create/link a Redis resource to this
project with Production enabled, and redeploy so the server receives credentials.
The current official setup guide is
https://upstash.com/docs/redis/howto/vercelintegration and its Vercel installation
link is https://vercel.com/integrations/upstash. Vercel integration discovery in
this workspace still reports DISABLED_BY_ADMIN / NOT_AVAILABLE; no database was
created or linked by the assistant. No additional game code/dependencies are
required for this step. Keep REST tokens server-side and out of chat.

Version 50 changes the misleading local-mode navbar label from “Explore at your
own pace” to “Live visitors unavailable,” with a clear hover explanation and the
existing automatic retry. A successful connection still says “Live visitors
connected.” This change does not create a database or prove the public deployment
is connected. All earlier prototype behavior remains. Version 50 passes 88 focused
checks across five files for connection status, named two-client movement/seating,
existing presence and seat coordination, and standalone export. The production
build passes; the full world suite and a live Redis/browser test were not run.

Version 49 added the name entry flow. On first desktop entry, a centered native
name dialog asks what to call the visitor before creating a world or publishing a
presence. `src/visitor-profile.js` stores the display name as a string under
`common-ground.visitor-name.v1` in localStorage. Returning visitors skip the popup;
denied storage falls back to memory for the current visit. Names support multiple
languages, collapse whitespace, remove controls/bidi overrides, and have a
32-Unicode-code-point limit. `src/name-prompt.js` handles focus, invalid submissions,
Escape, duplicate submits, modal background blocking, teardown and desktop resize.
The popup CSS is imported in main.js so production and standalone exports include it.

Main.js passes the saved name to `createWorld({playerName})` and
`createPresence({name})`. Real visitor labels show the name; the local player shows
`Name · YOU`. Labels use textContent and update without recreating characters.
Movement and seating requests retain the name; memory and Redis stores preserve
it while supporting old unnamed clients. Names never replace private visitor
credentials. All normal movement/seating/camera/bot/audio code and existing styles
remain unchanged apart from this entry/identity wiring.

Version 49 passes **113 focused checks across ten files**, covering name cache and
modal behavior, named two-client presence, existing presence/seat coordinator,
movement input/panels, and complete standalone export. Production compilation
passes. The full world suite was not rerun and no hands-on browser playtest,
hosted Redis test, or version 49 Vercel publication is claimed. The user reports
that they deployed version 48 independently at
https://common-ground-v48-vercel.vercel.app/ and can see another candidate walking
from two computers. Treat that as user-reported live behavior, not our browser
verification; do not start debugging visibility unless they clarify a problem.

Version 48 remains the office baseline. The user requested that the entire space look like one big office. A continuous 82-by-80 indoor floor now contains all eight departments/lounge/information rooms, broad halls, work desks, and shared recreation areas. Four low cutaway perimeter walls with inset windows enclose the office. Six new solid fixtures add a reception counter, café counter, printer and three storage units. Outdoor lawns, planting islands and perimeter trees are removed; indoor potted plants remain. Nine workstations, every doorway, all existing furniture/seat IDs and coordinates, all 47 public seats and all 19 ambient characters are preserved. New fixtures share exact renderer/collider dimensions and avoid existing routes.

The rendering pass uses shared smooth matte Lambert materials, warm #d6d2ca background/fog, sRGB/ACES color handling at exposure 1, and the existing single shadow-casting light. Static furniture outlines are removed; the white animated characters retain their own black silhouette, body, gait and hairstyles. Work tables have rounded rectangular oak tops within their original collider bounds. The neutral backing floor is 0.12 units below the new office floor to avoid coplanar flicker. Shared geometry/instancing stays lightweight at 46 office batches and 938 static instances. This follows verified source principles from the Plateforme10 reference, whose live appearance has not been visually inspected; it does **not** replicate its authored Blender texture bakes or claim an exact visual match. The player camera remains the established third-person view.

In version 48, all source UI HTML/CSS, original top navigation, right FAB/sidebar, sound controls and ten audio recordings remained unchanged from version 47. The permanent CSS export fix remains in use. Version 48 passed 128 focused automated checks across 14 files, including all 47 public-seat routes/transfers, all 19 bots, actual skin-safe chair contact and entry/exit, office fixture/wall geometry, shared occupancy, application/sidebar coordination and standalone CSS/audio/JS export. Production compilation and ZIP extraction/hash checks passed. The actual scene was reviewed in an offline geometry/material-color study. The complete world suite was not rerun; historical totals are separate. No hands-on browser playtest or assistant Vercel deployment is claimed.

Version 47 export repair remains intact. It repairs the exported navigation stylesheet, preserving the original pre-audio navigation design and the current sound control. Version 37 through version 46 standalone exporters used a semicolon-based regex to strip a Google Fonts import; semicolons inside its weight list caused a leftover `450;500;...` prefix and invalid CSS. PostCSS independently rejects the old export with `Unknown word 450` at line 23. This explains why restoring source CSS did not fix the exported prototype. The new persistent `scripts/export-standalone.mjs` parses CSS, retains complete font imports before other rules, and validates the actual exported stylesheet. Never use the old `/tmp/package-*.py` font-stripping code to generate a prototype again. The original cream top navigation, logo, colored buttons, source HTML/CSS, right FAB/sidebar and all audio remain. Version 47 passes 71 focused export/audio/panel/coordinator checks across four files, independently matches 17 parsed pre-audio navigation style rules, and passes the production build; hands-on browser testing and Vercel deployment are not claimed.

Version 46 seating remains intact. Walking into a free chair now starts automatic seating along its actual contact path, including side and back edges that missed the old tiny approach zones. A short 0.44-unit swept lookahead hands control to the safe entry before a walking hand or turn envelope reaches a solid backrest. It must hit the actual chair as the first obstacle along the intended line, and have a valid safe plan; walking parallel nearby stays free. No chair button or popup click is required. The existing planner chooses a clear route around the backrest/arms, keeps all structures and characters solid, aligns the feet, and gradually lowers the same character. The description opens only after the job-chair animation completes. Shared sofa contact selects the nearest free cushion; occupied seats retain their owners. Explicit destinations remain respected. Ordinary route cooldowns no longer delay actual chair contact after a ground route or completed departure; failed/cancelled claims retain their retry cooldown, and the just-vacated chair stays excluded until the user walks away. Version 46 passes 95 focused automated checks across six files, including 12 reported actual-world checks (five earlier world regressions plus seven new contact checks, counting the three side/back subcases). The production build passes. Final source fingerprints, per-run logs, standalone embedded assets/syntax, and ZIP restore integrity are included. The complete world suite was not rerun, and no hands-on browser playtest or Vercel deployment is claimed.

Preserve version 45's original interface restoration: full-width cream navigation fixed at the top, original colored navbar buttons, original yellow available-seats FAB with the original single-line count. Background music stays at 6% volume, and the sidebar/FAB keep their right edges aligned at 24px. Version 46 changes only the seating flow and its How to Explore explanation, with the original UI styling retained. Do not bring back version 44’s control restyling without a new request.

The prior navigation report now has an established export defect: the complete standalone CSS was malformed even though source/header substring and byte checks passed. Those earlier checks did not verify stylesheet syntax or live rendering. Version 47 adds actual exported-CSS parsing and preserves full font URLs. Version 45's 65 focused sound/panel/coordinator checks and original-design restoration are historical evidence, distinct from current seating checks. No hands-on browser/listening check or deployment is claimed.

The user supplied https://plateforme10-interactive-map.vercel.app/ as the exact desired **3D object/environment render style only**. The linked public repository https://github.com/Kirilbt/interactive-map was inspected: its main model uses four baked texture maps on MeshBasicMaterial, an orthographic camera, warm #d6d2ca background/fog, and sRGB/ACES rendering. Actual live rendered imagery and precise silhouettes/material finishes remain visually unverified. No reference-style migration has been implemented; keep the established UI, layout, white characters and behind-character camera while considering a future rendering pass. Source-based research evidence is separate from this portable game snapshot.

Version 42 made every free normally sittable furnishing usable: chairs, individual couch cushions, armchairs, beanbags, and ottomans across the lobby, work lounges, social rooms, and information room. The public seat catalog has **47 seats: nine job chairs plus 38 free lounge positions**. Thirty-four lounge positions are new; four free social beanbags already worked. The four companion-occupied social couch positions stay reserved and excluded from public claims. Preserve existing recruiters and all 19 ambient bots.

The same stable seat coordinates are shared by the local world, remote visitors, and both presence stores. Two-place sofas expose separate leases for each cushion. Furniture supports the established seated pose at a common 0.30-unit cushion plane, with front-edge anchors and solid backs, arms, feet, and rails. Entry takes the nearest clear reachable approach; seated visitors retain arm/knee clearance, and a finer route search handles narrow seat approaches only when the normal search fails; getting up keeps its planted-foot delay and collision-safe departure, holding the lease until the visitor is clear. Relaxing on furniture does not open a job description; application chairs retain their existing sidebar flow. The job FAB counts jobs rather than lounge positions.

Version 42 release verification: **215 focused checks across 17 test files passed**, including 19 selected actual-world checks. All 34 new seats have clear lobby routes, all nine shared sofas pass paired-body checks, and representative entry/exit and occupied-neighbor transfers pass actual skin/sole checks. The final production build, exact-byte HTTP delivery, all ten audio decodes, standalone inline JavaScript/audio validation, and ZIP restore integrity passed. The complete world suite was not rerun; no hands-on browser playtesting or Vercel deployment is claimed. Continue from the existing project rather than rebuilding it.

Preserve version 41's four-variation fight-impact pool: three sampled punch WAVs and the existing click WAV. Contacts follow actual visible, collision-paused punches and kicks; volume fades continuously with actual player distance, independent of the camera. Sound on/off also governs background music, footsteps, dismissal whooshes, and button clicks. All ten runtime audio assets remain. Version 51 supersedes version 36's proportions while preserving its smooth white skin and joined shoulder/arm surface, and the character **keeps walking while smoothly changing direction** as requested in version 35. Do not restore version 34's forced stop before turning.

This is a local source snapshot, not a new Vercel deployment. A historical public URL mentioned in the chat is https://flatland-nu.vercel.app/; its current contents and version have not been verified here.

## Files in the portable ZIP

The version 51 release targets are `/workspace/common-ground-v51.html`,
`/workspace/common-ground-v51.zip`, `/workspace/common-ground-v51-MEMORY.md`, and
the lean `/workspace/common-ground-v51-vercel.zip`. The full portable ZIP extracts
to `common-ground-v51/`; the Vercel ZIP contains the project files at its root.
Current export integrity is checked against the included SHA256 manifest.
The full portable project root contains:

- `MEMORY.md`: these continuation notes; read this before the historical notes.
- `prototype.html`: standalone runnable solo prototype, with ten runtime audio assets embedded: background music, four footfalls, dismissal whoosh, button click, and three punch samples.
- `src/`, `api/`, `public/`, `tests/`, `scripts/`: editable application source, shared-world API, viewport guard, checks, and optional offline render helpers.
- `package.json`, `package-lock.json`, `index.html`, `server.mjs`, `vite.config.js`, `vercel.json`, `.env.example`: install, run, build, and deployment configuration.
- Build output and dependencies are omitted; run `npm ci` and `npm run build` after extraction. A static `dist/` alone does not execute `api/world.js`.
- `README.md`: detailed current functionality and source map.
- `DEPLOYMENT.md`: Vercel and Redis setup; its environment-specific access notes describe the original workspace, not necessarily the next device.
- `design-qa.md`: chronological evidence and previous iterations. The version 51 character section and this file describe the latest change; the version 42 all-furniture seating section and the version 41 spatial-fight section and version 36 shoulder section remain relevant audio/character context. Older sections contain superseded requirements.
- `artifacts/office-v48-preview.png`: an offline still study exported from the actual world, including all nine real desk/recruiter scenes. It verifies geometry and material colors with an inspection renderer; it is not a browser screenshot or a runtime lighting match. Regenerate with `node scripts/preview-office.mjs` and the existing Blender render helper. Its 114 MB intermediate JSON is intentionally omitted.
- `artifacts/furniture-seating-v42-preview.png` and its report: eight offline actual-mesh furniture/occupant views. Regenerate them with `scripts/preview-furniture-seats.mjs` and `scripts/render-characters.py`; the large raw export and render caches are omitted.
- `artifacts/`: the current character reference render/report, historical shoulder comparison and character baseline, relevant room/color renders, and `footstep-sampling-report.json`, `dismiss-sampling-report.json`, `click-sampling-report.json`, and `fight-sampling-report.json`. Historical generated previews and render caches are omitted from this portable ZIP.
- `verification/version-51/`: current focused character/motion/furniture/coordinator/export results and source fingerprints. Earlier reports remain historical; do not treat previous totals as a current full-suite rerun.
- `PACKAGE-CONTENTS.md` and `SHA256SUMS`: export scope and integrity information.

Dependencies, credentials, browser state, and machine-specific tool state are excluded. Original reference images were supplied in the chat; the user's `/Users/mynk/...` paths are not files on a new device. Runtime characters and scenery are procedural and do not require those images to run.

## Run and edit on another device

Use Node.js 20.19+ or a supported 22+ version; the verified workspace used Node 24.19.0. In the extracted project root:

```bash
npm ci
npm run dev
```

The local server normally listens on port 4173 and serves the frontend plus `/api/world`. Use the address printed by that server. `localhost` refers to the machine running it; `terminal.local` was an old, unusable preview address and should not be reused as a public link.

```bash
npm run build
```

This regenerates `dist/`. `npm run preview` and `npm run dev:static` serve static/frontend-only modes, without the shared presence API. The standalone HTML also runs in solo mode.

No install is needed to inspect the standalone HTML in a desktop browser with WebGL support. The original Google Fonts load when network access is available, with system font fallbacks offline. Scripts, CSS rules, world geometry and all ten audio assets are embedded. Regenerate an export with `npm run export:standalone -- /absolute/output.html`; the exporter validates the actual bundled stylesheet and audio. Source development still requires the Node dependencies. Offline Blender previews are developer aids, not runtime dependencies.

## Product concept and current layout

Common Ground is a lightweight, actual 3D hiring world set in one large office. A visitor explores as a white cartoon character, approaches a recruiter and laptop table, sits, reads a job description, clicks Apply, and answers scripted questions in a sidebar. Nine fictional roles and browser-local applications demonstrate the flow; nothing is submitted to a real employer or AI service.

The spatial reference is Gather's virtual-office room layout, with the established visual language retained. It does not copy Gather's functionality. The current world has eight connected rectangular rooms: five work lounges containing nine job desks, two desk-free social rooms, and a Class 24 information room. Straight corridors and a shared arrival lobby link 20 doorway openings. Fifty-two solid low cutaway wall segments leave the third-person view clear. Colored furniture, rugs, beanbags, plants, lawns, and trees prevent an all-white/green scene. Rooms are varied but deterministic so visitors share a consistent physical plan. Version 48 joins them with one indoor office floor and cutaway exterior walls; old lawn/island/tree exports remain empty only for compatibility.

The information room contains five nearby clickable exhibits with short **dummy paragraphs**. The user deferred real organization content; do not assume it should be replaced with CARS24 or other researched copy without a new request.

## Current behavior to preserve

### Movement and camera

- WASD or arrow keys walk in camera-relative directions. The body rotates smoothly toward the requested heading **while movement continues**, including corners and reversals. There is no heading-angle stop.
- A 0.12-second speed ramp applies only when starting from rest. Direction changes preserve walking speed. Normal speed is 2.25 world units per second; body turn rate remains 8.
- Double-click/double-tap a clear ground coordinate to walk there. A single ground click does not move the character. Keyboard input cancels an automatic route.
- Walking follows the requested line and verified next-waypoint segments; do not introduce untested curved corner cuts through furniture.
- Furniture, walls, bots, recruiters, and real visitors are solid. A collision stops the full step with a small bump; manual walking does not slide automatically along an object. The visitor steers aside or backs away.
- The camera follows from behind with a gradual turn after sustained travel, capped at 25 degrees per second. Character direction changes do not snap the camera. Each held keyboard gesture captures a stable input basis so camera rotation does not bend its path.
- Mouse/trackpad dragging has inverted horizontal control. Zoom stays bounded between follow distances 8 and 24.

### Chairs, opportunities, and chat

- Every free chair, couch cushion, armchair, beanbag, and ottoman accepts a smooth automatic sit on approach or actual chair contact, without a click. Side/back contact takes a clear route around solid structures; sofas choose the nearest free cushion. Clicking a nearby job label or choosing a role also routes to its application chair. A single click on empty ground still does not walk.
- The 34 additional lounge positions comprise 11 arrival-lounge seats, 17 work-lounge seats, four information-room sofa positions, and two social-room ottomans. Together with the four existing free social beanbags, they make 38 free lounge positions and 47 public seats including the nine job chairs. The four NPC-occupied social couch seats remain reserved. Shared sofas have separate claimable cushions.
- Lounge seats show only the settled-in notice after arrival, without a job sidebar or ghost application. The opportunities FAB remains a count of available jobs. Coffee tables, desks, shelves, and other non-seating scenery stay solid.
- Entry compares complete reachable paths, including valid escape/gate combinations, instead of assigning a fixed left/right side. A visitor already safely in front uses the short centered transfer. Backrests and desks can require a side approach.
- Exits consider the next selected role, floor destination, or keyboard direction. Front departures are allowed only when clear and outside the normal seat turning footprint; a desk can require going around a side. When people block every exit, the visitor waits on a furniture-clear route that can reopen when they move.
- A short table-facing lateral/backward support step in the narrow chair lane is intentional. It differs from ordinary free walking and preserves physical foot/furniture clearance.
- Lowering, getting up, and departures remain collision checked. A roughly 0.75-second rise shifts weight over planted feet. The chair lease remains held until the visitor is physically clear; blockers pause the transfer.
- The job description opens only after visible seating completes. Passing a desk does not open the sidebar. Only the nearby desk's designation label appears; company captions and distant designation labels are removed.
- Closing the sidebar leaves the visitor seated and preserves the current chat/draft. The bottom nudge reopens it. All opportunities/Explore opens the roster without leaving the chair. Choosing another role automatically gets up and walks to that chair; a later navigation request supersedes an earlier queued destination.
- Movement keys while seated close the job window and begin the delayed get-up. Text fields retain ordinary typing and caret controls.
- Apply starts a scripted chat. Enter sends; Shift+Enter inserts a newline. Saved applications use browser localStorage key `meetspace-applications-v1`.
- One deliberate Space press or Push action can displace a bot occupying a job chair. The bot tumbles, pauses, recovers, and walks away; the visitor waits until clear before sitting. Real visitors cannot be pushed out of chairs.

### Characters and ambient life

- Body materials are pure white with a black outline, following the latest dimensional 3D mannequin: a large spherical head, low dot eyes, compact tapered torso, slim relaxed arms/plain mittens, exposed smooth legs, and small rounded soles. Defaults are bald; Fresh Look changes only the visitor's optional hairstyle. Recruiters wear ties.
- Keep the continuous shared skin and 15-bone rig. White skin uses 6,784 vertices/13,564 triangles; skin plus outline stays under the existing 30,000-triangle budget. Do not restore separate muscular blob limbs.
- Motion uses actual displacement, articulated hips/knees, planted support feet, lifted swing feet, and counter-swinging arms. Shared seated hip height is 0.485, keeping the body above the 0.30 cushions. Preserve the small arm tuck and tumble floor support correction.
- Preserve all 19 ambient bots: 3 walking, exactly 2 fighters, 3 spectators, 4 table-tennis players, 3 job-chair occupants, and 4 couch companions. Only two fight. Their encounter includes bumping, punches, a push/fall, brief low kicks, recovery, reddish reactions, and symbol-only speech clouds. Do not remove other bots to create the fight.
- Social rooms have seated couch/beanbag conversations without job desks or laptops. The visitor can join the audience or use free lounge seats.

### Screen layout

- The world fills the desktop viewport. The top navigation is full width with no top/left/right outer gap; How to Explore lives there.
- **Available-seats FAB: rightmost/bottom right. Zoom controls: leftmost.** Earlier left-FAB requests were superseded.
- The job/chat window floats beside the canvas.
- Minimum viewport width is 1280 CSS pixels. Below it, show exactly: `Please use desktop for a better experience.` A separate small-screen product page has not been built.
- No bot labels above ordinary characters and no bot-count/solo-review marketing caption. Intentional conversation/fight speech clouds remain.

### Background music and synchronized footsteps

- The existing funny-cartoon background track remains `public/audio/background.mp3`: 3:08, 96 kbps, 2,254,515 bytes. Music uses one looping HTML audio element at 6% volume, created only after a real desktop interaction. The standalone embeds the same compressed copy.
- Version 38 adds four concrete-footstep variations from `freesound_community-concrete-footsteps-1-6265.mp3`. `public/audio/step-1.wav` is 0.300 s / 13,274 bytes / source start 0.298542 s; `step-2.wav` is 0.320 s / 14,156 bytes / start 1.641542 s; `step-3.wav` is 0.300 s / 13,274 bytes / start 4.136833 s; `step-4.wav` is 0.340 s / 15,038 bytes / start 6.088125 s. Combined size: **55,742 bytes**.
- All four samples are mono 22,050 Hz PCM16 WAV, peak 0.419983 (−7.535 dBFS), with a 0.8 ms attack fade, 35 ms tail fade, zero-valued first/last PCM samples, and contact onset under 2 ms. They preserve distinct natural contacts, with no synthetic pitch change or time stretching. Measurements are in `artifacts/footstep-sampling-report.json`.
- Footsteps follow only the local player's actual animated swing-to-stance contacts. They are driven by the same movement/gait state, not a wall-clock loop, so cadence follows actual movement speed and stays consistent across frame rates. Idle, fully collision-blocked movement, seating transfers, and fight poses emit no footfalls. Other characters remain silent walkers. Do not change the white character mesh or gait to fit a fixed audio timer.
- The full-width navigation now has **Sound on/off** controlling music, steps, dismissal effects, button clicks, and fight impacts together. Preserve the legacy `common-ground:music-enabled` preference rather than resetting saved mutes. It is separate from application answers. Storage denial is harmless, and a first interaction that mutes never briefly starts sound.
- Footsteps use one reused Web Audio context at 40% gain (normalized impact peaks remain below 0.17), with local sample fetching and decoding deferred until a real eligible interaction. This supersedes version 37's statement that the world needs no Web Audio context. Music continues using its HTML audio element; no audio library or external service is required.
- Synthetic events, modifier/shortcut/repeated keys, toggle keydowns, and typing into editable fields do not independently unlock sound. Explicitly enabling sound is a start gesture.
- Mute, hidden tabs, page suspension, and widths below 1280 pixels stop active footstep sources and pause music. An eligible return resumes only previously unlocked music. Foot contacts from suspension, mute, or pending decoding are discarded; never queue a backlog that plays on return. Late async work must recheck eligibility before playback.
- Conversation clouds remain silent. Version 41 adds punch/kick impact effects and supersedes prior statements that fights have no audio; versions 37–40 audio remain.

### Deliberate popup/sidebar dismissal audio

- Version 39 samples `oxidvideos-transition-sfx-whoosh-sound-effect-407576.mp3` into `public/audio/dismiss.wav`: **0.729977 seconds, 32,236 bytes, mono 22,050 Hz PCM16**. Source range 0.022–0.752 seconds retains 99.999878% of source energy, including the full useful whoosh and decay. No time stretching or synthetic pitch changes are used.
- The sample has peak 0.419983 (−7.535 dBFS), a 2 ms attack fade, a 35 ms tail fade, zero first/last PCM samples, onset above 0.001 at 2.222 ms, and onset above 0.01 at 6.122 ms. Measurements and full-decode validation are in `artifacts/dismiss-sampling-report.json`.
- Sound follows only deliberate visible user dismissals: opportunity/job/chat/Class 24 sidebar X, FAB, Escape, or Class 24 navigation; Help X, toggle-close, or Escape; bot challenge X or Escape; and explicit Leave table. Programmatic seating/navigation/lifecycle closes, opens, hidden repeated closes, and toast expiry remain silent.
- One original DOM event closing several windows emits one whoosh. The dismissal instance allows at most one active voice and plays at natural pitch with 40% gain. Do not add a dismissal sound to every generic hide or timer callback.
- `src/sample-audio.js` is the common short-sample engine, reused by `src/footstep-audio.js` and the separate dismissal instance in `src/main.js`. This is implementation reuse, not a new fixed walking timer. Footsteps retain actual animated contacts and their existing quiet-state suppression.
- The same Sound on/off control and legacy `common-ground:music-enabled` preference govern all audio. Effects fetch/decode lazily after a real eligible gesture, reuse their contexts, stop on mute/hidden/pagehide/sub-1280px, and never replay stale or not-yet-ready dismissals later. Music retains its HTML audio element. No runtime dependency or external audio service was added.

### Shared button-click audio

- Version 40 samples `matthewvakaliuk73627-mouse-click-290204.mp3` into `public/audio/click.wav`: **80 ms, 3,572 bytes, mono 22,050 Hz PCM16**. The 0.043–0.123-second source slice preserves one natural down/up click pair and its useful decay, excluding a later separate click. Do not play multiple source click pairs for one button action.
- Peak is 0.419983 (−7.535 dBFS), attack fade 0.4 ms, tail fade 8 ms, endpoints zero, onset above 0.001 at 0.272 ms and above 0.01 at 3.537 ms. No pitch shift or time stretching. Full decoding and waveform measurements pass; evidence is `artifacts/click-sampling-report.json`.
- `src/button-audio.js` delegates document capture to enabled visible buttons inside the app. Dynamic/sidebar buttons, nested icon targets, and keyboard activation share the same behavior. Background/non-button/disabled/outside-app/synthetic activations remain silent; there is no canvas walking-click sound.
- The existing Sound on/off state and legacy `common-ground:music-enabled` preference govern button audio alongside music, steps, and whooshes. Clicking Sound off is silent; clicking Sound on may play its short click after the enabled state changes. Close buttons produce the short click plus the existing single dismissal whoosh.
- The controller reuses `src/sample-audio.js`. Only the latest first click may wait up to 150 ms for readiness. Mute, hidden tabs, pagehide, the sub-1280-pixel guard, and disposal clear pending intent; no stale click burst replays later. The shared generic sample engine remains lazy and gesture-driven.
- World, gait, character mesh, camera, and seating logic are unchanged by this feature. Preserve actual-foot-contact synchronization and all earlier lifecycle suppression.

### Spatial fight-impact audio

- Version 41 represents all four supplied recordings: `freesound_community-punch-2-37333.mp3` → `public/audio/fight-1.wav` (0.329977 s, 14,596 bytes, source 0.3745–0.7045 s); `universfield-punch-03-352040.mp3` → `fight-2.wav` (0.380 s, 16,802 bytes, source 0.3695–0.7495 s); `universfield-punch-140236.mp3` → `fight-3.wav` (0.400 s, 17,684 bytes, source 0.173–0.573 s). The fourth `matthewvakaliuk73627-mouse-click-290204.mp3` upload exactly matches the prior source hash, so reuse existing `click.wav` (0.080 s, 3,572 bytes) as the lighter variation.
- Three new assets total **49,082 bytes**; the four-variation pool totals **52,654 bytes**. The punch WAVs use mono 22,050 Hz PCM16, peaks near 0.5 (−6.021 dBFS), 0.5 ms attack and 35 ms tail fades, and zero endpoints. Main contact onset is 1.361 / 0.771 / 0.499 ms. No pitch change or time stretching. Full pool decoding passes. Report: `artifacts/fight-sampling-report.json`.
- `src/fight-impacts.js` emits six contacts per visible 24-second encounter: punches at 5,150 / 6,150 / 7,150 / 8,150 ms, kicks at 10,975 / 12,175 ms. It follows the actual collision-paused choreography rather than an independent wall clock. A frozen hit emits once; far, muted, loading, or resumed playback never replays missed contacts.
- `src/fight-audio.js` randomly chooses one of four natural-pitch samples per emitted contact, without an immediate repeat. The common `src/sample-audio.js` adds random selection and `setVolume` support while preserving other audio behavior.
- Distance uses actual player position and the actual fighters' midpoint, not camera position. Full gain is 0.45 within three world units; smoothstep fades it continuously to zero at ten units, with roughly 80 ms gain ramps. Frame updates continue during movement and paused choreography, so an active impact fades as the player approaches/leaves. Do not replace this with a binary near/far toggle.
- The shared Sound control still mutes all layers, and normal gesture/lifecycle protections remain. Character mesh, gait, and physics are unchanged; `world.js` adds only an audio frame hook. Conversation clouds remain silent. Version 41 supersedes old fight-silence notes.

## Source map for the next change

| Area | Files |
| --- | --- |
| Walking intent, smooth facing, camera, launch ramp | `src/third-person.js` |
| World ticks, navigation/seating coordination, scene/crowd | `src/world.js` |
| Shortest safe chair gates/departures, sole/structure checks | `src/seat-transition.js` |
| Controlled lowering and rising | `src/seat-entry.js`, `src/seat-exit.js` |
| Solid movement and reachable routes | `src/collision.js`, `src/character-collision.js`, `src/navigation.js` |
| Character geometry, rig, hair/tie | `src/character.js` |
| Grounded walking, sitting, falls and gestures | `src/character-motion.js`, `src/character-emotion.js` |
| Room plan, doors, walls, furniture | `src/garden-layout.js`, `src/garden-space.js`, `src/station-layout.js`, `src/lounge-layout.js`, `src/social-layout.js` |
| Authoritative lounge cushion anchors and furniture structure profiles | `src/furniture-seats.js`, `src/seat-catalog.js`, `tests/seating-presence.test.js` |
| Ambient bots, fighting, tennis, lounges | `src/crowd.js`, `src/fight-choreography.js`, `src/cozy-space.js`, `src/social-space.js` |
| Sidebar, roster, application lifecycle | `src/main.js`, `src/application.js`, `src/panels.js` |
| Shared sound toggle, background track, persistence, lifecycle | `src/background-music.js`, `src/main.js`, `public/audio/background.mp3`, `tests/background-music.test.js` |
| Local foot-contact events and sampled walking sound | `src/character-motion.js`, `src/world.js`, `src/footstep-audio.js`, `public/audio/step-1.wav` through `step-4.wav`, `tests/footstep-audio.test.js`, `tests/footfall-motion.test.js` |
| Shared sample engine and visible dismissal triggers | `src/sample-audio.js`, `src/main.js`, `src/panels.js`, `src/application.js`, `src/bot-challenge.js`, `public/audio/dismiss.wav`, `tests/sample-audio.test.js`, `tests/panels.test.js` |
| Shared enabled-button click handling | `src/button-audio.js`, `src/sample-audio.js`, `src/main.js`, `public/audio/click.wav` |
| Visible fight contacts and continuous player-relative audio | `src/fight-impacts.js`, `src/fight-audio.js`, `src/sample-audio.js`, `src/main.js`, `src/world.js`, `public/audio/fight-1.wav` through `fight-3.wav`, existing `public/audio/click.wav` |
| Replaceable Class 24 dummy content | `src/info-content.js` |
| Shared visitors/leases and API | `src/presence.js`, `api/world.js`, `server.mjs` |

Version 36 smooths the upper torso/arm union and rounded armpit cut, blends shoulder weights more gradually, and adds four local sampling rows. Tests require actual surface coverage across the former high slit, lower arm separation, and stable skin/outline through active poses. The before/after actual-geometry sheet is `artifacts/shoulder-smoothing-v36-preview.png`.

Version 34 added nearest safe chair routes and a turn-before-walking stop. Version 35 removed only the forced heading stop, kept the initial launch ramp, retained smooth body/camera turns, and updated checks accordingly. The earlier white character rebuild (version 33) and room layout (version 32) remain.

## Verification and limits

The prior version 36 production build and **299 automated checks across 27 files passed**, including all 50 original world scenarios and 249 checks in the other 26 files. The world assertions ran in four disjoint name-pattern groups with progress-only callback logging; no assertions were changed. All 61 source/test/API fingerprints stayed unchanged through that verification. The initial serial world run exceeded its 440-second test budget in the restored workspace. The successful grouped run covered every original case exactly once. Evidence, grouping metadata, and the progress harness are included in `verification/`. These are baseline results, not a claim that the complete suite was rerun after adding audio.

Historical version 37 verification passed **62 focused checks across four files**: 19 background-music, 27 main-coordinator, 3 movement-input, and 13 third-person cases. Audio checks cover lazy loading, trusted gesture filters, one reusable looping track, volume limits, mute persistence/capture ordering, denied storage, rejection/retry, hidden/page/viewport pauses, pending playback races, and disposal. The production build passes with the existing nonfatal chunk-size warning. Full-track MP3 decoding also passes; the runtime asset measures 2,254,515 bytes, 187.846531 seconds, stereo 44.1 kHz, 96 kbps. Local HTTP checks pass for the production page, byte-identical `audio/mpeg` delivery (200), and a matching 1,024-byte range (206). The standalone HTML embeds a byte-identical copy of the runtime track and passes inline JavaScript syntax validation. The ZIP restores with all 138 exported file hashes matching; its integrity manifest and the prior baseline are included. Do not invent a combined full-suite pass count. Audible playback and browser-autoplay behavior have not been manually verified in a browser here.

Historical version 38 verification passed **130 focused checks across nine files**: 22 footstep-audio,
12 footfall-motion, 30 main-coordinator, 21 character, 6 fight, 19 background-music,
3 movement-input, 13 third-person, and 4 actual-world cases. Coverage includes real contact
phases, actual movement cadence across speeds/frame rates, idle and blocked
silence, seating/fight suppression, lazy audio startup, shared mute/lifecycle
handling, retained white-character movement, and coordinator forwarding. The
production build passes. Full decoding succeeds for the existing music and all
four WAVs. Production HTTP checks return the index and all five byte-identical
audio assets with status 200, plus correct range delivery with status 206. Sample
validation confirms mono 22,050 Hz PCM16, onset under 2 ms, matched −7.535 dBFS
peaks, and zero-valued endpoints.

The four actual-world cases include two new footstep scenarios and two existing
world regressions; all four pass. Implementation and focused testing are complete.
All five audio assets are embedded byte for byte in the standalone, and its inline
JavaScript passes syntax validation. The archive restores with all 155 exported
file hashes matching. Historical version 36/37/38 totals are not a current version 39 full
suite rerun. Browser listening and hands-on autoplay testing remain unavailable;
no Vercel deployment is claimed.

Historical version 39 verification passed **110 focused checks across seven files**: 11 application,
19 background-music, 8 bot-challenge, 22 footstep-audio, 36 main-coordinator,
5 panel, and 9 generic sample-audio cases. Coverage includes deliberate visible
dismissal paths, silent automatic/hidden closes, one sound for an original event
closing several views, one active natural-pitch whoosh, retained footsteps,
shared sound preference, and lifecycle handling. Production compilation passes.
All six audio assets decode fully. Production HTTP checks return the index and
all six audio assets with exact bytes and status 200; byte ranges pass with 206.
World, character, gait, and camera source are unchanged from version 38.

The standalone embeds all six audio assets byte for byte and passes inline
JavaScript syntax validation. The archive restores with all 158 file hashes matching. Version 36/37/38 results are historical, not a current full-suite
rerun. Browser listening remains unavailable; no Vercel deployment is claimed.

Historical version 40 verification passed **102 focused checks across five files**: 19 background-music,
14 button-audio, 22 footstep-audio, 38 main-coordinator, and 9 generic sample-audio
cases. Coverage includes enabled visible button targeting, dynamic/icon/keyboard
activation, shared sound ordering, bounded first-click readiness, lifecycle
cancellation, retained footsteps, and coordinator integration. Production build
passes. All seven audio assets decode fully; production HTTP checks return the
index and all seven audio assets with exact bytes and status 200, and byte-range
responses match with status 206. World, gait, character, camera, sample engine,
footstep wrapper, application, panels, and bot-challenge source match version 39.

The standalone embeds all seven audio assets byte for byte and passes inline
JavaScript syntax validation. ZIP restoration verifies all 161 exported file hashes. Historical version 36/38/39 counts are not a current
full-suite rerun. Browser listening and hands-on interaction verification remain
unavailable; no version 40 Vercel deployment is claimed.

Historical version 41 verification passed **143 focused checks across eight files**: 19 background-music,
14 button-audio, 16 fight-audio, 13 fight-impact, 22 footstep-audio,
40 main-coordinator, 17 generic sample-audio, and 2 actual-world encounter/pause
cases. Coverage includes exact contact times, held/paused-hit deduplication,
missed-event suppression, no-repeat randomness, continuous player-distance gain
and ramps, shared mute/lifecycle behavior, and actual-world observer forwarding.
The production build passes and includes final source revisions. All ten audio
files decode fully. Production HTTP checks return the index and all ten assets
with exact bytes and status 200; byte-range responses pass with status 206.
Mesh, gait, camera, choreography, crowd, application, panel, and bot-challenge
source match version 40; world changes add a read-only audio observer.

The standalone embeds all ten audio assets byte for byte and passes inline
JavaScript syntax validation. ZIP restoration verifies all 175 exported file hashes. Historical version 36/38/39/40 counts are not a current full-suite
rerun. Browser listening remains unavailable; no Vercel deployment is claimed.

World integration checks run actual scene geometry, rigs, movement, seating, and coordinator ticks with GPU/DOM boundaries supplied by a Node fixture. They cover immediate/continuous turns, exact routes, walls, other bodies, sidebar timing, queued navigation, nearest chair access, bot handoffs, and actual skin/furniture clearance through five chair approaches, departures, and post-exit walking turns. Keep the existing 4 mm furniture-contact tolerance and absolute 0.24 deformation-edge limit; do not loosen these to silence a failure.

To run meaningful per-case checks, use direct Node execution for individual files:

```bash
node tests/background-music.test.js
node tests/sample-audio.test.js
node tests/button-audio.test.js
node tests/fight-audio.test.js
node tests/fight-impacts.test.js
node tests/panels.test.js
node tests/footstep-audio.test.js
node tests/footfall-motion.test.js
node tests/third-person.test.js
node tests/shoulder-surface.test.js
node tests/seat-transition.test.js
node tests/seating-presence.test.js
node tests/world-transition.test.js
```

The complete world file took about 140 seconds in the original workspace but exceeded seven minutes in the restored environment because each isolated VM reconstructs the scene. Final version 36 verification used four disjoint groups; see `verification/world-shards.json` and `verification/world-progress-harness.mjs`. Run all files in separate processes for the complete suite, for example:

```bash
for file in tests/*.test.js; do
  node "$file" || exit 1
done
```

`npm test` is present, but the original environment's default `node --test` isolation sometimes reported file-level wrapper counts. Check real per-case counts before claiming coverage.

The included character/room images are offline actual-geometry renders, **not browser screenshots**. Hands-on browser playtesting was not available in the original workspace. Do not claim visual/interactive browser verification from math or CPU checks. The production bundle has a nonfatal Vite chunk-size warning; compilation still succeeds.

## Presence, deployment, and portable state

- The standalone HTML and static-only preview have bots and local chats, but no cross-computer shared visitors.
- `npm run dev` includes the local visitor API. Vercel requires the included `api/world.js` plus configured server-side Redis REST credentials: `UPSTASH_REDIS_REST_URL` and `UPSTASH_REDIS_REST_TOKEN`, or the documented `KV_REST_API_*` aliases. Never put these in `VITE_` variables.
- Source/API/store checks cover the expanded lounge catalog; Redis request serialization is checked, but a configured live Redis service and current Vercel multiplayer were not verified. No version 42 deployment is claimed. Old access/network restrictions may differ on the next device, so inspect capabilities then.
- No credential or populated environment file is included. Do not recover or reuse a token from earlier chat text; use an authenticated deployment session if deployment becomes the next authorized task.
- The ZIP transfers the project, **not** browser localStorage, saved answers/drafts, remembered mute preference, anonymous session credentials, live visitors, seat leases, or in-memory bot-defeat state. Those are not synchronized by this export.
- Continuing the same chat does not guarantee its previous execution workspace or `/tmp` files exist on another device. The portable ZIP contains the source and evidence needed to resume without the old workspace. All run paths in this handoff are relative to the extracted project root.

## Collaboration preferences

The user wants implementation, concise progress, and a working result rather than repeated permission questions or instructions to do setup themselves. Use judgment within the authorized scope. Delegate independent implementation/review/QA tasks, coordinate shared file ownership, and preserve the latest decisions above. Report what was actually verified and whether a result is local or deployed. Do not invent a public preview URL or silently publish through a different hosting service. Version 42 extends seating to all free normally sittable furniture, preserving companions, separate sofa-cushion ownership, natural collision-safe entry/exit, and quiet lounge behavior. Version 41's contact-synchronized distance-faded impacts, version 40's button clicks, version 39's dismissal whoosh, version 38's synchronized footsteps, and version 37's music remain under Sound on/off. Version 36's smoothed white characters, established controls/camera, rooms, and application behavior are retained.
