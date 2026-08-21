# Wolf Knight — Combat & Enemy Systems Context Pack (v2, final)
**Purpose:** the single cached-context file for a solo Claude agent auditing/extending Wolf Knight's combat and enemy systems. Replaces the 8-bot playtest swarm. Upload once per session (or commit as a referenced doc next to CLAUDE.md); reference by section number in prompts instead of re-pasting code.

**Verified against the live build 2026-08-19:** https://jamesawilson1901.github.io/wolf-knight/ — modules read directly: `js/config.js`, `js/progress.js`, `js/enemies.js`, `js/player.js`, plus repo docs `design/COMBAT-SPEC.md` and `design/GAME-CONTRACT.md`. Those two repo docs remain the canonical law; this file is the combat-scoped extraction plus the audit workflow and the literature basis for each rule.

**Caching note (why this file is shaped the way it is):** Anthropic's prompt-caching rules require the static block to come first, be byte-for-byte identical between requests, and exceed the minimum cacheable length (commonly 1,024 tokens for Sonnet-class models); cache reads then cost ~10% of base input price with a 5-minute default TTL refreshed on each hit ([Anthropic prompt caching docs](https://docs.claude.com/en/docs/build-with-claude/prompt-caching)). Therefore: this entire file is static context — never append per-task instructions to it. Put the varying task at the end of your message, after the file.

---

## 0. Agent operating instructions

You are a combat-systems auditor and implementer for Wolf Knight, a mobile-first 3/4 top-down Three.js ARPG built for young children (roughly ages 5-10), co-designed by a dad with his kids and iterated through dated family playtest verdicts embedded in code comments.

Rules of engagement:
1. Work from this file plus ONLY the source file(s) named in the task. Do not request the full repo.
2. Rules marked **LAW** are binding. Flag violations; do not re-litigate the rule itself unless asked. Laws have playtest provenance (dated verdicts in comments) — numeric values should not be reverted without new playtest evidence.
3. Follow the pass structure in §6 sequentially. Stop early if Pass 1 fails.
4. Emit one consolidated findings report per task, not one per pass.
5. Every finding needs a file:line (or function-name) citation and a severity: LAW-violation / bug / balance-risk / style.
6. When writing tests (§6.5), write them to fail first, confirm they fail, then fix — never write tests that trivially pass against current behavior you haven't verified ([Anthropic Claude Code TDD guidance](https://rits.shanghai.nyu.edu/ai/unlocking-efficiency-best-practices-for-agentic-coding-with-claude-code/)).

---

## 1. Verified system inventory (as-built)

### 1.1 Modules
`main.js` (loop, dev harness), `player.js` (all player combat), `enemies.js` (Enemy base class, per-family classes, VARIANTS registry, TRAITS), `rooms.js` (~160KB; room builds, spawns, encounter placement, bosses), `config.js` (every tuning number), `progress.js` (XP, levels, `enemyScale()`, perks), `state.js`, `items.js` (weapon/shield defs incl. per-weapon `lock/range/dmg/arc/stun/element`), `juice.js` (single hit-feedback pipeline), `audio.js`.

Dev harness: `CONFIG.DEV_HARNESS: true` + `?dev=1` URL flag → read-only `window.__wk` state view, level jump, timescale. Use it for runtime state inspection instead of inferring state from source.

