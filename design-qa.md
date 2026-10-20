# Prototype verification

Current release: version 51, the latest 3D character reference. The newest section records current checks. Earlier sections are historical evidence and can describe superseded proportions, bot counts, controls and layouts.

Interactive browser review remains unavailable. This file does not claim a new Vercel deployment.

## Evidence and scope

Source visual truth: Don’t Look Up screenshots supplied by the user in this chat, used as a character and visual-style reference. The user subsequently requested a third-person camera that always follows behind the avatar; the overhead reference camera is therefore intentionally superseded.

Current spatial reference: Gather's public virtual-office page,
https://www.gather.town/virtual-office. The user requested its kind of layout while
retaining the existing design language and functionality. Its public page and
descriptions were retrieved; a live browser capture of Gather was unavailable.

Implementation: `/workspace/hiring-world/`. No browser-rendered implementation screenshot is available. Actual viewport, screenshot density, same-state comparison, and focused-region visual evidence remain unverified.

## Completed checks

- Vite production compilation and JavaScript imports/syntax pass.
- Application tests cover questions, completion, local persistence, async seat claims, occupied seats, and cancelling a pending application without a stale callback reopening it.
- Bot tests verify exactly 15 deterministic bots, 3 occupied visitor chairs, and smooth collision-free walking paths over five minutes of samples.
- Presence tests cover private anonymous credentials, shared positions, atomic exclusive claims, bot reservations, visitor expiry, late heartbeat behavior, HTTP input/origin validation, and explicit solo fallback.
- A live HTTP check against the running local server passed two independent visitors joining, observing movement, concurrent claims yielding exactly one winner, bot seat protection, and private tokens excluded from snapshots.
- Source-driven geometry checks covered 225 camera configurations: the camera offset remains behind the avatar at every tested yaw/zoom/location. Navigation and seat request/cooldown cases also pass.

## Review fixes

Earlier review fixes: zoom signs, standing-state synchronization, short-window chat scrolling, and navigation routes around desks.

Current integration fixes: pending application cancellation immediately invalidates a seat request; requests preserve a generation token across all waits; owned seats do not count as unavailable to the same visitor; bots and real seat owners remain distinct; the camera follows actual avatar position so a teleport cannot put it in front.

## Required visual surfaces

- Typography: DM Sans/Space Grotesk with system fallbacks; actual wrapping and rendered font appearance unverified.
- Spacing/layout: full-viewport world, floating navigation, seat-count FAB, floating job/chat panel, left-edge camera controls, and minimum 1280px viewport implemented; camera composition, projected label overlap, and short-window reachability need visual review.
- Colors/tokens: pale green garden, cream paths, warm timber decks, white figures, dark outlines, and muted accent colors implemented; browser-rendered contrast unverified.
- Assets: procedural white 3D characters, black hairstyles/ties, desks/chairs/laptops, speech clouds, and 15 bot figures implemented to satisfy requested real 3D motion; no raster character assets copied.
- Content: fictional roles, scripted questions, and browser-local answers. Bot labels and the bot-count/solo-preview caption have been removed as requested; live visitor labels remain. No actual job applications are submitted.

## Remaining verification blockers

The Browser skill was read, but no Node REPL/browser-control execution tool is exposed. No alternate browser automation path was used. Camera math, compilation, HTTP checks, and source review do not establish visual or interactive browser correctness.

The shared Redis Lua operation needs execution against a configured Redis service. Production Vercel multiplayer and a public URL cannot be confirmed: the Vercel connector is administrator-disabled, the enforced network policy blocks Vercel, authentication is unverified, and Redis is not configured.

Do not describe this build as visually verified, publicly deployed, or production ready.

## Latest layout iteration

Replaced the bounded world/sidebar grid with a full-viewport canvas and floating
navigation. The seat-count FAB toggles a persistent non-modal job/chat window;
job selection and seating open it automatically. Help moved to the top navigation,
and camera controls moved to the left edge in the subsequent revision. Existing flows and all controller
DOM targets were checked; browser-rendered layout verification is still blocked.

## Character and locomotion iteration

User feedback identified frozen legs, floating motion, dangling arms, and visibly
separate blob primitives. Replaced the model with one connected 6,644-triangle
skinned body and a 15-bone skeleton. Animation now uses actual frame movement,
world-space stance foot plants, hip/knee IK, visible swing-foot lift, relaxed bent
elbows, opposite arm swings, and stop/turn correction. Furniture heights match
the short-legged seated pose so feet can reach the ground.

Five character regressions pass: mesh connectivity/weights, actual limb motion,
world-space stance stability, grounded idle/seated articulation, and finite backward/
sideways/turn poses. These tests measure foot and hand positions rather than only
checking that animation functions were called.

Actual deformed meshes and their outline hulls were exported and rendered in
Blender for front, three-quarter, rear, walking, and seated inspection. Evidence:
`artifacts/character-contact-sheet.png`. Initial renders revealed arm-to-hip bridges
and underarm membranes; corrected the rest silhouette and shoulder union and
rendered again. The resulting poses have separate mittens/forearms, rounded elbows,
visible alternating steps, and grounded seated feet. Offline lighting differs from
the website, so this evidence verifies geometry/poses rather than browser rendering.
Interactive browser verification remains blocked; final result remains blocked.

## Third-person steering and camera iteration

User feedback identified sideways floating and a view change on key release.
Keyboard movement previously left a target one unit ahead after release, then
switched to click-navigation facing logic. Key release now clears that target.
The avatar eases toward its resolved movement direction during the walk, with
reduced travel speed while turning. Camera yaw and position follow continuously
through both movement and stopping, while remaining within the rear view.

Each continuous keyboard gesture captures a stable camera-relative basis so
camera rotation cannot feed back into an unintended curved path. Pointer turns
adjust that basis deliberately. Opposing keys, focus/visibility changes, chair
requests, and click navigation clear or restart the gesture as appropriate.

Seven controller regressions pass: left/right facing, straight held movement,
release continuity, rear view during reversals/position jumps, equivalent turns
at 30/60/144 fps, mouse turns, and bounded zoom/seating resets. Character tests
still check actual limb movement and stance stability. Compilation and automated
checks do not establish browser interaction quality; visual verification remains
blocked by the unavailable browser-control tool. The public Vercel site has not
been updated by this workspace.

## Keyboard movement iteration

Removed arbitrary floor-coordinate click-to-walk at the user's request. Walking
uses WASD or arrow keys; dragging still turns the view and scrolling still zooms.
Explicit role and job-popup selection continues to route the visitor to a chair.
The exploration help and README no longer advertise floor clicking, and the unused
pointer icon was removed. Interactive browser verification remains unavailable.

## Bot-seat challenge iteration

Approaching an original bot-occupied chair opens a three-bump challenge. Space or
the Bump button triggers a short open-hand arm gesture and seated recoil. The job
panel offers the same challenge without creating an interview. Ground clicking
remains disabled. Winning atomically claims the chair, records the bot defeat, and
returns the panel to Apply. Actual visitors cannot be challenged or displaced.

Bot defeats and deterministic departure timestamps appear in shared snapshots.
Each defeated bot rises, turns, and walks a permanent clear aisle loop, preserving
all fifteen bot IDs. The winning human waits beside the chair while the bot exits,
then walks in and sits. This is presentation only; exclusive ownership is granted
immediately, with no delayed claim that could steal a replacement visitor's seat.

Completed automated checks cover three deliberate hits, cooldown and progress
expiry, range and seated denial, competing challengers, protected real visitors,
offline wins, request failures, UI cancellation/stale responses, returning to
Apply, arm articulation, planted feet, rising, continuous bot departure, and human/
bot handoff clearance at all three chairs. The Redis Lua script also passed an
execution check using a Redis-command/TTL simulator; no configured Redis service
was available. A new live HTTP run was blocked by local socket permission errors;
API handler and store tests passed. Production compilation passes.

Interactive browser verification is still unavailable. No Vercel deployment was
performed for this iteration; final result remains blocked for visual verification.

## Ambient bot scuffles

Two pairs of existing bots now have repeating cartoon scuffles: one near the
starting position and one farther into the open aisles. They step in, alternate
open-hand jabs and upper-body reactions, take short breaks, and step apart.
Staggered shared-clock cycles keep at least one pair active. Existing rig motion
drives the arms and planted feet; a brief small outlined star marks contact.
No extra characters, models, textures, audio, or dependencies were added.

The world retains fifteen bot IDs, including eight ordinary walkers and three
initial seated occupants. Bot-seat challenges and defeated-bot departures retain
their existing ownership and rendering behavior. Sparring does not claim chairs.
Automated checks cover deterministic timing, paired facing and spacing,
alternation, cycle continuity, and table/chair clearance. Browser-rendered visual
verification remains unavailable, and the Vercel site has not been redeployed.

## Chair exits and cozy living space

WASD and arrow keys now capture movement from non-editable sidebar controls as
well as the canvas. Movement while seated releases the chair, cancels pending
application work, closes the job window, restores canvas focus, and continues
walking. Editable chat/search fields retain typing and caret navigation. The
exited role is suppressed while the visitor remains beside that table.
Discovery at another table uses the compact role prompt; the sidebar opens only
when a role is explicitly selected or the visitor sits. Company
captions above floating job designations and the extra near-prompt eyebrow were
removed; role titles and seat availability remain.

Added two lounge areas with six organic bean bags, two oval rugs, six plants,
coffee tables with books/mugs, a reading lamp, and a bookshelf. Two table-tennis
tables have nets, court lines, bats, and shared-clock bouncing balls. Four of the
existing fifteen bots now shuffle and trade forehands, synchronized to ball
contact. Four ordinary walkers, four sparring bots, and the three initial seated
bots remain. Shared procedural geometry/materials keep external asset downloads
unnecessary. Physical furniture bounds are used for keyboard collisions and
chair routing; rugs remain walkable.

Nine automated test files pass, including focused-sidebar movement and chat-field
guards, chair/application lifecycle, furniture clearance/resource reuse, rally
continuity/net clearance/bounces, player/ball contact timing, forehand articulation,
and grounded feet. Production compilation passes. An offline render of the actual
deformed geometry was inspected: `artifacts/cozy-space-preview.png` shows both
lounge clusters, table-tennis overview/contact, and furniture details with coherent
scale and no visible overlaps in those views. The rendered contact is within the
paddle radius. Job desks and UI are omitted from that focused geometry preview.

