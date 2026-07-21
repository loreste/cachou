# Publishing CachouJS (maintainers)

How to release packages to npm. **Never paste npm tokens into chat or commit them.**

## Packages

| Package | Path | Current |
|---------|------|---------|
| `cachoujs` | repo root | 1.0.9 |
| `@cachoujs/compiler` | `packages/compiler` | 1.0.9 |
| `@cachoujs/create` | `packages/create-cachou` | 1.0.9 |

You must own the npm name / `@cachoujs` org (this project uses org **cachoujs**, owner **loreste**).

---

## One-time setup

1. npm account + email verified: [https://www.npmjs.com/signup](https://www.npmjs.com/signup)  
2. Enable **2FA**: Account → Security  
3. Create a **Granular Access Token** with **Read and write** (and publish / bypass-2FA if required for non-interactive publish)  
4. On your machine only:

```bash
npm login
# or
npm config set //registry.npmjs.org/:_authToken "$NPM_TOKEN"

npm whoami   # must print your username
```

5. For scoped packages, create the org if needed: [https://www.npmjs.com/org/create](https://www.npmjs.com/org/create) → `cachoujs`

---

## Version policy (going forward)

From **0.4.0** onward, releases use **small increments** only.

| Rule | Detail |
|------|--------|
| Current published | **1.0.9** |
| Next release | **1.0.10** |
| Default bump | **patch** (`1.0.x` → `1.0.x+1`) for fixes, docs, CI, small APIs |
| Minor bump | Backward-compatible features (`1.x.0`) |
| Major bump | Break **stable** APIs only (`2.0.0`) |
| Scope | Bump **all three** packages together: `cachoujs`, `@cachoujs/compiler`, `@cachoujs/create` |
| Tags | `v1.0.0`, `v1.0.1`, … match the npm version |

Prefer many small patch releases. Stable API breaks require a major.

---

## Release checklist

### 1. Changelog (**required — never skip**)

Update root [CHANGELOG.md](../CHANGELOG.md) **first**, under a new version heading (e.g. `## 1.0.9`):

- Short release summary line
- Bullet sections as needed: **Added**, **Fixed / improved**, **Docs / tests**
- User-facing wording (what changed and why it matters), not only file names

No version bump or publish without a matching changelog section. GitHub release notes copy/summarize that section.

### 2. Bump version

npm **forbids** republishing the same version. Always bump (next: **1.0.10**):

- Root: `package.json` → `cachoujs`  
- `packages/compiler/package.json`  
- `packages/create-cachou/package.json`  

Same version on all three packages.

### 3. Verify

```bash
cd /path/to/cachou
# Local gates + (when `gh` is logged in) soft check for Linux/Chromium on HEAD
npm run publish:prep

# Hard-require a green GHA Linux/Chromium check-run for this commit:
CACHOU_REQUIRE_CI=1 npm run publish:prep
```

`publish:prep` looks up **Verify (Linux / Chromium)** for the current `HEAD` SHA
via `gh` (main push **or** tag push). Without `gh`, or without
`CACHOU_REQUIRE_CI=1`, a missing remote check is a warning only.

Still confirm the job is green for the **exact release commit** before calling a
release fully validated. Local unit/pack checks do not substitute for that CI
evidence. Keep Linux/Chromium required in branch protection where possible;
macOS Safari is optional signal only.

`publish:prep` fails if:

- package versions differ across `cachoujs` / `@cachoujs/compiler` / `@cachoujs/create`
- `CHANGELOG.md` lacks a `## <version>` heading
- a lightweight secret-pattern scan finds likely tokens/keys in source docs
- `CACHOU_REQUIRE_CI=1` and Linux/Chromium is not successful for `HEAD`

### 4. Publish

```bash
# Main runtime (public)
npm publish --access public

# Scoped packages (public)
npm publish -w @cachoujs/compiler --access public
npm publish -w @cachoujs/create --access public
```

If 2FA requires OTP in the terminal:

```bash
npm publish --access public --otp=123456
```

### 5. Confirm

```bash
npm view cachoujs version
npm view @cachoujs/compiler version
npm view @cachoujs/create version
```

Pages:

- https://www.npmjs.com/package/cachoujs  
- https://www.npmjs.com/package/@cachoujs/compiler  
- https://www.npmjs.com/package/@cachoujs/create  

### 6. Git tag + GitHub release

```bash
git tag v1.0.9
git push origin v1.0.9
# gh release create with notes from CHANGELOG.md for this version
```

---

## Common errors

| Error | Meaning | Fix |
|-------|---------|-----|
| `You cannot publish over the previously published versions: X.Y.Z` | Version already exists | Bump version, publish again |
| `Two-factor authentication or granular access token with bypass 2fa…` | Token can’t publish | New granular token with publish/2FA bypass, or `--otp=` |
| `401 Unauthorized` | Bad/missing token | `npm login` or fix `~/.npmrc` |
| `404` on publish | Often auth/permission | Check `npm whoami`, org membership, package name |
| `bin[…] was invalid and removed` | Bin script packaging warning | Ensure shebang `#!/usr/bin/env node` and path under package `files` |

---

## What not to do

- Do not share tokens in chat, commits, or CI logs  
- Do not force-publish the same version  
- Do not enable `CACHOU_DEMO=1` in production docs as a default  

---

## After publish — user install

Users should follow [INSTALL.md](./INSTALL.md):

```bash
npm install cachoujs
npx @cachoujs/create my-app
```
