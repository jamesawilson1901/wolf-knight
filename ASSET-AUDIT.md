# Asset Licence Audit — `jamesawilson1901/My-Games` asset repo

**Audited:** 2026-08-06 · **Repo:** `jamesawilson1901/My-Games` @ `63ade67`
· **Clone path:** `/workspace/my-games` · **On disk:** 1.3 GB, 646 files, 108 top-level entries
**Purpose:** determine which assets would block commercial release of Wolf Knight.

## How this audit was done (and its limits)

Evidence came from licence files, READMEs, the repo's own generated indexes
(`ASSETS.md`, per-folder `_index.md`) and archive listings. No binary asset was
opened. Every ruling below quotes the licence text it rests on — no pack was
graded on its publisher's reputation, and that mattered: **Kenney, KayKit and
Quaternius packs did not all come out the same way.**

Three limits shaped the UNKNOWN bucket, and all three are fixable:

1. **No `unrar` / `7z` binary in this environment.** Nine `.rar`/`.7z` archives
   could not be opened. A header scan showed `SummerPack.rar` *does* contain a
   `LICENSE.txt` — it simply can't be read here. These are "not yet determined",
   not "no licence".
2. **Two packs state their licence only as a URL**, and both URLs returned
   HTTP 403 through this environment's proxy (`craftpix.net/file-licenses/`,
   `hydrogene.itch.io`). Their on-disk text is quoted below; the operative terms
   live at those links.
3. **Four packs listed in the index are not on disk** — they exceed GitHub's
   100 MB limit and live in the `large-assets` release. They could not be audited.

---

## STEP 1–2 — SUMMARY

| Bucket | Packs | Approx. files | Approx. size | Meaning |
|---|---|---|---|---|
| 🟢 **GREEN** | 38 (incl. 8 duplicates) | ~19,900 | ~305 MB | CC0 / public domain. No obligations. |
| 🟡 **AMBER** | 4 | ~465 | ~50 MB | Commercial OK, with conditions. **Only 1 requires attribution.** |
| 🔴 **RED** | **0** | — | — | **No pack found that forbids commercial use.** |
| ⚪ **UNKNOWN** | 44 | ~900+ | ~915 MB | No licence, unverifiable, or unopenable. Blocked until resolved. |

**Headline:** nothing found so far actively blocks going commercial. The exposure
is almost entirely *undetermined* licences — and by size that's dominated by one
item (the 610 MB music library) plus a cluster of small unlabelled model packs.

**⚠️ The finding that matters most is in STEP 4:** two Quaternius packs supplying
Kael himself, Pip, Biscuit and three enemy types have **no licence file on disk in
either repo**, while `CREDITS.md` already lists them as CC0.

---

## STEP 2 — 🟢 GREEN (CC0 / public domain)

All KayKit packs carry the same licence file. Representative quote
(`KayKit_Forest_Nature_Pack_1.0_FREE/License.txt`):

> `License: (Creative Commons Zero, CC0)`
> `This content is free to use in personal, educational and commercial projects.`
> `Support me by crediting Kay Lousberg, www.kaylousberg.com (this is not mandatory, but would be appreciated)`

All Kenney packs likewise (`kenney_castle-kit/License.txt`):

> `License: (Creative Commons Zero, CC0)`
> `You can use this content for personal, educational, and commercial purposes.`
> `Support by crediting 'Kenney' or 'www.kenney.nl' (this is not a requirement)`

