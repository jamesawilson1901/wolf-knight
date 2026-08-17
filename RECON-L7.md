# LEVEL 7 — SHADOW COURT recon (agent read, 2026-08-17; verify by play)

## Shape
SPINE x1>xsh>xh>xst>xth. Pockets xp1/xp2 (off xh). NO shortcuts. ENTRY: ddp
n-door (meriDefeated) -> x1 (0,10). Wings off the hub xh: west xa1>xa2>xa3
(ash/EMBER relic) and xr1>xr2>xr3 (root/THORN relic); east xg1>xg2>xg3
(gale/TIDE relic) and xm1>xm2>xm3 (mirror/MOON relic). Wing relics at:
xa3(-6,0) xr3(-6,0) xg3(6,0) xm3(6,0), pickup r1.9 -> WS court relic_<name>.
xh n-door to xst exists only when relicCount>=4 AT BUILD (re-enter xh after
relic 4). xst -> xth (boss). Landings: xh w@-8->xa1(11,0), w@+8->xr1(11,0),
e@-8->xg1(-11,0), e@+8->xm1(-11,0); wings chain e/w at (±11,0)/(8,0);
xa3 e->xa2 lands (-7.1,3.3). xst s->xh(0,-12) n->xth(0,10).

## Teach/solve (exact)
- xsh sparkSpot (0,-1.5) grants ghost_wolf (K = ghost walk 6s/8s cd).
- xa2 wingSolve: EARTH crack 'x_ash_vault' (flags.cracked) — BLOCKS (wall
  x=-9 z-4..4 + gate box). xr2: FROST shatter 'x_root_ice' (WS ice_...) —
  BLOCKS. These two are the real locks.
- xa1 fire burn 'x_ash_bar' / xr1 verdant cut 'x_root_tangle' — nominal
  locks (walk-aroundable, see defects).
- xg2 poolBraziers (-3,-3)(0,0)(3,3): tide K quench x3 -> WS court
  galeQuenched (nothing reads it).
- xm1 watchers (2,-4.5)(2,0)(2,4.5) r1.5 (colliders vanish while ghosted);
  xm2 mirror panes (-5,-3)(1,4)(7,-3).
- x1 ghost-only alcove: chest x7_gate (-13,-3.8) behind 0.2-0.3u gaps.

## Grimm (xth, Shadowgrip class, skin grimm)
32hp, 1.1x, saveKey grimmHp (wounds persist). Same action machine. RESISTS:
hp<=16: resists STEEL and MOON (knight/dark_wolf/ghost_wolf useless);
hp<=~10.67: ALSO resists the last element that hit him -> ROTATE among
fire/earth/verdant/frost/storm/tide every landed hit. Kill -> grimmFreed +
gameComplete. ENDING: end_1..end_6 over 27s + rollCredits at +21s; #credits
overlay blocks POINTER input until tapped (keyboard unaffected; auto-close
45s). regions.js: the 27s restoration is skippable:false — the fight script
must WAIT it out, keyboard-only, then tap the credits once.

## DEFECT CANDIDATES (verify by play)
1. xa1/xr1 entry gates walk-aroundable (|z|>4.5 in a 20-deep room) — fire/
   verdant not actually required for their wings.
2. xg1/xg2: NO effective gate on the gale wing (lane ends short; sliver at
   |z|~9.4) — tide relic reachable without storm or tide.
3. xm1 watcher line passable (1.5u gaps); xm2 mirrors walk-aroundable
   (z~-10 strip clear) — the mirror wing never requires ghosting.
4. pupSpot id pup_x1 DEAD (pip.js reads pup1Spot..pup12Spot only) — same
   bug in level5/6: advertised pups never spawn.
5. NO state.room[0]==='x' narration block; music for x reuses stone-deep.
6. boss.js hpFrac uses MAX_HP=20 for 32-hp Grimm (cosmetic overshoot).
7. regions.js: duplicate keys storm_wolf/moonlight in GRANTED_IN;
   shadowcourt.grants 'moonlight' vs code granting ghost_wolf.
8. xh wing-door torch colours mirrored (cosmetic).
