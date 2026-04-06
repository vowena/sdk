# Security Policy

The SDK helps applications build, sign, simulate, and submit transactions. Vulnerabilities here can mislead integrators or create unsafe defaults, so private reporting is required.

## Report a vulnerability

Do not open public issues or pull requests for security findings.

Preferred reporting path:

1. Open a private GitHub security advisory: <https://github.com/vowena/sdk/security/advisories/new>
2. Or email `security@vowena.xyz` with the subject `[SECURITY] sdk vulnerability report`

## What to include

- A description of the issue
- Affected API surface or code path
- Reproduction steps or sample code
- Impact and likely exploitability
- Any mitigation ideas you have already confirmed

## Response targets

- Acknowledgment within 48 hours
- Initial assessment within 7 days

## In scope

- Unsafe transaction construction
- Incorrect parsing or serialization that can affect funds or permissions
- Dangerous default network or contract assumptions
- Package integrity or supply-chain concerns inside this repository

## Coordinated disclosure

Please give us time to investigate and patch before public disclosure.