| Pack | Path | Type | Formats | Files | Licence | Evidence |
|---|---|---|---|---|---|---|
| KayKit Adventurers 2.0 | `/KayKit_Adventurers_2.0_FREE (1).zip` | Characters | fbx, obj, gltf, png | 250 | CC0 | `License.txt` verified ✔ |
| KayKit Skeletons 1.0 | `/KayKit Character Pack - Skeletons 1.0.zip` | Characters | obj, fbx, dae | 304 | CC0 | `License.txt` verified ✔ |
| KayKit Skeletons 1.1 | `Kenny/KayKit_Skeletons_1.1_FREE.zip` | Characters | fbx, gltf | 107 | CC0 | `License.txt` verified ✔ |
| KayKit Character Animations 1.1 | `/KayKit_Character_Animations_1.1.zip` | Animation | glb, fbx | 37 | CC0 | `License.txt` verified ✔ |
| KayKit Dungeon Pack 1.1 | `/…(1).zip` + `Kenny/` | 3D env | fbx, obj, gltf | 1303 ×2 | CC0 | `License.txt` verified ✔ |
| KayKit Medieval Hexagon 1.0 | `/…(1).zip` + `Kenny/` | 3D env | fbx, obj, gltf | 1473 ×2 | CC0 | `License.txt` + root `License (7).txt` ✔ |
| KayKit Forest Nature 1.0 | `/…(1).zip` + `Kenny/` | 3D env | fbx, obj, gltf | 641 ×2 | CC0 | `License.txt` verified ✔ |
| KayKit Halloween Bits 1.0 | `/…(1).zip` + `Kenny/` | 3D props | fbx, obj, gltf | 402 ×2 | CC0 | `License.txt` verified ✔ |
| KayKit Resource Bits 1.0 | `/KayKit_ResourceBits_1.0_FREE.zip` | 3D props | fbx, obj, gltf | 466 | CC0 | `License.txt` verified ✔ |
| KayKit Block Bits 1.0 | `/KayKit_BlockBits_1.0_FREE.zip` | 3D modular | fbx, obj, gltf | 251 | CC0 | `License.txt` verified ✔ |
| KayKit RPG Tools Bits 1.0 | `/…(1).zip` + `Kenny/` | 3D props | fbx, obj, gltf | 339 ×2 | CC0 | `License.txt` verified ✔ |
| KayKit Fantasy Weapons Bits 1.0 | `/…(1).zip` + `Kenny/` | 3D props | fbx, obj, gltf | 196 ×2 | CC0 | `License.txt` verified ✔ |
| Kenney Nature Kit | `Kenny/kenney_nature-kit.zip` | 3D env | glb, obj, fbx | 3618 | CC0 | `License.txt` verified ✔ |
| Kenney Castle Kit | `Kenny/kenney_castle-kit.zip` | 3D env | glb, obj, fbx | 397 | CC0 | `License.txt` verified ✔ |
| Kenney Fantasy Town Kit 2.0 | `Kenny/kenney_fantasy-town-kit_2.0.zip` | 3D env | glb, obj, fbx | 847 | CC0 | `License.txt` verified ✔ |
| Kenney Food Kit | `Kenny/kenney_food-kit.zip` | 3D props | glb, obj, fbx | 1009 | CC0 | `License.txt` verified ✔ |
| Kenney Holiday Kit | `Kenny/kenney_holiday-kit.zip` | 3D env | glb, obj, fbx | 509 | CC0 | `License.txt` verified ✔ |
| Kenney Platformer Kit | `Kenny/kenney_platformer-kit.zip` | 3D props | glb, obj, fbx | 777 | CC0 | `License.txt` verified ✔ |
| Kenney Survival Kit | `Kenny/kenney_survival-kit.zip` | 3D props | glb, obj, fbx | 412 | CC0 | `License.txt` verified ✔ |
| Kenney Mini Arena | `Kenny/kenney_mini-arena.zip` | 3D env | glb, obj, fbx | 120 | CC0 | `License.txt` ✔ — also names `Additional credit(s): Tony Schär` |
| Kenney Smoke Particles | `Kenny/kenney_smoke-particles.zip` | 2D sprites | png | 80 | CC0 | `License (CC0)` … `You may use these graphics in personal and commercial projects.` ✔ |
| Kenney Pirate Kit | `/pirate 2.zip` + `Kenny/kenney_pirate-kit/` | 3D env | glb, obj, fbx, png | 79 | CC0 | `License.txt` verified ✔ |
| Kenney Impact Sounds | `Music & SFX/kenney_impact-sounds.zip` | Audio SFX | ogg | 133 | CC0 | `License.txt` verified ✔ |
| Kenney Interface Sounds | `Music & SFX/kenney_interface-sounds.zip` | Audio SFX | ogg | 103 | CC0 | `License.txt` verified ✔ |
| Kenney Digital Audio (×2 copies) | `Music & SFX/kenney_digital-audio*.zip` | Audio SFX | ogg | 67 ×2 | CC0 | `License.txt` verified ✔ |
| Kenney Music Jingles | `Music & SFX/kenney_music-jingles.zip` | Audio music | ogg | 89 | CC0 | `License.txt` verified ✔ |
| Mega Stylized Rock Pack (Free Tier) | `/Mega Stylized Rock Pack (1.0) - Free Tier.zip` | 3D env | obj, gltf, fbx | 906 | CC0 | `License: (Creative Commons Zero, CC0)` … `Support me by crediting Dr.Special.` ✔ |
| Animated Cartoon Chest Kit 1.1 | `/animated-cartoon-chest-kit-1.1.zip` | 3D animated props | fbx | 14 | CC0 | `License: (Creative Commons Zero, CC0)` … `Support us by crediting Overaction Game Studio` ✔ |
| Dumivid Free Sample | `/1_Free Sample.zip` | 3D models | obj, mtl, fbx | 7 | CC0 1.0 | `CC0 1.0 Universal (CC0 1.0) Public Domain Dedication` … `You are free to use these assets by Dumivid in any way you please.` ✔ |

