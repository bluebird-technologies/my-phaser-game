# UI/UX Pro Max — Vendoring info

This skill is vendored from https://github.com/nextlevelbuilder/ui-ux-pro-max-skill

| Field    | Value                                                   |
| -------- | ------------------------------------------------------- |
| Source   | https://github.com/nextlevelbuilder/ui-ux-pro-max-skill |
| Commit   | b7e3af80f6e331f6fb456667b82b12cade7c9d35                |
| Vendored | 2026-04-13                                              |

## Updating

To pull the latest version of the skill:

```bash
pnpm run skill:update
```

This runs `scripts/update-uiux-skill.sh` which clones upstream, copies SKILL.md + data/ + scripts/ into `.claude/skills/ui-ux-pro-max/`, and rewrites this UPSTREAM.md with the new commit SHA.

## Notes

- Upstream uses symlinks (`.claude/skills/ui-ux-pro-max/data` → `src/ui-ux-pro-max/data`). The vendoring script resolves these to real files so the destination is self-contained.
- Do not edit files under `.claude/skills/ui-ux-pro-max/` directly — your changes will be wiped on the next update. Send PRs upstream instead.
