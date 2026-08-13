# MORNING REVIEW — design-level questions from the overnight run

1. **Shadowgrip `phase` never leaves 1.** His fight machine is the ACTION cycle
   (prowl/stalk/windup/swipe/crouch/charge/tired/recover) and hp thresholds
   drive a half-way howl, not a phase number. If the spec means phases to be a
   universal boss concept, the field is dead on this boss; if actions ARE his
   phases, the spec wording should say so. Played evidence: full kill at 1x with
   all 8 actions exercised. Not a defect tonight — flagging the vocabulary gap.

2. **DEV_HARNESS ships enabled (gated behind ?dev=1).** Precedent: window.__game
   debug hook already ships. If you want the harness compiled out of kid builds
   entirely, that needs a build step the project deliberately doesn't have —
   decide whether the query-param gate is enough.

3. **Retired-id start room.** A brand-new game starts with state.room='r1',
   resolved to 'la' by the loader everywhere it matters. Cosmetic inconsistency
   in saved state; changing it touches save format, which tonight's rules
   forbid. Decide whether to migrate ids on save-load some future version.

4. **Boss-earned forms, L3+.** Wild Woods through Shadow Court still shrine-
   grant (verdant/storm/tide/ghost). The L1→L2 chain (fire from Shadowgrip,
   earth from Warden) is live and now play-verified. L3's re-key needs real
   puzzle redesign (every Wild Woods puzzle uses its own region's lash).

5. **Spitter in `la` (the very first room).** Deliberate per the difficulty
   rework — but it is the first thing a 5-year-old meets. Gentle mode softens
   it; consider whether room one should teach before it shoots.
