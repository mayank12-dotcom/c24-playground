# Common Ground

Source repository: [mayank12-dotcom/c24-playground](https://github.com/mayank12-dotcom/c24-playground).
The repository includes the complete version 53 runtime, API, audio, tests,
source scripts, previews and handoff notes. Generated build output, local
credentials and large reproducible geometry dumps are excluded.

Version 53 fixes a browser startup failure caused by the external Google Fonts
stylesheet. When that request was blocked, Chromium reproduced a failed Vite CSS
preload and the world module did not start. DM Sans and Space Grotesk now load
from four local variable-weight WOFF2 files, with their original OFL licenses.
The standalone export embeds all four fonts as well as the ten audio assets.
The original font families and the rest of the interface stylesheet are retained;
world, character, movement, recruiter combat and API behavior are unchanged.
See `public/fonts/README.md` for provenance and the version 53 section of
`design-qa.md` for the actual browser verification scope and result. Version 52's
previous automated totals below do not establish a successful browser startup.

Version 52 adds a playable encounter with the Product Manager recruiter. Any
visitor can trigger it with three separate bumps into the recruiter or their
chair; the third bump must hit the chair. Step back between contacts. The
recruiter tumbles, gets up and approaches the challenger. The bottom controls
show **J to punch**, **K to kick** and **Esc to step away**, with health for both
characters. Closing the controls keeps J/K available. The chair and recruiter
return smoothly when the encounter ends. One visitor owns the encounter at a
time; shared visitors see its poses and attacks through the existing API.
The nineteen ambient characters and their existing fight remain separate.
The original navigation, white outlined characters, job flow and sound toggle
are retained. See the version 52 section in `design-qa.md` for verification scope.

Version 51 reshapes every character around the latest supplied 3D mannequin
reference: a large spherical head above a compact tapered body, narrow relaxed
arms, rounded mitten hands, and more exposed legs. The finish stays white with
an ink outline, with no photographed texture. Hair, eyes, recruiter ties and
fighter expressions follow the revised head and body. The existing movement,
seating, office, original navigation, sound and shared-visitor API are retained.
See `artifacts/character-reference-v51.png` for actual posed geometry rendered
offline; this is not a browser screenshot or a new Vercel deployment. The
production build and standalone export pass. Character, gait, fighting and
expression test commands exit successfully, with focused physical-world checks
covering furniture clearance and bot scenes. `design-qa.md` records scope and
reporter limitations separately from older release counts.

Version 50 makes the multiplayer connection state explicit. When the shared
visitor API cannot be reached, the navbar now says “Live visitors unavailable”
instead of “Explore at your own pace”; it returns to “Live visitors connected”
on recovery. Real visitors already synchronize through the shared API and Redis,
including names, movement and seating. Publishing the complete source and
connecting one shared Redis database remain deployment requirements. A working
public Redis connection has not been verified from this workspace. The production
build and 88 focused checks across five files pass, including named two-client
movement/seating and connection-loss/recovery status.

Version 49 adds a first-visit name popup before entering the office. The name is
remembered in this browser with localStorage, so returning visitors go straight
in. Names appear over real visitors and travel with live movement and seating
updates; older visitors without names remain compatible. Storage-denied browsing
still works for the current visit. The original office, navigation, sound, bots,
camera and seating behavior remain. The production build and 113 focused checks
across ten files pass. No version 49 live deployment or hands-on browser playtest
is claimed. The user reports seeing another candidate across two computers on
their independently deployed version 48 site.

Version 48 brings the entire world inside one large office: a continuous floor, connected departments and lounges, cutaway exterior walls/windows, reception, café counter, printer, storage, and indoor plants. Static furniture now has smooth matte shading with warm neutral architecture and colored textiles. The original navigation, white characters, third-person camera, sounds and automatic seating remain. All 47 public seats and 19 ambient characters are preserved. The production build and 128 focused checks across 14 files pass. The included office preview is an offline actual-geometry study; hands-on browser verification and deployment are not claimed.

Version 47 repairs the standalone export so the original light navigation and button styles load correctly. Previous exports corrupted a font URL and left invalid CSS. The new `npm run export:standalone -- /absolute/output.html` command preserves full font imports, validates the complete stylesheet, and embeds all ten audio assets. The original navigation source, quieter sound, and version 46 automatic seating are preserved. All 71 focused export/audio/panel/coordinator checks pass, and 17 parsed navigation rules match the archived pre-audio design. Browser playtesting and deployment are not claimed.

Version 46 makes actual contact with a free chair start smooth automatic seating from its side, back or front, with no popup/button click. The character follows a clear path around solid backrests and arms, then lowers onto the cushion before job details open. A shared sofa selects the nearest free cushion. Occupied seats and protection against immediately reseating after getting up remain intact. The original top navigation, controls, white characters, and quieter 6% background music are preserved. The production build and 95 focused automated checks across six files pass; hands-on browser testing and deployment are not claimed.

A lightweight third-person 3D hiring-world prototype with connected lounge rooms inspired by Gather. Soft rounded white characters, black outlines, optional hairstyles, and recruiters in ties share colorful work rooms, social lounges, a reading room, an information gallery, and an arrival lobby, with greenery around the office.

Version 42 makes every free chair, couch cushion, beanbag, armchair, and ottoman usable as a seat. The world has 47 public seats: nine application chairs and 38 places to relax. Existing seated companions keep their places.

## Run locally

Requires Node.js 20.19+ or 22+.

```bash
git clone https://github.com/mayank12-dotcom/c24-playground.git
cd c24-playground
npm ci
npm run dev
```

The server prints its local address (default `http://localhost:4173`). It serves both Vite and the shared visitor API. Browsers connected to the same local server share visitors and seat ownership. This address refers to the computer running the server; it is not a publicly reachable address.

`npm run build` creates static output in `dist/`. `npm run preview` and `npm run dev:static` serve the frontend without the presence API, so they run in solo mode with bots.

## Screen layout

The 3D world fills the entire desktop viewport. Navigation spans the top edge of the canvas with no outer margins,
with How to Explore, the appearance control, and a Sound on/off toggle in the top bar. The available-seats
FAB sits at the bottom right, mirroring the zoom controls on the left, and toggles the floating
Your Current Next Chapter window, which contains job
browsing and application chats. The FAB opens the role roster manually. Selecting
a role starts the walk to its chair; the description and window open only after
the visitor is visibly seated. The nearest desk's small designation label appears
only when the visible character comes within three world units of that desk and
disappears when they walk away. Passing a desk does not open the job description
or replace sidebar content. Closing the window keeps the visitor seated and
preserves the current conversation and unfinished answer. A small bottom nudge
reopens that same description or chat. Zoom and
recenter controls sit vertically along the left edge.

The rooms use distinct colors: dusty blue in the Studio, lavender in the Quiet Lounge, rose in the Shared Living Room, terracotta in Clay Corner, and ochre in the Sunroom. Straight warm-sand hallways connect wide doorways, while low cutaway plaster walls keep characters visible. Blue table-tennis tops, varied upholstered chairs, colored beanbags, ceramic pots, and matching navigation accents add contrast around the white characters. Daylight uses a neutral ground tint with slightly lower intensity to retain the material colors. See `artifacts/connected-rooms-preview.png` for an inspected offline render of the actual scene.

## Controls and interactions

- WASD or arrow keys: choose a camera-relative direction. The avatar walks immediately and turns smoothly toward the chosen direction without pausing.
- Double-click a clear spot on the ground with a mouse or trackpad to walk there. Walking continues through route corners while the avatar turns toward the next segment. A single click does not move the character. Keyboard movement interrupts the selected route.
- Solid objects and other characters stop the entire movement with a small bump. Holding into a desk, chair, planter, bot, or visitor does not slide the visitor along it; steer aside or back away to continue.
- Drag the scene with a mouse or trackpad: inverted horizontal dragging smoothly turns the avatar and its trailing camera.
- Scroll or use zoom controls: change follow distance within fixed bounds.
- Approach a free visitor chair, click its role label, or choose a role from the FAB roster: walk to it and settle into the chair automatically through a continuous approach, turn, and lowering animation.
- Approach a free couch cushion, armchair, beanbag, or ottoman anywhere in the rooms or lobby to sit and relax. Each place has its own shared occupancy, including separate cushions on two-place sofas. Lounge seating does not open job descriptions.
- Choose Class 24 in the navigation to walk to the information room. Reach an exhibit and single-click it to read its short dummy paragraph in the sidebar; distant clicks show a closer-approach hint.
- Job descriptions appear only after sitting down, including after a bot leaves a won chair.
- At a bot's chair, press Space or click Push once. The bot visibly tumbles onto the lawn beside the chair, pauses, recovers, and walks away. The visitor waits for the chair to clear, then sits smoothly. A blocked landing asks for more room before a push can be confirmed.
- Bump the Product Manager recruiter or their chair three separate times, ending with the chair, to start a duel. Holding movement against it counts once. J punches, K kicks and Esc steps away. Move close and face the recruiter to land a hit. X hides the controls without ending combat. One real visitor can challenge this recruiter at a time; other connected visitors can watch.
- Read the role in the sidebar; Apply starts the interview while seated.
- All opportunities and Explore open the roster while keeping the visitor in their current chair. Choosing another role starts the smooth get-up and walk to its chair automatically; choosing the current role reopens its description without moving. Leave table & explore still explicitly gets up.
- Movement keys close the job window and start a visible get-up animation: shift over planted feet, rise for about 0.75 seconds, then take the shortest clear departure at normal speed. A clear front exit is allowed; a table or backrest can require going around a side. The chair stays reserved until the visitor is clear; an object or another person pauses the entire transfer. Held keys resume walking after the exit, and a released tap leaves the visitor standing. Text fields retain normal typing and arrow-key behavior.
- Closing the sidebar with X, Escape, or the available-seats FAB keeps the visitor seated. Use the bottom nudge to reopen the current job or conversation without losing a draft.
- Enter sends an answer; Shift+Enter adds a new line.
- Selecting a saved chat returns to its chair first. Once seated, Continue resumes the saved application. Leaving the table stands the visitor up.
- Everyone starts without hair. A fresh look adds or changes the visitor's hairstyle, including a return to the bald appearance.

The camera keeps its direction when movement starts. After sustained travel it gradually turns toward the walk, with a slow start and a maximum automatic turn speed of 25 degrees per second. Short taps and keys held against furniture leave the view steady. Stopping brakes the small remaining camera momentum. The avatar turns promptly while walking continues. A brief speed ramp applies only when starting from rest; direction changes keep the current walking speed. Mouse dragging remains responsive. Keyboard movement captures a stable direction for each continuous gesture, so camera rotation does not bend the walking path. The experience requires at least 1280 CSS pixels of viewport width; narrower screens show “Please use desktop for a better experience.” without loading the game.

## Characters and movement

Characters follow the newest dimensional reference: a spherical head about
40% of total height, a compact tapered torso, slim sloping shoulders, relaxed
arms with rounded mitten ends, exposed straight legs and small rounded soles.
Low-set dot eyes retain the established face. The body is white on the visitor,
recruiters, bots and live visitors, with a continuous black inverted-hull outline.
One connected watertight skin shares a 15-bone rig and stays below the existing
30,000-triangle budget including its outline and optional accessories. The model
is generated once per world without model or texture downloads. Everyone starts
bald; five hairstyles remain available through A fresh look. Recruiters retain
their ties below the larger chin.

Walking and body rotation happen together, with no turn-related pause. A brief acceleration blends the first step from rest into the normal gait; corners and reversals do not restart it. Walking is driven by actual movement: hips and knees articulate, one foot lifts
while the other remains planted, and relaxed bent arms counter-swing. Stopping
settles the feet rather than continuing a floating loop. Seated characters bend
their knees, rest their feet on the floor, and keep their hands near the desktop.
The seated pose is fitted to the new skin so the pelvis rests just above the .30-unit cushion and the solved feet stay on the ground. A small arm tuck during the transfer keeps the longer reference hands above the desktop. Couch and beanbag anchors sit toward the front edge; job chairs use shallow cushions and widely spaced legs so thighs, shins, and feet stay clear of the furniture.

Seating compares the complete clear access routes from the visitor’s current position instead of assigning one fixed side. A visitor already in the open front strip uses the short direct transfer; someone behind a backrest steps clear and goes around the nearer reachable side. At the cushion, a short centered backward step, planted feet, and controlled lowering keep the transfer continuous. The feet stay planted while the hips move back. Backrests, armrests, chair legs, and rails stay solid during the transfer; only the cushion's intended support area is accessible to its occupant. Interrupted lowering reverses from the visible pose, and remote visitors use the same entry and departure paths.

Version 36 smooths the shoulder-to-arm surface with a broader rounded attachment, a lower armpit opening, and gradual skin weights. Four local shoulder sampling rows remove the outer contour step while keeping the rest of the mesh lightweight. The before/after evidence is `artifacts/shoulder-smoothing-v36-preview.png`.

The same model and motion apply to the visitor, recruiters, bots, and live visitors.
Offline pose previews can be regenerated with `scripts/preview-characters.mjs` and
`scripts/render-characters.py` when Blender is available. These developer helpers
are not required to build or run the website. The current eight-view reference preview
is `artifacts/character-reference-v51.png`, with front, back, side, walking,
three-quarter, pushing, seated typing, and an optional hairstyle. The older
drawing-based baseline remains in `artifacts/reference-character-v33-preview.png`.

## The shared world

The office has eight rectangular rooms: five work lounges containing nine job desks, two desk-free social rooms, and the Class 24 information room. Straight corridors and a shared arrival lobby connect 20 actual doorway gaps. Fifty-two low plaster wall segments define the room edges, with matching physical collision bounds. Front walls are 0.85 units high, back walls 1.15, and side walls 1.0, preserving the third-person view without roofs. Colored floors and rugs distinguish rooms; lawns, six planting islands, and 23 trees frame the exterior. The spatial reference is [Gather's virtual office](https://www.gather.town/virtual-office), adapted to the established 3D hiring interactions and visual language.

Each job conversation takes place at an oval café table with a laptop and two compact upholstered slipper chairs. Their shallow cushions and open sides keep legs clear and leave the bot's tumble path unobstructed. Five work lounges have distinct sofa, armchair, ottoman, and low-table arrangements, with woven rugs, pillows, throws, lamps, and plants in dusty blue, lavender, rose, terracotta, ochre, and warm wood. The furniture leaves clear approaches to chairs and room to move between areas. Scattered trees frame the garden without enclosing it. Keyboard walking, double-click ground navigation, and selected-chair navigation share physical boundaries and route through actual doorways. Walls reserve extra clearance for walking hands and shoes; furniture retains its existing clearance. The nine job positions stay stable, and lounge anchors come from the shared seat plan so presence and rendering agree.

Movement checks the full travel segment and stops just before first contact, even if a frame would cross a slim furnishing or another person. Both job chairs and every visible room wall are solid while walking. Selecting a free role routes to the open front side of its chair, within the automatic seating range. Seating and chair departures preserve solid backrests, arms, legs, and rails while allowing the cushion to support the seated body. The visitor steps into position, plants both feet, and lowers; getting up reverses that weight transfer before walking out through the clear front lane. Transfers pause when furniture or another body blocks them. Cancelling a lower reverses from the actual visible pose, and remote visitors use the same routes. The chair is released only after the visitor is physically clear. Couches, planting islands, low shrubs around tree roots, and the reading lamp also have matching physical bounds. A brief upper-body recoil marks a new bump without moving the visitor through or away from the boundary.

Bots, recruiters, and live visitors have solid body footprints. Displayed crowd positions move through the same swept checks rather than jumping through the local visitor between updates. Walking bots can take a clear short detour around someone; manual movement requires the user to steer. Coincident visitor arrivals are placed in nearby reachable space, and a remote visitor's seated pose waits until their displayed body reaches the chair.

There are 19 background bots: 3 follow the garden paths, exactly 2 take part in one encounter, 3 watch them, 4 play table tennis, 3 sit at job tables, and 4 converse on couches. Every existing bot ID remains in the world. The fighters walk into a bump, react with an angry exchange, alternate punches, and progress through a two-handed shove, a standing fall, two brief low kicks, a supported recovery, and disengagement. Their fists and toes meet the other bot's actual skin, with planted support feet and smooth steps between gestures. Small symbol-only speech clouds and fading reddish head tints with angled brows carry their reactions without written curse words; contact-synchronized impact audio accompanies punches and kicks.

The spectators face the action and occasionally react, with open gaps where the visitor can stand and watch using the normal movement controls. Physical body volumes follow the fallen bot's head and limbs. The encounter pauses if a visitor blocks the movement or steps into the exchange, then resumes when clear; the tennis players, ordinary walkers, seated occupants, and lounge conversations continue. Only the next frame's actual body silhouettes are reserved during movement, so there is no invisible boundary around the crowd. The encounter uses a deterministic 24-second clock synchronized to server time when connected. Pushed job occupants still tumble beside their chairs, recover, and join the main garden paths.

The two social rooms feature cushioned couches, beanbags, low coffee tables, reading accessories, and warm lamps, without job desks or laptops. Two companions on each couch take turns gesturing and displaying brief speech clouds, with no sound. Four free beanbags let visitors join the relaxed spaces. Furnishings and finishes vary deterministically from a fixed seed, so every connected visitor sees the same physical plan.

Version 42 adds 34 usable lounge positions across the existing furniture: 11 in the arrival lounges, 17 in work lounges, four on the information-room sofas, and two on social-room ottomans. Together with the four existing free social beanbags, there are 38 free lounge positions. The nine application chairs bring the public catalog to 47 seats; the four companion-occupied social couch positions remain reserved and are excluded from that catalog. Recruiters and existing bots remain in the world. Coffee tables, desks, shelves, and other objects that are not seating remain solid scenery.

The authoritative furniture seat plan includes cushion positions, rotations, approach points, stable furnishing IDs, and structural collision profiles. Local visitors, live visitors, and the presence service use the same coordinates. The upholstery supports the existing short-legged pose at a common 0.30-unit cushion plane, with the body near the front edge and feet clear of the furnishing. Approaches use the nearest clear reachable route; getting up retains the planted-foot delay and collision checks. Closing a panel does not stand the visitor up. Lounge arrivals show only the quiet settled-in notice, while job chairs keep their existing sidebar behavior. The available-seats FAB continues to count job opportunities rather than all lounge cushions.

The Class 24 information lounge contains five solid, clickable exhibits, with two small sofas, rugs, side tables, books, and a reading lamp around its open central aisle. Its story, work, values, people, and careers cards intentionally contain short dummy copy for later replacement in `src/info-content.js`. A nearby single click opens only the information body; the saved application/chat DOM remains intact.

Two public lounge areas and two table-tennis tables occupy the shared arrival lobby. Colored beanbags, a loveseat, layered rugs, low tables with books and mugs, potted plants, reading lamps, and shelving make the arrival areas feel inhabited. Furniture has physical collision bounds; selected-chair routes and keyboard movement go around it. The scenery uses shared procedural geometry/materials without texture or model downloads. Repeated garden pieces are instanced to keep the added lounge detail lightweight. Only the nearest desk within reach shows its designation and seat availability. Distant job labels remain hidden, including while zooming out or approaching a reserved chair from afar; company captions above the designation remain removed.

Approach a seated bot or select its role to show the Push action. One deliberate Space press or button click sends one atomic request. A successful push uses both hands and a shared timestamp for a 650 ms tumble that first clears the front of the chair, a 550 ms grounded pause, a 950 ms recovery, and a 300 ms turn. The visitor holds the lease and waits for the bot to clear before approaching and lowering into the chair. Actual falling skin stays above the lawn and clear of the station furniture; a wider landing reservation keeps other characters out, and blocked movement pauses the fall clock. Pushed bots keep their IDs and do not reclaim the chair during that world session. Real visitors cannot be displaced.

The shared API checks proximity and exclusive ownership before granting a push. Duplicate or racing requests can produce only one owner, and a held Space key does not repeat the action. Old partial bump progress does not affect the new single-push flow. Wins and bot tumbles are shared with connected visitors; in the downloadable HTML they remain local to that page until it closes or reloads.

The presence API shares anonymous avatar positions, hairstyles, and chair ownership. It does not send application answers. Seats are reserved atomically, expired visitors and seat leases disappear after 25 seconds, and private anonymous credentials are excluded from public snapshots. A visible status distinguishes live visitors from solo/bots-only mode.

Vercel needs a shared Redis REST database for visitor presence. Its serverless functions cannot reliably share process memory. See `DEPLOYMENT.md` and `.env.example`. No real credentials belong in the browser bundle.

## Prototype scope

Nine fictional roles and scripted questions demonstrate the application flow. Answers stay in this browser's localStorage; nothing is submitted to an employer or AI service. There is no account system, CV upload, or employer integration. The floor follows the visitor; the tables are a fixed sample neighborhood.

The downloadable single-file HTML contains the visuals, movement, seating, bots, local chats, background music, sampled local-player footsteps, a dismissal whoosh, button clicks, and nearby fight impacts. It runs in solo mode and cannot share real visitors across computers.

## Music and interaction audio — version 41

The user-supplied `maksymmalko-funny-cartoon-music-532611.mp3` remains the quiet
background track. Its runtime copy is `public/audio/background.mp3`: the
3:08 track is encoded at 96 kbps, about 2.25 MB instead of the roughly 6 MB
original. The production build serves local audio files; the portable standalone
HTML embeds the track, footstep samples, dismissal whoosh, button click, and fight samples without an external audio service.

The attached `freesound_community-concrete-footsteps-1-6265.mp3` supplies
four distinct individual footfalls. Each is mono 22,050 Hz PCM16 WAV, with a
matched peak of 0.419983 (−7.535 dBFS), a 0.8 ms attack fade, a 35 ms tail fade,
and zero-valued first and last samples. Contact onset is less than 2 ms after
sample playback begins. No pitch shifting or time stretching is applied.

| Runtime file | Duration | Bytes | Source start |
| --- | ---: | ---: | ---: |
| `public/audio/step-1.wav` | 0.300 s | 13,274 | 0.298542 s |
| `public/audio/step-2.wav` | 0.320 s | 14,156 | 1.641542 s |
| `public/audio/step-3.wav` | 0.300 s | 13,274 | 4.136833 s |
| `public/audio/step-4.wav` | 0.340 s | 15,038 | 6.088125 s |

The samples total **55,742 bytes**. Sampling measurements are preserved in
`artifacts/footstep-sampling-report.json`. The local player's actual animated
swing-to-stance foot contacts trigger the sounds; there is no wall-clock audio
loop. Cadence therefore follows actual movement speed and animation across
frame rates. Idle, fully collision-blocked movement, seating transfers, and fight
gestures do not emit footfalls. Other bots and visitors do not add walking noise.
The existing white character mesh, rooms, camera, and physical movement remain.

The top-navigation **Sound on/off** toggle controls background music,
footsteps, the dismissal whoosh, button clicks, and fight impacts. It retains the existing `common-ground:music-enabled` localStorage
preference, so a saved mute remains respected. Storage denial does not prevent
operation. Music uses one looping HTML audio element at 6% volume. Footsteps
use one reused Web Audio context at 40% gain, with samples fetched and decoded lazily after
a real desktop interaction. Muting as the first interaction keeps all sound silent.
Synthetic events, typing in editable fields, and shortcut or modifier keys do
not unlock playback by themselves.

Mute, hidden tabs, page suspension, and widths below the 1280-pixel desktop
threshold stop active sound effects and pause music. Returning can resume eligible
music after a prior real gesture; old foot contacts are discarded instead of
replayed. Rejected playback or decoding remains harmless to the world, and late
async results cannot revive sound after mute, suspension, or disposal. Character
conversations have no spoken audio. Punches and kicks use the impact samples below.

### Dismissal whoosh

Version 39 adds the supplied
`oxidvideos-transition-sfx-whoosh-sound-effect-407576.mp3` when a visitor
deliberately dismisses a visible popup or sidebar. The local runtime sample,
`public/audio/dismiss.wav`, is **0.729977 seconds / 32,236 bytes**, mono 22,050 Hz
PCM16. Its source trim spans 0.022–0.752 seconds, retaining 99.999878% of decoded
source energy, including the initial rush and natural decay. A 2 ms attack fade,
35 ms tail fade, peak of 0.419983 (−7.535 dBFS), and zero-valued endpoints keep the
sample restrained. Pitch and duration are not artificially changed. Measurements
and decode results are in `artifacts/dismiss-sampling-report.json`.

A whoosh follows a visible user dismissal of the opportunity roster, job/chat,
or Class 24 sidebar through X, the available-seats FAB, Escape, or Class 24
navigation; Help through X, its toggle, or Escape; the bot challenge through X
or Escape; and the explicit Leave table action. Programmatic seating,
navigation, and lifecycle closes, opening a view, repeated closes of hidden
views, and expiring toasts remain silent. One DOM event that closes multiple
views produces one whoosh. At most one whoosh voice is active, with its natural
pitch and 40% gain.

`src/sample-audio.js` provides the common short-sample engine. The existing
`src/footstep-audio.js` wrapper and the dismissal instance reuse that code while
retaining their separate triggers. Samples load/decode lazily after a real
eligible gesture; mute, hidden tabs, page suspension, and sub-1280-pixel views
stop active effects. Early or stale dismissal requests are discarded instead of
queued. The existing Sound toggle and remembered preference govern every audio
layer. White character geometry, foot-contact timing, rooms, camera, and seating
behavior are retained.

### Button-click sound

Version 40 samples the attached
`matthewvakaliuk73627-mouse-click-290204.mp3` into `public/audio/click.wav`:
**80 ms / 3,572 bytes**, mono 22,050 Hz PCM16. The 0.043–0.123-second source slice
preserves one natural down/up click pair and its useful tail, excluding a later
separate click. Peak is 0.419983 (−7.535 dBFS), with a 0.4 ms attack fade, an 8 ms
tail fade, zero first/last samples, and onset above 0.001 within 0.272 ms.
No pitch shifting or time stretching is used. The sampling report is
`artifacts/click-sampling-report.json`.

`src/button-audio.js` captures real button-click events at the document level.
Enabled, visible buttons inside the app produce one short click, including
buttons added later in sidebars, icons nested inside buttons, and keyboard
activation. Background clicks, other elements, disabled buttons, buttons outside
the app, and synthetic events remain silent. Closing a panel by its button gives
the short click plus the existing dismissal whoosh. Turning Sound off is silent;
turning Sound on may play the click after the enabled state takes effect.

Button audio reuses `src/sample-audio.js` and the existing Sound preference.
If the first eligible click arrives while its sample becomes ready, only the
latest click may wait, for at most 150 ms. Mute, hidden tabs, page suspension,
sub-1280-pixel views, or disposal clear that pending intent; no delayed click
burst replays later. The feature changes no world, gait, character mesh, or
camera behavior.

### Nearby fight impacts

Version 41 adds three sampled punch sounds and reuses the existing short click
as a lighter fourth impact. All four supplied recordings are represented. The
new mouse-click upload matches the previously sampled recording by SHA-256,
so it needs no duplicate runtime file.

| Runtime file | Source recording | Duration | Bytes | Main contact onset |
| --- | --- | ---: | ---: | ---: |
| `public/audio/fight-1.wav` | `freesound_community-punch-2-37333.mp3` | 0.329977 s | 14,596 | 1.361 ms |
| `public/audio/fight-2.wav` | `universfield-punch-03-352040.mp3` | 0.380 s | 16,802 | 0.771 ms |
| `public/audio/fight-3.wav` | `universfield-punch-140236.mp3` | 0.400 s | 17,684 | 0.499 ms |
| `public/audio/click.wav` (reused) | `matthewvakaliuk73627-mouse-click-290204.mp3` | 0.080 s | 3,572 | 3.537 ms |

The three new WAVs total **49,082 bytes**, with **52,654 bytes** across the four
impact variations. They use mono 22,050 Hz PCM16, matched peaks near 0.5
(−6.021 dBFS), 0.5 ms attack and 35 ms tail fades, and zero-valued endpoints.
Source slices are 0.3745–0.7045 s, 0.3695–0.7495 s, and 0.173–0.573 s,
respectively. Leading swing/silence is removed so the useful contact and natural
tail can follow the visible hit. No pitch changes or time stretching are applied.
Evidence is `artifacts/fight-sampling-report.json`; the reused click retains its
original measurements in `artifacts/click-sampling-report.json`.

`src/fight-impacts.js` tracks the actual visible, collision-paused choreography:
four punch contacts at 5,150 / 6,150 / 7,150 / 8,150 ms, and two kicks at 10,975 /
12,175 ms in each 24-second encounter. A held contact emits once; muted, far,
loading, and resumed playback do not accumulate old hits. Each emitted contact
randomly chooses from the four samples without immediately repeating the last
variation, at its natural pitch.

`src/fight-audio.js` measures distance from the actual player position to the
actual fighters' midpoint, independently of camera rotation or zoom. Gain is
0.45 within three world units, fades smoothly to zero over three to ten units
using smoothstep, and follows movement through approximately 80 ms gain ramps.
It updates even while a hit or choreography is paused, so approaching or leaving
the crowd fades active audio naturally. Distance does not flip a binary sound
switch. The global Sound control still mutes every layer. Character geometry,
gait, and physics remain unchanged; the world adds only the audio frame hook.
Conversation clouds remain silent.

## Verification

`scripts/browser-smoke.mjs` runs the production `dist/` in actual Chromium with
a same-origin isolated memory API and all external hosts blocked. It checks the
name/cache flow, local fonts, sampled keyboard movement, original controls and
the narrow-screen guard. Frame bursts are bounded for the software GPU; this is
not a frame-rate benchmark or a live Vercel/Redis test. It requires Playwright
Core and Chromium; use `PLAYWRIGHT_CORE_PATH` and `CHROMIUM_PATH` when they are
installed outside the project. Evidence is written to the output directory
passed as its first argument.

`npm test` covers application lifecycle/cancellation, challenge keyboard and button behavior, character articulation and foot plants, bot defeats/departures, turning and camera continuity, deterministic bot routes, anonymous visitor ownership, shared positions, seat exclusivity, expiry, and offline behavior. Garden checks cover connected paths, clear entrances, furniture/chair clearance, access to all nine chairs and bot challenges, journeys between rooms, routes from the lobby, detours through doorways from either side, genuinely unreachable goals, collision-free smoothed routes, resource ownership, and instanced rendering. Push checks include one deliberate action, proximity, duplicate and racing requests, protected real visitors, blocked landings, actual falling-body clearance, cancelled handoffs, and local fallback. Steering checks cover prompt avatar facing, stable held directions, steady views for short taps and blocked movement, bounded automatic camera speed/acceleration, smooth braking, direction reversals, refresh-rate consistency, mouse turns, zoom, and seating resets. A previous live HTTP check against the local server passed two-client movement, concurrent chair claims, and bot seat protection; new challenge behavior is covered through API handler and store tests. `npm run build` passes.

The version 36 baseline smoothed the shoulder/arm joins while retaining continuous walking through direction changes. Its 299 automated checks across 27 files passed, including all 50 original world scenarios checked in four disjoint groups with progress logging. This is a historical full-suite result, not a claim that all checks were rerun for version 42. Room coverage includes rendered wall/collision agreement, floor and hallway alignment, wall-only limb clearance, four-sided held-key contact, open doorway passage, cross-room chair travel, and bot departures. Coverage includes the application flow, physical world, lounge furniture, shared seating, information interactions, and visible push handoff. Collision checks include held keys, diagonal full stops, deliberate sidesteps/backing away, large steps across thin rails, earliest contact, tangent escapes, corner crossings, and solid chairs with usable seating approaches. Coordinator checks verify that proximity and role selection never reveal descriptions before seating, the FAB roster stays intact while passing desks, bot handoffs wait for visible seating, and cancelled/late seat callbacks cannot reopen a popup. Closing and reopening the seated panel retains the same chat and draft; server release waits for the completed exit and precedes another claim. Room checks cover solid side walls, clear doorways, connected corridors, matching rendered and physical wall footprints, planting footprints, and reserved tumble landings. Earlier baseline sweeps completed 396 chair approaches and five minutes of bot activity without collisions or stalls; version 32 additionally samples actual wall contact and cross-room chair transfers.

Historical version 37 verification passed 62 focused checks across four files: 19 background-music,
27 main-coordinator, 3 movement-input, and 13 third-person checks. Audio checks cover lazy
loading, real-gesture activation and filtering, one reusable looping audio
element, volume bounds, remembered mute, first-click capture ordering, denied
storage, playback rejection/retry, visibility/page/viewport suspension, pending
playback races, and disposal. Run them with `node tests/background-music.test.js`.
The version 37 production build passes, with the existing nonfatal chunk-size
warning, and the entire MP3 decodes successfully. The runtime asset is 2,254,515
bytes, 187.846531 seconds, stereo 44.1 kHz at 96 kbps. Local HTTP checks return the
production page and matching audio with status 200 and `audio/mpeg`; a byte-range
request returns matching bytes with status 206. The standalone track matches the runtime asset byte for byte, inline JavaScript
syntax passes, and all 138 exported files restore with matching SHA-256 hashes.
These focused automated
checks do not establish audible playback in a browser.

Historical version 38 verification passed **130 focused checks across nine files**: 22 sampled
footstep-audio, 12 foot-contact motion, 30 main-coordinator, 21 character, 6 fight,
19 background-music, 3 movement-input, 13 third-person, and 4 actual-world cases. These establish
actual contact timing, speed/frame-rate consistency, silence during idle/blocked/
seated/fight states, lifecycle handling, shared mute behavior, and retained motion.
The actual-world cases cover two new footstep scenarios and two existing
world regressions. Implementation and focused testing are complete. The
production build passes. Full decoding
of the music and all four WAVs passes, as do production HTTP checks for the page,
byte-identical delivery of all five audio assets (200), and byte-range delivery
(206). Waveform sampling confirms mono PCM16, contact onset under 2 ms, matched
peaks, and zero-valued sample boundaries.

The standalone embeds all five runtime audio assets byte for byte, and its inline
JavaScript passes syntax validation. The ZIP restores with all 155 exported file
hashes matching. Browser
listening and hands-on interaction verification remain unavailable; no Vercel
deployment is claimed. Version 36/37 totals above remain historical rather than
an implied complete version 39 suite rerun.

Historical version 39 verification passed **110 focused checks across seven files**: 11 application,
19 background-music, 8 bot-challenge, 22 footstep-audio, 36 main-coordinator,
5 panel, and 9 generic sample-audio cases. Coverage includes deliberate visible
dismissals, silent automatic/hidden closes, same-event deduplication, one active
natural-pitch whoosh, existing footstep behavior, shared mute, and lifecycle
handling. The production build passes. All six runtime audio assets decode fully;
production HTTP checks return exact bytes for the page and all audio assets with
status 200, and byte-range delivery passes with status 206. World, character,
gait, and camera source remain unchanged from version 38.

The standalone embeds all six audio assets byte for byte and passes inline
JavaScript syntax validation. The portable ZIP restores with all 158 exported file
hashes matching. Browser listening and
hands-on interaction verification remain unavailable; this update is local and
has not been deployed to Vercel. Historical counts do not imply a complete
version 40 suite rerun.

Historical version 40 verification passed **102 focused checks across five files**: 19 background-music,
14 button-audio, 22 footstep-audio, 38 main-coordinator, and 9 generic sample-audio
cases. They cover eligible button targeting, dynamic/icon/keyboard activation,
shared mute ordering, first-click readiness, pending-intent cancellation,
existing audio behavior, and coordinator integration. The production build
passes. All seven audio assets decode fully; production HTTP checks return the
page and every audio asset with exact bytes and status 200, plus matching
byte-range delivery with status 206. World, gait, character, camera, generic
sample engine, footstep wrapper, application, panels, and bot-challenge source
match version 39.

The standalone embeds all seven audio assets byte for byte and passes inline
JavaScript syntax validation. The ZIP restores with all 161 file hashes matching. Historical version 36/38/39 results
remain separate rather than implying a complete version 40 suite rerun.
Browser listening and hands-on interaction verification remain unavailable;
this update is local and has not been deployed to Vercel.

Historical version 41 verification passed **143 focused checks across eight files**: 19 background-music,
14 button-audio, 16 fight-audio, 13 fight-impact, 22 footstep-audio,
40 main-coordinator, 17 generic sample-audio, and 2 actual-world encounter/pause
cases. Coverage includes six contact times, paused-hit deduplication, no backlog,
random no-repeat selection, continuous actual-player distance gain/ramping,
shared mute/lifecycle handling, and actual-world forwarding. Production build
passes and includes the final source revisions. All ten audio files decode fully;
HTTP checks return the page and every asset with exact bytes and status 200,
plus matching byte-range delivery with status 206. Mesh, gait, camera,
choreography, crowd, application, panel, and bot-challenge source match version
40; the world adds a read-only audio observer.

The standalone embeds all ten assets byte for byte and passes inline JavaScript
syntax validation. The ZIP restores with all 175 file hashes matching. Historical version 36/38/39/40 totals remain
separate rather than implying a complete current suite rerun. Browser listening
and hands-on interaction verification remain unavailable; no Vercel deployment
is claimed.

Version 42 release verification: **215 focused checks across 17 test files passed**, including 19 selected actual-world checks. All 34 new seats have clear lobby routes, all nine shared sofas pass paired-body checks, and representative entry/exit and occupied-neighbor transfers pass actual skin/sole checks. The final production build, exact-byte HTTP delivery, all ten audio decodes, standalone inline JavaScript/audio validation, and ZIP restore integrity passed. The complete world suite was not rerun; no hands-on browser playtesting or Vercel deployment is claimed.

The current version 53 release targets are `common-ground-v53.html`, `common-ground-v53.zip`, `common-ground-v53-vercel.zip`, and `common-ground-v53-MEMORY.md`. The standalone embeds all four local font files and ten runtime audio files and runs in solo mode. The source ZIP transfers the editable project and handoff notes; browser-local answers, settings, sessions, and live seat leases are not transferred.

New integration checks execute actual world ticks, scene geometry, and character rigs with the GPU and DOM boundaries replaced. They cover body contacts, separate visitor spawn positions, a timed rise with grounded feet, paused or side departures around people, cancelled navigation, world teardown, and blocked seating arrivals. New checks measure pelvis, ankle, and wrist continuity through walking and lowering; remote entries retain their progress across heartbeats and pause when someone crosses their path. Information checks require proximity and preserve existing chats. A 600-tick scene keeps all 19 bots and the local visitor visible and separated through three bot departures. Independent randomized collision checks covered 17,665 sweeps and over 1.78 million sampled positions without penetration. These are automated simulations, not hands-on browser verification.

Seated bodies use a shared pelvis height and front-edge support so their hips rest on the cushion while their knees, shins, and feet stay outside it. Lounge anchors and shallower couch/beanbag fronts share the same plan with presence; job-chair anchors stay fixed. When leaving a fully settled seat, the visitor shifts forward over planted feet before standing, then takes the shortest clear departure, using the next selected chair or ground destination when available. Clear front departures are allowed; a desk or backrest can require a side route. The visible motion is collision checked while the shared seat lease remains held until departure finishes. See `artifacts/seating-fit-preview.png` for actual before-and-after geometry from the archived version 26 and corrected version 27.

Reference-style character checks also require a closed white skin and measure actual hand/desktop clearance over 81 gesture poses. A 29-pose deformation regression covers both the white body and its black outline so raised hands cannot stretch waist skin into large triangular sheets. The archived reference baseline is in `artifacts/reference-character-v33-preview.png`; its main row shows actual front, back, profile, and steady-cycle walking geometry, with softly lit 3D, gesture, seated recruiter, and optional hair views below. The raw capture and current geometry/proportion report are in `artifacts/character-preview.json` and `artifacts/character-geometry-report.json`. All 17 seated characters across nine talking phases and the visitor's job-chair and beanbag rise/departure sequences were independently sampled with no furniture intersections.

Actual lounge geometry was rendered and inspected offline, including an overview, a furnished job lounge, a populated conversation lounge, the information reading nook, and third-person framing; see `artifacts/lounge-rooms-preview.png`. The tumble poses are shown in `artifacts/bot-push-preview.png`. This confirms scene arrangement and clear entrances, not browser interaction. The actual fight is captured in `artifacts/fight-storyboard.png`, including walking, bumping, arguing, punches, the shove, a grounded kick, recovery, and the audience. Interactive browser verification is still blocked by unavailable browser-control tools. The Redis Lua operation has not yet been executed against a configured Redis service, and this update has not been deployed to Vercel. See `design-qa.md` for these limits.

## Main files

- `src/recruiter-combat.js`: deliberate contact gate, fall/recovery, playable duel and return controller.
- `src/recruiter-controls.js`, `src/recruiter-controls.css`: bottom combat controls and keyboard handling.
- `tests/recruiter-combat.test.js`, `tests/recruiter-controls.test.js`, `tests/recruiter-presence.test.js`, `tests/pm-recruiter-world.test.js`: focused recruiter checks. Redis Lua cases opt in through the dedicated disposable test socket; ordinary tests do not need production credentials.

- `src/world.js`: 3D scene, characters, rear camera, movement, seating, and crowd rendering.
- `src/garden-layout.js`: connected room floors, walls, doorways, straight halls, stable desks, planting, and shared physical bounds.
- `src/garden-space.js`: instanced room floors, cutaway walls, corridors, lobby, modern furniture, and exterior greenery.
- `src/navigation.js`: selected-chair routing with exact segment/obstacle checks.
- `src/collision.js`: swept solid-object movement, avatar clearance, and shared segment checks.
- `src/character-collision.js`: swept body contacts and reachable crowd placement.
- `src/station-layout.js`: desk/chair footprints and clear seating approaches.
- `src/third-person.js`: smooth avatar steering, stable keyboard directions, and trailing rear camera.
- `src/character.js`: continuous shared skin, skeleton, hairstyles, and ties.
- `src/fight-choreography.js`: single encounter phases, spectators, symbol clouds, and fallen-body footprints.
- `src/fight-impacts.js`: one-shot contacts from the visible paused encounter clock.
- `src/fight-audio.js`: randomized natural-pitch impact playback with player-relative continuous distance gain.
- `public/audio/fight-1.wav` through `fight-3.wav`: three short source-recorded punch impacts; existing `click.wav` is the lighter fourth variation.
- `src/character-motion.js`: grounded walking, seated transfers, fight gestures, falls, and recovery.
- `src/character-emotion.js`: independently fading fighter head tints and angry brows.
- `src/character-motion.js`: planted-foot gait, arm motion, and seated poses.
- `src/crowd.js`: deterministic bots and table positions.
- `src/cozy-space.js`: lounge furniture, greenery, table-tennis tables, and animated balls.
- `src/lounge-layout.js`: shared scenery footprints and synchronized rally positions.
- `src/movement-input.js`: keyboard movement and chair exits across canvas/sidebar focus.
- `src/bot-challenge.js`: single Push action, keyboard input, and confirmed results.
- `src/bot-push.js`: shared tumble, recovery, landing, and handoff timing.
- `src/seat-arrival.js`: visual chair handoff while the defeated bot stands and leaves.
- `src/seat-entry.js`: continuous approach, alignment, and lowering into an owned chair.
- `src/seat-transition.js`: open-side seating gates, solid seat backs/arms, and foot clearance around legs and rails.
- `src/social-layout.js` and `src/social-space.js`: social furniture, free lounge seats, and physical footprints.
- `src/seat-catalog.js`: shared authoritative coordinates for job chairs and free lounge seats.
- `src/furniture-seats.js`: stable seats and structural profiles for every usable sofa, armchair, beanbag, and ottoman across the lobby, work lounges, and information room.
- `src/info-content.js`, `src/info-room.js`, and `src/info-sidebar.js`: editable dummy copy, physical exhibits, and the independent information view.
- `src/seat-exit.js`: timed rise and collision-paused departure from an owned chair.
- `src/application.js`: roles and browser-local application chat.
- `src/background-music.js`: lazy gesture-activated background audio, mute persistence, and lifecycle suspension.
- `src/sample-audio.js`: reusable lazy short-sample playback, bounded voices, random no-repeat selection, dynamic volume, shared eligibility, and lifecycle cleanup.
- `src/button-audio.js`: document-level eligible button-click capture, shared Sound state, and bounded first-click readiness.
- `public/audio/click.wav`: one short natural mouse down/up click pair for app buttons.
- `src/footstep-audio.js`: footfall-specific wrapper over the common sample engine; contact triggering remains in character/world motion.
- `public/audio/dismiss.wav`: trimmed user-supplied whoosh for deliberate visible popup/sidebar dismissals.
- `public/audio/background.mp3`: compressed local copy of the user-supplied background track.
- `public/audio/step-1.wav` through `step-4.wav`: four short source-recorded concrete footfalls.
- `src/presence.js`: shared visitor client and private anonymous session credential.
- `api/world.js`: Vercel presence function and exclusive seat storage.
- `server.mjs`: local frontend and shared-world server.
- `src/main.js`: coordinates the world, sidebar, and presence.
- `vercel.json`: Vercel build and API configuration.

The actual geometry seating sheet is `artifacts/furniture-seating-v42-preview.png`. `node scripts/check-furniture-access.mjs` repeats the complete new-seat lobby/entry route audit; `scripts/preview-furniture-seats.mjs` exports actual furniture and seated rigs for offline inspection.
