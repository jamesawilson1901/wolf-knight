# SHIPPED v3.69.0 → v3.71.1 (2026-08-29, overnight) — PUZZLES PAY, THE SPIRE, THE ELEMENTAL WOLF
# (This log went quiet between v3.54 and v3.69 — that history is in
#  BUILDLOG.md and the git log; the habit resumes here.)
#
# DAD'S FEEDBACK BATCH, all shipped:
#   * every push-plate puzzle now opens the way or a visible barred reward
#     (lg1/lb/lb2 rebuilt; verify-puzzle-payoff.mjs fails by name on any
#     plate that pays nothing)
#   * coins/weapon drops big enough to actually see; the double-chest fixed
#     (a three.js node-name sanitisation bug — the phantom silver chest also
#     skewed every chest's placement box)
#   * attack no longer locks facing (ATTACK_TURN_MULT 0.55)
#   * jump dodges ground attacks honestly (AIR_GRACE after real jumps)
#   * Ghost Wolf invisibility works (senseRange -> GHOST_SIGHT 1.3)
#   * THE MOONLIT SPIRE (m1/m2/ma/mb/m3): final level off the restored
#     Village. m1 is the game's first REQUIRED jumps (gaps 1.8/1.8/1.6u vs
#     2.98u worst-case carry; a miss costs the walk, never a heart).
#     Trials pay a vault each AND light the sigils that open the last door.
#   * THE ELEMENTAL WOLF: tenth form, granted at the crown. Two rigged
#     never-used wolf clips for its attacks, seven-element braided swirl
#     aura, ranged bolt rolls one of the six shipped kinds (no repeats),
#     Element Storm hits each foe with its own weakness + fires every
#     world-verb. Overpowered on purpose — it's the victory lap.
# TEST DEBT PAID ALONG THE WAY:
#   * verify-route had been red since the spine gained its puzzle gates —
#     now proves the gates are SHUT first, then walks with plates down
#   * five game-wide suites carried hand-kept room lists that had never
#     heard of the Village or the Spire; tools/all-rooms.mjs now asks the
#     live ROOMS registry (LEGACY names the 28 rooms still excluded, dated)
#   * verify-spire.mjs measures the jump gauntlet from world.pitAt, not
#     from the comments; run-spire.mjs plays the whole level on real keys
#     (3x consecutive ALL CLEAN)
#   * the Rime Plate is findable now (c_f1b_ice), not shop-only
# GATES, AS THEY ACTUALLY LANDED (v3.71.1 → v3.71.8 overnight):
#   run-spire x3 ALL CLEAN · verify-spire, route, landings, roomid, gear,
#   callable, check-loot, music, gauntlet, emptyrooms green · reachable
#   ALL CLEAN over the full 126-room registry (267 doors) · playthrough
#   ALL CLEAN once the walker learned the spine's puzzle gates · loot's
#   --par FAIL was contention flake (serial PASS) · density KNOWN-FAIL
#   (va1/vc1 pre-existing; lb 130 vs 125 is MY open debt, task #69,
#   loudly noted in known-fail.txt so the green cannot hide it).
# WHAT FIRST-NIGHT COVERAGE OF THE MISSING ROOMS CAUGHT AND FIXED:
#   two landings inside Village houses (v3.71.2) · Village/Spire music
#   fallthrough — the overrun Village played the Den's lullaby (v3.71.3)
#   · FIVE guardian pockets with door triggers buried in wall and open
#   holes at their real gaps — no way out since the big-town rebuild
#   (v3.71.5) · vc2→vcp sealed behind its own alcove wall, so Stoneroot's
#   armour chest was unreachable on foot (v3.71.7) · two unnamed
#   deliberate floaters named (sigils v3.71.4, potion cork v3.71.6).
#   Room lists are no longer kept by hand (tools/all-rooms.mjs), and
#   verify-openholes now asks the WALL, not just the door list.
# OPEN FOR DAD: no human has played the Spire yet. The jump margins are
#   generous on paper and a bot clears them every time, but "a five-year-
#   old can do this" is a claim only a five-year-old can settle. And the
#   five pocket-exit fixes mean the VILLAGE deserves one human replay too.

