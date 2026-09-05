#!/bin/sh
# The two-rule lint (tools/eslint.config.mjs). Runs from anywhere in the repo,
# takes about a second, and needs no browser and no server.
#
#   sh tools/lint.sh            the whole repo
#   sh tools/lint.sh js/        one directory
#
# Exit status follows no-undef ONLY: unused-variable findings print as warnings
# and do not fail. See the config's header for why, and for the board item that
# turns them back into errors once they are burned down.
cd "$(dirname "$0")/.."
exec npx --prefix tools eslint --config tools/eslint.config.mjs "${@:-.}"
