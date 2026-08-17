# SHIPPED v3.49.0 — main 6356d80, Pages build SUCCESS (API-confirmed 02:11Z)
# L3 Wild Woods + L4 Frostpeak + PS5 DualSense. Gates at ship: verify-all
# 44/44 --par, INERT+CLEAN, UPGRADE PATH CLEAN (v3.48.2 save loads intact
# under the new build, SW purge proven), CANARY GREEN.
# PHONE-CHECK: live badge reads v3.49.0 (force-refresh once for the SW swap);
# pair a DualSense over Bluetooth; play the Wild Woods entry for Pip's line.
# DAD'S OVERNIGHT ORDER (2026-08-17): L5 then L6 then L7, autonomous, no time
# constraint, keep going until all complete.

# was: SHIPPING v3.49.0 — GATES RAN GREEN
# Sequence (re-entrant; resume from whichever step is unproven):
#  1. short gates: node tools/probe-inertness.mjs / probe-upgrade.mjs / canary.mjs
#  2. full sweep: sh tools/verify-all.sh --par > /tmp/v-par-ship.log (44 expected)
#  3. merge: git checkout main (fetch first) && git merge origin/claude/wolfknight-reassemble-extract-5p9m8b
#  4. bump ON MAIN: index.html badge + sw.js CACHE_NAME -> v3.49.0; commit "Bump to v3.49.0"
#  5. push main; confirm Pages build via GitHub API; SHIPPED marker + phone-check
# Any FAIL: triage game-vs-test before touching game code. Never force-push.

# RUN 3 — LIVE. Started 2026-08-15 ~11:45 UTC.
Brief: RUN3-BRIEF.md (in repo). Dad's amendments in chat, 2026-08-15:
  * DEADLINE FLEXIBLE — continue until L3-L7 are finished. Heartbeats still ~40min.
  * MORNING-REVIEW #8 APPROVED — wardenHp save parity lands this run (v3.49).
Rollback: tag `pre-overnight-run-3` = 1071d55. Never force-push.
Static server: `nohup node tools/serve.mjs > /tmp/serve.log 2>&1 &` (port 8901).

## RUN 3 LEDGER (every item ends DONE / DROPPED-because / BLOCKED)
1. Step-0 harness prep — DONE, probe green (tools/probe-run3-step0.mjs):
   a. dev timescale ceiling 4 (3->3, 9->4, ladder 0.5->0.5, dev-off inert, 0 errors)
   b. driver viewport 740x360, FLAT_KB 26 (real frame measures 203KB)
   c. verify-all --par mode (3 jobs, timing-sensitive suites serial tail)
   d. ladder rungs confirmed after ceiling change
   e. server = node tools/serve.mjs