# SHIPPED v3.54.0 — THE TEST HARNESS'S OWN ROOM-IDENTITY RACE, FIXED EVERYWHERE
# THE BUG: window.__game.state.room flips the INSTANT a jump is requested,
#   before the async rebuild it triggers even starts. Every tools/*.mjs file
#   that jumps between rooms polled exactly that flag for readiness — so a
#   poll could pass while `world` was still the PREVIOUS room. verify-level3
#   caught and fixed this once already (six confident false failures, none of
#   them real); this pass found the identical pattern in every other test
#   file and fixed it the same way: read world.roomId, stamped by a room's
#   own builder as the last step of its rebuild, which a race cannot forge.
# TWO MORE BUGS SURFACED GETTING THERE, BOTH NOW FIXED:
#   world.roomId was never set AT ALL for any room built through js/rooms.js's
#   central buildRoom() dispatcher — Ember Hollow, Frostpeak, every legacy
#   room (den, e1-e3, w1-w5, f1-f5, r1-r3, k1/ka/kb, zoo). Only the newer
#   level files stamped it themselves. Every test jumping to one of those ids
#   waited out the full timeout and reported it broken. Fixed by stamping it
#   once, centrally, in buildRoom() itself, for every room regardless of
#   which region's builder made it.
#   Retired room ids (r1->la, e2->vb1, w3->t3a, ...) get redirected inside
#   buildRoom() via resolveRoom(), so world.roomId ends up holding the
#   RESOLVED id, never the raw one a test asked for — comparing against the
#   raw id meant a retired-id jump could never succeed even once roomId was
#   being set correctly. Fixed by resolving the comparison target too.
# CAUGHT BY ITS OWN FAILURE SIGNATURE, NOT ASSUMED: the first pass looked
#   clean under a full verify-all --par sweep for the suites it touched
#   directly. A wider sweep across everything using the same driver turned up
#   10 more suites all failing on the identical shape ("<room> builds"),
#   every one jumping to a rooms.js-routed or retired id — traced to source,
#   fixed at the two actual origins above, then reverified clean.
# GATES: targeted reruns of the previously-failing set (9/10 clean; the 10th,
#   verify-grounded's vc3 floating rock, is the same pre-existing unrelated
#   finding from last night), INERT+CLEAN, CANARY GREEN on the live build —
#   js/rooms.js's buildRoom() is the central dispatcher every room in the
#   game passes through, so it got the same live-build gates as a ship that
#   touches gameplay, even though world.roomId itself has no gameplay
#   consumer (debug/test hook only).
# OPEN FOR DAD: nothing new. vc3's hovering "Mesh_rock_largeC" prop
#   (Stoneroot, gap 1.27u) is still open from last night — cosmetic,
#   unrelated, not blocking.
#
# SHIPPED v3.53.0 — L3 REWORK: VERDANT IS SYLVA'S REWARD + SPITTER IDENTITY
# DAD'S LAW: each elemental wolf is locked behind its own element's boss, and
#   the level after runs on it. Wild Woods broke this — verdant came from
#   touching tsh's shrine mid-level. Fixed to match Fire Wolf's pattern:
#   Sylva's kill grants it (boss.js + a main.js ceremony), the shrine is now a
#   promise, not a gate. The pre-boss spine (tc2's log-bridge rope, t4b's
#   great thorn-knot) used to demand verdant before the child could have it —
#   both re-verbed to fire, which the child already holds. tkn's boulder
#   tether (whose "no floor behind it" fiction was never enforced) is gone,
#   replaced by an honest push-and-plate room. Vine/thorn dressing was
#   near-invisible bush-large.glb clones ("so tiny you can't see them and just
#   think the game is glitching" — dad, from play); replaced with the
#   Quaternius forest kit's real bushes and bare-branch canes.
# SPITTER now has a real elemental identity (dad's call): weak to tide/frost,
#   resists fire. Exposed and fixed a systemic gap — TRAITS.resist was never
#   read by the Enemy constructor at all, so nothing in the game could resist
#   anything before this.
# FOUND BY ACTUALLY PLAYING IT, NOT TRUSTING DIRECT API CALLS: a room's own
#   random breakable-prop placer could legally drop a pot straight into the
#   Knot's boulder push lane, permanently deflecting it off the plate's
#   capture radius — a softlock for a real child. Fixed by reserving the push
#   corridor as gameplay ground before dressing runs.
# HARNESS: a room-identity race (window.__wk.room, and every ad-hoc test's own
#   go() helper, read state.room — which flips the INSTANT a jump is
#   requested, before the async rebuild it triggers even starts) could report
#   a room ready while `world` was still the PREVIOUS one. Traced beyond L3
#   into verify-density/awareness/grounded/completion.mjs via a full
#   verify-all --par sweep; fixed at the source (main.js's __wk.room getter,
#   wk-drive.mjs's jump()) and in every file it touched. ~38 more tools/*.mjs
#   files share the exact same pattern — noted for a future dedicated pass,
#   not attempted here.
# GATES: all 4 dedicated L3 suites ALL CLEAN, the full real-play walker
#   (tools/run-l3.mjs) clean end to end including post-boss return content and
#   both chords, verify-all --par 44 suites with every failure traced to
#   either reconfirmed parallel-load flakiness or the harness race above (both
#   resolved) — except vc3's floating-rock finding in verify-grounded, which
#   is pre-existing and unrelated (js/level2.js untouched this pass).
# OPEN FOR DAD: nothing new. The vc3 hovering "Mesh_rock_largeC" prop
#   (Stoneroot, gap 1.27u) is a pre-existing cosmetic bug, unrelated to
#   tonight's work — worth a look next pass but not blocking.
#
# SHIPPED v3.52.0 — DAD'S THREE-SCREENSHOT PLAY REPORT + COMBAT AUDIT PASS 1
# FROSTPEAK WAS UNCOMPLETABLE BY ANYONE: f3's lake lanes left a 1.0u collider
#   corridor for a 1.24u boulder, so the plates could never be pressed and the
#   f4 gate never opened. The old suite "passed" only at 3x timescale, where
#   big frame-steps tunnel the boulder through; at kid speed it wedged, and the
#   sealed ice read as "you need the Frost Wolf" — the boss's own reward.
#   Lanes widened to the 2.0u standard; both proven by real pushes at 1x.
# L2: crypt stairs were 4 centre-pivot meshes, half-buried and interpenetrating,
#   swallowing the door trigger (dad: "stairs don't work") -> one measured low
#   trim + landing moved off it. Bone Warden bigger (true 2.3x Kael), turn-
#   clamped so flanking is possible at all, longer telegraphs/punish windows.
#   The shoulder pin is a real mechanism now: a charred BEAM props a granite
#   HAND on an arm reaching in from the hub wall; burn it and the hand falls.
# COMBAT AUDIT PASS 1: four attacks had drifted under the 0.8s telegraph floor
#   (minion 0.25s, shield 0.55s, spitter 0.6s, rogue 0.7s) — two of them found
#   by this pass. Raised to the floor; threat preserved by CADENCE, never by
#   shrinking tells. js/attacks.js is now one pure-data attack clock that the
#   state machines AND tools/verify-combat-laws.mjs read, so a telegraph cannot
#   silently drift again (POSE-NEVER-LIES extended from hitboxes to clocks).
#   The checker was validated fail-first against all four known-bad values.
# HARNESS: verify-level3's go() waited on state.room — a flag it set itself —
#   so it could measure the PREVIOUS room and report six confident false
#   failures (t1a with Ember's doors). Now asserts world.roomId.
# GATES: verify-level3 ALL CLEAN, run-l4 clean, combat regression 4/4 (0 fails),
#   verify-combat-laws ALL CLEAN, guide/vault/level2-progress/loot PASS,
#   real-play probes (pin-arm, lake-west, chest-anim) PASS, INERT+CLEAN,
#   UPGRADE CLEAN, CANARY GREEN. Full sweep runs post-ship as the net.
# PHONE-CHECK: force-refresh once for the SW swap, badge reads v3.52.0.
#   Frostpeak: the lake is solvable now. L2: the crypt stair reads and walks.
# OPEN FOR DAD: the Spitter has NO elemental identity (no TRAITS entry) —
#   fire-weakness (family lesson) vs fire-resist (truer for a fire-spitter,
#   harder in a fire level) is a design call, deliberately not made unilaterally.
#
# SHIPPED v3.51.0 — main b65cc85, Pages build (deploy run 32214150293).
# DAD'S TWO PLAY REPORTS ON THE LIVE v3.50.0 BUILD, both fixed + verified by
# REAL play (probe-l2-guide.mjs / probe-map-close.mjs) and the greybox L2/guide
# suites; gates at ship: verify-all 43/44 --par + gauntlet CONFIRMED PASS serially
# (s2b was a --par CPU-contention flake), INERT+CLEAN, UPGRADE CLEAN, CANARY GREEN.
# PHONE-CHECK: live badge reads v3.51.0 (force-refresh once for the SW swap);
# Level 2 — after the plate, follow Pip to the north spoke's burnt post, be the
# Fire Wolf and slam it; the crypt opens. Map — ✓ Done always closes it now.
#
# ORIGINAL REPORTS (kept for the record):
#   BUG 1 (map soft-lock): opening the map had no way back — the ✓ Done button
#     sat below a non-scrolling centered .panel on a phone screen, so the only
#     escape was to kill the game. FIX index.html .panel: overflow-y:auto +
#     justify-content:safe center + safe-area padding. VERIFIED real-play at a
#     220px viewport (probe-map-close.mjs): content overflows, Done reachable
#     after scroll, click resumes the game (clock ticks). PASS.
#   BUG 2 (Level 2 loops forever): "talk to the spirit, stomp the plate, then the
#     new rooms just loop back with nothing to do." ROOT CAUSE: Spoke C's last
#     room (vc3) ends in an ACTION (burn the shoulder pin), not a door — but the
#     lost-child guide (route.js nextRoom) pointed Pip at the loop-back door,
#     walking the child PAST the unburned pin and back to the hub; and unlike the
#     rattle plate the pin had no immediate proximity nudge (only a 22s linger).
#     A rock-pile silhouette also reads as an EARTH-stomp target — the one wolf
#     the child does NOT have yet (it is this boss's reward). FIX:
#       - main.js guideTarget(): in a spoke's last room, target the pending
#         lantern/plate/pin while its milestone is undone; fall through to the
#         door once done. Pip now leads TO the objective, not past it.
#       - main.js: immediate pin_hint on approach (mirrors the rattle plate);
#         narration.js pin_hint names the FIRE verb and what it opens.
#       - menus.js map: Stoneroot list now the real vh/va3/vb3/vc3/vz ids so the
#         "⭐ You are here" star works (retired e1/e2/e3 never matched).
#     VERIFIED real-input (probe-l2-guide.mjs): guide → lantern/plate/pin (not a
#     door), pin_hint speaks on approach, real fire slam burns the pin ->
#     handDown, guide then leads back to the hub. PASS. Greybox: verify-guide,
#     verify-vault, verify-level2-hub, verify-level2-progress all PASS.
#     PENDING: run-l2 full real-play, verify-all --par, ship as v3.51.0.
#
# SHIPPED v3.50.0 — main 16e07c0, Pages build SUCCESS (API-confirmed 11:22Z)
# L5 Stormreach + L6 Sunken Vale + L7 Shadow Court — THE GAME IS COMPLETABLE
# END TO END (playthrough suite walks all 7 regions + frees Grimm). Boss 1x
# ZERO DEATHS each: Aria, Meri, Shadow-Grimm. Gates at ship: verify-all 44/44
# --par, INERT+CLEAN, UPGRADE PATH CLEAN (v3.49.0 save loads intact), CANARY
# GREEN. TWO SHIP-BLOCKING BOSS FIXES (Grimm was UNBEATABLE for any player):
#   1. boss.js Shadowgrip coreHittable dropped the damage ELEMENT -> every hit
#      read as 'steel', which Grimm resists below half health. Now forwarded.
#   2. boss.js float residual left coreHp at ~1e-15 (immortal at ~0hp). Snapped.
# PHONE-CHECK: open the live link, force-refresh once for the SW swap, confirm
# badge reads v3.50.0; play to the Shadow Court and free Grimm for the ending.
#
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
6. L5 Stormreach — DONE, PASS (composition in Levels). Boss 1x zero deaths.
   (history) ROUTE PASS (iter 11, FAILS none, 0 errors): storm
   granted, teach gale dashed, sc2 develop crossed (north-door dash), svn
   VANES TURNED, s4b wind gate opened, Aria sighted (boss-loop). BOSS NEXT:
   node tools/fight-aria.mjs (1x). D-L5-1 RESOLVED by play: the ssA bridge
   door is created at s4a UNCONDITIONALLY (level5.js:983) but at s1a only
   `if (bridged=WS windBridge)` (level5.js:504) — nothing sets windBridge, so
   the bridge is ENTERABLE from the top (s4a) yet the s1a return never opens.
   Whether that is one-way-by-design or a defect: the bridge's PURPOSE is a
   shortcut DOWN (top->bottom), so s4a-entry + ssA->s1a exit would suffice IF
   ssA has a west door to s1a — verify in the Aria/close pass. If the down
   route works, D-L5-1 is a cosmetic dead flag; if not, s4a's ssA door leads
   into a room with no exit to s1a = real trap. RESOLVE at close.
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
7. L6 Sunken Vale — DONE, PASS (composition in Levels). Boss 1x zero deaths.
8. L7 Shadow Court — DONE, PASS (composition in Levels). Boss 1x zero deaths.
   Two ship-blocking game bugs found+fixed (element-drop made Grimm unbeatable
   <16hp; hp residual left him immortal at ~0hp) — see the Levels L7 entry.
