# Publishing CachouJS (maintainers)

How to release packages to npm. **Never paste npm tokens into chat or commit them.**

## Packages

| Package | Path | Current |
|---------|------|---------|
| `cachoujs` | repo root | 0.4.5 |
| `@cachoujs/compiler` | `packages/compiler` | 0.4.5 |
| `@cachoujs/create` | `packages/create-cachou` | 0.4.5 |

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
| Current published | **0.4.5** |
| Next release | **0.4.6** |
| Default bump | **patch** (`0.4.x` → `0.4.x+1`) for fixes, docs, CI, small APIs |
| Minor bump | Rare: only when a coherent feature set lands (`0.4` → `0.5`) |
| Major bump | Reserved for **1.0** API freeze (later) |
| Scope | Bump **all three** packages together: `cachoujs`, `@cachoujs/compiler`, `@cachoujs/create` |
| Tags | `v0.4.4`, `v0.4.5`, … match the npm version |

Do **not** jump versions (e.g. 0.4.0 → 0.5.0) for routine work. Prefer many small patch releases over large batches.

---

## Release checklist

### 1. Bump version

npm **forbids** republishing the same version. Always bump (next: **0.4.5**):

- Root: `package.json` → `cachoujs`  
- `packages/compiler/package.json`  
- `packages/create-cachou/package.json`  

Keep [CHANGELOG.md](../CHANGELOG.md) updated under the new version heading.

```bash
# example for the next release — same version on every package
# # keep
```

### 2. Verify

```bash
cd /path/to/cachou
npm run test:unit
npm run publish:prep    # unit + compiler build + pack dry-run
```

### 3. Publish

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

### 4. Confirm

```bash
npm view cachoujs version
npm view @cachoujs/compiler version
npm view @cachoujs/create version
```

Pages:

- https://www.npmjs.com/package/cachoujs  
- https://www.npmjs.com/package/@cachoujs/compiler  
- https://www.npmjs.com/package/@cachoujs/create  

### 5. Git tag

```bash
git tag v0.4.5
git push origin v0.4.5
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
