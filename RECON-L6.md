# LEVEL 6 — SUNKEN VALE recon (agent read, 2026-08-17; verify by play)

## Shape
Spine: d1a>d1b>dg1>d2a>d2b>dsh>dg2>d3a>d3b>dtp>dg3>d4a>d4b>dg4>ddp.
Pockets d1p/d2p/d3p/d4p. Shortcut = dlg (the lagoon), opened by OWNING
tide_wolf (canWade at build) — re-enter a room after the grant for its door.
ENTRY: scr n-door -> d1a (ariaDefeated). BOSS ddp; meriDefeated -> n door x1.
Door landings (dest coords): d1a s->scr(0,8) n->d1b(0,10) w->dlg(14,0)|wade;
d1b s->d1a(0,-10) n->dg1(0,5) e->d1p(-7.5,0); dg1 n->d2a(0,10);
d2a s->dg1(0,-5) w->d2b(13,0) n->d2p(0,6) e->dlg(0,13)|wade;
d2b n->dsh(0,6); dsh s->d2b(0,-10) w->dg2(9,0); dg2 w->d3a(13,0);
d3a w->d3b(13,0) n->d3p(0,6) s->dlg(0,-13)|wade; d3b n->dtp(0,10);
dtp n->dg3(0,5) UNGATED; dg3 n->d4a(0,10); d4a w->d4b(13,0) e->d4p(-7.5,0)
n->dlg(0,13)|wade; d4b w->dg4(9,0) n->d4p(0,6); d4p s->d4b(0,-10)
w->d4a(7.5,0); dg4 n->ddp(1.7,10.7); ddp s->dg4(0,-5) n->x1(0,10)|meri.

## Teach
- dsh introduce: sparkSpot (0,-4.6) grants tide_wolf (2.4 radius, WS vale
  spark). Deep 'd_shrine' x[-7.8,-3.4] z[-7.5,7.5] bars w exit until tide.
- dg2 develop: deep band x[-3,2] z[-6.5,6.5] mid-room; walk only.
- dtp TWIST: poolBraziers (-8,-1)(0,-5)(8,-1) ids tp-8/tp0/tp8. As TIDE,
  stand within 3.4 and press K (trySplash, cd 6 game-s) -> WS vale
  quench_tp<x>; all three -> WS vale poolsQuenched. No timer.
- d4b conclude: deep 'd4b_lock' x[-6.5,2.5] z[-11,11] crossed with tide;
  pack on the far side.
- d3b: frost-shatter promiseGate at (-10,-7.2) (L breath as FROST) ->
  WS vale ice_d3b_ghost; chest d6_ghost (-13,-7.2).

## Water
canWade = tide_wolf owned, read at BUILD. Deep without tide = solid box
collider; with tide = drag 0.88 only. NO drowning/damage anywhere. Junction
centre props: d1a drownedgate, d2a fisherruin, d3a sunkenhall (6 columns
x{-4.5,0,4.5} z±2.2 r0.6), d4a whalebones (slabs x[-6.2,6.2] z±2 r0.5),
ddp throne ring (8 columns r=9.8, r1.1; skirt between r3.4 and r9.8).
Bypass lanes x≈±7..12 in junctions.

## Meri (ddp, Shadowgrip class, Slime.glb, skin meri)
28hp, 0.92x, saveKey meriHp (wounds persist). SAME action vocabulary:
prowl/stalk/windup/swipe/crouch/charge/tired/recover. At hp<=14 ONE flood:
two deep zones world x[-13,-6] and [6,13], z[-14,10] (need tide to stand
there; the middle stays dry). Kill: meriDefeated + tide safety push +
_drain() removes meri zones; main.js vale party (victory music, WS vale
restored). Rebuild ddp: n gap to x1, meriShrine (0,-3), gold chest.
Fight plan: whole duel AS TIDE (K splash useless vs boss? — splash is the
brazier verb; melee J + shield + walk; floods passable in tide). 1x.

## DEFECT CANDIDATES (verify by play)
1. dlg landings mismatched: d2a e->dlg lands (0,13) [south, next to the d4a
   door] and d3a s->dlg lands (0,-13) [north, next to the d2a door]; the
   west ring at (-14,0) is orphaned. Bounce risk (velocity preserved).
2. dtp puzzle GATES NOTHING: n->dg3 unconditional; world.onSolved read but
   never assigned repo-wide.
3. Enemy variants tide/deeptide/gull/drowned DO NOT EXIST in enemies.js
   VARIANTS — applyVariant silently returns base: the whole region's
   enemies are unscaled, untinted base creatures.
4. d3b gate hinted as GHOST (ghostPromise, ghost_howto line) but opened by
   the FROST shatter system — the hint names a verb that cannot open it.
5. Dead narration: vale_deep_first, vale_lagoon, meri_duel never said;
   tide_quench bound to marker tidePromise which L6 never sets.
6. NO state.room[0]==='d' Pip block in main.js (t/f have one) AND music
   falls back to region-stone — the Vale plays Stoneroot's music.
7. WS 'vale' restoration never defineRestoration'd (keys unregistered).
8. dg2 e->dsh landing x=-9 only 0.85u from dsh's west trigger (bounce risk).
