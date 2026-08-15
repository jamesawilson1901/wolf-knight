#!/bin/sh
# THE WHOLE SUITE. All of it, by default.
#
# There are dozens of verifiers in this directory and this script used to run
# three. That is not a detail — it is the reason four separate things rotted
# without anyone noticing:
#
#   * the rebuilt Stoneroot and Wild Woods played Ember Hollow's music for
#     weeks, and three boss arenas fought to region music;
#   * guideTarget() named only RETIRED rooms, so the one system meant to help a
#     lost child had nothing to say in five of seven regions;
#   * settings.easy was never in the defaults, so that system never ran at all;
#   * Ember Hollow's boss sat sealed behind the Kiln's forge, and the game could
#     not be finished.
#
# A suite you do not run is a suite you do not have. So: everything, in the
# order that fails fastest, and `--quick` when you genuinely only want a smoke
# test. Naming suites explicitly still runs just those, after boot.
#
#   sh tools/verify-all.sh                    everything, serial (~2h40m measured)
#   sh tools/verify-all.sh --par              everything, 3 suites at a time
#   sh tools/verify-all.sh --quick            boot, density, music
#   sh tools/verify-all.sh verify-level3.mjs  boot + that one
#
# --par exists because the serial sweep measured 2h39m (run-2 report) on a
# 4-core box where each suite is its own browser. Three at once contend for
# CPU, so a suite CAN flake under load that would pass alone: any --par FAIL
# must be re-run serially before it is believed (gate-triage rule). The three
# frame-timing-sensitive suites always run serial, after the parallel batch.
#
# The static server must be up: (nohup node tools/serve.mjs &)
cd "$(dirname "$0")/.."
PASS=0; FAIL=0; FAILED=""
run() {
  [ -f "tools/$1" ] || { printf '%-26s SKIP (no such file)\n' "$1"; return; }
  printf '%-26s ' "$1"
  START=$(date +%s)
  if node "tools/$1" > "/tmp/vall-$1.log" 2>&1; then
    printf 'PASS  %ss\n' "$(( $(date +%s) - START ))"; PASS=$((PASS+1))
  else
    if grep -q "ALL CLEAN" "/tmp/vall-$1.log" 2>/dev/null; then
      printf 'PASS  %ss\n' "$(( $(date +%s) - START ))"; PASS=$((PASS+1))
    else
      printf 'FAIL  (/tmp/vall-%s.log)\n' "$1"; FAIL=$((FAIL+1)); FAILED="$FAILED $1"
    fi
  fi
}

# --one is --par's worker: same pass rule as run(), verdict to a result file.
if [ "$1" = "--one" ]; then
  t="$2"; RDIR="$3"
  START=$(date +%s)
  if node "tools/$t" > "/tmp/vall-$t.log" 2>&1 || grep -q "ALL CLEAN" "/tmp/vall-$t.log" 2>/dev/null; then
    echo "PASS $(( $(date +%s) - START ))" > "$RDIR/$t"
  else
    echo "FAIL $(( $(date +%s) - START ))" > "$RDIR/$t"
  fi
  exit 0
fi

# Boot first, always: twenty seconds, and it catches the errors that make every
# other result meaningless.
run verify-boot.mjs