This establishes geometry and automated behavior checks; interactive browser
verification remains unavailable. The live Vercel site has not been redeployed.

## Available-seats button position

Moved the available-seats FAB to the bottom left at 96px from the edge, with a
24px gap after the left-side zoom controls. The button still opens the job window
on the right. The compact center prompt retains clear horizontal space at the
minimum supported 1280px width. Browser visual verification remains unavailable.

## Slow camera follow

Latest feedback requests a steady view on key press and a very gradual change as
the visitor keeps walking. Automatic camera yaw is now independent of the
avatar's prompt turning. Both former rear-angle clamps were removed so they
cannot force the view around during a reversal. After 0.25 seconds and 0.18 units
of sustained travel, automatic rotation ramps at 35 degrees/s² up to 25 degrees/s.
Short taps, stationary keyboard intent, and seated heading updates do not start an
orbit. Stopping brakes remaining yaw momentum without completing a catch-up turn.
Explicit mouse turning uses its own responsive path. Fresh keyboard gestures
restart travel confirmation; held gestures preserve their captured input basis.

Ten controller regressions pass, including short taps, blocked movement, gradual
starts, speed/acceleration limits, reversals, stopping, position jumps, stable
held input, mouse control, zoom/reset, and equivalent behavior at 30/60/144 fps.
This supersedes the earlier strict rear-angle constraint: the camera can retain
its prior view while the character turns and settles behind during walking.
Interactive browser verification remains unavailable; Vercel was not redeployed.

## Inverted pointer drag

Reversed horizontal pointer-drag turning for mouse and trackpad. The signed drag
delta now reaches the manual turn controller with the opposite sign. Existing
drag threshold, turn sensitivity, smooth manual motion, keyboard follow, and zoom
retain their prior behavior. Browser interaction verification remains unavailable.

## Open garden and workspaces

Replaced the empty floor neighborhood with nine outdoor workspaces linked by
cream gravel paths. Each timber deck has low wooden railings and a real 3.2-unit
front opening, with the job desk, laptop and chairs centered inside. Every space
also has an inward-facing couch and whiteboard, a beanbag, and three potted
plants. Upholstery rotates through sage, clay, and butter. Scattered perimeter
trees leave the garden open. Public lounges and both table-tennis tables now sit
in the forecourt.

All fifteen bot identities and activities remain. Four walkers follow the garden
path network, sparring pairs use clearings, and defeated seated bots exit through
the gates before joining the paths. Shared station positions also drive presence
and seat ownership. Existing camera, inverted drag, keyboard exits, application
chat, and minimum desktop width remain in effect.

Fourteen focused layout, scenery, and navigation checks pass. They cover path
connectivity, all nine chairs and challenge approaches, furniture clearance,
journeys between workspaces, routes from the forecourt, and rejection of closed
entrances. Dense independent route sampling caught corner clipping from the
old coarse line checks; exact segment/AABB collision checks fixed it. Manual
walking and routing now use the same 0.32-unit clearance so a visitor beside a
railing can still select a chair. The full automated suite and production build
pass. Existing bot route/departure checks cover five minutes of samples.

The actual scene was exported with all 1,713 instanced garden parts expanded,
then rendered offline and inspected in three views. Evidence:
`artifacts/garden-preview.png` contains the garden overview, a furnished workspace,
and starting third-person framing. Initial path intersections had coplanar
surfaces; tiny distinct heights removed their visual overlap. The corrected views
show clear entrances and no visible furniture collisions. Repeated garden parts
use 30 instanced batches and 22 shared GPU resources, with no asset downloads.

This is scene geometry and automated behavior evidence. It does not establish
browser rendering, interaction quality, or live multiplayer behavior. Browser
verification remains unavailable, and the public Vercel site was not redeployed.

## Solid objects and bump movement

Removed automatic X/Z sliding after a blocked move. A swept movement check now
stops the entire travel vector just before the first solid boundary, so diagonal
input cannot glide around an object and a large frame cannot cross a thin rail.
Holding against the same object keeps the collision root stationary. Moving
aside or backing away is permitted immediately. A new contact plays one brief
upper-body recoil while the feet settle from actual resolved velocity.

Added physical footprints for both chairs at every job desk. Free-role navigation
ends 0.74 units in front of the seat, outside its 0.70-unit inflated boundary and
inside the 0.78 automatic seating trigger. Selected-route final tolerance is
0.01, and route corners are reached before changing segments. Standing up during
a cancelled chair handoff also resolves to a clear position. Existing seating
remains an intentional placement into the selected chair. Enlarged rail-cap,
couch, tree-root shrub, and reading-lamp bounds to cover visible geometry.

All 91 checks across 14 files pass, including nine swept-collision regressions
and three station-clearance checks. Production compilation passes. Independent
stepped route simulations covered the start and all nine chair exits to every
role at 30/60/144 Hz: 270 approaches reached their seating triggers without
collisions or stalls. This verifies collision behavior and route integration;
interactive browser verification remains unavailable. Vercel was not redeployed.

## Seat-only job descriptions

Desk proximity no longer renders a job description or shows the compact nearby
role popup. Clicking an in-world label or a role in the FAB roster starts a walk
to its chair, clears previous details, and closes the window during navigation.
The FAB still opens the roster manually, and passing desks cannot change its
content. Saved conversations also return to the relevant chair before offering
Continue. A seated visitor can reopen their current role.

Seat reservation and visible arrival now have separate callbacks. Ownership and
presence update immediately, while descriptions open only when the avatar is
visibly seated. This includes the wait for a defeated bot to leave its chair.
Standing up, cancelling a claim, or leaving before arrival prevents a late popup.
The separate bot-seat challenge remains available.

All 101 automated checks across 15 files pass, including nine checks against the
actual main coordinator with rendering/network boundaries stubbed, plus roster
selection and saved-chat flow checks. Production compilation passes. These checks
do not constitute interactive browser verification, which remains unavailable.
The Vercel site was not redeployed.

## Persistent left FAB anchor

The available-seats FAB now has its own `#seats-toggle` positioning rule: fixed
96px from the left and 24px from the bottom, with top/right reset to auto and no
margin. It keeps the 24px gap after the zoom controls in both open and closed
states. Appearance states remain separate from positioning. Source review found
no media query or JavaScript that changes its anchor. Production compilation
passes; browser interaction verification remains unavailable.

## Connected campus layout

Replaced nine identical fenced pods with five varied outdoor rooms: two larger
shared studios with two desks each, one three-desk lab, and two quiet single-desk
rooms. All nine job positions, per-desk furnishings, visitor coordinates, and bot
routes stay stable. Continuous timber floors replace the former internal pod
boundaries. Thirty-seven outer rail segments leave 17 real front/back openings;
both main avenues pass through the shared rooms. A broad walkable forecourt ties
together the existing lounges and table-tennis tables. Cream, sage, clay, butter,
wood, and outlined white characters retain the established visual language.

The existing interface and hiring interactions remain: desktop minimum 1280px,
full-screen third-person world, bottom-left FAB, inverted dragging, hard-stop
collision with a bump, and job descriptions only after visible seating. This is
a spatial arrangement change using Gather as a reference.

All 105 direct checks across 15 files pass. Independent stepped QA completed
396 free/occupied chair approaches over 88,511 walking frames, 180,015 bot poses
across five minutes, and 612 repeated-contact/back-away checks on 153 solid
objects. A mathematically tangent beanbag corner exposed a floating-point overlap
roughly 8e-15 units wide; the shared segment test now treats round-off-sized
intervals as tangencies. The exact 20Hz regression passes, and strict point-inside
checks still find no object penetration. Production compilation passes.

Actual scene geometry was exported with all 1,580 garden instances expanded and
rendered offline. `artifacts/campus-preview.png` shows an overview, a continuous
shared studio, and the starting third-person view. The inspected views show clear
doors, clean floor junctions, and no visible furniture collisions. The scenery
uses 39 instanced batches and 26 shared resources, with no external models or
textures. Offline lighting differs from the website. Browser-rendered fidelity
and interaction remain unverified; the live Vercel site was not updated.

## Solid characters, delayed chair exits, and seated sidebar nudge

The local visitor now stops against bots, recruiters, and live visitors as well
as furniture. Swept body checks use the displayed positions and stop on the
original line without automatic sliding. Walking bots can choose a short clear
detour around another character. Coincident visitor arrivals resolve into nearby
reachable positions, and hidden/unplaced bodies do not leave floating labels.
Seating transfers and timed bot handoffs also check bodies and furniture, with
only the owner's applicant chair exempt. A blocked arrival withholds its seated
pose and sidebar-ready event until the visible body reaches the seat.

A seated visitor rises in place for 750 ms, then steps clear over 300 ms using
the existing rig. Movement waits for this departure; a released tap leaves the
visitor standing and a held key resumes walking afterward. A blocked step pauses
without releasing the chair. The stand-up operation is shared across repeated
leave requests. Queued job selection cancels on manual movement or teardown.
Old world callbacks and delayed claims cannot release a replacement world's
chair when the viewport is reduced and restored.

Closing the job window with X, Escape, or the bottom-left FAB keeps the visitor
seated and leaves the current chat DOM and draft intact. A persistent small
bottom-center nudge reopens the same window. It disappears while getting up,
after seat loss, below 1280 px, or on teardown. The FAB keeps its left anchor.

Independent integration tests execute real Three.js scene/rig math and the world
loop with only GPU/DOM and deterministic clock boundaries supplied by Node.
Twelve world regressions cover body stops and backing away, bots walking around
a stationary visitor, coincident visitor placement, timed/blocked/diagonal exits,
cancelled navigation, destroyed pending exits, obstructed seat transfers, and
readiness after a blocked handoff. A 600-tick smoke test includes all 15 bots,
sparring, tennis, and three chair departures without hidden or overlapping
characters. Independent randomized body checks pass 17,665 sweeps across over
1.78 million sampled positions. All 157 direct checks across 19 test files and
production compilation pass. Coordinator regressions also confirm that a stale
claim, seat-ready event, or exit callback from a destroyed viewport lifecycle
cannot release or alter a replacement world's seat.

These checks verify the simulation and coordinator behavior. Interactive browser
verification remains unavailable, no configured Redis service was exercised,
and this workspace update has not been deployed to Vercel.

## Double-click ground navigation