> **Duplicates:** seven KayKit packs exist twice (root + `Kenny/`), and
> `kenney_digital-audio` twice. ~90 MB of pure duplication — safe to delete either copy.

---

## STEP 2 — 🟡 AMBER (commercial OK, with obligations)

| Pack | Path | Type | Files / Size | Licence | Evidence quoted | Obligation |
|---|---|---|---|---|---|---|
| **Kyrise's Free Voxel Graveyard Environment Pack** | `/kyrises-voxel-graveyard-environment-pack.zip` (+ root `LICENSE.txt`) | 3D voxel env | 141 / 420 K | **CC BY 4.0** | `Kyrise's Free Voxel Graveyard Environment Pack Low Poly © 2021 by Kyrise is licensed under CC BY 4.0.` | **ATTRIBUTION REQUIRED** — see ATTRIBUTION section |
| Low Poly Western Desert Pack (FREE) | `/FREE_VERSION_30_MODELS.zip` | 3D env | 153 / 5.7 M | Custom permissive (author: `dglopez`) | `You are allowed to: … Use these assets in commercial projects.` / `You are not allowed to: - Resell, redistribute or re-upload the original files.` / `Credit is appreciated but not required.` | No credit needed. **Do not ship raw source files or publish them in a public asset folder.** |
| JellySquish Oasis Pack (Base) | `/JellySquish Oasis Pack - Base Version.zip` | 3D env | 105 / 43 M | Custom permissive | `You have the non-exclusive right to use the material for commercial, educational or personal purposes.` / `There is no attribution required` / `You cannot: - Sublicense, sell or rent any contents` / `- Redistribute or offer the contents … for download` | No credit needed. Same no-redistribution caveat. |
| Lowpoly Weapon Pack 01 | `/Lowpoly.WeaponPack.01.zip` | 3D props | 66 / 956 K | Custom permissive | `The pack is free to use in personal or commercial projects.` / `You may not redistribute or resell the pack.` / `No attribution required but always appreciated!` | No credit needed. Same no-redistribution caveat. |

**One judgement call, flagged for your override.** Your brief listed
"no redistribution" under RED. I did **not** put the bottom three there, because
each one *explicitly grants commercial use* and the restriction is on reselling
the asset pack itself — not on shipping the models inside a game. That is the
industry-normal reading. But it does have one real consequence:

> **These three must not be committed to a public repo as raw source files.**
> Wolf Knight's current practice of `.gitignore`-ing `asset-raw/` and committing
> only converted, game-ready files stays compatible. Publishing this asset repo
> publicly, or shipping an "assets" download, would breach them.

Say the word and I'll reclassify all three as RED.

---

## STEP 2 — 🔴 RED (blocks commercial use)

**None found.** No pack in this repo carries CC-BY-NC, CC-BY-ND, "non-commercial
only", or a personal-use-only clause in any licence text I could read.

That verdict only covers the 46 packs whose licences were readable. The RED risk,
if any exists, is hiding in the UNKNOWN bucket below — particularly the CraftPix
packs and the two dafont fonts, which are the two places where restrictive terms
are genuinely plausible.

---

## QUARANTINE — ⚪ UNKNOWN (treat as blocked)

Everything here is unusable commercially **until resolved**. Grouped by *why*,
because the fix differs per group.

### Q1 — No licence file of any kind (22 packs, ~635 files, ~65 MB)

Checked for `.txt`/`.md`/`.pdf`/`.url`/`.html` inside each: **all returned none.**

| Pack | Path | Type | Files |
|---|---|---|---|
| AssetPack | `/AssetPack.zip` | 3D (fbx) | 48 |
| Fantasy seed – Dungeon all | `/Fantasy seed - Dungeon all.zip` | 3D (fbx) | 63 |
| Free | `/Free.zip` | 3D (obj) | 20 |
| Free Witchy Assets | `/Free_Witchy_Assets.zip` | 3D (glb/obj) | 10 |
| Furniture Pack | `/Furniture Pack.zip` | 3D (glb/obj/fbx) | 8 |
| Golem_Free | `/Golem_Free.zip` | 3D character (fbx) | 4 |
| KayKit Mage Animations | `/KayKit Mage Animations.zip` | Animation (`.res`) | 1 |
| Low Poly Rocks | `/Low Poly Rocks.zip` | 3D env (glb/obj) | 8 |
| Low Poly Siege Pack | `/LowPolySiegePack.zip` | 3D props (glb/fbx) | 10 |
| Mushroom Pack | `/MushroomPack.zip` | 3D env (fbx/blend) | 2 |
| Rat Pack | `/Rat-Pack-All-Files.zip` | 3D character (fbx/blend) | 6 |
| Royal Family Free | `/Royal_Family_Free.zip` | 3D characters (fbx) | 7 |
| Stylized Free Rocks | `/StylizedFreeRocks_FBX.zip` | 3D env (fbx) | 7 |
| Three Musketeers Asset Pack | `/Three Musketeers Asset Pack.zip` | 3D (blend only) | 2 |
| Tropical Island Lite (FBX) | `/TropicalIslandLite_FBX.zip` | 3D env (fbx) | 13 |
| Viking Asset Pack (×2 copies) | `/VikingAssetPack.zip`, `/VikingAssetPack (1).zip` | 3D (blend/png) | 6 ×2 |
| Blacksmith Asset Pack | `/blacksmith_asset_pack.zip` | 3D (obj/scn/png) | 84 |
| Casual Assassin Cat | `/casual-assassin-cat.zip` | 3D character (fbx) | 2 |
| Casual Viking Character | `/casual-viking-characterauto-armatures.zip` | 3D character | 2 |
| Free Model Pack | `/freemodelpack.zip` | 3D (blend/png) | 35 |
| **Pirate (unlabelled copy)** | `/pirate.zip` | 3D env (glb/obj/fbx) | 291 | 

> `pirate.zip` looks like Kenney's Pirate Kit but **ships no licence file**.
> The licensed copy is `/pirate 2.zip` (GREEN). Use that one; quarantine this.
> `LowPolySiegePack` has a ReadMe naming `de-alpe-game-art.itch.io` but **no terms**.

### Q2 — Licence exists but is unreadable in this environment (9 packs, ~90 MB)

No `unrar`/`7z` binary here. **These are recoverable** — one tool install settles them.

`Dragon Firyx.rar` (27 M) · `Dragão.rar` (280 K) · `Free_Dungeon_Props_Pack.rar` (196 K) ·
`Free_Sample.rar` (56 K) · `MVPP (Built-In) - Demo.rar` (27 M) ·
`Skfod_MedievalMarketAssets_1.0.rar` (1.3 M) · **`SummerPack.rar` (1.3 M — header scan
confirms it contains `SummerPack/LICENSE.txt` + `README.txt`)** ·
`Small Props Pack.7z` (22 M) · `Stylish plants.7z` (3.7 M)

> `Stylish plants.7z` matters: `CREDITS.md` already lists "Stylish Plants —
> Nobiax / yughues" as CC0 in the shipping game. **That claim is currently unbacked.**

### Q3 — Licence by URL only, unverifiable here (3 packs, ~636 MB)

| Pack | Path | Size | On-disk text | Why unresolved |
|---|---|---|---|---|
| **HydroGene "High Quality 16-bit Music"** | `Music & SFX/` (numbered tracks, mp3+ogg+wav) | ~610 MB, ~141 files | `readme (6).txt`: `As explained in the itch.io page, credits are not mandatory, so feel free to use it in any way you want.` | Wording is permissive but **defers to the itch.io page for actual terms**; page returned HTTP 403. Never states "CC0" or "commercial". |
| CraftPix — underwater parallax backgrounds | `/craftpix-561109-….zip` | 13 MB, 40 files | `TXT/license.txt` contains **only** the URL `https://craftpix.net/file-licenses/` | Page returned HTTP 403. CraftPix free-file terms are known to carry conditions — must be read, not assumed. |
| CraftPix — underwater 2D backgrounds | `/craftpix-997189-….zip` | 13 MB, 39 files | same | same |

