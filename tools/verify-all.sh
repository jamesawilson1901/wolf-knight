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
#   sh tools/verify-all.sh --shard 2/8        1/8th of the suites, serial, deterministic
#   sh tools/verify-all.sh verify-level3.mjs  boot + that one
#
# EVERY FAILURE GETS ONE AUTOMATIC SERIAL RE-RUN (test-infra job 3): only the
# LAST attempt's verdict counts toward PASS/FAIL/exit code, and every attempt
# is logged. This absorbs environmental flake (OOM, a slow first asset fetch)
# without hiding a real failure — a suite that is actually broken fails the
# re-run too. Exception: a suite already listed in tools/known-fail.txt is
# never retried (retrying a documented, expected failure just burns CI
# minutes every single night).
#
# --par exists because the serial sweep measured 2h39m (run-2 report) on a
# 4-core box where each suite is its own browser. Three at once contend for
# CPU, so a suite CAN flake under load that would pass alone — its serial
# re-run runs alone, contention gone, and per the rule above only THAT
# verdict counts.
#
# --shard exists for CI (docs/TESTING.md §8): each of N shards is its own
# machine running serially, so the --par false-failure class cannot occur
# there by construction — parallelism between machines, serial within each.
# The suite list is sorted and assigned round-robin, so the same K/N always
# gets the same suites regardless of when or where it runs.
#
# The static server must be up: (nohup node tools/serve.mjs &)
cd "$(dirname "$0")/.."
PASS=0; FAIL=0; FAILED=""
TIMES="/tmp/vall-times.$$"; : > "$TIMES"
KNOWN_FAIL="tools/known-fail.txt"
STALE_KNOWN_FAIL=""

# Is this suite's failure already proven pre-existing (job 4)? Format per
# line: "suite.mjs | reason | YYYY-MM-DD". Comments (#) and blanks skipped.
is_known_fail() {
  [ -f "$KNOWN_FAIL" ] || return 1
  awk -F'|' -v t="$1" '!/^#/ && NF>=1 { gsub(/^[ \t]+|[ \t]+$/, "", $1); if ($1 == t) found=1 } END { exit !found }' "$KNOWN_FAIL"
}

record() { # record NAME VERDICT SECONDS ATTEMPT-TAG
  printf '%s %s %s %s\n' "$1" "$2" "$3" "$4" >> "$TIMES"
}

# ONE attempt at a suite. Sets ATT_V (PASS/FAIL) and ATT_S (seconds). Never
# touches PASS/FAIL/TIMES itself — every caller decides what an attempt means.
attempt() {
  START=$(date +%s)
  if node "tools/$1" > "/tmp/vall-$1.log" 2>&1 || grep -q "ALL CLEAN" "/tmp/vall-$1.log" 2>/dev/null; then
    ATT_V=PASS
  else
    ATT_V=FAIL
  fi
  ATT_S=$(( $(date +%s) - START ))
}

# Turns a FINAL verdict (already decided — retries, if any, are done) into
# the printed line + PASS/FAIL tally + timing-table record. Shared by every
# code path so known-fail/stale-known-fail handling can't drift between them.
report_verdict() {
  t="$1"; v="$2"; s="$3"
  if [ "$v" = FAIL ] && is_known_fail "$t"; then
    printf 'KNOWN-FAIL  %ss  (%s)\n' "$s" "$KNOWN_FAIL"; PASS=$((PASS+1)); record "$t" KNOWN-FAIL "$s" final
  elif [ "$v" = PASS ] && is_known_fail "$t"; then
    printf 'PASS  %ss  (STALE known-fail entry — remove it from %s)\n' "$s" "$KNOWN_FAIL"
    PASS=$((PASS+1)); STALE_KNOWN_FAIL="$STALE_KNOWN_FAIL $t"; record "$t" PASS "$s" final
  elif [ "$v" = PASS ]; then
    printf 'PASS  %ss\n' "$s"; PASS=$((PASS+1)); record "$t" PASS "$s" final
  else
    printf 'FAIL  (/tmp/vall-%s.log)\n' "$t"; FAIL=$((FAIL+1)); FAILED="$FAILED $t"; record "$t" FAIL "$s" final
  fi
}

# The ordinary way to run one suite: one attempt, and — unless it is already a
# documented known-fail — one automatic serial re-run if that attempt failed.
run() {
  [ -f "tools/$1" ] || { printf '%-26s SKIP (no such file)\n' "$1"; return; }
  t="$1"
  printf '%-26s ' "$t"
  attempt "$t"
  if [ "$ATT_V" = FAIL ] && ! is_known_fail "$t"; then
    record "$t" FAIL "$ATT_S" attempt1
    printf 'FAIL (%ss) — retrying serially...  ' "$ATT_S"
    attempt "$t"
  fi
  report_verdict "$t" "$ATT_V" "$ATT_S"
}