Restored pointer navigation on a double-click of the canvas ground. Single ground
clicks do not move the character. Native mouse and trackpad double-clicks project
through the actual camera to a clear ground point, then use the existing route
planner, destination marker, gradual camera follow, and swept collision checks.
Targets inside furniture or other visible bodies are rejected. Interface controls
do not trigger ground movement, and recent drags or cancelled pointers suppress
accidental double-click navigation.

A double-click while seated queues its destination after the existing get-up
animation. A subsequent keyboard movement, role selection, new ground destination,
or teardown invalidates the previous queued request. The help panel and canvas
accessible description now explain the added control. Pointer listeners are
removed when the world is destroyed.

All 165 direct checks across 19 files pass, including eight new world integration
regressions for real camera/raycast coordinates, single-click inactivity,
drag suppression and recovery, UI/solid/body target rejection, seated departure
timing, keyboard/job cancellation, listener cleanup, and a 400-tick route around
desk and garden obstacles. Production compilation and standalone syntax checks
pass. Interactive browser verification remains unavailable; this local package
has not been deployed to Vercel.


## Spacious social campus and continuous seating

The campus now has eight rooms: five workrooms with varied width/depth, two
desk-free social rooms, and a Class 24 information room. Workrooms are deeper,
and 24 sparse room-level props replace 54 repeated per-desk furnishings. Nine
job coordinates remain stable. Twenty actual doorways and branching paths reach
the new side rooms and central gallery promenade. Warm floors, flat sage lawn
islands, rounded path junctions, plants, rugs, and shared upholstery connect the
spaces visually. Seeded variation keeps the world identical for all visitors.

Four new bald companions converse on two social couches with alternating silent
speech clouds and listening gestures. Four free beanbags let visitors settle into
these rooms without opening job descriptions. Their exclusive shared leases use
the same authoritative catalog and release lifecycle as job chairs. Social
companions retain their couch positions, and each seat owner can cross only its
own furnishing during a deliberate transfer. Remote departures keep this
exception until the actual inflated cushion boundary is clear.

Automatic seating retains the same visible character and camera. A continuous
speed-limited approach gently aligns the body and lowers it over 650 ms; a
nearby free job chair normally completes the transfer in about 0.9 seconds.
A blocked transfer pauses before contact and withholds the job description.
Leaving midway rises from the current lower-body pose. An exited seat stays
unarmed until the visitor moves away or explicitly selects it again, preventing
an idle character from immediately sitting back down.

The shared body has narrower sloping shoulders, slimmer relaxed arms, a rounded
torso, continuous field normals, and softer shading. Its 8,660 triangles and
15-bone rig are shared; no per-frame meshing or downloaded models are added.
All characters start bald, with optional hairstyles available through A fresh
look. Hairstyle 5 represents the bald appearance throughout client and server.

The navigation is full width and flush with the top, left, and right edges.
Its Class 24 button walks to the new room. Five solid exhibits each show a short
dummy paragraph, as explicitly requested; real information can be added later
in src/info-content.js. A single exhibit click requires proximity. A distant
click neither opens content nor starts walking. Information occupies a separate
body in the same floating sidebar, preserving application chats and drafts.
Ground movement remains double-click only, and the FAB stays on the left.

Combined route checks reach 38 destinations: nine job-chair approaches, four
free beanbag approaches, five exhibit interaction points, and 20 doorways.
Source geometry was rendered and inspected offline in a five-view campus sheet
and a separate character contact sheet. The final lawn surfaces are genuinely
flat, removing the shaded edges from an earlier flattened-sphere treatment.
This evidence checks arrangement and poses; browser interaction remains
unverified, no configured Redis service was exercised, and Vercel was not
updated by this workspace.


Final verification for this iteration: all 209 direct checks across 22 files
pass, including 30 real-world interaction cases. The world fixture executes real
Three.js scene geometry, camera projection, raycasts, character rigs, and ticks;
GPU/DOM/network boundaries are supplied by Node. Measured gait-to-lowering
continuity exposed an ankle snap, which was fixed by blending the current feet,
arms, and pelvis into lowering. The first lowering frame now moves the ankles
about 0.0084/0.0020 units relative to the root over 50 ms, instead of 0.327.
Remote entries use the same motion and retain progress across heartbeats.
Dynamic obstructions pause the body and lowering clock together. Default bald
state, optional hairstyles, exclusive shared beanbags, dummy information cards,
and the old double-click-only ground control all pass.

Production compilation and standalone packaging checks pass. No interactive
browser verification or Vercel deployment is claimed.


## Open garden office and visible push handoff

The campus is now one open outdoor office. Removed every fence, gate, enclosing
collider, wooden deck, and plank join. Eight named zones retain stable job,
social-seat, and information-object coordinates, with open lateral approaches.
Continuous lawns, gently curving gravel ribbons, flat oval mineral terraces,
six low planting islands, and 23 trees connect the setting. The nearby beanbag
and sofa at two bot stations moved 0.7 units outward to clear actual tumbles.

All job desks/chairs and the lounge, social, and gallery furnishings now use
slim sage/ivory frames, lighter neutral rounded forms, tapered planters, finer
outlines, and fewer small details. Desktop and cushion heights remain compatible
with the shared character rig. The garden uses 34 instanced batches and 733
instances, reduced from the previous fenced/planked scene. Object geometry and
materials remain procedural/shared, with no model or texture downloads and no
new animation-time mesh allocation.

A seated job bot is displaced with one deliberate Push button click or Space
press. Solo, memory, and Redis commands use the same one-action rule; duplicate
and racing requests yield at most one seat owner. Range and existing visitor
leases remain protected, and old partial bump records do not block the new flow.
Before requesting a push, the world checks the actual landing silhouette against
furniture and other bodies. A blocked landing asks for more room without
reserving a chair. The confirmed player gesture uses both hands and continues
while logical ownership is held.

A shared timestamp drives a 650 ms sideways tumble, 550 ms grounded pause,
950 ms recovery, and 300 ms turn. The same bot body lies on the lawn, gets up,
and walks away; its ID remains present. A larger landing reservation prevents
characters from entering the falling silhouette. If actual movement is blocked,
the fall clock pauses. Local and remote applicants wait for that space to clear,
then approach and lower continuously. Role readiness remains withheld until the
visible user is seated. Cancelling or destroying the handoff prevents stale
sidebar callbacks.

Independent actual-world checks cover all three bot chairs and sample deformed
body vertices at seven fall/recovery times for floor clearance, furniture height
bands, and nearby character cores. New cases also cover blocked landings,
foreign leases, a late visitor entering the reserved area, and cancelled handoffs.
The complete scene keeps all 19 bot activities, shared beanbags, gallery clicks,
remote entries, double-click ground walking, and prior chair lifecycle behavior.

The modern scene preview exposed 48 inverted faces per gravel ribbon from offset
edges folding over very short curved connectors. Short connectors are now
straight while longer routes still meander; every indexed ribbon triangle is
checked for upward winding. Both final 2,128-triangle ribbons have zero reversed
or degenerate faces. The corrected garden scene and six-frame skinned tumble
sheet were rendered offline for inspection.

These checks cover simulation, source integration, and actual geometry. They do
not establish hands-on browser behavior. No configured Redis service was exercised
and the public Vercel site was not updated in this workspace.

Final iteration result: all 229 direct checks across 23 files pass, including
34 actual-world integration cases. The production build succeeds. Standalone
syntax, final-source freshness, and archive integrity are also checked before
delivery.

## Available-seats FAB placement — version 23

The latest request supersedes the earlier left-side FAB placement. The
available-seats button is now fixed 24px from the right and bottom viewport edges
in every open/closed state. Zoom and recenter controls remain 24px from the left
and bottom edges. The production build, compiled positioning rules, standalone
script syntax, and delivery archive integrity are checked for this CSS change.

## Garden lounge rooms — version 24

The five work zones now have distinct open-air lounge arrangements rather than
office whiteboards and isolated desks. Upholstered chairs and oval café tables
retain the nine job positions and shared seat contracts. Sofas, lounge chairs,
ottomans, low tables, books, tea sets, pillows, throws, warm lamps, plants, and
fourteen flat woven rugs establish comfortable corners in sage, clay, butter,
and ivory. Broader ambient light and warmer, softer directional light support
the same outlined character style. The garden stays open, with no new walls.

Both social lounges gain low tables and reading accessories around their
existing shared seats. The arrival lounges add compact loveseats. Class 24
adds two reading sofas, rugs, side tables, books, and a lamp while preserving
the five exhibit positions and nearby-click interactions. Solid additions have
collision bounds. The available-seats FAB remains at the bottom-right and
zoom/recenter controls remain at the bottom-left.

The garden uses 38 static batches and 955 instances with 33 shared resources;
there are no downloaded models/textures or added realtime lights. Combined
walking checks use the actual world furniture bounds, including information
lounge furniture, instead of reconstructing an incomplete parallel list.
Geometry checks cover furniture footprints, seating surfaces, rug overlap,
chair approaches, and bot handoffs. An existing forecourt passage at (9.1, 14)
was kept clear by moving the arrival loveseat before delivery.

Actual skinned fall poses exposed clipping through the first version of the
job chair armrests. Lower and shortened arm variants still intersected the
falling silhouette, so the final job chairs use open-sided upholstered slipper
profiles with their timber feet retained. The established tumble animation and
shared seat heights remain unchanged.


Final version 24 validation: all 233 checks across 23 files pass, including all
35 actual-world cases against the final furniture layout. The original ground
destination (2, -6) stays clear after a small Studio sofa adjustment. All 18 job
chairs fit their shared footprints and retain the .30 cushion surface. Production
build and standalone packaging checks pass. The five-view lounge preview uses
the actual scene, expanded instances, and deformed character skins; it is an
offline geometry review, not hands-on browser verification. This local version
has not been deployed to Vercel.


## One natural garden encounter — version 25

Exactly two of the existing bots now take part in one 24-second encounter:
walking into a bump, an angry exchange, alternating punches, a two-handed shove,
a standing side fall, two brief low kicks, a protective grounded reaction,
recovery through a supported kneel, and disengagement. Three existing bots watch
from an open arc that visitors can join. All nineteen bot IDs remain present,
including tennis players, job occupants, and the seated social companions.

The fighters use the same continuous white skin and fifteen-bone rig. Guarded
arms, shoulder and torso rotation, short lunges, bent knees, planted supporting
feet, and actual-skinned floor support replace the old repeated jab poses.
Measured contact spacings align fists, palms, and toes with the opponent's
visible body. Head-conforming tint geometry fades from white to a gentle red
forehead shade, with angled brows; only the two fighters own these expressions.
Short speech clouds contain symbols rather than written curse words.

