# Contributing to Vowena SDK

Thanks for contributing to the Vowena SDK. This package is the bridge between the protocol and real applications, so we care about type safety, predictable APIs, package quality, and good upgrade paths for integrators.

## Good contributions

- Bug fixes
- Type improvements
- Transaction builder correctness
- Event parsing improvements
- Better docs and examples
- Test coverage and release tooling

If you are new here, start with smaller issues or documentation changes first.

## Prerequisites

- Node.js 20 or later
- npm 10 or later

## Local setup

```bash
git clone https://github.com/vowena/sdk.git
cd sdk
npm install
npm run build
```

For continuous rebuilds while you work:

```bash
npm run dev
```

## Verification

Run these before you push:

```bash
npm run typecheck
npm run build
npm pack --dry-run
```

If your change affects transaction building, simulation, or submission behavior, test it against the Stellar testnet too.

## Branch naming

- `feat/add-batch-charge-method`
- `fix/handle-missing-network-passphrase`
- `docs/improve-installation-guide`
- `refactor/extract-transaction-builder`
- `test/add-events-coverage`
- `chore/update-build-tooling`

## Commit messages

Use [Conventional Commits](https://www.conventionalcommits.org/):

```text
feat: add batched charge helper
fix: guard missing contract id in client config
docs: clarify buildSubscribe return type
refactor: extract shared soroban invocation builder
test: cover stroop conversion edge cases
chore: validate npm package contents in CI
```

## Code expectations

- Keep TypeScript in strict mode.
- Avoid `any`; use `unknown` and narrow intentionally.
- Preserve backwards compatibility unless the change is explicitly breaking.
- Document units clearly. Contract amounts are in stroops.
- Favor small, composable helpers over large multi-purpose functions.

## Pull requests

- Keep PRs focused and reviewable.
- Link related issues when possible.
- Explain the API surface affected by the change.
- Call out any breaking changes or migration notes clearly.
- Add docs updates when a public method changes.

## Security

Never disclose vulnerabilities in a public issue. Follow [SECURITY.md](SECURITY.md).

## Conduct

This repository follows [CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md).