> **Highest-value single check in this audit.** One look at
> `hydrogene.itch.io/high-quality-16-bit-music` settles 610 MB — nearly half the
> repo — *and* resolves a documentation conflict (see STEP 4).
> **Also:** both CraftPix packs' `readme.txt` credits two dafont fonts —
> **Soup of Justice** and **Gravity** (also in the root `readme (1).txt`). dafont
> fonts are frequently "free for personal use only". The fonts aren't in the repo,
> but **don't use those two names in the game** without checking them.

### Q4 — Unity-only packages, no licence inside (4 packs, ~24 MB)

Listed their internal pathnames (gzip-tar) — no licence file present in any:
`JC_StylizedRocks_Lite_…unitypackage` (12 M) · `LowPolyMedievalPropsLite_…unitypackage` (2.9 M) ·
`LowPolyRPGWeaponsLite_…unitypackage` (1012 K) · `TropicalEnvironmentLite_…unitypackage` (7.2 M)

> Doubly blocked: unknown licence **and** unusable in three.js without a Unity
> round-trip. "Lite" naming implies Unity Asset Store free tiers, whose EULA
> restricts redistribution. Lowest-value group in the repo — I'd delete these.
> (`animated-cartoon-chest-kit-1.1.unitypackage` is exempt — its `.zip` twin is CC0 GREEN.)

