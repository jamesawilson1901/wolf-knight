# Credits & Licences — Wolf Knight

Wolf Knight is a personal, non-commercial game built with free assets.

**Licence evidence lives in [`assets/LICENSES/`](assets/LICENSES/)** — each pack's
own licence file, verbatim as it shipped, plus `MANIFEST.json` mapping packs to
the files they cover. `node tools/check-licences.mjs` enforces that every asset
directory is accounted for.

Most of what follows is CC0 with the licence file to prove it. **Four packs are
not yet proven** and are marked ⚠ below: they ship in the build, but no licence
file for them has ever been on disk, so their status rests on the creator's
website alone. See `assets/LICENSES/README.md` for how to clear each one.

## Engine

| What | Version | Licence | Source |
|---|---|---|---|
| three.js (`three.module.min.js`, `three.core.min.js`, GLTFLoader + utils addons, vendored in `./vendor`) | 0.185.1 | MIT (see `vendor/LICENSE-three.txt`) | https://threejs.org |

## 3D asset packs

*(✓ = licence file in `assets/LICENSES/`. ⚠ = shipping, licence not yet proven.)*

| Pack | Author | Used for | Source |
|---|---|---|---|
| ✓ Nature Kit | Kenney | Floor tiles, rocks, cliff wall blocks (`assets/env/floor-tile.glb`, `rock-*.glb`, `cliff-block.glb`) | https://kenney.nl/assets/nature-kit |
| ✓ Castle Kit | Kenney | Pillars (`assets/env/pillar.glb` + `Textures/colormap.png`) | https://kenney.nl/assets/castle-kit |
| ⚠ Ultimate Animated Animal Pack | Quaternius | Wolf (Kael's wolf forms), Fox (Pip), Husky (Biscuit the den dog) | https://quaternius.com/packs/ultimateanimatedanimals.html |
| ✓ Character Pack: Adventurers | KayKit (Kay Lousberg) | Knight (Kael), Mage (shopkeeper), Ranger/Barbarian/Rogue_Hooded (den villagers) | https://kaylousberg.itch.io/kaykit-adventurers |
| ✓ Character Animations | KayKit (Kay Lousberg) | Humanoid animation library — from Phase 1+ | https://kaylousberg.itch.io/kaykit-character-animations |
| Mini Arena | Kenney | Arena props — later regions | https://kenney.nl/assets/mini-arena |
| ✓ Survival Kit | Kenney | Crates, chest, camp props | https://kenney.nl/assets/survival-kit |
| Food Kit | Kenney | Food props (quests, shop) | https://kenney.nl/assets/food-kit |
| ✓ Holiday Kit | Kenney | Ice/snow region pieces | https://kenney.nl/assets/holiday-kit |
| ✓ Pirate Kit | Kenney | Water region, chests, docks | https://kenney.nl/assets/pirate-kit |
| ✓ Fantasy Town Kit 2.0 | Kenney | The Moonlit Den hub + shop | https://kenney.nl/assets/fantasy-town-kit |
| ✓ Platformer Kit | Kenney | Chests, coins, hearts, hazards | https://kenney.nl/assets/platformer-kit |
| Smoke Particles | Kenney | Smoke/puff sprites | https://kenney.nl/assets/smoke-particles |
| ✓ Fantasy Weapons Bits | KayKit (Kay Lousberg) | Shop weapon variety (swords, hammers, spears, shields…) | https://kaylousberg.itch.io/ |
| RPG Tools Bits | KayKit (Kay Lousberg) | Lanterns, torches, maps, tools (props/quests) | https://kaylousberg.itch.io/ |
| ✓ Forest Nature Pack | KayKit (Kay Lousberg) | Forest region flora | https://kaylousberg.itch.io/ |
| Halloween Bits | KayKit (Kay Lousberg) | Spooky props: graves, crypts, lanterns, dead trees | https://kaylousberg.itch.io/ |
| ✓ Skeletons 1.1 | KayKit (Kay Lousberg) | Skeleton enemy family (Warrior/Mage/Rogue/Minion) | https://kaylousberg.itch.io/kaykit-skeletons |
| Medieval Hexagon Pack | KayKit (Kay Lousberg) | World-map hex tiles, towns, castles (FBX/OBJ + atlas) | https://kaylousberg.itch.io/ |
| ⚠ Animated Monster Pack | Quaternius | Cave Slime + Cave Bat enemies (FBX converted to GLB offline; Dragon is the Shadowgrip boss body) | https://quaternius.com |
| Stylish Plants | Nobiax / yughues | Decorative flora (OBJ/FBX) | https://opengameart.org/users/yughues |
| ✓ Modular Dungeon Pack | Quaternius | Stoneroot Caverns interiors — walls, floors, torches, traps, statues (converted OBJ→GLB) | https://quaternius.itch.io/lowpoly-modular-dungeon-pack |
| Particle Pack | Kenney | FX sprites — later phases | https://kenney.nl/assets/particle-pack |
| UI Pack | Kenney | HUD graphics — later phases | https://kenney.nl/assets/ui-pack |

## Audio

*(✓ = licence file in `assets/LICENSES/`. ⚠ = shipping, licence not yet proven.)*

> **Corrected 2026-08-07.** This table used to list three OpenGameArt tracks as the
> game's music and HydroGene as an unused bonus "for the expansion". That was
> backwards. Every file in `assets/audio/music` was md5-matched against the packs
> on disk: **8 of the 10 tracks are HydroGene**, and *Boss Battle Music* by Juhani
> Junkala — credited here for a year — **is not in the build at all** (the boss
> music is HydroGene's Battle Theme II). The row has been removed rather than
> credit someone whose work the game does not use.

| Track / pack | Author | Used for | Source |
|---|---|---|---|
| ⚠ **HydroGene — High Quality 16-bit RPG Music** | HydroGene | **Eight of the game's ten tracks**: `boss-intro`+`boss-loop` (Battle Theme II), `causeway`+`kiln` (Volcanic Crater), `den`+`ember-calm` (Peaceful Village), `region-stone` (Hidden Cavern), `stone-deep` (Dwarven Mine — also Frostpeak) | https://hydrogene.itch.io/high-quality-16-bit-music |
| ⚠ Cave Theme (`region-ember`) | Brandon Morris | Ember Hollow region music | https://opengameart.org/content/cave-theme |
| ⚠ Victory Fanfare Short (`victory`) | cynicmusic | Victory sting | https://opengameart.org/content/victory-fanfare-short |
| ✓ RPG Audio | Kenney | Sword swings (`knifeSlice*`), hits + growls (`chop`), dust puffs and air-whooshes (`cloth3`/`cloth1`) | https://kenney.nl/assets/rpg-audio |
| ✓ UI Audio | Kenney | UI clicks, checkpoint tick (`click*`) | https://kenney.nl/assets/ui-audio |
| ✓ Impact Sounds | Kenney | Hurt, Blood Moon / ground-slam / tendril thumps (`impact*`), and the wolf's bite (`impactSoft_medium`) | https://kenney.nl/assets/impact-sounds |

## Other

- PWA icons (`assets/icons/icon-*.png`): original art generated for this project (ember
  crescent moon over a volcanic ridge).