### 1.2 Player forms (FORM_DEFS, player.js) — now NINE forms
| Form | speed | melee lock / hitAt / range / dmg | ranged kind (bolt element) | special (cooldown) |
|---|---|---|---|---|
| knight | 4.6 | 0.55 / 0.30 / 2.0 / 1 | spark (spark) | Whirlwind 360° ×1.2 dmg (6s) |
| dark_wolf | CONFIG 6.7 | 0.34 / 0.19 / 1.7 / 1 | pierce (moon, 3 targets) | Blood Moon surge (earned gauge) |
| fire_wolf | 5.2 | 0.45 / 0.24 / 1.7 / 1 | breath (fire cone 38°, 3.4u) | Ground slam 2 dmg r3.0 (7s) |
| earth_wolf | 4.9 | 0.50 / 0.26 / 1.7 / 1.5 | rock (earth, +0.5 dmg, 0.9s stun) | Stone stomp 2 dmg r3.2, 2.5s stun (8s) |
| verdant_wolf | 5.4 | 0.42 / 0.22 / 1.7 / 1 | thorn (verdant, 1.2s root) | Vine lash 1.5 dmg, 2.6s snare (7s) |
| ghost_wolf | 5.5 | 0.40 / 0.21 / 1.7 / 1 | pierce (moon) | Ghost Walk 6s stealth (8s) |
| tide_wolf | 5.0 | 0.44 / 0.23 / 1.7 / 1.2 | shard (frost, 0.8s stun) | Splash 1 dmg r3.4, 2.0s soak (6s) |
| storm_wolf | 5.7 | 0.40 / 0.21 / 1.7 / 1 | spark | Thunder dash 5.2u, 1.5 dmg, 1.6s stun (5s) |
| frost_wolf | 5.0 | 0.44 / 0.23 / 1.7 / 1.2 | shard | Frost breath cone 40°, freeze 2.2s (7s) |

Key player constants (player.js): `PARRY_WINDOW 0.3` (+ shield `parryBonus`), `PARRY_STUN 2.2`, `IFRAME_TIME 1.0`, `COMBO_WINDOW 0.7`, thrust = ×1.3 dmg / +0.55 range / 32° arc, `RANGED_COOLDOWN 1.1`, `boltDamage`: 0.5 ground / 1.0 flying (+0.25/perk rank, ×3 fury). Dodge roll from CONFIG: `ROLL_SPEED 7.5, ROLL_DUR 0.32, ROLL_IFRAMES 0.4`. Dark Wolf lunge: `LUNGE_DIST 2.5 / LUNGE_DUR 0.26` with i-frames = LUNGE_DUR exactly (one number, visible dash = invulnerable window — deliberate).

### 1.3 Element vocabulary — ⚠ EXPANDED, watch for drift
Player-emitted strike elements now include: `steel, spark, moon, fire, earth, verdant, frost, storm, tide`. The `takeDamage` doc comment in enemies.js still lists only `steel | spark | moon | fire | earth`. Enemy `weakness`/`resist` values observed: `moon, fire, earth`. **Standing audit item:** any new enemy weakness/resist must use an element the player can actually emit at that point in progression, and the takeDamage comment/enum should be updated to the full vocabulary.

### 1.4 Enemy roster (TRAITS + XP_VALUES, ground truth)
| Enemy | XP | Weakness | Armored | Signature |
|---|---|---|---|---|
| Shade | 5 | moon | no | lurching skip, contact damage |
| Ember Moth | 6 | moon | no | bob → glow 0.8s → double-dive (dive speed 7.2) |
| Shadow Hound | 20 | moon | no | crouch ~1s body telegraph → straight charge (0.7s) → recover |
| Slime | 5 | fire | no | splits into 2 minis on death |
| Cave Bat | 6 | fire | no | dive → crash-lands grounded (vulnerable) |
| SkeletonMinion | 8 | fire | yes | slow swarm |
| SkeletonRogue | 12 | fire | yes | orbits at ~2.6u, crouch-telegraph ~0.7s → dash; PREDICTABLE sidestep of first melee swing (3.5s dodge cd), bolts/AoE always land |
| SkeletonShield | 12 | fire | yes | visible shield-up, front NULL; drops on own swing/stun/flank (2 rad/s turn) |
| SkeletonWarrior | 12 | fire | yes | melee, swingTimer 2.2-3.2s, long 1.7s punish recovery |
| SkeletonMage | 14 | fire | yes | ranged spitter |
| BoneWarden | 60 | fire | yes | mini-boss; 130° chop (`CHOP_ARC` shared by telegraph arc AND hit test — can never drift), 3-swing pattern then 360° sweep |

Variants (`VARIANTS` registry — tint/scale/stat/element deltas on shipped models; **new code-built creatures are banned**): cinder (fire-RESIST Shade), elder (hound, chargeSpeed 10.8), brute, thorn/elderthorn/bramble (Wild Woods, fear fire), rime/elderrime/snowblob/frostmoth (Frostpeak, fear fire), gale/eldergale/stormbat/sparkblob (Stormreach, fear EARTH — deliberately breaking four regions of "burn it"), plus a moon-weak charger family (chargeSpeed 10.5/11.5, dark puffTint — Shadow Court region). Awareness/stealth (region 7): enemies born `aware` everywhere else; only "sleeping" shadows start `unaware`; `SUSPECT_R 5.5`, `SUSPECT_HOLD 2.0`, suspicious state is a visible body pose (stop, turn, eyes climb with timer) — THE POSE NEVER LIES applies to attention.