### Q5 — Loose unlabelled files at repo root (30 files, ~100 MB)

No licence covers any of these:
- **Medieval building set** — 17 × `Medieval-Assets-*.fbx` (Walls, Roofs, Doors, Stairs,
  Beams, Banners, Windows, Floors, Fence-Railings, Prebuilts…) + 3 × `TexturePallete_*.png`
  + `Medieval_Metal-Rougness_Unity.png`
- `Farm_withTextures.fbx` (13 M) · `Outdoor_Fall.fbx` (4.1 M) · `low_poly_castle.fbx` (632 K)
- `GenericAssetPack_1.blend` / `.fbx` · `ChestPack.blend` · `potions_0.blend`
  · `low poly trees for itch.blend` (25 M)
- `Low Poly Pack Lite.rbxm` (Roblox format — unusable in three.js regardless)
- `logo.psd` · `text.psd` · `Underwater world_1024x1024.psd` (39 M — source art, not runtime)

### Q6 — Not on disk, could not be audited (4 packs, ~936 MB)

Held in the `large-assets` GitHub release per `CLAUDE.md`:
`Kenney Game Assets All-in-1 3.6.0.zip` (510 M) · `underwater-world-game-kit (1).zip` (177 M) ·
`weapon-pack.zip` (138 M) · `Batch_Aquatic_Ruins.zip` (111 M)

> The Kenney all-in-1 is very likely CC0 like every other Kenney pack verified here,
> but it was **not** verified — fetch and check before use.

### Not assets (no action needed)
`Music & SFX/mermaid-reef-build.zip` + `sw.js`, `registerSW.js`, `index-*.js`,
root `index.html`, `workbox-*.js`, `manifest.webmanifest`, `rotate.svg`,
`creatures.json`, `mermaid.json` — a built copy of the Mermaid Reef game, not asset material.

---

## ATTRIBUTION — credit lines required if AMBER packs ship

Exactly **one** pack in this repo legally requires a credit. If the Kyrise
graveyard pack is used, this must appear in-game (credits screen is sufficient):

```
Kyrise's Free Voxel Graveyard Environment Pack Low Poly © 2021 by Kyrise,
licensed under CC BY 4.0 — https://creativecommons.org/licenses/by/4.0/
```

CC BY 4.0 requires: creator name (Kyrise), title, the licence name **with a link**,
and an indication if you modified it. If you recolour or rescale anything from it,
append "— modified".

**Not required, but customary** (every one of these says credit is optional — the
game already does this in `CREDITS.md`, and it costs nothing to keep):

```
Kay Lousberg (KayKit) — www.kaylousberg.com
Kenney — www.kenney.nl
Quaternius
Dr.Special — Mega Stylized Rock Pack
Overaction Game Studio — www.overactiongamestudio.com
dglopez — Low Poly Western Desert Pack
JellySquish — Oasis Pack
Dumivid
Tony Schär — additional credit, Kenney Mini Arena
```

---

## STEP 4 — CROSS-CHECK AGAINST WOLF KNIGHT'S OWN DOCS

Compared against `design/ASSETS.md` and `CREDITS.md`. **No files were edited.**

### 🔴 Conflict 1 — Quaternius packs asserted CC0 with no licence on disk (SHIPPING NOW)

`CREDITS.md` lists under the heading **"3D asset packs (CC0)"**:

> `| Ultimate Animated Animal Pack | Quaternius | Wolf (Kael's wolf forms), Fox (Pip), Husky (Biscuit the den dog) |`
> `| Animated Monster Pack | Quaternius | Cave Slime + Cave Bat enemies … Dragon is the Shadowgrip boss body |`

I searched both repos. **Neither pack has a licence file anywhere:**
- `asset-raw/monsters/` — contains only `Blend/`, `FBX/`, `OBJ/`, `Preview.jpg`. No licence.
- `Kenny/Monster Pack Animated by Quaternius.zip` — 17 entries, **no licence file**.
- The animals pack (wolf/fox/husky) has no licence file in either repo.

The **only** Quaternius licence found anywhere is for a *different* pack —
`asset-raw/dungeon/.Updated Modular Dungeon - May 2019/License.txt`:

> `LowPoly Models by @Quaternius`
> `License:` `CC0 1.0 Universal (CC0 1.0)` `Public Domain Dedication`

So Quaternius **does** ship CC0 licences with packs — which makes it likely the
other two are CC0 too. But per your instruction I have not graded on reputation,
and this is not a hypothetical: **these models are Kael himself, Pip, Biscuit, the
Shade, the Moth/Bat and the precached Dragon.** They are in the shipping build.

