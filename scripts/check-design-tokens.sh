#!/usr/bin/env bash
# Guards a handful of design-token regressions that have already been cleaned up,
# so they do not creep back in. It is intentionally narrow: the broader sweep of
# raw hex / ad-hoc palette utilities is tracked separately and only reported
# here, not enforced.
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

# 3. Informational only: remaining raw-hex Tailwind utilities.
remaining="$(grep -rhoE -- '\b(bg|text|border|ring|from|to|via|fill|stroke)-\[#[0-9a-fA-F]{3,8}\]' "${roots[@]}" 2>/dev/null | wc -l | tr -d ' ')"
echo "note: ${remaining} raw-hex utilities remain (tracked; not enforced)."

exit "$fail"