7b. L6 Sunken Vale — NEXT: run-l6.mjs + fight-meri.mjs are DRAFTED (tide
    splash puzzle, frost-shatter gate, deep crossings, Meri floods). Recon
    RECON-L6.md (8 defect candidates). Route at 3x, Meri 1x.
7c. L7 Shadow Court — after L6. Recon RECON-L7.md (Grimm resists steel+moon
    below 16hp, rotate elemental forms below ~11hp; ending blocks pointer).
9. Ship events per protocol (batch ~2 levels per ship) — TODO. L5 shippable
   now; will BATCH L5+L6 (and maybe L7) into one ship to save gate cycles.
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
- L6 Sunken Vale: **PASS** (run 3, 2026-08-17)
  * Route: full RIM spine d1a..ddp by play at 3x, 0 console errors. TIDE wolf
    granted at dsh; BOTH deep-water crossings (dg2, d4b) walked as tide; all
    three pools QUENCHED by splash. Meri sighted (28hp, boss-loop).
  * Boss: MERI FREED at 1x FULL SPEED, ZERO DEATHS — all 8 actions, floods
    survived in tide form; the drained deep opens the way to x1 (Shadow
    Court). Evidence: test-evidence/level-6/.
  * Lagoon (dlg) verified: enter/exit works, NOT a trap (D6-1 cosmetic).
  * NO js/ changes -> the v3.49.0 ship's 44/44 gates still hold; full sweep +
    canary run at the batched L5+L6+L7 ship.
  * DEFECTS -> MORNING REVIEW (RECON-L6.md), none overnight-fixable: D6-RE-
    ENTRY (tide-grant leaves a deep wall until dsh is re-entered — soft-lock
    risk, wants a hint), D6-6 (Vale plays Stoneroot's music — needs an asset/
    decision), D6-2/D6-DTP (tide-quench twist is decorative — the door is
    ungated and poolsQuenched has no readers).