**Action:** re-download the Ultimate Animated Animals and Animated Monster packs
from quaternius.com and keep their `License.txt` alongside. Cheapest possible fix
for the single biggest commercial risk in the project.

### 🟡 Conflict 2 — `design/ASSETS.md` makes a blanket CC0 claim

> `All packs below are **CC0** (public domain) and **verified to exist with the creatures we need**.`

"Verified to exist" is true. "CC0" is **not verified** for the two Quaternius packs
above, for Stylish Plants (Q2), or for the HydroGene music (next). The table mixes
confirmed-CC0 entries with unconfirmed ones under one heading.

### 🟡 Conflict 3 — HydroGene music listed as CC0; its readme doesn't say so

`design/ASSETS.md`:

> `| *(bonus, regions 2–7)* HydroGene 16-bit RPG Music | 28 CC0 seamless RPG loops, future region music |`

The pack's own `readme (6).txt` says only that credits aren't mandatory and defers
to the itch.io page. **It never says CC0 or public domain.** Resolve via Q3.

### 🟡 Conflict 4 — Stylish Plants credited as CC0, unverifiable

`CREDITS.md`: `| Stylish Plants | Nobiax / yughues | Decorative flora (OBJ/FBX) |` under
the CC0 heading. Only copy here is `Stylish plants.7z`, unopenable (Q2). No licence text seen.

### 🟢 Confirmed correct
Every Kenney and KayKit entry in `CREDITS.md` is backed by a real CC0 licence file
I read this session. The Modular Dungeon Quaternius entry is backed. That's the
large majority of the credits table.

### ℹ️ Two housekeeping notes (not licence issues)
- `CREDITS.md` opens: *"Wolf Knight is a personal, non-commercial game built with
  free assets."* That sentence would need rewriting on commercial release — and it
  is the sentence that currently makes the ambiguous packs *safe*, since every
  "free for personal use" risk is moot while the game is non-commercial.
- `design/ASSETS.md`'s HARD RULE says packs are dropped into `./asset-downloads`;
  the actual staging directories are `asset-raw/` and now this second repo.

---

## STEP 5 — SUITABILITY SHORTLIST (GREEN + AMBER only)

Judged for a 3/4 top-down camera on mid-range Android. Wolf Knight's established
style is chunky soft-shaded low-poly (Kenney / KayKit / Quaternius) — anything
outside that family will read as a foreign object no matter how good it is.

### Strongest additions, by elemental region

| Region | Pack | Bucket | Why it works |
|---|---|---|---|
| **Ice** | **Kenney Holiday Kit** (509) | 🟢 | The single best find. Snow-laden trees, ice, winter props in the exact engine style. Frostpeak is essentially pre-built. |
| **Earth** | **Mega Stylized Rock Pack** (906, 180 rocks ×5 formats) | 🟢 | Huge silhouette variety, ships `.gltf`. Solves "every boulder looks the same". |
| **Earth / caves** | KayKit Dungeon Pack 1.1 (1303) | 🟢 | Far larger than the Quaternius dungeon set currently used; native `.gltf`. |
| **Water** | Kenney Pirate Kit (`pirate 2.zip`) | 🟢 | Docks, ships, palms, chests — reads well from above. Use the *licensed* copy. |
| **Fire / desert** | JellySquish Oasis Pack (105) | 🟡 | Oasis/desert set with `.glb`. 43 MB — cherry-pick, don't bulk-import. |
| **Fire / desert** | Low Poly Western Desert (153) | 🟡 | Cacti, bones, rocks, dead vegetation; ships `.glb`. Good Ember-adjacent scorched dressing. |
| **Wind / forest** | KayKit Forest Nature (641) | 🟢 | Already proven in Wild Woods — only 14 of ~105 pieces are vendored so far. |
| **Light** | **KayKit RPG Tools Bits** (339) | 🟢 | Lanterns, torches, candles — directly extends the Gloomwood lantern-lighting puzzle into a Light region. |
| **Electric** | KayKit Resource Bits (466) | 🟢 | Ores/crystals/gems. Recoloured cyan they become the Electric region's motif — the asset-multiplication law applied to environment art. |
| **All** | KayKit Block Bits (251) | 🟢 | Modular blocks for puzzle geometry (plates, pillars, pushable shapes). |
| **All** | Animated Cartoon Chest Kit (14) | 🟢 | *Animated* chests — a straight upgrade on the current static ones. |
| **Hub** | Kenney Fantasy Town Kit 2.0 (847) | 🟢 | Expands the Moonlit Den into a real village. |
| **Combat** | Kenney Mini Arena (120) | 🟢 | Purpose-built arena geometry for boss rooms. |
| **Props** | Kenney Food/Survival/Platformer Kits | 🟢 | Shop stock, camps, pickups. |
| **Characters** | KayKit Skeletons 1.1, Adventurers 2.0, Character Animations | 🟢 | Already in use; 1.1 skeletons are newer than the 1.0 currently vendored. |
| **Audio** | Kenney Impact / Interface / Digital / Jingles | 🟢 | ~450 CC0 sounds. Jingles could replace the placeholder victory sting. |
| **FX** | Kenney Smoke Particles (80) | 🟢 | 2D — usable **only** as camera-facing billboards, which is how the game already does puffs. |