case "$1" in
  --quick)
    run verify-density.mjs
    run verify-music.mjs
    ;;
  --par)
    # The suite list is PARSED FROM THE SERIAL BLOCK BELOW — one list, no rot.
    ALL=$(grep -oE '^ *run verify-[a-z0-9-]+\.mjs' "$0" | awk '{print $2}' | awk '!s[$0]++' | grep -v '^verify-boot')
    # Longest suites first so a 17-minute giant never starts last and runs alone.
    HEAVY="verify-playthrough.mjs verify-gauntlet.mjs verify-reachable.mjs verify-level2-hub.mjs verify-level2.mjs verify-level3.mjs verify-l1-doors.mjs"
    # Frame-timing measurements flake under CPU contention — these run serial, last.
    TAIL="verify-timing.mjs verify-telegraphs.mjs verify-touch.mjs"
    PARLIST=""
    for t in $HEAVY; do echo "$ALL" | grep -qx "$t" && PARLIST="$PARLIST $t"; done
    for t in $ALL; do
      case " $HEAVY $TAIL " in *" $t "*) ;; *) PARLIST="$PARLIST $t" ;; esac
    done
    RDIR="/tmp/vall-par.$$"; mkdir -p "$RDIR"
    printf '%s\n' $PARLIST | xargs -P 3 -n 1 -I{} sh "$0" --one {} "$RDIR"
    for t in $PARLIST; do
      if [ -f "$RDIR/$t" ]; then read -r V S < "$RDIR/$t"; else V=FAIL; S='?'; fi
      printf '%-26s %s  %ss\n' "$t" "$V" "$S"
      if [ "$V" = "PASS" ]; then PASS=$((PASS+1)); else FAIL=$((FAIL+1)); FAILED="$FAILED $t"; fi
    done
    for t in $TAIL; do
      echo "$ALL" | grep -qx "$t" && run "$t"
    done
    rm -rf "$RDIR"
    ;;
  '')
    # THE ONES THAT ANSWER "IS IT A GAME" come first, because a failure here
    # makes the detail suites beside the point: can you walk it, can you reach
    # every door, is anything in the rooms, does it sound right, and does a lost
    # child get told where to go.
    run verify-reachable.mjs
    run verify-playthrough.mjs
    run verify-density.mjs
    run verify-music.mjs
    run verify-guide.mjs
    run verify-awareness.mjs
    run verify-story-beats.mjs
    run verify-grounded.mjs
    run verify-loot.mjs
    run verify-gear.mjs
    run verify-level2-progress.mjs
    # then everything else, per region and per system
    run verify-level1.mjs
    run verify-level2.mjs
    run verify-level2-hub.mjs
    run verify-level3.mjs
    run verify-level5.mjs
    run verify-level6.mjs
    run verify-level7.mjs
    run verify-route.mjs
    run verify-roomid.mjs
    run verify-progression.mjs
    run verify-sequence.mjs
    run verify-completion.mjs
    run verify-promises.mjs
    run verify-spawn-clear.mjs
    # WHERE A DOOR PUTS YOU DOWN HAS TO BE A PLACE IN THE ROOM. verify-reachable
    # cannot see this one: it asks whether anything solid is at the landing, and
    # a point two metres outside a wall has nothing solid at it either.
    run verify-landings.mjs
    # A METHOD THAT DOES NOT EXIST IS A ROOM THAT CANNOT BE FINISHED. One second,
    # no browser, and it is the only thing in the suite that would have caught
    # juice.shake() — the typo that made Stoneroot's dam unreachable.
    run verify-callable.mjs
    # ...and the two regions whose end state nothing had ever PLAYED: the Court's
    # relics (the last boss was unreachable) and the vault's hub milestones.
    run verify-court.mjs
    run verify-vault.mjs
    # NO DOOR EVER LOCKS, AND NO FIGHT IS FREE TO SPRINT THROUGH. The seal is
    # gone by dad's order; the gauntlet holds both halves of what replaced it.
    run verify-gauntlet.mjs
    run verify-den.mjs
    run verify-minigame.mjs
    run verify-shop.mjs
    run verify-pose.mjs
    run verify-telegraphs.mjs
    run verify-timing.mjs
    run verify-touch.mjs
    run verify-storm.mjs
    # EMBER HOLLOW, EVERY DOOR, WALKED. Dad could not get through a door in a
    # Level 1 room; the lava channel ran under one of them.
    run verify-l1-doors.mjs
    run verify-l2-warden.mjs
    run verify-l3-lash.mjs
    run verify-l3-knot.mjs
    run verify-l3-chords.mjs
    ;;
  *)
    for t in "$@"; do run "$t"; done
    ;;
esac

# AND A GUARD AGAINST THIS FILE ROTTING THE SAME WAY. A verifier that exists
# but is not listed here is a verifier nobody runs, which is where this started.
# --par parses its list from the serial block, so guarding the serial block
# guards both modes.
if [ -z "$1" ] || [ "$1" = "--par" ]; then
  MISSING=""
  for f in tools/verify-*.mjs; do
    b=$(basename "$f")
    grep -q "run $b" "$0" || MISSING="$MISSING $b"
  done
  if [ -n "$MISSING" ]; then
    echo
    echo "NOT RUN BY THIS SCRIPT — add them:$MISSING"
    FAIL=$((FAIL+1)); FAILED="$FAILED unlisted-suites"
  fi
fi

echo
echo "passed $PASS, failed $FAIL"
[ -n "$FAILED" ] && echo "failed:$FAILED"
exit $FAIL
