#!/usr/bin/env bash
# Guards design-token regressions that have already been cleaned up so they do
# not creep back in: the old radius prefix, the drifting navy literals, and any
# raw-hex Tailwind colour utility (all of these now have semantic tokens).
set -euo pipefail

roots=(apps/web/src packages/ui/src)
fail=0

# 1. The radius tokens are --itq-radius-*; the old --it-radius-* prefix is gone.
if grep -rnE -- '--it-radius-' "${roots[@]}" 2>/dev/null; then
  echo "error: use --itq-radius-* (the --it-radius-* prefix was renamed)." >&2
  fail=1
fi

# 2. The drifting dark-navy literals were unified to --itq-color-ink-deep.
if grep -rniE -- '\[#(112c38|102f3b|123640)\]' "${roots[@]}" 2>/dev/null; then
  echo "error: use var(--itq-color-ink-deep) instead of a raw navy hex." >&2
  fail=1
fi

# 3. No raw-hex colour utilities: every palette value has a semantic token.
if grep -rnE -- '\b(bg|text|border|ring|ring-offset|outline|from|to|via|fill|stroke|decoration|caret|accent|shadow)-\[#[0-9a-fA-F]{3,8}\]' "${roots[@]}" 2>/dev/null; then
  echo "error: use a var(--itq-color-*) token instead of a raw-hex utility." >&2
  fail=1
fi

exit "$fail"