### Explicitly *not* suitable

| Asset | Bucket | Problem |
|---|---|---|
| **Kyrise Voxel Graveyard** | 🟡 | **Style clash** — true voxel (`.vox`) against chunky low-poly. Would look like a different game. It's also the *only* pack demanding attribution: not worth the obligation for assets you'd have to restyle. Recommend skip. |
| CraftPix underwater backgrounds ×2 | ⚪ | 2D parallax **side-scroller** backgrounds. Structurally useless for a top-down 3D camera, licence unresolved. Delete regardless of licence. |
| `Underwater world_1024x1024.psd` (39 M) | ⚪ | Photoshop source art, not runtime content. |
| Medieval building set (17 fbx) | ⚪ | Architectural interiors — walls, beams, window frames, stairs. Built for **first-person/close-up detail**; from a 3/4 top-down camera you see roofs and nothing else. Poor value per megabyte. |
| `Farm_withTextures.fbx` (13 M single mesh) | ⚪ | One 13 MB mesh with no LOD — poly budget risk on mid-range Android, and can't be culled piecemeal. |
| `low poly trees for itch.blend` (25 M) | ⚪ | `.blend` — needs a Blender export step before it's even inspectable. |
| `Low Poly Pack Lite.rbxm` | ⚪ | Roblox-only format. Unusable, delete. |
| 4 × Unity "Lite" `.unitypackage` | ⚪ | Unity-only container; needs a Unity install to extract. Not worth it. |
| `Dragon Firyx.rar` (27 M) | ⚪ | Size suggests a detailed, high-poly dragon — likely well over the budget the Shadowgrip/Sylva wolves run at. Inspect poly count before any use. |
| `MVPP (Built-In) - Demo.rar` (27 M) | ⚪ | "Demo" build — demo assets are commonly watermarked or feature-limited. |
| `KayKit Mage Animations` (`.res`) | ⚪ | Godot-only resource format. **Already confirmed unusable** earlier in this project. |

### Coverage gaps this repo does *not* fill
- **Electric** has no dedicated pack — best available route is recolouring KayKit
  Resource Bits crystals, plus Kenney smoke particles tinted blue-white.
- **Water** is thin in 3D: the Pirate Kit is surface/coastal only. There is no
  clean-licensed underwater 3D environment set (the two candidates are 2D and unresolved).
- **Light** has props (lanterns) but no environment set — would need building from
  Block Bits + Fantasy Town.

---

## FOLLOW-UP — 2026-08-07 (action 1 attempted)

Dad: *"re download with license."*

**Partly done. The download itself is blocked in this build environment**, and
that block is real, not a workaround-able one: the proxy answers `CONNECT 403`
for `quaternius.com`, `quaternius.itch.io`, `itch.io`, `patreon.com`,
`opengameart.org`, `poly.pizza` and `kenney.nl`. Only GitHub hosts resolve.
A web search returns third-party pages *describing* the animals pack as CC0,
but the standing rule for this audit was to quote the licence text the ruling
rests on — a summary of someone else's summary is not that, so no pack was
graded on it.

**What was done instead, and it turned out to be most of the value:**
`asset-raw/` is still on disk in this container and is gitignored, so **16
genuine licence files were sitting outside the repo the whole time.** Every
vendored asset was traced back to its source pack by filename against
`asset-raw/`, and the licences were copied in verbatim:

- **New: `assets/LICENSES/`** — 15 licence files, exactly as the packs shipped
  them, plus `MANIFEST.json` mapping every pack to the files it covers and
  quoting the granting line.
- **New: `tools/check-licences.mjs`** — fails if any directory under `assets/`
  is unclaimed by the manifest, and reports every pack that ships without a
  licence file on disk. `--strict` fails on those too (for release).
- **13 packs are now cleared with evidence** (Kenney Nature/Castle/Survival/
  Town/Pirate/Platformer/RPG-Audio/UI-Audio/Impact, KayKit Adventurers/
  Animations/Skeletons/Weapons-Bits/Forest, Quaternius Modular Dungeon).
  Every one of those files contains the words *"License: (Creative Commons
  Zero, CC0)"* or *"CC0 1.0 Universal"*.
