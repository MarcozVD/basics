# Releasing

Releases are cut from a version tag. Pushing a `v*` tag runs
[`.github/workflows/release.yml`](.github/workflows/release.yml), which publishes both npm packages with provenance
and creates the matching GitHub Release.

## One-time owner setup

1. **Restore access to the npm account.** The packages are owned by the `MarcozVD` npm account. Recover the account and
   enable 2FA before publishing; the workflow authenticates through npm trusted publishing, not a stored token.
2. **Configure trusted publishing on npmjs.com** for both packages:
   - `@marcozvd/basics-core` → Settings → Trusted publishing → GitHub Actions
   - `@marcozvd/basics` → Settings → Trusted publishing → GitHub Actions

   Use repository `MarcozVD/basics` and workflow `release.yml` for both. Do not create an `NPM_TOKEN` secret; the
   workflow requests `id-token: write` and npm exchanges the GitHub OIDC token for a short-lived publish credential.
3. Make sure the npm CLI used by the workflow supports trusted publishing (the workflow upgrades npm before
   publishing). No other repository secret is needed.

## Release steps

1. Start from a clean, green `main`:

   ```bash
   git switch main
   git pull
   npm ci
   npm run lint
   npm test
   npm run build
   ```

2. Bump versions and generate changelogs from the pending changesets:

   ```bash
   npm run version-packages
   ```

   Both packages are in a fixed group, so they get the same version. Review the version bumps, the new
   `packages/*/CHANGELOG.md` sections and the deleted `.changeset/*.md` files.

3. Commit the release and push it:

   ```bash
   git add packages/*/package.json packages/*/CHANGELOG.md package-lock.json .changeset
   git commit -m "chore: release v1.0.0"
   git push
   ```

4. Tag the release and push the tag:

   ```bash
   git tag v1.0.0
   git push --tags
   ```

The tag must match the package versions produced by `version-packages`. The workflow then:

- installs, builds and tests the repo;
- publishes `packages/core` and then `packages/basics` with `npm publish --provenance --access public`, skipping any
  version that already exists on npm;
- creates the GitHub Release `Basics v1.0.0` with the matching sections from both `CHANGELOG.md` files.

If a run fails after one package was published, fix the cause and re-run the workflow from the Actions tab; the
already-published version is skipped and the remaining steps continue. Do not move or reuse a tag that has already
triggered a release.
