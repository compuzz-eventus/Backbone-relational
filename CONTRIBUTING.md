# Contributing

Thanks for your interest in Backbone-relational! This document covers how to report issues and how to set up the project locally to submit a Pull Request.

## Reporting a bug / feature / enhancement

Please include the following in any bug report:

- Backbone-relational version
- Backbone version
- Underscore (or Lodash) version
- Node.js version (if relevant for the test toolchain)

A good description includes:

1. **The problem you are facing**, in as much detail as is necessary for someone who doesn't know your codebase.
   - A failing test case is the most valuable thing you can attach. The test suite is now Vitest-based and runs in Node — see [Running tests](#running-tests) below.
2. A summary of the proposed solution.
3. A description of how this solution solves the problem.
4. Any additional discussion on possible side-effects, open questions, etc.

## Local setup

This project requires:

- **Node.js 22 or 24** (the CI matrix; declared in `package.json` `engines.node`)
- **Corepack** (shipped with Node ≥ 16) to pin Yarn 4. Enable it once per machine:

```bash
corepack enable
```

Clone and install:

```bash
git clone https://github.com/compuzz-eventus/Backbone-relational.git
cd Backbone-relational
yarn install
```

You don't need a browser locally — the test suite uses [happy-dom](https://github.com/capricorn86/happy-dom) inside Node.

## Running tests

```bash
yarn test            # single run, ~1.5s
yarn test:watch      # watch mode for local development
yarn test:coverage   # coverage report (V8 provider)
```

Test files live in `test/*.js`. Shared fixtures and the QUnit-to-Vitest adapter live in `test/setup/`. The 140 existing tests are written against QUnit 1.x and run unchanged via [`test/setup/qunit-shim.js`](./test/setup/qunit-shim.js). New tests can use either the QUnit-style API (`QUnit.module` / `QUnit.test`) or the native Vitest API (`describe` / `it`) — both work, but stay consistent within a given file.

## Lint and format

```bash
yarn lint            # ESLint over the whole repo
yarn lint:fix        # ESLint with --fix
yarn format          # Prettier --write on every supported file
yarn format:check    # Prettier --check (used in CI)
```

A pre-commit hook (husky + lint-staged) runs Prettier and ESLint on staged files automatically. If you bypass hooks (`--no-verify`), CI will still catch any drift.

## Submitting a Pull Request

Before opening a PR, please make sure that:

1. **Lint and format pass.** `yarn lint && yarn format:check` should both succeed locally — CI runs them on every PR.
2. **Tests pass.** `yarn test` should be green. If you added or fixed behavior, please add or update a test.
3. **Your branch is rebased on `master`.**
4. The CI matrix (Node 22 + 24) on your PR is green.

`backbone-relational.js` is the single-file UMD source — keep changes focused and explain non-obvious choices in the PR description.

## Project structure

See the [README](./README.md#project-structure) for a tree view of the repo.

## Release process

Releases follow [Semantic Versioning](https://semver.org/spec/v2.0.0.html). For each release:

1. Bump `version` in `package.json`, the header of `backbone-relational.js`, and the two version mentions in `index.html`.
2. Add a `## [X.Y.Z] — YYYY-MM-DD` section at the top of `CHANGELOG.md` (Keep a Changelog format) with `### Added` / `### Changed` / `### Fixed` / `### Removed` subsections as needed.
3. Tag the commit (`git tag X.Y.Z`) and push (`git push --tags`).

The convention in this fork's history is to split the bump and the changelog entry into two commits: `chore(release): X.Y.Z` followed by `docs(release): move X.Y.Z release notes into CHANGELOG.md`.