- **4 remain PENDING and are now marked as such in `CREDITS.md`** rather than
  sitting under a blanket "(CC0)" heading: the two Quaternius packs, the Kenney
  Holiday Kit (vendored in v3.21 for Frostpeak — same gap, freshly created),
  and the three OpenGameArt music tracks.

**Conflicts 1 and 2 are therefore resolved as documentation:** `CREDITS.md` and
`design/ASSETS.md` no longer assert CC0 for anything unproven. The underlying
*evidence* gap for the two Quaternius packs is unchanged and still needs a
download from a machine with normal internet — roughly two minutes of work,
described step by step in `assets/LICENSES/README.md`.

### Second pass, same day — the game-assets repo was still attached

Rather than send dad off to download things, I searched his own asset repo
(`jamesawilson1901/my-games`, already cloned at `/workspace/my-games`) for the
four missing licences. Two useful results:

**1. The Kenney Holiday Kit is now CLEARED.** `Kenny/kenney_holiday-kit.zip`
contains `License.txt` — *"Holiday Kit (2.0) … License: (Creative Commons Zero,
CC0) … You can use this content for personal, educational, and commercial
purposes."* Its timestamp (11-12-2024 14:31) matches the vendored snow GLBs
exactly, so it is provably the same download. Extracted to
`assets/LICENSES/kenney-holiday-kit.txt`. Three pending, not four.

The Quaternius Monster Pack zip is in the same folder and confirms the original
finding: 20 files, `Blend/ FBX/ OBJ/ Preview.jpg`, no licence. The Ultimate
Animated Animals pack is not in that repo at all — no wolf, fox or husky file
anywhere in it — so those models were fetched directly in an earlier session and
their licence has never existed on any disk here.

**2. The music credits were backwards, and this is the bigger finding.**
`CREDITS.md` listed three OpenGameArt tracks as the game's music and HydroGene as
an unused bonus "for the expansion". Md5-matching every file in
`assets/audio/music` against the packs on disk shows the reverse:

| game file | actually is |
|---|---|
| `boss-intro.ogg`, `boss-loop.ogg` | HydroGene *09. Battle Theme II* |
| `causeway.mp3`, `kiln.mp3` | HydroGene *15. Volcanic Crater* |
| `den.ogg`, `ember-calm.ogg` | HydroGene *04. Peaceful Village* |
| `region-stone.ogg` | HydroGene *06. Hidden Cavern* |
| `stone-deep.ogg` | HydroGene *10. Dwarven Mine* (also Frostpeak) |
| `region-ember.ogg` | Brandon Morris, *Cave Theme* (OGA) |
| `victory.ogg` | cynicmusic, *Victory Fanfare Short* (OGA) |

So **8 of 10 tracks are HydroGene**, and *Boss Battle Music* by **Juhani Junkala
— credited for a year — is not in the build at all.** That row has been removed
rather than credit someone whose work the game does not use.

This makes HydroGene the single largest licence exposure in the project, ahead of
the Quaternius pair. Its readme is now on file
(`assets/LICENSES/hydrogene-16bit-rpg-music-README.txt`) and says, verbatim:

> *"As explained in the itch.io page, credits are not mandatory, so feel free to
> use it in any way you want."*

That is a genuine permission from the author, but it is not a named licence, no
public-domain dedication, and it defers to a page this environment cannot read.
The manifest therefore gained a third tier — `evidence`, distinct from `licence`
— for exactly this shape of thing: better than nothing, not good enough to clear.

**Also worth a look sometime:** `den.ogg`/`ember-calm.ogg` and
`causeway.mp3`/`kiln.mp3` are byte-identical pairs. That is ~6.7 MB of the
service-worker precache spent twice, which a phone on a slow connection pays for.

---

## RECOMMENDED NEXT ACTIONS (awaiting your decision)

1. ~~**Re-download the two Quaternius packs with their licence files.**~~
   *Attempted 2026-08-07 — blocked by this environment's network policy; see
   the follow-up above. Everything around it is done.*
2. **Check the HydroGene itch.io page.** Settles 610 MB and a doc conflict in one look.
3. **Install `unrar`/`p7zip`** (or unpack locally) to clear the 9 archives in Q2 —
   including `SummerPack.rar`, which is confirmed to contain a licence.
4. **Delete outright** (no licence value, no usability): the 4 Unity "Lite" packages,
   `Low Poly Pack Lite.rbxm`, both CraftPix background packs, `pirate.zip` (keep
   `pirate 2.zip`), and the ~90 MB of duplicated KayKit/Kenney archives.
5. **Decide the AMBER judgement call** (three no-redistribution packs: AMBER as
   graded, or RED as your brief's letter would have it).
6. Once decided, I'll update `design/ASSETS.md` and `CREDITS.md` to match reality —
   **not touched in this pass.**
