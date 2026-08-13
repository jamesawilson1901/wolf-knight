#!/bin/sh
# THE WHOLE SUITE. All of it, by default.
#
# There are thirty-two verifiers in this directory and this script used to run
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
#   sh tools/verify-all.sh                    everything (slow: hours)
#   sh tools/verify-all.sh --quick            boot, density, music
#   sh tools/verify-all.sh verify-level3.mjs  boot + that one
#
# The static server must be up: (nohup python3 -m http.server 8901 &)
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

# Boot first, always: twenty seconds, and it catches the errors that make every
# other result meaningless.
run verify-boot.mjs

case "$1" in
  --quick)
    run verify-density.mjs
    run verify-music.mjs
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
    # A LOCKED ROOM HAS TO BE MADE OF SOMETHING. Cheap (under a minute) and it
    # guards the shape of bug that let dad walk out of a sealed room and into
    # the void — a doorway whose trigger declines to fire while the opening
    # stays passable.
    run verify-seal.mjs
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
if [ -z "$1" ]; then
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
