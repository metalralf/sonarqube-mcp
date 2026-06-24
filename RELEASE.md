# Release Process

## Version numbering

| Bump | When | Example |
|------|------|---------|
| **patch** | Bugfixes, scanner updates, docs, tests — no new tools | `1.5.0` → `1.5.1` |
| **minor** | New tools, features, refactors — all changes since last minor | `1.5.0` → `1.6.0` |
| **major** | Breaking changes (tool removal, env var renames, SDK bump) | `1.5.0` → `2.0.0` |

## When to cut a release

- **3+ new tools** since last release → minor
- **Critical bugfix** → patch (cut immediately, don't wait)
- **Enough time passed** with accrued fixes → patch
- **Main feels stable enough** → any version you feel comfortable tagging

## Release checklist

1. **Create `release/vX.Y.Z` branch** from main

2. **Run gate**
   ```
   npm run typecheck
   npm test
   npm run coverage:check
   ```

3. **Update CHANGELOG.md**
   - Summarize all changes since the last release tag
   - Group by: Added, Changed, Fixed
   - Reference commit hashes or PR numbers

4. **Bump version** in these files:
   - `package.json` — `version` field
   - `src/index.mjs` — `version` string
   - `README.md` — `#version` badge

5. **Commit** as `chore: bump to vX.Y.Z`

6. **Tag and push**
   ```
   git tag vX.Y.Z
   git push origin vX.Y.Z
   git push origin release/vX.Y.Z
   ```

7. **Create GitHub Release** using the tag
   - Title: `vX.Y.Z`
   - Description: paste CHANGELOG entry

8. **Merge `release/vX.Y.Z` back to main** if any fixes were made on the release branch

## Post-release

- Update the `#version` badge in README if needed
- Start the next iteration on main
