# Security Policy

## Supported Versions

Only the latest minor release on the `master` branch receives security
updates. See [`CHANGELOG.md`](./CHANGELOG.md) for the current version and the
release history.

## Reporting a Vulnerability

If you discover a security vulnerability in backbone-relational, **please do
not open a public GitHub issue**. Instead, report it privately so it can be
fixed before disclosure.

Two equivalent channels:

1. **Email** : send a report to `christopher.rombach@mobiolink.com`. Include
   - a short description of the vulnerability,
   - the version (or commit SHA) where you observed it,
   - reproduction steps or a minimal proof-of-concept,
   - the impact you assess (information disclosure, prototype pollution,
     denial of service, etc.).
2. **GitHub private advisory** : use the "Report a vulnerability" button in
   the [Security tab](https://github.com/compuzz-eventus/Backbone-relational/security)
   of the repository. Same information, hosted privately on GitHub.

You can expect an initial acknowledgement within a few business days. Fix
cadence depends on severity; a coordinated disclosure window will be agreed
on a case-by-case basis before any public mention.

## Scope

In scope :

- The library source (`backbone-relational.js`, `backbone-relational.mjs`).
- The published npm package and its declared exports.

Out of scope :

- Demo/landing assets (`index.html`, `static/`).
- Generated documentation (`docs-api/`).
- Issues in upstream Backbone or Underscore — please report those to their
  respective maintainers.
- Vulnerabilities that require the attacker to already control the host
  application's JavaScript runtime (a backbone-relational consumer can
  legitimately execute arbitrary code in the same context).

## Disclosure

Once a fix is released, we will publish:

- a CVE if applicable,
- a GitHub Security Advisory describing the issue, affected versions, and
  remediation,
- an entry in `CHANGELOG.md` referencing the advisory.