Bosses: Shadowgrip (giant Shadow Hound, 20hp, 3-dmg-per-hit cap, 1.0s charge telegraph, every charge ends in 2.6s gold-ring collapse), Bone Warden, Sylva Thornbound (24hp, ~8% quicker, same grammar), Boreal (flying — circles KAEL not the arena, dive bounded ±6.6, verified by NDC projection at 740×360). **LAW: bosses fight like their family** — bigger, tougher, same telegraphs and answers; never a separate machine of tendrils/waves/phases.

### 1.5 Damage resolution pipeline (`takeDamage`, enemies.js)
Multipliers apply in this exact order — order matters when auditing balance math:
1. Frozen-shatter: hitting a frozen enemy → ×2 and breaks the freeze (setup-not-kill lesson).
2. Armored: steel ×0.5 / magic (any non-steel element) ×1.35 — armor teaches "switch off steel," not "hit harder."
3. Weakness match → ×1.5 (SUPER!).
4. Resist match → ×0.4 (RESIST — the counterpart lesson).
5. Stunned (incl. parry stun) → ×2.
6. Result rounds to the nearest 0.5, with a floor of 0.5 — no hit is ever fully nullified.
Audit implications: any new multiplier must slot into this order explicitly; a weakness+stun+shatter stack on a new enemy can spike (×6 before rounding), so check burst math on low-HP additions; the 0.5 floor means RESIST can never become immunity.

### 1.6 Difficulty machinery
- `enemyScale() = min(2.2, 1 + (level-1) × 0.08)` — HP only, capped. Gentle skips `ENEMY_HP_BONUS` (currently 1) entirely.
- Cozy (default): damage taken ×0.6, floor ½ heart. Gentle: ×0.4 AND enemies run at 80% timescale (`GENTLE_ENEMY_TIME`) — moves and telegraphs slow down. Brave: full.
- Attack tokens (`CONFIG.ENGAGE`): max simultaneous pressers 2 Gentle / 3 Cozy / 4 Brave; the rest prowl a 3.0u ring at 0.95 u/s. An attack in motion always finishes.
- Rubber-band after 3 deaths at one checkpoint; boss wounds persist across deaths (`flags.bossHp`).

---

## 2. Binding laws (LAW) — with literature basis

Each law below is from GAME-CONTRACT.md/COMBAT-SPEC.md or config comments, verified in code. The literature column is why the law is right — cite it when a proposed change would weaken a law.

