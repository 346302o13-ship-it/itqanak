#!/usr/bin/env bash
set -euo pipefail

# Lightweight defence-in-depth check for committed material. It deliberately
# does not inspect ignored runtime secrets, generated dependencies, or examples
# that contain only named configuration keys.
patterns='(BEGIN (RSA |EC |OPENSSH )?PRIVATE KEY|ghp_[A-Za-z0-9]{30,}|xox[baprs]-[A-Za-z0-9-]{20,}|AKIA[0-9A-Z]{16})'
if rg --hidden --glob '!.git/**' --glob '!node_modules/**' --glob '!**/dist/**' --glob '!**/.next/**' --glob '!secrets/**' \
  --pcre2 --line-number "$patterns" .; then
  printf '%s\n' 'Potential committed secret material found.' >&2
  exit 1
fi

printf '%s\n' 'No known secret patterns found.'