# --one is --par's worker: one bare attempt, verdict to a result file. No
# retry here — the retry is the whole point of the serial re-run back in the
# parent, which is the ONLY other attempt --par ever makes (job 3: parallel +
# one serial re-run, exactly two attempts total, never three).
if [ "$1" = "--one" ]; then
  attempt "$2"
  echo "$ATT_V $ATT_S" > "$3/$2"
  exit 0
fi

# Every suite file that exists, sorted — the one deterministic source both
# --shard and the "unlisted suites" guard read from.
sorted_suite_files() {
  for f in tools/verify-*.mjs; do basename "$f"; done | grep -v '^verify-boot\.mjs$' | sort
}

# Boot first, always: twenty seconds, and it catches the errors that make every
# other result meaningless.
run verify-boot.mjs

case "$1" in
  --quick)
    run verify-density.mjs
    run verify-music.mjs
    ;;
  --shard)
    KN="$2"
    K=$(echo "$KN" | cut -d/ -f1); N=$(echo "$KN" | cut -d/ -f2)
    case "$K$N" in *[!0-9]*|'') echo "usage: --shard K/N (e.g. --shard 2/8)"; exit 2 ;; esac
    if [ "$K" -lt 1 ] || [ "$K" -gt "$N" ]; then echo "K must be between 1 and N ($KN)"; exit 2; fi
    i=0
    for t in $(sorted_suite_files); do
      i=$((i + 1))
      shard=$(( (i - 1) % N + 1 ))
      [ "$shard" = "$K" ] && run "$t"
    done
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
    printf '%s\n' $PARLIST | xargs -P 3 -I{} sh "$0" --one {} "$RDIR"
    FIRST_FAILED=""
    for t in $PARLIST; do
      if [ -f "$RDIR/$t" ]; then read -r V S < "$RDIR/$t"; else V=FAIL; S='?'; fi
      printf '%-26s %s  %ss  (parallel attempt)\n' "$t" "$V" "$S"
      record "$t" "$V" "$S" parallel
      [ "$V" = "FAIL" ] && FIRST_FAILED="$FIRST_FAILED $t"
    done
    rm -rf "$RDIR"
    for t in $TAIL; do
      echo "$ALL" | grep -qx "$t" && run "$t"
    done
    # THE RE-RUN. Any suite that failed in the parallel batch gets EXACTLY ONE
    # serial re-run — CPU contention is gone, it's alone now — and per job 3
    # only this verdict feeds PASS/FAIL/exit code. A known-fail doesn't need
    # re-proving; it goes straight to report_verdict.
    if [ -n "$FIRST_FAILED" ]; then
      echo
      echo "re-running serially, failed under --par:$FIRST_FAILED"
      for t in $FIRST_FAILED; do
        printf '%-26s ' "$t"
        if is_known_fail "$t"; then
          report_verdict "$t" FAIL 0
        else
          attempt "$t"
          report_verdict "$t" "$ATT_V" "$ATT_S"
        fi
      done
    fi
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
    run verify-level-village.mjs
    run verify-route.mjs
    run verify-roomid.mjs
    run verify-progression.mjs
    run verify-sequence.mjs
    run verify-completion.mjs
    run verify-promises.mjs
    run verify-spawn-clear.mjs
    # Pass 2 audit: applyVariant() fails silent on an unknown variant name —
    # the whole Sunken Vale roster shipped unmodified for however long this
    # went unaudited. One bad name should never ship quietly again.
    run verify-variant-names.mjs
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
    run verify-combat-laws.mjs
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
# guards both modes. --shard reads the sorted file list directly, so it is
# never short a suite even if this guard is what catches the gap.
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

# THE TIMING TABLE (job 3). Slowest FINAL-verdict attempt first — that is the
# order clock-conversion work (TESTINGADDENDUM.md §10) should happen in.
if [ -s "$TIMES" ]; then
  echo
  echo "timing (slowest first):"
  awk '$4 == "final" || $4 == "parallel" { printf "%-26s %-10s %6ss  %s\n", $1, $2, $3, $4 }' "$TIMES" | sort -t' ' -k3 -rn
fi
rm -f "$TIMES"

if [ -n "$STALE_KNOWN_FAIL" ]; then
  echo
  echo "STALE KNOWN-FAIL (now passing — remove from $KNOWN_FAIL):$STALE_KNOWN_FAIL"
fi

echo
echo "passed $PASS, failed $FAIL"
[ -n "$FAILED" ] && echo "failed:$FAILED"
exit $FAIL
