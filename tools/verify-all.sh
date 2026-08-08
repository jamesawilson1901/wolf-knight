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
run verify-boot.mjs
for t in "$@"; do run "$t"; done
echo
echo "passed $PASS, failed $FAIL"
[ -n "$FAILED" ] && echo "failed:$FAILED"
exit $FAIL