- L5 Stormreach: **PASS** (run 3, 2026-08-17)
  * Route: iter 11, full switchback climb by play at 3x, FAILS none, 0
    errors. Storm wolf granted at ssh; teach gale DASHED; sc2 develop crossed
    by dashing NORTH up through the door; svn VANES TURNED (minimum-turn,
    timescale-aware facing); s4b wind gate opened; Aria sighted (boss-loop).
  * Boss: ARIA FREED at 1x FULL SPEED, ZERO DEATHS — all 8 actions, 16
    dashes to answer her half-health gales, fought entirely in storm form.
    Way to the Vale (d1a) opens on the rebuild. Evidence: test-evidence/level-5/.
  * D-L5-1 RESOLVED (not a defect): the ssA wind-bridge is a working one-way-
    DOWN shortcut (s4a->ssA->s1a walks; probe-l5-bridge OK). The windBridge WS
    flag is vestigial (gates only the never-needed s1a->ssA up-entry).
  * Suites: verify-storm, callable, boot PASS. Canary GREEN.
  * DRIVER LESSONS (run report): dash facing follows NET velocity; keyboard
    holds scale with timescale (200/TS); the thin lane-strip is un-walkable;
    vanes solved minimum-turn from outside their lane. ~11 route iters + 4
    focused probes (sc2, vanes x2, bridge) + 2 env crashes retried.

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
- L7 Shadow Court: **PASS** (run 3, 2026-08-18)
  * Route: hub xh + all 4 relic wings + throne by play at 3x, FAILS none, 0
    errors. GHOST wolf granted at xsh; four relics by real walking + the wing
    verb — ASH earth-crack (ember), ROOT frost/skirt (thorn), GALE storm-DASH
    across the gale + tide-quench all 3 fires (tide), MIRROR ghost-walk (moon).
    Four relics -> the throne stair (xst) opens on the xh rebuild; Shadow-Grimm
    at the throne (32hp, boss-loop). Evidence: test-evidence/level-7/.
  * Boss: SHADOW-GRIMM FREED at 1x FULL SPEED, ZERO DEATHS — aim at the moving
    CORE (world.boss.coreHittable, not the __wk root); armour answered by
    elemental melee + forward rotation (steel/moon dead <16, last-element dead
    <=10.67); low-hp FINISHER piles in when clean windows go scarce; ending
    cinematic + gameComplete + credits + music 'den' ("the game is complete").
  * TWO CRITICAL GAME-CODE FIXES (final boss was UNWINNABLE, ship-blocking):
    (1) js/boss.js Shadowgrip coreHittable dropped the damage ELEMENT ->
        every hit read as 'steel' -> Grimm resists steel below half health ->
        a kid's fire/earth/etc. all counted as the one thing he shrugs off.
        Now forwards the element. (No-op for Sylva/Aria/Meri — they never
        resist.)
    (2) js/boss.js floating-point residual: elemental damage (1.5, 2.2, ...)
        left coreHp at ~1e-15 instead of 0, so `coreHp <= 0` never fired and
        he survived on an invisible sliver. Now snaps <1e-6 -> 0.
  * DEFECTS -> MORNING REVIEW: D7 wing gates are DECORATIVE (wingLock/wingSolve/
    puzzleSolved set but read by no door logic — every gate walk-aroundable);
    court/throne music is the stone-deep/boss-loop placeholder (no dedicated
    Court track); the tide-quench needs the 6s splash cadence (not a bug).
  * DRIVER LESSONS: __wk.boss.x/z is the ROOT, the hittable rides
    core.position and wanders metres out — swing at the CORE; reliable FACING
    (aimAt bearing loop) is the whole ballgame for the ±70° bite; gameWait must
    cap real-time (the ending freezes player._time).

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
