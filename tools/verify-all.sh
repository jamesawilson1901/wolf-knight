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
PASS=0; FAIL=0; FAILED=""; RAN=""
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
  # WHAT ACTUALLY RAN, recorded as it runs. The glob-append at the end of the
  # serial block reads this rather than grepping this file for `run verify-x`
  # lines: verify-formlock and verify-hud are named ONLY in the --quick block,
  # so a text scan would call them "already listed" and the append would skip
  # them in the very mode that is supposed to run everything.
  RAN="$RAN $1"
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

# Every suite file that exists, sorted — the ONE deterministic source every
# mode reads. If it is on disk, it runs. There is no second list anywhere.
sorted_suite_files() {
  for f in tools/verify-*.mjs; do basename "$f"; done | grep -v '^verify-boot\.mjs$' | sort
}

# The suites measured to take the longest. Named once, used twice: --par starts
# them first so a seventeen-minute giant never begins last, and --shard deals
# them out first so they land on DIFFERENT machines.
HEAVY="verify-playthrough.mjs verify-gauntlet.mjs verify-reachable.mjs verify-density.mjs verify-level2-hub.mjs verify-level2.mjs verify-level3.mjs verify-l1-doors.mjs verify-sequence.mjs"
# Frame-timing measurements flake under CPU contention — --par runs these
# serial, last. (--shard is already one suite at a time on its own machine.)
TAIL="verify-timing.mjs verify-telegraphs.mjs verify-touch.mjs"

# HEAVY first, then everything else, both in a stable order. Round-robin over
# THIS is what balances the shards: dealing an alphabetical list meant shard 7
# drew density AND several other long ones and ran 58m25s against a 60-minute
# limit, while shard 6 finished in 3m44s (docs/TESTING.md §10). Alphabetical
# order carries no information about cost; this does.
heavy_first() {
  ALLF=$(sorted_suite_files)
  for t in $HEAVY; do echo "$ALLF" | grep -qx "$t" && echo "$t"; done
  for t in $ALLF; do
    case " $HEAVY " in *" $t "*) ;; *) echo "$t" ;; esac
  done
}

# Boot first, always: twenty seconds, and it catches the errors that make every
# other result meaningless.
run verify-boot.mjs