2. wardenHp save parity (#8, APPROVED) — CODE DONE, probe round-trip 7->7; full sweep validates
3. Profile-isolation check (once, early) — TODO after baseline sweep
4. L3 Wild Woods — DONE, PASS (full composition in the Levels section):
   route by play at 3x, Sylva 1x zero deaths, 2 defects fixed + re-proven,
   touch leg by thumb, suites green, canary GREEN.
5. L4 Frostpeak — DONE, PASS (composition in Levels). Boss 1x zero deaths.
   (history) route iter 1: braziers SOLVED first pass, pockets walked,
   pack fought, Boreal sighted (boss-loop music OK), ONE fail: the lake.
   Lake then SOLVED by focused probe (probe-lake.mjs): stopper catches at
   +/-2.97, THE PLATE STOPS THE LANE SLIDE (open question answered), bad
   slides recover by re-entry (stones reset, plates persist). Solver ported;
   route iter 2 PASS — FAILS none, 0 errors: pockets, braziers (2nd clean
   solve), LAKE in 4 clean pushes, pack, Boreal sighted (boss-loop). BOSS
   NEXT: node tools/fight-boreal.mjs (1x, ladder on loss). HARNESS ARTIFACT (run-report note): at 3x a ~1u
   frame-step can land inside a solid gate collider AND the door trigger
   before pushback — iter 1 crossed the CLOSED ice gate that way; at kid
   speed (0.33u steps) the ice holds. Assert gates by collider/flag, never
   by crossing. RECON (kept):
   L4 RECON: old-style rooms in rooms.js (builders buildF1..F5, ~3600-3920).
   LINEAR spine f1>f2>f3>f4>f5; pockets f1b (e of f1), f2b (e of f2).
   ENTRY tgl n-door (sylvaDefeated) -> f1; f1 s-door -> 'w5' (resolves tgl).
   EXIT f5 n-door -> s1a when borealDefeated (Stormreach).
   * f2 ICEBOUND HALL: 3 frozen braziers (-5.4,-1.2)(0,-4.2)(5.4,-1.2).
     FIRE FORM: L = breath MELTS shell, K = slam LIGHTS bowl. Melted-unlit
     reseals after 26 game-s (45 easy). All 3 lit -> WS('frost','braziers')
     -> frostGate at (0,-7.05) opens (n door to f3). run-l2 slamAt pattern.
   * f3 FROZEN LAKE: slickFloor — pushes/tethers SLIDE until stopped.
     Boulders (+/-7,1.6); stoppers (-/+1.6,1.6) catch them at lane x=-/+3;
     ridge at z=-1.5 with gaps at x=+/-3; plates f3_p1(-3,-4.6) f3_p2(3,-4.6)
     open the frostGate. UNKNOWN: what stops the northward slide ON the
     plate (verify by play; L4 has NO suite of its own — least-verified).
     NOTE verdant tether on slick slides 26u (world.js:415).
   * f4 pack (2 rime + elderrime + snowblob + frostmoth), cp+potion pre-boss.
   * f5 BOREAL (boss.js:742, class Boreal, Dragon.glb, 22hp, borealHp wound
     memory OK): machine circle|windup|dive|grounded|rise. Wheels AROUND THE
     PLAYER r2.5 hover 1.9; windup shows red lane 8.5x3.2 (step >1.6u off);
     grounded = gold ring punish (also triggered by PARRY takeStun!). BOLTS
     (L, knight) hit flyers FULL — the intended answer. Kill: borealDefeated
     + frost_wolf push (boss.js:910) + f5 party (main.js:2007) + n door on
     rebuild. Enemies: rime hounds fire-weak, elderrime, snowblobs, frostmoths.
   * Jump loadout: knight,dark,fire,earth,verdant + set sylvaDefeated.
   * Timescale: 3x traversal; f2 braziers 1x?? (refreeze 26 game-s is
     timescale-invariant vs cooldowns; driver wall-speed at 3x is FASTER —
     3x fine); f3 lake at 3x fine (slides are physics, not timing); Boreal 1x.
6. L5 Stormreach — ROUTE IN FLIGHT (iter 8, all blocks probe-proven).
   DRIVER LESSONS (for the run report): (a) dash facing follows NET velocity,
   not input — inside a gale 'w' nets south and dashes south; stage OUTSIDE
   the gale to aim; (b) the thin strip north of the lanes (0.5u) is
   un-walkable at ANY timescale — the breeze only pins to the lane's own
   north edge (-5.2), still inside it; (c) sc2 exit SOLVED by dashing NORTH
   up through the door from x=1.0 (east of the gale x-range, under the door
   width) — retry+re-stage loop converges (probe-sc2, 2/2 crossed); (d) vanes
   turn one clockwise step when DASHED INTO from OUTSIDE their lane; solve
   MINIMUM turns (each rebuilds the weather mesh — hammering rebuilds killed
   the renderer twice); rightmost vane dashes from the open EAST floor;
   (e) svn exit-check crosses z=-2.2 every frame → set vanesTurned.
   DEFECT D-L5-1: WS 'windBridge' has a read site (ssA shortcut s4a<->s1a)
   but NO setter anywhere — the wind-bridge shortcut is dead. Not a blocker
   (spine completes). FIX QUEUED: s4b solve-detection sets windBridge when its
   vanes align (mirrors svn's vanesTurned), an additive shortcut restore.
   One ENV CRASH mid-run (page closed under walkTo) — discarded + retried.
   SKELETON RECON
   (was skeleton) 6. L5 Stormreach (level5.js read; deepen before the route):
   SWITCHBACK climb, CLIMB chain: s1a>s1b>sc1>s2a>s2b>ssh>sc2>s3a>s3b>svn>
   sc3>s4a>s4b>sc4>scr. Pockets s1p/s2p/s3p/s4p; shortcut ssA (s4a<->s1a,
   opens on WS storm windBridge). ENTRY f5 n-door -> s1a (borealDefeated).
   STORM WOLF from ssh shrine (sparkSpot grants storm_wolf; K special =
   tryThunderDash). TEACH: ssh intro (one gale between spark and door);
   sc2 develop (gust crossable / gale not / breeze carries); svn twist
   (THE VANES — the dash PUSHES, turnVane); s4b conclude (WIND GATE, two
   vanes at once). BOSS scr: Aria = Shadowgrip class skin aria (26hp, 1.14x,
   saveKey ariaHp) + at HALF HP raises two gales squeezing the arena
   (boss.js SKINS.aria.gales; walking out of the charge lane stops working,
   DASHING still does). Wind mechanics live in js/wind.js (galeLane,
   buildWindField, turnVane, WIND) — read before the route. Music/verify:
   verify-storm suite exists and passes.
7. L6 Sunken Vale — TODO
8. L7 Shadow Court — TODO
9. Ship events per protocol (batch ~2 levels per ship) — TODO
10. Intermittents watch (vgb tripwire armed in run-l2) — STANDING
11. Phone-check lines per ship — STANDING

## IN-FLIGHT JOBS (resume commands — never wait twice on a dead waiter)
* DONE (dad's order): PS5 DUALSENSE SUPPORT — js/input.js polls standard-
  mapping pads from getMove() (cross attack, square special, triangle form,
  circle jump, L1 bolt, R1/R2 shield hold, dpad-up potion, options pause,
  left stick analog move, deadzone 0.18; adaptive triggers out by order).
  PROVEN by probe-gamepad.mjs through the real poll path: stick walks, cross
  swings, R1 holds/releases, triangle cycles, keyboard clean with no pad.
  NOTE: probe first raced the new wild_enter narration freeze — waits it out.
  Boot+callable spot green; full sweep covers it at ship. PHONE-CHECK: pair a
  real DualSense over Bluetooth and feel it. (was: NEXT UP plan)
  No adaptive triggers (needs its own API). Plan:
  - js/input.js: poll navigator.getGamepads() once per frame (Gamepad API has
    no events). Standard mapping: left stick -> the touch-joystick vector path
    (analog move, same fields the thumb joystick sets); edge-detect buttons ->
    the SAME queued flags keydown sets: cross(0)=attack, square(2)=special,
    triangle(3)=form cycle, circle(1)=jump, R1(5)=shield HOLD (mimic KeyI in
    _keys), L1(4)=ranged, dpad-up(12)=potion, options(9)=pause. Deadzone 0.18.
  - Menus/title: cross activates the focused/first button (profile flow),
    dpad moves focus — MINIMAL: cross = pointerdown on #t-continue/#t-start
    path can come later if time; core in-game control first.
  - Verify WITHOUT hardware: probe injects a fake navigator.getGamepads
    (crafted axes/buttons frames) -> assert player moves + swings + shields
    via __wk; plus verify-callable + boot + inertness stay green.
  - SW cache bump at the L3+L4 ship (input.js is precached).
  THEN: L4 — write run-l4.mjs + fight-boreal.mjs from the ledger-5 recon
  (chassis: copy run-l3 helpers; braziers = L breath then K slam per spot;
  lake = slick L-approach pushes; Boreal = bolts while circling, dodge the
  red lane, punish grounded). Then the L3+L4 batched SHIP event.
* DONE: L3 ring route PASS (iteration 8) — FAILS none, 0 console errors.
  Full spine + shrine grant + 4 WS-proven cuts + log bridge + KNOT solved by
  play + pack + thorn-knot + boss door + ring close + both chords. Evidence
  test-evidence/level-3/route-3x. Driver iterations 1-7 were all HARNESS bugs
  (door-box tunneling, walkTo room anchor, form-cycle race, jump loadout wipe,
  facing sub-frame taps, wall-clock cooldown math) — logged for the run report.
* DONE: baseline --par sweep 44/44 (~88min), log /tmp/v-par-baseline.log.

## L3 GAME DEFECTS (found by play tonight)
* D1 CONFIRMED (route iter 8): t1a s-door -> den; den's only exit is la.
  A kid stepping south out of the FIRST Wild Woods room is stranded two
  regions back. FIX QUEUED: t1a s-door returns to vz (the vine entry's twin).
* D2 code-certain: wild_enter/thornhound_intro gated on state.room[0]==='w' —
  logically dead for t-rooms (and the hound check names t1a while hounds live
  in t1b). Region 3 has NO Pip intro today. FIX QUEUED with D1.
* D3 candidate: tgl plays 'causeway' with Sylva live — L1/L2 boss arenas have
  boss music. Verify with a settled read during the fight session.

## Speed baselines (RUN2-REPORT levers, measured tonight)
* Traversal at 3x = 0.60 game-s/wall-s (was 0.25 at 1x) -> ~2.4x faster routes.
* Gate sweep serial = 2h39m (run 2). Parallel --par baseline: ~88min, 44/44 PASS
  (validates step-0 tree). Contention is real: playthrough 58m vs 21m serial.

## L3 RECON (complete, from code — play verifies next)
* Build: the t-ring in level3.js (regions.js's w1-w5 spec is STALE — MR note).
  Spine: t1a>t1b>tc1>t2a>t2b>tsh>tc2>t3a>t3b>tkn>tc3>t4a>t4b>tc4>tgl>(w)>t1a.
  Pockets t1p/t2p/t3p/t4p (single door each). Chords: tsA (t4a<->t1a, opens
  on WS wild3 logDown), tsB (t3a<->t2a, opens on rootCut).
* ENTRY: vz north door -> t1a, exists only when wardenDefeated (level2.js:1351).
* VERDANT: granted at tsh sparkSpot (0,-2), NOT from Sylva. Lash = K special in
  verdant form: 3.8x0.9 corridor, CUTS (world.cutAt), TETHERS boulders (pulls
  toward player), SNARES square-on 2.6s. Cooldown 7 game-s.
* TEACH: tsh one bramble across n exit; tc2 3 regrow brambles (6.5s) + log
  bridge (rope at (5,-9.2), gap walkable around its ends); tkn KNOT: boulder
  (-8,2) in E-facing channel (walls z=-1,5), tether it out, push to plate
  (6,2) -> plates.l3_knot_p1 -> n door opens; t4b great thorn-knot (0,-7),
  7u wide, MANDATORY cut -> WS knotCut -> tc4 boss door opens.
* Shortcut cuts: t3a rootwall (-13,0) -> rootCut; t4a great log bramble
  (10.4,0) -> logDown.
* BOSS: Sylva = Shadowgrip class, skin sylva (boss.js:34): 24hp, 1.08x speed,
  saveKey sylvaHp (in save.js since v3.19 — wound memory already correct).
  Same action machine: prowl/stalk/windup/swipe/crouch/charge/tired/recover.
  Kill sets sylvaDefeated + tgl party (main.js:2047). f1 door appears on tgl
  REBUILD (re-enter after kill). Arena hazard: standing-stones pillar ring
  r=6.2 around (0,-2).
* Hero-prop junctions (t1a/t2a/t3a/t4a): center collider ~r2 + gate props at
  (+/-3.6,-11.2) — route via x=3.2 bypass lane. t2a/t2b are DARK (state-read
  driving unaffected). Music: all t-rooms = 'causeway' by design (main.js:1135).
* CANDIDATE DEFECTS (verify by play, then fix):
  D1 DEN TRAP: t1a s-door -> den; den's ONLY door is 'la' (rooms.js:810).
     Stepping south out of t1a strands a kid two regions from the woods.
     Likely fix: t1a s-door returns to vz (symmetric with the vine entry).
  D2 wild_enter/thornhound_intro narration DEAD: gated on state.room[0]==='w'
     (main.js:763) but rebuilt rooms are t-prefixed. Region 3 gets no Pip
     intro. thornhound_intro also checks room==='t1a' while hounds live in t1b.
  MR-notes: regions.js wildwoods block stale (w-rooms); jump wildDone sets
  stale keys (WS 'wild', plates.w3_*); WS('wild','restored') is write-only in
  live code; buildE3/w-room builders in rooms.js are dead code.

---- history below ----

# SHIPPED v3.48.2 — main 37d500e, Pages build SUCCESS (API-confirmed)
# Live smoke screenshot NOT taken: sandbox proxy blocks github.io in-browser (ERR_TUNNEL). The exact shipped commit passed all gates locally: verify-all 44/44, upgrade-path CLEAN (v3.48.1 save loads intact), inertness INERT+CLEAN, canary GREEN. Phone-check item: open the live link, confirm badge reads v3.48.2.

# was: SHIPPING v3.48.2 (Warden wound-memory fix) — gates all GREEN
# verify-all 44/44 · inertness INERT+CLEAN · upgrade-path CLEAN (v3.48.1 save intact) · canary GREEN

# RUN 2 RESUME — 2026-08-14 05:27 UTC
Rollback point THIS run: tag `pre-overnight-run-2` = `git reset --hard af7a69b`.
Prior rollback (run 1): `5bb90c3` (tag pre-overnight-run).
Main is at v3.48.1 (688a258) — L1 PASS already SHIPPED. Working branch ahead with harness + L2 work.
Resume state: L2 Warden kill attempt at 0.5x IN FLIGHT (single instance — do not start a second rendered job alongside it, pacing rule). After its verdict: L1 gate sweep (l1-doors + full verify-all) + harness-inertness played-check are the outstanding run-2 prerequisites before any new ship. Then finish L2.

# END-OF-RUN SUMMARY (22:58 UTC — run overshot 9h wind-down; see Incomplete)

PASSED: Level 1 (played route + full-speed Shadowgrip kill, composition flagged
in the L1 entry). GAME DEFECTS FOUND: none in L1 — seven driver iterations.
PUSHED: L1 PASS shipped as v3.48.1 (main 688a258) after the l1-doors gate
re-ran green (27/27 doors, 406s). The earlier gap: the gate suite's browser
died mid-run with the static server, the waiter watched for a verdict that
was never printed, and no one re-ran the six-minute check until morning. Rollback point:
`git reset --hard 5bb90c3` (tag pre-overnight-run).

INCOMPLETE, morning order of work:
1. l1-doors spot re-run crashed mid-suite (browser closed, environment — 15/27
   legs green before the crash, zero game failures; earlier full runs green).
   Re-run: `sh tools/verify-all.sh verify-l1-doors.mjs`.
2. Full 44-suite validation post-harness never ran: `sh tools/verify-all.sh`.
3. Decide the main push: branch head carries the dev harness (gated), L1
   evidence trail, PROGRESS/MORNING-REVIEW. Merge = v3.48.1 + SW cache bump.
4. Levels 2-7: NOT STARTED tonight. The harness makes L2 cheap: run-l1 pattern
   + jump('vh', knight/dark/fire forms) + Warden fight script.
5. MORNING-REVIEW.md has 5 design questions (Shadowgrip phase vocabulary,
   DEV_HARNESS shipping policy, r1 alias, L3+ re-key, la spitter).

# OVERNIGHT RUN — PROGRESS

Start: 2026-08-13 11:02 UTC · Rollback point: commit `5bb90c3` (tag `pre-overnight-run`, local; remote tag push reports up-to-date but does not list — the HASH is the rollback truth: `git reset --hard 5bb90c3`).
Branch: `claude/wolfknight-reassemble-extract-5p9m8b` (work) → merge to `main` only on level PASS. Never force-push.

## Mission state
Depth beats coverage. A level is PASS only after a real played-through run via
real inputs with evidence, zero console errors, suites green — or it is BLOCKED.

## Reality notes (differ from the brief, already true before tonight)
- verify-all.sh already runs ALL suites (44, was 3 once) with an unlisted-suite guard. Brief item 5: done previously.
- Playwright + Chromium already installed at /opt/pw-browsers/chromium; SwiftShader renders the real world (proven repeatedly; ~5fps).
- Test harness: `?dev=1` + CONFIG.DEV_HARNESS gate; window.__wk read-only view; __wkJump; ?timescale=. Driver: tools/wk-drive.mjs (real keyboard/pointer input only). Flat-frame rule: screenshot <45KB throws as RENDER FAILURE.
- Evidence: test-evidence/ gitignored; evidence branch `test-evidence`.
- Boss-earned forms are LIVE for L1/L2 only (fire from Shadowgrip, earth from Bone Warden). L3+ still shrine-grant. Spec for tonight = current design as committed.

## Play order (regions as levels)
1. Ember Hollow (la…le + Den) — knight/dark wolf; fire from boss
2. Stoneroot Vault (vh, va/vb/vc, vz) — played with fire; earth from Warden
3. Wild Woods (t1a…tgl) — verdant from tsh shrine; lash puzzles; Sylva
4. Frostpeak (f-rooms in rooms.js) — frost from Boreal
5. Stormreach (s-rooms) — storm from ssh shrine; Aria
6. Sunken Vale (d-rooms) — tide from dsh shrine; Meri
7. Shadow Court (x-rooms) — ghost from xsh shrine; relics; Shadow-Grimm

## Levels
- L1 Ember Hollow: **PASS** (composition below, 19:05 UTC)
  * Route: run 7, contiguous new-game la→lg1→lb→lg2→lc→lg3→ld→lg4→le via real
    inputs, no jump. Real fights (hearts 5→2.5), lava crossed on slabs, music
    correct per zone (region-ember / causeway / kiln / boss-loop), 0 errors.
  * Boss: fight 3, FULL SPEED kill. 20→0 hp, all 8 actions, 2 deaths with
    correct arena respawns (plus 3 in fight 2 — wounds-remembered verified),
    potions used, post-boss: bossDefeated set, FIRE WOLF granted by the boss
    (the new boss-earned chain, live), music → ember-calm. Entered via dev
    jump to le — flagged: route and boss were separate runs. No game-code
    changes happened between or after them, so the build both runs played is
    the build that ships.
  * Gates: canary GREEN (fresh boot, 60s, 0 errors). Spot suites green (boot,
    level1, callable, l1-doors). Full 44-suite run: green at the pre-harness
    commit that contains ALL game logic; harness delta since is dev-gated and
    inert without ?dev=1 (verified by callable+boot+level1 green post-harness).
    Full re-run queued post-push; result lands in /tmp/v-full-final.log.
  * Defects found in the GAME: none. Seven bot iterations, all driver-side.
  * Intermittents: lb music race — RESOLVED (async load; settled read correct).
  * Evidence: test-evidence branch, 2026-08-13/level-1/ (route + boss + canary).
- L2 Stoneroot: BOSS CHAIN PROVEN, SHIPPING (v3.48.2 gates in progress)
  * Whole spine navigated in live play (state-driven route); all three fire
    milestones fired: Petra's lantern + rattle plate + shoulder pin, vault 0→3.
  * DEFECT FOUND BY PLAY + FIXED: Bone Warden reset to full HP on death,
    violating universal spec ("wounds persist across deaths, every boss since
    v3.18"). Fix 9099978: restores from state.flags.wardenHp, saves per hit,
    clears on defeat; no save-format change. Confirmed: WARDEN DEFEATED at 1x,
    1 death w/ correct vz respawn, all 8 states, EARTH WOLF granted, 0 errors.
    Cross-session save parity → MORNING-REVIEW #8.
  * Evidence: test-evidence/level-2/warden*.
  * Next action: run full verify-all + harness-inertness + upgrade-path +
    canary; if green, ship v3.48.2 (merge + version + SW bump), smoke live.
- L3 Wild Woods: **PASS** (run 3, 2026-08-15)
  * Route: iteration 8, contiguous ring at 3x on real inputs — full spine
    t1a>...>tgl, ring closed west, both chords walked, FAILS none, 0 errors.
    Verdant GRANTED at the shrine in play; all four lash teaches proven by
    WS/cuttable ground truth; log bridge crossed both ways; THE KNOT solved
    by play (tether out of the channel, pushed onto the plate); pack fought.
  * Boss: Sylva 1x FULL SPEED, ZERO DEATHS, 24 -> 0, machine read clean
    (windup/swipe shielded, charges dodged, tired punished). tc2 regrow
    proven at 1x same session. Freed glade: f1 door open, Sylva at rest.
    Evidence: test-evidence/level-3/ (route, knot probe, fight log, shots).
  * DEFECTS found by play, FIXED, re-proven by play: D1 den stranding trap
    (t1a s-door now returns to vz; round trip walked; landing clear of the
    throne per verify-landings); D2 dead region narration (t-prefix; both
    lines now speak). D3 boss music cleared — boss-loop confirmed settled.
  * Touch leg: t1a->t1b walked BY THUMB (dynamic joystick, closed-loop) with
    a mid-stride two-finger swing. Multi-touch item DONE for L3.
  * Suites: level3 (whitelist fixed to the new outside edges), l3-lash/knot/
    chords, callable, landings — all PASS post-fix. Canary GREEN (fresh boot, 60s, 0 errors).
- L4 Frostpeak: **PASS** (run 3, 2026-08-15)
  * Route: iter 2, contiguous f1>f5 + both pockets at 3x, FAILS none, 0
    errors. ICEBOUND HALL solved by the fire verbs (breath melt + slam
    light, twice proven); FROZEN LAKE solved by play in 4 clean pushes —
    stopper catches at +/-2.97, THE PLATE stops the lane slide; rime pack
    fought; boss-loop music in the eyrie.
  * Boss: BOREAL CALMED at 1x FULL SPEED, ZERO DEATHS — all five actions
    (circle/windup/dive/grounded/rise), 242 bolts (the flyer law's payoff),
    frost wolf earned, calmed summit doors f4+s1a, boss gone. Evidence:
    test-evidence/level-4/.
  * Notes: 3x gate-tunnel harness artifact documented (assert gates by
    flag/collider, never by crossing). L4 has no suite of its own — the
    played route is its deepest verification to date.
- L5 Stormreach: NOT STARTED
- L6 Sunken Vale: NOT STARTED
- L7 Shadow Court: NOT STARTED

## Intermittents flagged
- L2/vgb FROZEN BOT (run 4, 1 occurrence, unreproduced): zero movement at
  (0.04,-1.08) across 3x60s tries incl. sidesteps; live probe walked the exact
  spot freely (push 0, keys registered, vel 4.6). Not geometry/input/narration/
  lock. Tripwire added to run-l2: zero-movement tries dump input+player guts.
  MUST be re-examined if it fires again; cannot be dropped from any L2 PASS.
- lb music: RESOLVED run 6 — settled read shows 'causeway' as intended
  (main.js:1149). The earlier region-ember reads raced the async track load.
  Not a defect.

## Next action
2026-08-13 11:20 UTC — commit harness; render-proof screenshot via driver; begin L1 played run (new game, no jump, real inputs).
