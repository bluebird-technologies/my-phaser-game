#!/usr/bin/env bash
# Re-vendor the ui-ux-pro-max Claude skill from upstream.
# Usage: bash scripts/update-uiux-skill.sh
#        (or: pnpm run skill:update)

set -euo pipefail

UPSTREAM_REPO="https://github.com/nextlevelbuilder/ui-ux-pro-max-skill"
SKILL_DIR=".claude/skills/ui-ux-pro-max"
TMP_DIR="$(mktemp -d)"
trap 'rm -rf "$TMP_DIR"' EXIT

# Run from the project root (where package.json lives)
cd "$(dirname "$0")/.."

echo "→ Cloning $UPSTREAM_REPO ..."
git clone --depth 1 "$UPSTREAM_REPO" "$TMP_DIR/uiuxpm" 2>&1 | tail -1

SHA="$(cd "$TMP_DIR/uiuxpm" && git rev-parse HEAD)"
DATE="$(date +%Y-%m-%d)"

echo "→ Vendoring skill files into $SKILL_DIR ..."
rm -rf "$SKILL_DIR"
mkdir -p "$SKILL_DIR"
cp "$TMP_DIR/uiuxpm/.claude/skills/ui-ux-pro-max/SKILL.md" "$SKILL_DIR/SKILL.md"
cp -R "$TMP_DIR/uiuxpm/src/ui-ux-pro-max/data" "$SKILL_DIR/data"
cp -R "$TMP_DIR/uiuxpm/src/ui-ux-pro-max/scripts" "$SKILL_DIR/scripts"

cat > "$SKILL_DIR/UPSTREAM.md" <<EOF
# UI/UX Pro Max — Vendoring info

This skill is vendored from $UPSTREAM_REPO

| Field | Value |
|-------|-------|
| Source | $UPSTREAM_REPO |
| Commit | $SHA |
| Vendored | $DATE |

## Updating

To pull the latest version of the skill:

\`\`\`bash
pnpm run skill:update
\`\`\`

This runs \`scripts/update-uiux-skill.sh\` which clones upstream, copies SKILL.md + data/ + scripts/ into \`.claude/skills/ui-ux-pro-max/\`, and rewrites this UPSTREAM.md with the new commit SHA.

## Notes

- Upstream uses symlinks (\`.claude/skills/ui-ux-pro-max/data\` → \`src/ui-ux-pro-max/data\`). The vendoring script resolves these to real files so the destination is self-contained.
- Do not edit files under \`.claude/skills/ui-ux-pro-max/\` directly — your changes will be wiped on the next update. Send PRs upstream instead.
EOF

echo "✓ Skill updated to commit $SHA"
echo "  Files: $(find "$SKILL_DIR" -type f | wc -l | tr -d ' ')"
echo "  Size: $(du -sh "$SKILL_DIR" | awk '{print $1}')"