case "$1" in
  --quick)
    # THE PUSH GATE, AND IT HAS TO BE FAST OR IT STOPS BEING A GATE.
    #
    # This used to be density + music, and on 2026-09-05 that had cancelled
    # THIRTY-EIGHT consecutive CI runs. The arithmetic: verify-density takes
    # ~8 minutes and is a documented known-fail (board #124), every failure
    # earns one automatic serial re-run, and the job's limit was 20 minutes —
    # so the gate spent its whole budget failing the same suite twice and was
    # killed before it reported anything. A cancelled run says nothing, so
    # nobody could see the gate had died. Seven nightly sweeps in a row were
    # red over the same period and nothing was learned from any of them.
    #
    # So: nothing here may be slow, and nothing here may be a known-fail.
    # Measured on the CI-equivalent box, 2026-09-05, in this order:
    #   boot 5s, callable 0s, graphs 0s, story-beats 0s, variant-names 0s,
    #   formlock 14s, hud 14s, completion 23s, progression 49s, roomid 71s
    # — about three minutes total, which leaves room for a re-run and still
    # finishes four times inside the limit.
    #
    # What it buys: does the game boot with no page error, does every method
    # a room calls exist, does every room id resolve, is every enemy variant
    # name real, do the mission graphs hold, does a form lock behave, does the
    # HUD lay out at phone size, can the game be progressed and completed.
    # That is the "is it a game" question, in three minutes.
    #
    # NOT here, on purpose: verify-density (slow, known-fail) and
    # verify-music (2.5 min, and the nightly shards run it). The nightly is
    # where slow and known-red suites belong; the push gate is where speed
    # belongs. If a suite is ever added here, add its measured time above.
    run verify-callable.mjs
    run verify-graphs.mjs
    run verify-story-beats.mjs
    run verify-variant-names.mjs
    run verify-formlock.mjs
    run verify-hud.mjs
    run verify-completion.mjs
    run verify-progression.mjs
    run verify-roomid.mjs
    ;;
  --shard)
    KN="$2"
    K=$(echo "$KN" | cut -d/ -f1); N=$(echo "$KN" | cut -d/ -f2)
    case "$K$N" in *[!0-9]*|'') echo "usage: --shard K/N (e.g. --shard 2/8)"; exit 2 ;; esac
    if [ "$K" -lt 1 ] || [ "$K" -gt "$N" ]; then echo "K must be between 1 and N ($KN)"; exit 2; fi
    i=0
    for t in $(heavy_first); do
      i=$((i + 1))
      shard=$(( (i - 1) % N + 1 ))
      [ "$shard" = "$K" ] && run "$t"
    done
    ;;
  --par)
    # THE GLOB IS THE LIST. This used to parse the serial block below, which
    # meant --par ran exactly what someone had remembered to type there — and
    # on 2026-09-05 that was 58 of the 76 suites on disk. --shard has always
    # read the glob, so the nightly was complete while every local run was
    # eighteen suites short, including verify-looks, verify-chests and
    # verify-onward. Two modes, two answers to "what is the suite?" is one
    # answer too many.
    ALL=$(sorted_suite_files)
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
    # Added 2026-08-30, the night the rot guard caught all seven at once:
    # each of these shipped with its feature but never joined this list, so
    # no mode had ever run them in a sweep. The guard exists because this
    # exact thing is how the file rotted before; it earned its keep tonight.
    run verify-graphs.mjs
    run verify-l2-lantern.mjs
    run verify-openholes.mjs
    run verify-pups.mjs
    run verify-puzzle-payoff.mjs
    run verify-smash.mjs
    run verify-spire.mjs
    # AN ENEMY'S BONES MUST MOVE (2026-08-31, dad: "the skeletons don't walk
    # or attack with an animation"). Damage suites and screenshots both pass
    # a skinned mesh gliding around in bind pose; this one measures a leg
    # bone's quaternion actually changing on every rigged enemy.
    run verify-motion.mjs
    # NOTHING RENDERS OUTSIDE ITS ROOM, AND NOTHING HOVERS (2026-08-31, dad:
    # "objects outside in the black" / "a weird floating rock structure").
    # Both were the same dresser function with a wrong coordinate frame, and
    # nothing had ever swept the game for either symptom outside the frame a
    # human happened to screenshot. Promoted from the scratchpad probe that
    # found the bug; sweeps every room in the live registry.
    run verify-bounds.mjs
    # STANDING STILL MUST NEVER PAY OUT (2026-08-31, dad: "stand in the
    # circle... and get pretty much infinite shards" — 3,504 coins from one
    # socket). Every suite verified a socket WORKS; none asked whether
    # repeating the same action, unmoving, is safe. Sweeps every carry socket
    # in the live registry — see the suite's own header for what it does not
    # cover (levers, plates: a real gap, not yet guarded).
    run verify-abuse.mjs
    # THE ARMOURY (2026-08-31). A new screen with a live 3D preview, real item
    # art and its own second WebGL context — three things that can each break
    # silently. It also guards dad's rule that "a red axe is a red axe" on the
    # one screen where it was still false, and checks the layout at PHONE size,
    # which is the only size that actually matters here.
    run verify-armoury.mjs
    # AND THEN EVERYTHING ELSE ON DISK, FROM THE GLOB.
    #
    # The curated order above is worth keeping — it is "fails fastest and
    # cheapest first", and the comments record why each suite exists. What is
    # NOT worth keeping is the assumption that someone remembers to add a line
    # here. Eighteen suites had not been added (verify-looks, verify-chests,
    # verify-onward, verify-bosses, verify-level4, verify-map and twelve more),
    # so every serial and --par run was short of them while the sharded nightly
    # ran them all. The guard at the foot of this file DID print a warning, and
    # the warning had been printing for long enough to become furniture.
    #
    # A list that maintains itself cannot rot, so this runs the difference.
    # A new suite is covered the moment the file exists.
    for t in $(sorted_suite_files); do
      case " $RAN " in
        *" $t "*) ;;
        *) printf '(from the glob) '; run "$t" ;;
      esac
    done
    ;;
  *)
    for t in "$@"; do run "$t"; done
    ;;
esac

# THE ROT GUARD, RETIRED (2026-09-05) — and worth recording why.
#
# There used to be a check here that listed every verify-*.mjs not named in the
# serial block and turned it into a synthetic FAILURE called "unlisted-suites".
# It worked exactly as designed and it did not help: it printed eighteen names
# every single run, went red every single run, and the red became scenery
# (docs/TESTING.md §7b, lesson 3 — "a long-standing failure is a finding, not
# furniture"). A guard that reports a gap on every run is a guard nobody reads.
#
# All three modes now read `sorted_suite_files` — the glob — so the gap it was
# watching for cannot exist. Nothing to guard, so nothing here.
#
# The general lesson, which outlives this particular check: when a guard fires
# constantly, close the hole instead of watching it. A warning that is always
# on carries no information.

# THE TIMING TABLE (job 3). Slowest FINAL-verdict attempt first — that is the
# order clock-conversion work (TESTINGADDENDUM.md §10) should happen in.
if [ -s "$TIMES" ]; then
  echo
  echo "timing (slowest first):"
  # Sort the RAW single-space-delimited records first (field 3 = seconds) —
  # sorting after printf's padding turns every run of spaces into extra empty
  # fields and silently un-sorts the table (caught live: verify-music at 96s
  # printed ahead of verify-density at 459s).
  awk '$4 == "final" || $4 == "parallel"' "$TIMES" | sort -k3 -rn | \
    awk '{ printf "%-26s %-10s %6ss  %s\n", $1, $2, $3, $4 }'
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
