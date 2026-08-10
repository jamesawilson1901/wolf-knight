#!/bin/sh
# THE WHOLE SUITE, in the order that fails fastest.
# Under SwiftShader each browser verifier takes minutes, so boot first: it is
# twenty seconds and catches the errors that make everything else meaningless.
cd "$(dirname "$0")/.."
PASS=0; FAIL=0; FAILED=""
run() {
  printf '%-26s ' "$1"
  if node "tools/$1" > "/tmp/vall-$1.log" 2>&1; then
    printf 'PASS\n'; PASS=$((PASS+1))
  else
    if grep -q "ALL CLEAN" "/tmp/vall-$1.log" 2>/dev/null; then
      printf 'PASS\n'; PASS=$((PASS+1))
    else
      printf 'FAIL  (/tmp/vall-%s.log)\n' "$1"; FAIL=$((FAIL+1)); FAILED="$FAILED $1"
    fi
  fi
}
# THE RECORDS CHECK RUNS FIRST because it is a third of a second and needs no
# browser at all. Nine versions shipped with no BUILDLOG entry — the dressing
# pass, the seam, the Den, the mini games, two regions and the ending — and
# nothing in this suite could tell, because nothing was looking at the record.
run check-buildlog.mjs
run verify-boot.mjs
# THE DENSITY CHECK RUNS BY DEFAULT, not on request. Every topology assertion in
# this suite was green while the rooms were empty boxes, which is exactly how
# "big but bare" reached a playtest — the suite could not fail a bare room
# because nothing in it was measuring the room's contents.
run verify-density.mjs
# ...and the music, which nothing checked until v3.43 and which was hiding two
# regions playing the wrong loop and four bosses fighting to region music. It is
# the one thing a child experiences with their eyes shut.
run verify-music.mjs
for t in "$@"; do run "$t"; done
echo
echo "passed $PASS, failed $FAIL"
[ -n "$FAILED" ] && echo "failed:$FAILED"
exit $FAIL