The encounter's clock pauses if another visitor obstructs its physical motion
or enters the immediate exchange. Ordinary walkers, tennis, shared chairs, and
social conversations continue. Fallen head/body footprints follow the actual
side fall and kneeling recovery. Movement also checks the next frame's physical
silhouettes so a character cannot enter a falling head between the pose check
and rendering. Audience gaps stay open; there is no reserved perimeter around
the crowd. The user joins by walking to the spectators with existing controls.

The production build remains procedural and self-contained, with no downloaded
models, sound, or extra realtime lights. Automated checks exercise floor support,
phase continuity, gesture contact, all nineteen bots, paused/resumed motion,
a late visitor near the fallen head, and an actual walk into the audience.
The offline storyboard uses the actual rendered scene/rigs, head vertex colors,
material opacity, and captured symbol-cloud text. Browser interaction and Redis
are not manually verified here; this version remains local and is not deployed
to Vercel.


Final version 25 result: all 249 checks across 25 files pass, including all 39
actual-world cases against the final source. The production build succeeds.
The tests verify all nineteen bots remain visible, precisely two fighters and
three spectators, actual punch/shove/kick contact, solid fallen-body clearance,
independent choreography pausing, continued background life, and a completed
walk into the open audience. Packaging verifies standalone script syntax, source
freshness, desktop gating, the right-side seats FAB and left-side zoom controls,
and archive integrity.


## Nearby desk designations — version 26

Job designation labels start hidden and appear only for the nearest desk when
the visible character is within three world units. They disappear after walking
away and remain hidden for distant desks at every zoom level. Proximity uses the
actual animated character position, so reserving a chair from afar does not
reveal its label early during the seated approach. The full job description
continues to open only after visible seating. Existing speech clouds, spectator
reactions, and the seated sidebar reopen nudge retain their separate behavior.


Focused version 26 verification passed against the real world coordinator with
the GPU/DOM boundaries supplied: all labels are hidden at arrival and at maximum
zoom-out, reserving a distant chair does not reveal its label before the visible
body reaches the desk, the nearby designation appears during approach/seating,
and walking away hides it again. All 26 existing application interaction checks
and the production build pass. Standalone script syntax, final source freshness,
archive integrity, and the retained right-FAB/left-zoom placement are checked
during packaging. No browser interaction or deployment was performed.


## Seated body and furniture fit — version 27

The screenshot exposed real intersections: the social couches and beanbags
placed the character near the center of deep cushions, leaving bent knees,
shins, and feet inside the furniture. The shared seated pelvis height is now
.465, applied consistently to idle seating, lowering from a walk, reversed rises,
and standing up. The visible white pelvis is approximately .304 above the .30
seat surface; ankles remain at .11 and soles stay on the ground.

The four couch companions sit toward the front edge, with shallower cushions
and a recessed front crossbar. Shared visitor beanbag anchors also move forward,
with shallower front profiles and a flatter support surface. All lounge seat IDs,
ownership, and approach/exit targets remain stable; the physical seat anchors
are shared with presence and rendering. Job chairs retain their existing world
anchors and collision bounds while their cushion/base front edges stop behind
the bent shins and their timber legs leave the feet clear.

A fully seated visitor shifts .29 forward over planted feet during the rise,
then steps sideways from a job chair rather than through its backrest. The
same weight transfer precedes the existing forward beanbag departure. Actual
visible proposals are checked against furniture and characters, including
during the rise; a blocked path pauses the motion and retains the chair lease.
The 750 ms rise and 300 ms departure remain unchanged. Cancelled partial
entries retain their current pose and reverse from the shared pelvis height.

Validation uses the actual deformed white skin and expanded outline, multiple
talking poses, all eight shared lounge seats, job chairs, and real sitting/rising
transitions. The before-and-after preview compares the archived version 26
geometry with the final corrected geometry rather than relying on shape bounds
alone. The nearby-only designation labels, right seats FAB, left zoom controls,
all nineteen bots, and the single fight encounter remain part of this version.

Final version 27 verification: all 253 checks across 25 files pass, including
39 real-world coordinator cases and actual lounge-skin/outline intersection
checks across all eight seats and seven talking poses per seat. An independent
actual-world sweep sampled the full rise and departure at 26 timestamps for
the job chair and both beanbag orientations: zero white-skin intersections,
minimum sole height .00220, .29 forward transfer, and less than .000009 planted
foot drift during the rise. The final eight-view before-and-after preview is
`artifacts/seating-fit-preview.png`. The production build passes. These are CPU
scene integration and offline-render checks; interactive browser verification
remains unavailable, and this local update has not been deployed to Vercel.


## Character reference style — version 28