1. **Telegraph floor: every attack ≥0.8s windup; bosses ≥0.9s.** Basis: adult simple visual reaction is ~200-300ms ([Human Benchmark-derived analysis](https://ndcswift.github.io/tapduel/what-is-a-good-reaction-time/)), but children's complex/choice reaction is far slower — ~785-800ms at ages 10-11 ([Trends in Sport Sciences, 2013](https://www.wbc.poznan.pl/Content/299310/PDF/6_Trends_2013_3_147.pdf)) and whole-body reaction at ages 4-6 is 777-975ms ([Kanazawa University study](https://kanazawa-u.repo.nii.ac.jp/record/791/files/ED-PR-MIYAGUCHI-DEMURA-2791.pdf)). A 0.8s floor ≈ one full child choice-reaction; Gentle's 0.8 timescale stretches it to ~1.0s, matching the youngest players. Longer telegraphs for higher-stakes attacks is standard guidance ([note.com telegraphing article](https://note.com/darkangels_417/n/nb520b22d60f7?hl=en-US)).
2. **Difficulty must never be raised by degrading readability** (shrinking windups). Raise difficulty via behavior/composition; shorten punish windows only after players have had reps to chunk a pattern ([Game Developer: Designing for Difficulty — Readability in ARPGs](https://www.gamedeveloper.com/game-platforms/designing-for-difficulty-readability-in-arpgs)).
3. **Attack tokens cap simultaneous threat** (2/3/4 by mode; prowl ring for the rest). This is the same architecture as Batman: Arkham's ticket system ([Unity Discussions breakdown](https://discussions.unity.com/t/how-does-the-batman-arkham-games-combat-system-work/509429)), DOOM 2016's demon token system ([GDC 2018: Embracing Push Forward Combat](https://www.gdcvault.com/play/1024940/Embracing-Push-Forward-Combat-in)), and God of War 2018's aggression-token pool with per-enemy priority ([GDC 2019: Evolving Combat in God of War](https://www.youtube.com/watch?v=hE5tWF-Ou2k)). Wolf Knight's version is validated industry practice; audit that new spawn logic never bypasses it.
4. **Telegraphs live on the body** (crouch, eye flare, dust) — no floor decals under regular enemies; boss lane telegraphs are the one exception. Telegraphs are the games application of Disney's Anticipation principle ([Game Developer: 12 principles of animation](https://www.gamedeveloper.com/production/the-12-principles-of-animation-in-video-games)).
5. **Color grammar: RED = danger, GOLD = act-here. Never mixed.** Consistent visual language ("expectations") is half of readability ([Readability in ARPGs](https://www.gamedeveloper.com/game-platforms/designing-for-difficulty-readability-in-arpgs)).
6. **Every attack has a taught answer** (dodge / shield / parry / jump / flank), and **every attack that ends leaves a punish window.** Post-attack vulnerability of ~0.25-1s is the recommended fairness device ([Chaotic Stupid: post-attack telegraphs](http://www.chaoticstupid.com/telegraphs-2-post-attack-vulnerability/)); Wolf Knight runs generous-for-kids windows (hound recover, Warrior 1.7s, boss collapse 2.6s) — appropriate for the audience, do not shorten below ~1s without flagging.
7. **THE POSE NEVER LIES:** one `shieldUp` getter feeds both `takeDamage` and animation; hitbox and pose can never drift. Same pattern as BoneWarden's `CHOP_ARC` (one constant for telegraph arc and hit test). **Extend this pattern:** any new guard/telegraph must read the same constant/getter in both the visual and the hit test.
8. **HP scaling is secondary; behavior carries difficulty.** `enemyScale()` cap 2.2 exists to prevent sponge design — the documented failure of Destiny/Division-style HP inflation ([Den of Geek: bullet sponges](https://www.denofgeek.com/games/bullet-sponges-v/)); practitioner consensus is introduce-mechanic-then-compose, numbers last ([Game Dev StackExchange: level scaling](https://gamedev.stackexchange.com/questions/181980/correctly-done-level-scaling)).
9. **Forgiveness stack is intentional, not slack:** soft lock-on (4u, 120° cone), input buffer 0.15s, hitbox pad 0.2u, generous i-frames, Cozy default. This is the "forgiveness mechanics" school — silently correct imprecise input to return the intended outcome, doubly important for children's fine-motor precision ([GDC: Forgiveness Mechanics](https://gdcvault.com/play/1026606/Forgiveness-Mechanics-Reading-Minds-for)). Gentle mode's granular independent toggles (damage softening + timescale + guide trail) mirror Celeste's Assist Mode philosophy of stacking independent assists (50-90% speed, etc.) without marking the save file ([Vice on Celeste Assist Mode](https://www.vice.com/en/article/celeste-difficulty-assist-mode/)).
10. **Verification tools must have working rulers.** Project history: verify-gear passed five unobtainable tier-5 items because it checked stock lines, not rung reachability; the blind-strip audit measured from the ground plane and passed rooms it should have failed. "A verification tool with a broken ruler is worse than no tool: it reports clean and is believed" (GAME-CONTRACT). Every check you write must be validated against a known-bad case first (fail-first, §6.5).

---

## 3. Normalized attack-pattern template

One schema for every enemy/boss attack — documenting existing or specifying new. No per-enemy ad hoc fields.

```jsonc
{
  "attack_id": "hound_charge",            // stable snake_case, unique per owner
  "owner": "ShadowHound",                 // class name, must match js/enemies.js
  "range_band": "lane",                   // melee | lane | ranged | aoe
  "shape": { "type": "line", "width_u": 1.2, "length_u": 8 },  // or cone{angle_deg,radius_u} / circle{radius_u}
  "timing": {
    "windup_s": 1.0,          // LAW floor: >=0.8 (>=0.9 boss/mini-boss)
    "release_s": 0.7,         // active window (hound charge run = 0.7s)
    "recovery_s": 1.2,        // MUST be a usable punish window (~>=1s for this audience)
    "tracking_windup": 0.3,   // 0-1 aim correction allowed during windup
    "tracking_release": 0.0   // aim correction once committed (should be 0)
  },
  "telegraph": {
    "type": "body",           // body | boss_lane (only exception to no-decals)
    "color_grammar": "red",   // red=danger, gold=act-here, never both
    "shared_constant": "CHOP_ARC",  // the one constant/getter both the visual and hit test read (LAW 7); name it
    "readable_at_gentle_speed": true // still readable at 0.8 timescale
  },
  "damage": { "amount": 1.5, "element": "steel", "kind": "melee" },
  // element ∈ steel|spark|moon|fire|earth|verdant|frost|storm|tide (§1.3) ; kind ∈ melee|bolt|aoe
  "counterplay": ["dodge_roll", "jump"],  // >=1 taught answer, required
  "cooldown_s": 3.5,
  "priority_weight": 5,           // attack-token claim priority (CONFIG.ENGAGE)
  "engage_token_required": true,  // false only for passive contact damage
  "post_attack_state": "recover"  // collapsed_vulnerable | recover | resume_patrol
}
```

Validation rules (mechanical, run in Pass 1):
- `windup_s < 0.8` (or `< 0.9` for boss/mini-boss) → LAW-violation.
- `counterplay` empty → LAW-violation.
- `telegraph.shared_constant` missing on any attack with a drawn arc/ring → bug risk (pose/hitbox drift).
- Ground decal under a non-boss enemy → LAW-violation.
- `engage_token_required: false` with nonzero windup → red flag.
- `damage.element` must exist in §1.3's vocabulary AND the intended counterelement must be obtainable by the player at that progression point.
- `recovery_s < 1.0` on a melee attack → balance-risk flag for this audience (post-attack window literature: 0.25-1s general, this game runs the generous end deliberately).

---

## 4. Difficulty-scaling normalization template

Fill BOTH axes for any difficulty-facing change. An Axis-B-empty change (numbers only) is the exact failure the 2026-07-31 "too easy" verdict produced and the sponge literature warns against.

**Axis A — numeric (existing):**
```jsonc
{
  "axis": "numeric",
  "formula": "min(2.2, 1 + (player_level - 1) * 0.08)",
  "applies_to": ["hp"],            // NOT damage in current code
  "cap": 2.2,
  "flat_bonus": "CONFIG.DIFFICULTY.ENEMY_HP_BONUS = 1 (skipped in Gentle)",
  "mode_softening": { "cozy": 0.6, "gentle": 0.4, "gentle_timescale": 0.8 }
}
```

**Axis B — behavioral (the sanctioned difficulty carrier):**
```jsonc
{
  "axis": "behavioral",
  "levers": [
    "role_composition",           // mix roster roles (see role map below), not 3x same grunt
    "engage_token_pressure",      // 2/3/4 pressers by mode — the sanctioned crowd lever
    "concurrent_telegraph_cap",   // keep low even late-game (DOOM/GoW token rationale)
    "encounter_room_budget",      // total threat per room, not per-enemy inflation
    "conditional_unlocks",        // e.g. shieldling guard logic — skill floor, not sponge
    "elemental_counterplay",      // new region = new weakness lesson (fire→earth pivot at Stormreach is the model)
    "positioning_pressure"        // flankers/ranged staggering, respecting token caps
  ],
  "anti_pattern_flags": [
    "windup_s shrinking as difficulty lever (LAW 2)",
    "hp-only gating of late rooms (sponge)",
    "damage-only scaling with no behavior change (burst-death vs Cozy's half-heart floor)",
    "a new region reusing the same weakness element a 4th time (see the deliberate earth pivot)"
  ]
}
```

Roster role map for `role_composition` (using the Grunt/Squad/Leader/Tank/Swarm/Sniper taxonomy of [The Level Design Book](https://book.leveldesignbook.com/process/combat/enemy) and Rogers' *Level Up!* classes ([O'Reilly listing](https://www.oreilly.com/library/view/level-up-the/9780470688670/))): Shade/SkeletonMinion = Grunt; Moth/Bat = Swarm (aerial); Hound family = Chaser/elite; SkeletonRogue = Flanker (with anti-mash scripted dodge); SkeletonShield/BoneWarden = Tank (positional lesson); SkeletonMage/spitters = Sniper (interruptible windup). Gap worth knowing: the roster has no Leader/buffer role — if one is ever added it must obey token caps and die to a taught answer.

---

## 5. Pre-seeded findings from the final verification pass (2026-08-19)

Carry these into your first audit; they are confirmed against live source, not hypotheses.

1. **LAW-violation (confirmed): ranged spitter windup 0.6s.** `enemies.js` spit attack: `this._windup = 0.6` with the tell scaling over `/ 0.6`. Below the 0.8s floor. Note the design intent comment ("interrupt it with anything, or step off the line") — the fix should extend the tell to ≥0.8s, not remove interruptibility. Gentle timescale makes it 0.75s — still under.
2. **LAW-violation (confirmed): SkeletonRogue crouch-telegraph ~0.7s.** The class's own header comment admits "crouch-telegraphs (~0.7s), then dashes." Below the 0.8s floor; the dash is also its highest-commitment attack. Verify the actual `stateT` transition, then extend to ≥0.8s.
3. **Verify: BoneWarden vs the 0.9s boss floor.** It is a mini-boss; its chop/sweep windup timings need explicit measurement against the ≥0.9s boss floor (the 130° `CHOP_ARC` sharing is exemplary; the timing needs confirming).
4. **Doc drift (confirmed): element enum.** `takeDamage` comment lists 5 elements; the game now emits 9 (§1.3). Update the comment/enum and check every `weakness`/`resist` against player-obtainable counterelements at that progression point.
5. **Doc drift (confirmed): attack-token counts.** GAME-CONTRACT.md still states 1 Gentle / 2 Cozy / 3 Brave attack tokens, but `config.js` ENGAGE now reads `MAX: 3, MAX_GENTLE: 2, MAX_BRAVE: 4` with a "raised one across the board" comment. Code is presumed current (dated tuning comment); update GAME-CONTRACT to match, or flag if the raise was unintended.
6. **Scope drift since v1 of this file:** ghost_wolf/tide_wolf/storm_wolf/frost_wolf forms, the stealth/awareness system, Stormreach + Shadow Court enemy families, and Boreal all shipped after the earlier design review. Any older audit conclusions predating these are stale — re-verify before citing them.
7. **Positive patterns to preserve (call out if a change would break them):** single-constant telegraph/hitbox sharing (`CHOP_ARC`, `shieldUp`); lunge i-frames = lunge duration (one visible number); rogue's PREDICTABLE first-swing dodge (anti-button-mash teaching, bolts/AoE always land); frozen-shatter as setup-not-kill; RESIST as the counterpart lesson to SUPER!.

---

## 6. TDD audit plan — single agent, four passes

### 6.1 Why one agent (the evidence)
Anthropic's own analysis: multi-agent systems cost ~15× the tokens of a chat interaction (vs ~4× for a single agent), are justified only for breadth-first parallelizable work, and "most coding tasks involve fewer truly parallelizable tasks than research"; heavy inter-dependence and shared context favor a single agent ([Anthropic: How we built our multi-agent research system](https://www.anthropic.com/engineering/multi-agent-research-system)). Combat auditing is exactly that: every check reads the same law table and the same few files. Token usage explains ~80% of agent performance variance — so spend tokens on one agent's depth, not eight agents' redundancy. The swarm's real value (breadth of dissimilar checks) is preserved as sequential passes.

### 6.2 The four passes (sequential, one agent, one report)
**Pass 1 — Static/structural (gate).** Scope: only the files under change. Validate every attack against §3's rules; every enemy has TRAITS; no code-built creatures; explicit `element`/`kind` at every takeDamage call site; no non-boss floor decals; no timing under the floor; §5 findings re-checked if touching those files. Output: pass/fail with file:line. **Fail → stop.**

**Pass 2 — Difficulty/balance.** Scope: progress.js, config DIFFICULTY/ENGAGE, touched stat tables. Fill §4 Axis A + B; flag Axis-B-empty changes; confirm cap 2.2 and Gentle exemptions; confirm token caps aren't bypassed by new spawn logic.

**Pass 3 — Encounter/room composition.** Scope: touched rooms.js sections. Reachability sealed-before/reachable-after (mirrors `verify-reach.mjs` flood-fill law); ≤3 simultaneous aggro; no spawn inside colliders ("nothing lives inside a boulder"); decals offset from `world.deckY`, never hardcoded; blind-strip: no interactive within ~2.5u of the south shell, measured from the southernmost box collider, NOT the ground plane; weakness element obtainable at that progression point; role composition sanity vs §4's role map.

**Pass 4 — Holistic readability (once, last).** Scope: the changed room/encounter only. Would a first-time child get ≥0.8s to read every active telegraph with 2-3 pressers engaged? Color grammar unambiguous? Holds at Gentle 0.8 timescale? Use the `?dev=1` harness + `window.__wk` for runtime state instead of inferring it. One bounded fix per issue — no open-ended redesigns.

### 6.3 Token discipline
- This file + targeted reads (path + line range, grep) of the touched file = the whole context budget. Never paste whole files.
- Do not re-fetch GAME-CONTRACT/COMBAT-SPEC — §2 is the combat-scoped extraction. If a check isn't covered here, that's a §8 update trigger.
- Context engineering goal: "the smallest possible set of high-signal tokens" ([Anthropic: Effective context engineering](https://www.anthropic.com/engineering/effective-context-engineering-for-ai-agents)). Accumulate findings silently; emit one report.

### 6.4 CLAUDE.md handoff (repo-side, one-time)
Keep the repo's CLAUDE.md short and high-signal per Anthropic guidance — commands, style, test instructions, with critical rules bolded/IMPORTANT-tagged — and reference this file by path for combat work instead of inlining it ([Anthropic: Scaling agentic coding](https://resources.anthropic.com/hubfs/Scaling%20agentic%20coding%20across%20your%20organization.pdf?hsLang=en)). Suggested line: "For any combat/enemy work, load `docs/wolf-knight-combat-context.md` and follow its §6 pass structure."

### 6.5 TDD loop (for fixes, not just audits)
Per Anthropic's documented workflow — explore → plan → code → commit, and for TDD: write the failing test first, **confirm it fails**, then implement until green ([Claude Code best-practices summary](https://rits.shanghai.nyu.edu/ai/unlocking-efficiency-best-practices-for-agentic-coding-with-claude-code/)). Concretely for this project:
1. Encode the law as a check first (e.g., a scratchpad script that parses attack timings and asserts ≥0.8s), run it, confirm it FAILS on the known-bad cases in §5 — this validates the ruler (LAW 10).
2. Fix the code until the check passes; re-run the full Pass 1 checklist on the touched file.
3. Self-verification is mandatory before declaring done — "marks features done prematurely" is a documented agent failure mode ([Anthropic: Effective harnesses for long-running agents](https://www.anthropic.com/engineering/effective-harnesses-for-long-running-agents)). Where feasible, have a fresh session/second opinion try to refute the fix rather than the same session grading itself.
4. Add durable checks to the repo's scratchpad tool family (`verify-reach.mjs`, `check-duplicates.mjs` are the precedents) so the law outlives the session.

Telemetry worth exposing for Pass 4 (extends the dev harness): per-enemy role/state/cooldown/telegraph timers, per-room token usage, and per-run player hit rate, damage taken, deaths, clear time, death cause.

---

## 7. Literature quick-reference (for justifying findings)

- Telegraphing fundamentals and windup framing: [Game Developer: Enemy Attacks and Telegraphing](https://www.gamedeveloper.com/design/enemy-attacks-and-telegraphing) · [note.com 3D-action telegraphing](https://note.com/darkangels_417/n/nb520b22d60f7?hl=en-US) · practitioner windup bands ~0.25-0.75s for adult-audience games ([r/gamedesign thread](https://www.reddit.com/r/gamedesign/comments/p5v52c/how_much_should_enemies_telegraph_their_attacks/)) — Wolf Knight deliberately exceeds these for its audience.
- Readability / Window of Opportunity: [Designing for Difficulty: Readability in ARPGs](https://www.gamedeveloper.com/game-platforms/designing-for-difficulty-readability-in-arpgs) · post-attack windows [Chaotic Stupid](http://www.chaoticstupid.com/telegraphs-2-post-attack-vulnerability/).
- Attack tokens: [DOOM GDC 2018](https://www.gdcvault.com/play/1024940/Embracing-Push-Forward-Combat-in) · [AI of DOOM](https://www.aiandgames.com/p/the-ai-of-doom-2016) · [God of War GDC 2019](https://www.youtube.com/watch?v=hE5tWF-Ou2k) · [Arkham ticket system](https://discussions.unity.com/t/how-does-the-batman-arkham-games-combat-system-work/509429).
- Boss layering (bosses remix minion grammar — dad's law has direct precedent in God of War): [The Gamer on GoW enemy design](https://www.thegamer.com/respawn-design-director-god-of-war-enemies-combat-mechanics/).
- Sponge criticism / behavioral scaling: [Den of Geek](https://www.denofgeek.com/games/bullet-sponges-v/) · [boss sponge experiments](https://ljeasson.wordpress.com/2023/05/31/boss-design-damage-sponges-experiments-1-3/) · [DDA systematic review, Wiley 2018](https://onlinelibrary.wiley.com/doi/10.1155/2018/5681652) · subtle beats mechanical adaptation, [CHI 2020](https://doi.org/10.1145/3313831.3376423).
- Kids' reaction/cognition: ages 4-6 whole-body RT 975→777ms ([Kanazawa](https://kanazawa-u.repo.nii.ac.jp/record/791/files/ED-PR-MIYAGUCHI-DEMURA-2791.pdf)) · ages 10-15 choice RT ~790→~610ms, R²=0.982 ([Trends in Sport Sciences 2013](https://www.wbc.poznan.pl/Content/299310/PDF/6_Trends_2013_3_147.pdf)) · simple RT near-adult by 6-12 ([PubMed ruler-drop norms](https://pubmed.ncbi.nlm.nih.gov/28011080/)) · cognitive-load onboarding rules ([CLT thesis](https://www.diva-portal.org/smash/get/diva2:1977636/FULLTEXT01.pdf)) · adaptive difficulty helps youngest players most ([ERIC study](https://files.eric.ed.gov/fulltext/ED599091.pdf)).
- Assist-mode precedent: [Celeste Assist Mode](https://www.vice.com/en/article/celeste-difficulty-assist-mode/) · [its framing change](https://www.vice.com/en/article/celeste-assist-mode-change-and-accessibility/) · [Nintendo wide-entrance philosophy](https://www.nintendolife.com/news/2013/11/super_mario_3d_worlds_team_highlights_the_values_of_accessibility_and_empathy).
- Enemy taxonomies: [The Level Design Book: enemy design](https://book.leveldesignbook.com/process/combat/enemy) · [Level Up! (Rogers)](https://www.oreilly.com/library/view/level-up-the/9780470688670/) · data-driven combat at scale, [AC Valhalla GDC](https://www.gdcvault.com/play/1026999/Fighting-with-Data-Learnings-from).
- Agent engineering: [prompt caching](https://docs.claude.com/en/docs/build-with-claude/prompt-caching) · [multi-agent tradeoffs](https://www.anthropic.com/engineering/multi-agent-research-system) · [building effective agents](https://www.anthropic.com/engineering/building-effective-agents) · [context engineering](https://www.anthropic.com/engineering/effective-context-engineering-for-ai-agents) · [long-running harnesses](https://www.anthropic.com/engineering/effective-harnesses-for-long-running-agents) · [Claude Code in practice](https://www.anthropic.com/research/claude-code-expertise).

---

## 8. Update discipline

Re-cache this file when: a new family/variant/boss/form ships (§1) · a GAME-CONTRACT number changes (§2 — drift here is a bug in THIS file, not the doc) · the schema changes shape (§3/§4) · a §5 finding is fixed (move it to §5's "preserved patterns" or delete) · a new defect class recurs more than twice (append to §6.2). Keep it lean: cut unused sections rather than accumulate — cache reads are cheap but attention is not.