The six supplied character illustrations guide the existing procedural 3D
model: a nearly circular head, simple dot eyes, a softly rounded torso, relaxed
sloping shoulders, continuous rounded arms and mitten tips, and short quiet
toes. Body material is now white (#ffffff); default bald avatars, optional
Fresh Look hair, recruiter ties, and the existing shared 15-bone motion rig
remain. The geometry is created and shared locally, without model or texture
downloads.

Actual front, back, side, three-quarter, walking, push, seated recruiter, and
optional hairstyle views are exported by `scripts/preview-characters.mjs` and
rendered by `scripts/render-characters.py`. The reference sheet is
`artifacts/reference-character-preview.png`. It uses actual deformed body and
outline vertices with neutral offline lighting; it is not browser verification.

The typing pose is raised slightly to keep the longer rounded hands above the
desktop. Sitting, lowering, and rising use the same typing angle, while lounge
gestures retain their separate pose. Seated support height, planted soles,
front-edge furniture clearance, and the timed collision-aware get-up behavior
remain part of the validation.

Arm and hip surfaces are separated in the sampled field and skin weights so a
raised mitten cannot pull a sheet of waist skin into its elbow. The final body
uses 6,176 vertices and 12,348 triangles, shared by all avatars, plus the same
shared outline count. Both remain within the existing lightweight character
budget. The final eight-view render has been inspected: the large folded-arm
black wedges are gone, with only small bent-shoulder creases remaining.

Final version 28 result: all 255 checks across 25 files pass, including 39 actual
world integration cases, 81 seated hand/desktop poses, white material and closed
skin checks, and 29 folded gesture poses on both body and outline. The longest
deformed edge is approximately .197 in the white skin and .212 in the outline,
below the .24 forearm length; the broken geometry stretched those edges to
approximately .66. Independent actual-world sweeps found zero furniture
intersections across all 17 seated characters over nine talking phases, and
throughout job-chair and both beanbag rise/departure sequences. Minimum sole
height is approximately .002755 and rising feet drift less than .000009.
The production build passes. Browser interaction was not verified, and this
local version has not been deployed to Vercel.


## Solid furniture during seating — version 29

The prior broad owned-chair exemption allowed a visitor to enter through its
backrest, cross the base while lowering, or cross the chair on a cancelled
approach. Baseline actual-skin sampling found up to approximately 6.5 cm of
penetration. This version replaces that exemption with distinct cushion
support, solid back/arm boundaries, and separate sole checks against legs and
rails. Other furniture and characters remain solid throughout the transfer.

Job entry routes around the backrest to the open front-side gate. A visitor
already close behind the chair first steps away without turning, so swinging
hands do not cut through the back. The front lane sits .43 ahead of the seat;
the visitor faces the table while sidestepping, then backs into the .29 front
support position. The feet settle for 380 ms before the 650 ms lowering, during
which the root and explicit foot targets share one backing offset. Every
polyline corner is reached before taking the next segment.

Departure transfers weight over planted feet, rises, advances through the front
lane, and steps aside at a peak 2.25 world units per second. The same limit caps
predictive footsteps at each segment endpoint. All explicit transfer phases
pause when blocked. Cancelling a lower reverses from the current visible root,
hip height and foot offset, while an upright cancelled approach retains its
current facing. The shared lease is retained until the visitor is physically
clear. Remote visitors, including newly observed won-chair arrivals, use the
same transition paths.

The old bot fall also moved backwards into its own solid backrest. Its 650 ms
tumble now clears .29 toward the front during the first 195 ms, then settles
at the side landing offset (1.2, -.22). The existing grounded, recovery, turn,
and handoff timings remain. Independent actual-world sampling of all three
pushed bots at 50 ms intervals over five seconds found no white body intrusion
past 2 mm into station furniture, no collision-clock delay, and completed
departures more than 2.28 units clear of the seat.

The actual before-and-after storyboard is
`artifacts/seat-transitions-preview.png`. Its final panels show the clear front
approach, supported lowering, reversal of an interrupted lower, the seated pose,
and the front-lane exit. It uses actual world and skinned character geometry;
browser interaction remains unverified.

Final version 29 verification: all 274 automated checks across 25 files pass.
The 43 distinct world cases were verified with 41 passing in the full run and
the two corrected test fixtures passing focused reruns against unchanged final
production source. The new actual-skinned-mesh checks cover front, rear,
close-rear and side approaches; interrupted entry and lowering; complete exit;
remote visitor entry/exit; both beanbag directions; and all three bot handoffs.
They check owned station furniture throughout each transition, grounded feet,
movement speed, seat leases, and sidebar timing. The production build passes.
The before-and-after render was inspected offline; interactive browser behavior
was not verified, and this local update has not been deployed to Vercel.

## Browse opportunities while seated — version 30

All opportunities and Explore now change the sidebar view without releasing the
current chair. Selecting another role delegates the physical departure to the
world coordinator: rise, walk clear, release the original chair, walk to the
selected destination, and lower into its chair before opening the description.
Selecting the current role simply reopens its description. A newer selection
during the rise supersedes an earlier destination without starting another exit.

An already-confirmed chair is also retained when a user opens the roster while
Apply is still starting the chat. Cancelling an unconfirmed new claim retains
the existing release behavior. The explicit Leave table & explore action still
gets up, and saved conversation answers remain available.

The selected destination's ordinary walking route uses the same wider turning
clearance as its final seat approach, so the character's swinging hands clear
the backrest before entering the front lane.

The final approach endpoint now remains available during the stationary
alignment phase. This bounds the last velocity-driven predicted footstep before
the gait settles, rather than allowing the heel to cross the chair base for two
frames. No character geometry or general walking animation was changed.

Version 30 validation: 106 focused checks across eight files pass, including
10 application, 27 coordinator, 43 collision/navigation/seat-controller,
20 character-motion, and six actual-world scenarios. The new end-to-end case
checks the same-seat selection, latest destination during rising, normal speed,
old-seat lease retention, automatic destination seating, and actual white mesh
clearance throughout the complete journey. Existing automatic arrival and five
approach directions were rerun after the final alignment fix. An additional
distant occupied-chair run reaches the push prompt in 115 frames while
remaining clear of the destination furniture. The production build passes.
The full suite now contains 279 checks; the unchanged tests retain their
version 29 results. Browser interaction was not verified, and this update
has not been deployed to Vercel.

## A more colorful garden — version 31

The garden now has distinct blue, lavender, rose, terracotta, and ochre terrace
and rug finishes, with warmer sand paths and deeper natural foliage. Chairs,
sofas, beanbags, pillows, books, ceramic pots, and lamps carry related accents.
Table-tennis tops are dusty blue with slate frames; job tables use warm wood
and six chair colors. The information lounge uses blue and terracotta seating
and lavender rugs. Navigation buttons, chat bubbles, and zoom controls have
matching restrained accent colors. Character body materials remain white.

Background and fog use a neutral blue-gray; the outer floor uses warm sand.
Neutral daylight at slightly lower intensity retains the colored materials.
Geometry, object positions, collision footprints, and character/seat behavior
were not changed. Garden rugs share a white toon material with per-instance
colors; the static scene remains 38 draw batches, 955 instances, and 65 colliders.
No external models, textures, or downloads were added.

All 64 existing focused checks across garden layout/space, cozy/social space,
information exhibits, station footprints, and the application coordinator pass.
The production build passes. The inspected actual-scene four-view render at
`artifacts/color-garden-preview.png` includes the per-instance rug colors and
shows the distinct zones and white characters together. Raw geometry remains
in /tmp. This is an offline render; browser interaction was not verified, and
the update has not been deployed to Vercel.

## Connected lounge rooms — version 32

The previous oval open zones are now eight rectangular rooms: five job lounges,
two social rooms, and the Class 24 information room. Straight shared hallways
and a rectangular arrival lobby link 20 physical doorway openings. All nine
job stations, furniture positions, four free lounge seats, and crowd circuits
retain their shared coordinates. Color finishes and white character bodies
are retained. Peripheral lawns, trees, and planting frame the office.

Fifty-two solid plaster wall segments use front/back/side cutaway heights of
0.85/1.15/1.0 units. Geometry and base collision footprints agree exactly, with
colored top caps, slim baseboards, no roofs, and no invisible doorway barriers.
Wall-only walking clearance is 0.50 units, covering forward shoes and swinging
hands; furniture remains at its prior clearance. Held movement stops, and the
user can back away or steer to a door. Selected-chair navigation routes through
openings and uses the existing smooth get-up, entry, and lowering controllers.

The static environment uses 39 instanced batches and 1,078 instances, compared
with 38 batches in version 31. The shared plan has 117 colliders, including
52 wall segments. The inspected actual-scene render is
`artifacts/connected-rooms-preview.png`; its overview and doorway, corridor, and
social room views show the final geometry and colors. Raw geometry stays in
/tmp. This is an offline render; interactive browser behavior was not verified.

Focused world checks pass for all nine chairs, four free beanbags, information
exhibits, and doors from spawn and through a room tour; white character skin
against all four studio wall sides and through its doorway; automatic travel
between chairs in distinct rooms; and all 19 ambient bots with all three pushed
bot departures. The wall contact probe permits only a 4 mm numerical contact
tolerance. An independent four-minute sweep sampled 182,438 actor positions
without a wall overlap.

Final version 32 result: all 284 automated checks across all 25 files pass
against unchanged final production source, including all 46 world scenarios.
Each test file was run in its own Node process with per-case counts checked;
the production build passes. The single-file local prototype and archives
contain the same final sources and inspected preview. This local update has
not been deployed to Vercel.

## Character rebuilt from four reference views — version 33

The previous model had a small head, high eyes, angular shoulders, short straight
arms, and lumpy joint/foot contours. The actual continuous skin now uses a rounder
head, lower eyes, sloping shoulders, long pear torso, bowed hanging arms and plain
mitten ends, short uninterrupted legs, and flatter rounded soles. All body
materials are pure #ffffff; the black outline, bald default, optional Fresh Look
hairstyles, recruiter tie, and shared 15-bone articulation remain.

Approximate manual drawing proportions and final neutral actual-mesh values:

| Measure | Drawing estimate | Final 3D geometry |
| --- | ---: | ---: |
| Head width / standing height | .354 | .3568 |
| Overall width / height | .54 | .5317 |
| Central leg split / height | .21 | .2004 |
| Eye depth from head top | .68 | .6772 |
| Head profile / front width | 1.00 | .9599 |

These quantify the reference silhouette; they do not establish pixel-perfect
equivalence of a 3D model to the hand-drawn 2D views. The new reference regression
checks these proportions against bands derived from the supplied drawings.
The closed connected white skin has 6,144 vertices and 12,284 triangles; skin
and outline stay within the existing 30,000-triangle character budget. A
29-pose deformation sweep peaks at .20869 white / .20854 outline edge length,
below the retained absolute .24 limit. Curved gap sampling and smooth shoulder
weights prevent hand-to-waist sheets during walking, pushing, and typing.

The longer hands required fitted motion. Shared seated hip height is .555;
actual white support is .3210 and outline support .3040, above the .30 cushion.
A small transfer tuck clears the desktop while lowering and rising. A folded
forearm pose protects the hands during the existing side tumble. Its final
floor correction uses a cached actual-skin support cloud with a 3 mm margin.
Tennis contact remains within its original target tolerance. Eyebrows follow
the actual low eyes, their full back corners sit outside the real head surface,
and the shared forehead tint remains within its original geometry budget.

The inspected final eight-view render is
`artifacts/reference-character-v33-preview.png`. Primary front/back/profile/walk
views use flat white shading for silhouette comparison; the lower row shows
softly lit actual 3D poses. Runtime body materials remain white Lambert. The
raw capture and geometry report were regenerated from final source, replacing
stale version 28 data. This is offline actual-geometry inspection; browser
interaction was not verified.

Final version 33 validation: all 285 distinct checks across 25 files are
validated using the full per-file run and focused final reruns. The focused
reruns cover the exact skin floor correction and two existing world tests whose
phase detection previously assumed the old seated hip height. Their continuity,
collision, seat-lease, and callback assertions remain intact. Final character
21/21, fight 6/6, bot-push 6/6, actual three-chair tumble clearance, and both
updated automatic-entry/cancellation scenarios pass. The production build
passes after the final support change. This local update has not been deployed
to Vercel.


## Facing before walking and nearest chair routes — version 34

Ordinary keyboard walking and double-click navigation now retain a direction
intention while the body turns in place. Root translation waits until the
body faces within five degrees of that intention, then ramps to walking speed
over 0.12 seconds. The same gate applies at routed corners and reversals. A
90-degree turn takes about 0.37 seconds; a half-turn takes about 0.45 seconds at
60 fps. The camera still follows actual travel, retaining its gradual speed,
acceleration, and braking limits; turning in place does not begin automatic
camera rotation. Releasing a key during a turn cancels translation.

Chair selection compares complete reachable access routes instead of routing
every visitor to the same side. The short existing centered transfer is retained
for someone already safely in front. Backrests and desks can require the nearer
clear side; their collision bounds stay solid. Departure candidates include a
front stop outside the ordinary owned footprint and turn clearance. If a desk
blocks the front, it is rejected. A selected role, ground destination, or movement
key supplies the onward direction so the exit can minimize the continuing walk.
The controlled rise, planted feet, occupied-seat lease, and sidebar timing remain.

The remaining 25 test files passed 247/247 checks against unchanged production
source. The full actual-world file passed 49/50 on the same source; its sole
failure expected translation on the first frame after a chair departure. That
expectation predates the requested turn-first behavior. The corrected scenario
retains the rise, lease, promise, speed, and final-destination checks and now
requires a stationary turn before aligned walking. Its focused final rerun
passes, validating all 50 world scenarios and 297 distinct checks across 26 files.
The production build and self-contained artifact syntax/integrity checks pass.
This is a local prototype update; hands-on browser verification and a Vercel
deployment remain unavailable in this workspace.


## Continuous walking through direction changes — version 35

The user revised the previous turn-first behavior after trying it. Removed the
heading-angle gate from walking preparation: a new walking intention updates
body facing without setting speed to zero. The existing 0.12-second launch ramp
applies only after true idle and is retained through corners and reversals.
Body rotation still eases at its established rate. Camera speed, delay,
acceleration, braking, zoom, inverted mouse dragging, and the stable held-input
basis are unchanged.

Walking retains its exact requested line and next-waypoint segments. Each
translation still sweeps the existing solid furniture and character footprints,
so removing the pause does not introduce curved corner cuts. Releasing input,
arriving, or bumping a solid object still stops movement. The previous version's
nearest safe chair approaches and goal-aware departures are retained.

The focused controller checks require nonzero movement while turning at 30,
60, and 144 fps, smooth converging body rotation, and full speed throughout
90-degree corners and reversals. World checks now require continuous actual
movement while turning, exact routed obstacle clearance, bounded camera yaw,
and walking only after a seated visitor finishes the physical chair departure.
These replace the previous version's stationary-turn expectations in response
to the user's revised behavior request.

Final version 35 validation: all 297 checks across 26 files pass against
unchanged final production source. This includes 247 checks in the other 25
files, focused 6/6 world cases, and a full 50/50 actual-world run. Production
compilation and the standalone JavaScript bundle pass. The packaged HTML and
archives pass syntax, desktop-gate, UI-placement, final-source agreement, and
integrity checks. This local update has not been browser play-tested or
deployed to Vercel.


## Smooth shoulder and arm joins — version 36

The previous relaxed model was watertight but had an overly high armpit notch
and a small outer shoulder ledge. In front/back views this read as a split at
the shoulder attachment. The field now uses a broader smooth upper-arm union,
a lower rounded armpit subtraction, a gradual torso/arm weighting transition,
and four extra sampling rows localized to the shoulders. The rest bones,
reference proportions, white material, accessories and motion logic are retained.

The skin has 6,656 vertices and 13,308 triangles; skin plus its actual black
outline has 26,616 triangles. The full optional-hair/tie character stays below
30,000 triangles. Forty-eight actual triangle-ray samples across the former
upper slit have minimum surface depth .1475224 (required .04). Six lower-arm
samples retain a clear opening, preserving arm separation. These regressions
measure the visible surface rather than relying only on connected topology.

All 21 original character checks and two new shoulder checks pass without
relaxed limits. A 105-pose inspection covers the original 29-pose sweep and
76 additional walking/active poses, both punch sides, pushes, shoves, tennis,
true falls, recovery, and seated gestures. The longest final edges are .2272574
for white skin and .23475194 for outline, below the retained absolute .24 cap.
The expanded check caught a punch stretch during development; the final weight
falloff corrects it. Whole-figure reference proportion measurements are unchanged.

The final actual-mesh comparison is
`artifacts/shoulder-smoothing-v36-preview.png` (1280 x 1464, 392,294 bytes).
Eight before/after pairs use matching cameras, poses, white skin and runtime
outline. Root and render review inspected the front/back, three-quarter,
walking, raised, pushing, seated and whole-figure views. The shoulder split
and small contour ledge are removed. Canonical raw geometry and current
measurements are refreshed in `artifacts/character-preview.json` and
`artifacts/character-geometry-report.json`.

The production build and standalone bundle pass. All 299 checks across 27
files pass against unchanged final production source. This includes 249 checks
in the other 26 files and all 50 original actual-world cases in four disjoint
name-pattern groups, with only progress callback logging added in a temporary
harness. Source/test/API fingerprints remained unchanged. The initial serial
world run exceeded its 440-second test budget in the restored environment; a
read-only benchmark identified slow scene generation in isolated VM contexts.
The grouped run covered every original case exactly once and completed in
295.72 seconds. No assertions or collision limits were relaxed.

This is offline actual-geometry inspection and automated simulation; hands-on
browser playtesting remains unavailable. No Vercel deployment is claimed for
this update.

## User-supplied background music — version 37

Added the attached `maksymmalko-funny-cartoon-music-532611.mp3` as ambient
background music. Its local runtime copy, `public/audio/background.mp3`, retains
the 3:08 duration and is encoded at 96 kbps: about 2.25 MB rather than the roughly
6 MB original. The production build serves this file locally, and the portable
standalone embeds the same compressed track. No external music service, new
runtime dependency, or Web Audio context is needed.

Music defaults to enabled but waits for a real interaction before creating an
HTML audio element or assigning its source. One reusable element loops at 18%
volume. The full-width navigation has a Music on/off control with matching
accessible labels and pressed state. Mute preference uses its own localStorage
key, `common-ground:music-enabled`, and storage failure remains harmless.
Capture-phase gesture handling excludes the toggle itself, so a first click
that mutes never briefly starts the track. Synthetic events, repeated or modifier
keys, shortcuts, and typing in editable fields do not unlock it by themselves.

The controller pauses hidden tabs, suspended pages, and small-screen views below
the existing 1280-pixel desktop threshold. It resumes only when enabled and
previously unlocked. A rejected or synchronously failed play request waits for
the next real gesture rather than disrupting the world. Pending play results
recheck current eligibility, preventing late permission from reviving muted,
hidden, suspended, small-screen, or disposed playback. Existing character
conversations and fight gestures still have no separate audio effects.

All 19 focused tests in `tests/background-music.test.js` pass under direct Node
execution. They cover lazy loading, one looping element, bounded volume,
remembered mute, the first-toggle capture order, eligible gesture filtering,
denied storage, rejected/synchronous failures and retry, hidden/page/viewport
suspension, repeated gestures during pending playback, stale promise resolution
and rejection, and cleanup. The prior 299 checks across 27 files are the version
36 baseline; this audio change does not claim a complete rerun of those cases.

Existing integration checks also pass: 27 main-coordinator, 3 movement-input,
and 13 third-person cases. Together with the audio checks, this is 62 focused
checks across four files. Version 37 production compilation passes with the
existing nonfatal Vite chunk-size warning. Full-track decoding succeeds; ffprobe
reports 187.846531 seconds, 2,254,515 bytes, stereo 44.1 kHz, and 96 kbps.
Local HTTP verification returns the production index and byte-identical audio
with status 200 and `audio/mpeg`; a range request returns status 206 with the
correct first 1,024 bytes.

The standalone track matches the runtime MP3 byte for byte, and its inline
JavaScript passes syntax validation. The portable ZIP restores with all 138
exported file hashes matching. These packaging checks are separate from the
62 focused tests. Browser listening and hands-on autoplay verification are
unavailable here; automated media doubles establish state handling, not audible
playback. No Vercel deployment is claimed.

## Sampled footsteps synchronized to actual gait — version 38

The latest attachment, `freesound_community-concrete-footsteps-1-6265.mp3`, is a
7.584-second, 24 kHz stereo source. Four distinct sole contacts were isolated
without pitch shifting or time stretching. Runtime WAV files use mono 22,050 Hz
PCM16, matched peak 0.419983 (−7.535 dBFS), a 0.8 ms attack fade, and a 35 ms tail
fade. First and last PCM samples are zero, with contact onset under 2 ms.

| File | Duration | Bytes | Source start | Contact onset |
| --- | ---: | ---: | ---: | ---: |
| `public/audio/step-1.wav` | 0.300 s | 13,274 | 0.298542 s | 1.995 ms |
| `public/audio/step-2.wav` | 0.320 s | 14,156 | 1.641542 s | 1.678 ms |
| `public/audio/step-3.wav` | 0.300 s | 13,274 | 4.136833 s | 1.995 ms |
| `public/audio/step-4.wav` | 0.340 s | 15,038 | 6.088125 s | 1.905 ms |

The four samples total **55,742 bytes**. Full FFmpeg decoding succeeds for every
sample, and waveform measurements confirm these format, level, onset, and
boundary values. Evidence is `artifacts/footstep-sampling-report.json`. This
establishes media validity, not audible browser listening quality.

Footstep triggering follows only the local player's actual animated
swing-to-stance contacts, not elapsed wall time or held-key intent. Actual travel
speed and gait progress determine cadence across frame rates. Idle, fully
collision-blocked movement, seating transfers, and fight gestures emit no
footfalls; bots and remote visitors do not add step noise. Existing movement,
white character geometry, smooth shoulder surface, rooms, and camera are retained.

The previous Music on/off navigation control becomes **Sound on/off**, governing
both the looping background track and sampled steps. Its legacy preference key,
`common-ground:music-enabled`, continues to respect saved mutes. One Web Audio
context is reused for the short samples at 40% gain (impact peaks below 0.17),
with fetching and decoding deferred
until a real eligible interaction. Music retains its HTML audio element. Mute,
hidden tabs, page suspension, and the existing sub-1280-pixel guard stop active
step sources. Stale contacts are discarded rather than replayed after resuming
or after asynchronous decoding completes. No audio library, separate network
service, new world geometry, or bot sound layer is introduced.

Version 38 passes **130 focused checks across nine files**: 22 sampled
footstep-audio, 12 foot-contact motion, 30 main-coordinator, 21 character, 6 fight,
19 background-music, 3 movement-input, 13 third-person, and 4 actual-world cases. These check
actual contact timing, speed/frame-rate cadence, silence during idle/blocked/
seated/fight states, shared sound eligibility, async/lifecycle handling, and
retained character motion. The production build passes. The music and all four
WAVs decode fully. Production HTTP checks return the index and all five audio
assets with status 200 and exact bytes, and range delivery succeeds with 206.

The four actual-world cases pass: two new footstep scenarios and two existing
world regressions. Implementation and focused testing are complete. The standalone
embeds all five audio assets byte for byte and passes inline JavaScript syntax
validation. The ZIP restores with all 155 exported file hashes matching.
Version 36's 299-check full-suite result and version 37's 62 focused checks above
remain historical evidence. Browser listening and hands-on interaction
verification remain unavailable, and no Vercel deployment is claimed.

## User-supplied dismissal whoosh — version 39

The latest attached `oxidvideos-transition-sfx-whoosh-sound-effect-407576.mp3`
is a 1.200-second, stereo 48 kHz source. `public/audio/dismiss.wav` retains the
0.022–0.752-second segment: **0.729977 seconds, 32,236 bytes, mono 22,050 Hz
PCM16**. This retains 99.999878% of decoded source energy, including the initial
rush and useful natural tail. No time stretching or pitch change is applied.

Waveform measurements confirm peak 0.419983 (−7.535 dBFS), a 2 ms attack fade,
a 35 ms tail fade, and zero first/last PCM samples. Onset above 0.001 is 2.222 ms;
onset above 0.01 is 6.122 ms. Full FFmpeg decoding passes. Evidence is
`artifacts/dismiss-sampling-report.json`; these measurements do not establish
manual listening quality.

A dismissal whoosh follows a visible user close of the opportunity/job/chat/
Class 24 sidebar by X, FAB, Escape, or Class 24 navigation; Help by X,
toggle-close, or Escape; the bot challenge by X or Escape; and the explicit
Leave table action. Programmatic seating, navigation, and lifecycle closures,
opening a view, hidden repeated closes, and toast expiry remain silent. A single
original DOM event that closes multiple views emits one whoosh. The dismissal
instance allows one active natural-pitch voice at 40% gain.

`src/sample-audio.js` factors out the existing short-sample engine. The local
footstep wrapper and separate dismissal instance reuse its lazy trusted-gesture
loading, decode handling, bounded voices, and lifecycle suspension. Sound on/off
and the legacy saved preference govern every audio layer. Mute, hidden tabs,
page suspension, and sub-1280-pixel views stop effects; pending or stale events
never replay as a backlog. Existing foot-contact synchronization, music, smooth
white character mesh, camera, rooms, and seating behavior remain.

Version 39 passes **110 focused checks across seven files**: 11 application,
19 background-music, 8 bot-challenge, 22 footstep-audio, 36 main-coordinator,
5 panel, and 9 generic sample-audio cases. These validate deliberate visible
dismissals, silent automatic/hidden close paths, original-event deduplication,
one active natural-pitch whoosh, retained footstep behavior, shared mute, and
lifecycle handling. Production compilation passes. All six audio assets decode
fully; production HTTP checks return the index and all six audio assets with
status 200 and exact bytes, plus matching byte-range responses with status 206.
World, character, gait, and camera source remain unchanged from version 38.

The standalone embeds all six audio assets byte for byte and passes inline
JavaScript syntax validation. ZIP restoration verifies all 158 exported file hashes. Version 38's 130 focused checks and version 36's 299-check
baseline remain historical. Browser listening and hands-on interaction
verification are unavailable, and no Vercel deployment is claimed.

## Shared enabled-button click sound — version 40

The attached `matthewvakaliuk73627-mouse-click-290204.mp3` contains two distinct
paired bursts. `public/audio/click.wav` retains only source 0.043–0.123 seconds:
one natural down/up click pair with its useful decay, excluding the later click.
The runtime sample is **80 ms, 3,572 bytes, mono 22,050 Hz PCM16**. Peak is
0.419983 (−7.535 dBFS), with 0.4 ms attack and 8 ms tail fades, zero-valued
endpoints, and onset above 0.001 within 0.272 ms (above 0.01 within 3.537 ms).
No pitch shift or time stretching is applied. Full decoding and waveform
measurements pass; evidence is `artifacts/click-sampling-report.json`.

`src/button-audio.js` captures trusted button clicks at the document level.
Enabled visible buttons inside the app include dynamically added/sidebar
buttons, icon descendants, and keyboard activation. Background, non-button,
disabled, outside-app, and synthetic activations remain silent. The existing
Sound on/off control governs every layer: switching sound off is silent, while
switching it on may play its click after the state change. A close button gives
the short click plus the existing dismissal whoosh.

The new controller reuses `src/sample-audio.js`. Only the latest first-click
intent may wait, bounded to 150 ms for sample readiness. Mute, hidden tabs,
pagehide, sub-1280-pixel views, and disposal clear pending work; no old burst
replays later. Existing world, gait, white character mesh, camera, seating,
footstep contacts, music, and dismissal sound remain.

Version 40 passes **102 focused checks across five files**: 19 background-music,
14 button-audio, 22 footstep-audio, 38 main-coordinator, and 9 generic sample-audio
cases. These validate enabled visible button targeting, dynamic/icon/keyboard
activation, Sound off/on ordering, bounded first-click readiness, lifecycle
cancellation, retained footsteps, and coordinator integration. Production
compilation passes. All seven audio files decode fully. Production HTTP checks
return the index and all seven assets with exact bytes and status 200, with
matching byte-range responses at status 206. World, gait, character, camera,
sample engine, footstep wrapper, application, panels, and bot-challenge source
match version 39.

The standalone embeds all seven assets byte for byte and passes inline JavaScript
syntax validation. ZIP restoration verifies all 161 exported file hashes. Version 39's 110 focused checks, version 38's 130, and version
36's 299-check baseline remain historical. Browser listening and hands-on
interaction verification are unavailable, and no Vercel deployment is claimed.

## Player-relative fight-impact sound — version 41

The three new punch recordings are sampled as mono 22,050 Hz PCM16 WAVs:

| File | Duration | Bytes | Source trim | Main contact onset |
| --- | ---: | ---: | --- | ---: |
| `public/audio/fight-1.wav` | 0.329977 s | 14,596 | 0.3745–0.7045 s | 1.361 ms |
| `public/audio/fight-2.wav` | 0.380 s | 16,802 | 0.3695–0.7495 s | 0.771 ms |
| `public/audio/fight-3.wav` | 0.400 s | 17,684 | 0.173–0.573 s | 0.499 ms |

They map respectively to `freesound_community-punch-2-37333.mp3`,
`universfield-punch-03-352040.mp3`, and `universfield-punch-140236.mp3`.
Peaks match near 0.5 (−6.021 dBFS), with 0.5 ms attack and 35 ms tail fades and
zero-valued endpoints. Leading swing/silence is removed while retaining useful
contact texture and decay; no pitch change or time stretching is applied. Three
new files total **49,082 bytes**. The fourth uploaded mouse-click MP3 matches the
previous source hash exactly, so existing `click.wav` (80 ms / 3,572 bytes) is
reused as the lighter variation. The complete pool totals **52,654 bytes** and
represents all four supplied recordings. All four runtime files decode fully;
measurements/hashes are in `artifacts/fight-sampling-report.json`.

`src/fight-impacts.js` emits exactly four punch contacts at 5,150 / 6,150 / 7,150 /
8,150 ms and two kick contacts at 10,975 / 12,175 ms per 24-second encounter.
The tracker follows actual displayed, collision-paused choreography, without
repeated sounds from a held hit or a backlog after far/muted/loading/resumed
states. Each contact selects a natural-pitch sample randomly without immediately
repeating the previous variation.

`src/fight-audio.js` measures actual player distance from the actual fighters'
midpoint rather than the camera. Gain is 0.45 within three world units, smoothstep
fades to zero at ten, and approximately 80 ms ramps follow movement continuously.
Frame updates persist during paused choreography and active sounds; distance
does not flip a binary sound toggle. The shared sample engine adds random
selection and `setVolume`; global Sound still mutes all audio. Character/gait/
physics are retained, with only an audio hook added to world frames. This
supersedes old fight-silence statements; conversation clouds remain silent.

Version 41 passes **143 focused checks across eight files**: 19 background-music,
14 button-audio, 16 fight-audio, 13 fight-impact, 22 footstep-audio,
40 main-coordinator, 17 generic sample-audio, and 2 actual-world encounter/pause
cases. These validate exact contact timing, paused/held-hit deduplication, no
backlog, random no-repeat choice, actual-player continuous attenuation/ramping,
shared mute/lifecycle protection, and actual-world observer forwarding.
Production compilation passes and includes the final source revisions. All ten
audio assets decode fully; HTTP delivery returns the page and all ten files
with exact bytes and status 200, plus matching byte ranges at status 206.
Mesh, gait, camera, choreography, crowd, application, panel, and bot-challenge
source match version 40; the world adds a read-only audio observer.

The standalone embeds all ten assets byte for byte and passes inline JavaScript
syntax validation. ZIP restoration verifies all 175 exported file hashes. Version 40's 102 focused checks, version 39's 110, version 38's 130, and
version 36's 299-check baseline remain historical. Browser listening and
hands-on interaction verification remain unavailable, and no Vercel deployment
is claimed.

## All normally sittable furniture — version 42

The latest request extends seating beyond application chairs and the four free
social beanbags. Thirty-four additional lounge positions cover existing furniture:
11 in the arrival lounges, 17 in work lounges, four on the information-room sofas,
and two on social-room ottomans. There are now **47 public seats: nine application
chairs plus 38 free lounge positions**. Four companion-occupied social couch
positions remain reserved and excluded from public claims. Recruiters and all 19
ambient bot identities and activities are retained.

`src/furniture-seats.js` supplies stable furnishing/seat IDs, independent sofa
cushion anchors, rotations, approach positions, and structural collision profiles.
`src/seat-catalog.js` exposes the same authoritative public seat coordinates to the
local world, remote visitor rendering, memory store, and Redis command. Separate
leases allow two visitors to use different sofa cushions without double booking
either position. Non-seating objects such as desks, coffee tables, and shelves
remain solid scenery.

Newly usable upholstery supports the existing short-legged seated pose at a
common 0.30-unit cushion plane. Front-edge anchors keep hips supported and leave
the knees and feet outside the furniture. Clear reachable approaches are compared
from the visitor's actual position; departures retain the delayed weight shift,
planted feet, and collision checks against furniture and other bodies. Backrests,
arms, supports, and surrounding scenery remain solid while the owned cushion is
used. The lease is held until the visitor is physically clear.

Lounge arrivals show the quiet settled-in notice and do not open an application
or job-description sidebar. Application chairs retain the existing seated-only
description flow, dismissal keeps the visitor seated, and the FAB counts job
opportunities rather than all lounge positions. The full-width navigation,
right-side opportunities FAB, left-side zoom controls, minimum 1280-pixel guard,
white character design, smooth turning, bots, and all existing audio layers remain.

Initial occupancy checks exercise every new seat through the real memory store,
HTTP handler, shared browser-presence client, and solo fallback. They also cover
independent adjacent sofa occupants, authoritative seated positions, expiry and
replacement, and rejection of companion-occupied cushions. Redis coverage checks
the generated EVAL request and complete seat catalog; no configured Redis service
has been executed. Existing coordinator checks confirm lounge seating does not
open a ghost job description or produce dismissal sounds from automatic closes.

Final version 42 release verification: **215 focused checks across 17 test files passed**, including 19 selected actual-world checks. All 34 new seats have clear lobby routes, all nine shared sofas pass paired-body checks, and representative entry/exit and occupied-neighbor transfers pass actual skin/sole checks. The final production build, exact-byte HTTP delivery, all ten audio decodes, standalone inline JavaScript/audio validation, and ZIP restore integrity passed. The complete world suite was not rerun; no hands-on browser playtesting or Vercel deployment is claimed.

The eight-view actual-mesh seating sheet and source-hash report are `artifacts/furniture-seating-v42-preview.png` and `artifacts/furniture-seating-v42-report.json`. The standalone and source ZIP retain all ten existing runtime audio files. Fresh final-source legacy confirmations supplement the selected historical-regression shard without increasing the distinct test count.


## Version 43 — sidebar aligned with the right-side FAB

The opportunity panel used a 96px right inset while its available-seats FAB used 24px. Changed the panel inset to 24px, aligning both outer right edges while preserving its width and vertical spacing. No application JavaScript, world geometry, or interaction changed. A separate read-only cascade review found no competing inset rules, media overrides, or transformed ancestors.

All 45 existing panel/coordinator checks and the production build pass. Source and compiled CSS confirm identical fixed right offsets at supported widths. The standalone and portable export retain their integrity checks. Version 42’s 215-check seating evidence is carried separately; it was not rerun for this CSS change. Browser pixel inspection and Vercel deployment are not claimed.


## Version 44 — quieter music and calmer controls

Reduced the explicit background-track gain, controller default, and invalid-volume fallback from 0.18 to 0.06: one third of the prior level, approximately 9.54dB quieter. Gesture unlocking, saved mute preference, looping, hidden-page suppression, screen guard, and other effect levels are retained. Sound on/off now inherits the blue navbar button style in both states; state remains explicit through the icon, label, and aria-pressed value.

The available-seats FAB uses a soft warm background and lighter border/shadow. A separate 28px badge gives its 16px bold tabular numeral a clear hierarchy. Dark #293243 on #ddcba6 measures 8.07:1 contrast. Live occupancy updates both badge and pluralized text; the parent button retains the complete accessible count. Panel/FAB right alignment stays24px.

All 65 focused checks pass across background-music, panel, and real-coordinator tests, including zero/singular/plural seat count updates and shared Sound toggling. Production build, current HTTP assets, compiled styling, standalone embedded assets/syntax, and restored ZIP hashes are verified. No browser pixel inspection, listening session, new world-suite rerun, or deployment is claimed. The supplied Plateforme10 URL has not been visually analyzed because browser capture was unavailable.


## Version 45 — restore the original navigation and control design

The user reported black navigation at the bottom and asked to retain the original navigation/design. Reinstated version 43’s exact `src/style.css` and `index.html` bytes, and restored the original single-text seat-count updates. This returns the cream full-width top header, original navbar button colors, and original yellow FAB; the sidebar and FAB remain right-aligned at 24px. Music remains at 6% volume.

A read-only inspection of source, built CSS, and version 43/44 standalone artifacts found one header/nav, a fixed top0 cream header, embedded styles, and no black/bottom navigation rule or JavaScript repositioning. The reported appearance was not reproduced, so no specific cause is claimed. 65 focused checks and the production build pass. Source hashes confirm the original styles/markup, while current served assets and portable-export integrity are checked. No browser pixel or listening verification or deployment is claimed.


## Version 46 — automatic chair contact

The user requested automatic natural sitting without a button or popup click. Previous automatic gates (.34 around route gates / .78 around cushion centers) missed side/back furniture contact. Version 46 detects the real chair on the intended walking line using a .44-unit forward sweep. The first obstacle must be that eligible chair, with a collision-safe entry plan, before the character advances into its turn envelope. This prevents the torso/hand from becoming trapped inside a conservative backrest bound. The existing nearest clear approach, grounded alignment, 650 ms lowering and completion-only sidebar remain. Shared furniture still selects the nearest free cushion; occupied seats, people and nearby parallel passersby remain solid. Generic route/exit cooldown permits fresh contact at another chair, while failed/cancelled claims retain their delay and a recently exited chair does not immediately pull the visitor back.

The first new tests exposed side-contact plan failures and a 0.00794-unit hand/backrest intersection on rear sofa contact. Both are fixed by the anticipatory handoff. Final verification passes **95 focused automated checks across six files**, including seven new reported contact tests (left/right/back subcases and parent, sofa, occupied/passersby and delayed-exit anti-reseat) and five earlier actual-world regressions. Actual character skin/furniture checks sample phase changes, every fifth frame and final seating, while root continuity and readiness are checked every frame. The existing 0.004-unit penetration tolerance is unchanged. Entry/exit/transfer, main coordinator and sidebar checks also pass. The production build succeeds with the existing nonfatal bundle-size warning.

CSS, navigation and all ten audio assets are byte-identical to version 45; index.html changes only the automatic-seating help sentence. The standalone embeds all ten audio assets and is syntax checked; the ZIP is restored and hash checked by the release script. The complete world suite was not rerun. Node fixtures exercise real scene/character geometry and coordinator ticks with GPU/DOM boundaries supplied; no hands-on browser test, audio listening or Vercel deployment is claimed.


## Version 47 — original navigation export repair

The user reported that navigation still differed from the original pre-sound design. Source comparison against archived v35/v36 confirmed that the header and navigation rules were unchanged except for the later sound toggle. The exported prototype was the defective surface: v37–v46's font-stripping regex stopped at the first semicolon in the Google Fonts weight list, leaving `450;500;...` before the next CSS rules. PostCSS rejects these actual exports with `Unknown word 450` at line23column1. Earlier source/byte/sub-string checks did not establish CSS validity or a visual browser match; their original-design confirmation was insufficient.

The persistent scripts/export-standalone.mjs now uses parsed CSS nodes, preserves complete font imports, places imports before viewport rules, and validates the complete exported stylesheet and inline script. It embeds all ten audio recordings unchanged. Tests generate a real artifact and cover CSS/font ordering, original cream top navigation and colored buttons, the1280pxguard, original header plus sound control, all ten audio bytes, and valid standalone JS. Source UI styles and all runtime world/audio JavaScript remain byte-identical to v46. The source header is exactly v36 after excluding the authorized added sound control. An independent comparison confirms17parsed original navigation/root/button rules match the actual export.

Version47 passes **71 focused automated checks across four files**, production compilation, full standalone and production CSS parsing, complete embedded-audio checks, and inline script syntax. The original font provider is retained, with system fallbacks when offline. Version46's95focused seating checks remain historical and were not rerun for this export-only change. No hands-on browser screenshot/playtest/listening or Vercel deployment is claimed. ZIP integrity is verified by restoration and SHA256 checks during packaging.


## Version 48 — one large office and smoother object rendering

The user requested one large office and asked whether the earlier Plateforme10 rendering reference had been used. The prior research inspected its linked source; its live scene was not visually inspected, so exact matching is not claimed. This pass applies the verified broad direction—warm neutral architecture and continuous object shading—using shared matte Lambert materials and existing soft shadows. It does not add authored Blender bake textures. The original white character and ink silhouette, behind-character camera, controls, sound and original navigation remain.

One 82 by 80 floor now joins all eight departments/lounge/information rooms, nine hiring desks and shared recreation areas. Four low cutaway perimeter walls/windows and six non-seating office fixtures establish an interior. Outdoor lawns, planting beds and trees are removed; potted plants and all 19 ambient characters remain. New fixtures include reception, café counter, printer and three storage units with shared exact collision dimensions. Department furniture IDs, 47 public seat anchors, room coordinates, doorway gaps and bot paths are preserved. Rounded rectangular desk tops remain inside existing station colliders. The neutral world backing plane sits 0.12 units below the office slab to avoid coplanar flicker. Static office geometry remains at 46 instanced batches and 938 instances, within the original 50 batch budget.

**128 focused automated checks across 14 files passed.** New office tests verify full floor containment, all new fixture/shell geometry and collisions, all fully furnished doorways, all 47 seat routes plus final transfer/lowering, and all 19 bots across their cycle. Existing layout/station/crowd/cozy/social/info/furniture/garden-render/seating-presence tests pass. The only changed old expectation replaced required outdoor lawns with one continuous office floor; no physical clearance tolerance or rendering budget was loosened. Five reported actual-world contact/physical checks pass, including all three side/back contact subcases and every defined actual skinned job entry/exit approach. Main/sidebar and standalone font/CSS/header/audio/JS tests pass. Production compilation succeeds with the existing nonfatal bundle-size warning.

The actual createWorld scene was exported for an offline still study with nine real stations, 938 tinted instances and 58 skinned meshes. The two-panel office-v48-preview.png was visually reviewed for the layout, surfaces and gross intersections. It uses the inspection renderer's lighting, not WebGL lighting, and is not a browser screenshot. The 114 MB regenerable JSON is omitted from the portable ZIP; its exporter and PNG are included. No exact live-reference appearance, browser interaction/listening or Vercel deployment is claimed. The final HTML retains the corrected parsed-font export, all ten audio assets, the original UI, and the 1280px desktop guard; archive integrity is verified through extraction and SHA256 checks.

## Version 51 — dimensional character reference

The latest supplied 3D mannequin replaces the earlier drawing's form. Every
character now has a spherical head about 40.0% of standing height, a compact
tapered torso, slimmer relaxed arms, rounded mitten ends, more exposed legs and
small rounded feet. The pure-white body and dark ink outline remain; no stock
texture or external model is used. Dot eyes, optional hair caps, recruiter ties
and the fighters' brows/blush fit the new proportions.

The skin remains one closed connected mesh with normalized influences and
continuous field normals: 6,784 vertices and 13,564 triangles, or 27,956 triangles
including its outline, hair and tie. Bounded surface projection softens the
marching-tetrahedron silhouette without adding triangles. A gradual anatomical
shoulder blend removes an abrupt chest-to-arm influence change found by the
strict fall/recovery checks. The .24 maximum deformation-edge limit and .04
visible shoulder-bridge thickness remain unchanged. The narrower reference uses
rig-relative bridge probes; lower-arm checks also require visible torso and
forearm on either side of the actual gap.

The shared seated hip height is .485 so the actual supporting skin reaches
about .3215 above the .30 cushion, with both solved ankles at .11 and hands clear
of the oval desk. Lowering, sitting, rising and interrupted transfers share this
supported pose. The resting fight torso is 1.43 degrees flatter for the larger
head; the final head maximum is .9446, and the low kick still meets actual skin.
No floor, contact or furniture-clearance tolerance was loosened.

Final verification:

- Direct collision and shoulder reporters captured 23/23 passing cases.
- Main coordination and standalone export reporters captured 54/54 passing cases.
- Character, fight-motion, footfall-motion and emotion commands all exited zero
  on the frozen source, covering 46 declared test cases. Their first reporter
  output was lost through child-process pipes; the proof summary distinguishes
  declared counts from captured counts. An additional real-file-descriptor run
  captured footfall 12/12. No aggregate reporter total is claimed for the four
  original commands. Before/after/current source fingerprints match.
- Seven selected actual-world cases pass with unchanged source fingerprints:
  all new lounge cushions and neighboring bodies, five-sided job-chair entry
  and exit, both beanbag facings, remote heartbeat/seat continuity, all nineteen
  bots remaining solid and visible, all three bot-to-chair handoffs, and one
  complete fight with physical contacts, reactions and synchronized impacts.
  The complete world suite was not rerun.
- Production compilation and the persistent standalone exporter pass. All ten
  embedded audio files match source bytes. The original navigation, controls,
  office, audio and presence/API files match baseline 2c9259a7; 64 protected
  runtime/config files were independently checked byte for byte.

`artifacts/character-reference-v51.png` shows eight actual posed mesh views:
front, back, profile, walking, three-quarter, pushing, seated recruiter and an
optional hairstyle. These were rendered and inspected offline. A fresh export
against the final motion source produced the same eight poses, confirming that
the last fight-only adjustment did not stale the preview. The small companion
report records geometry measurements and source/image hashes.

The standalone and portable/Vercel source ZIPs use the current persistent CSS
exporter, preserving full font imports and the original navigation. Archive
entry hashes are verified. HTTP serving could not be tested because the sandbox
denied a loopback socket. No hands-on browser test, live Redis verification or
new Vercel deployment is claimed. Earlier sections and test totals are historical.
