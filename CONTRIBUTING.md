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
yarn test                # single run, ~1.5 s, 139 tests
yarn test:watch          # watch mode for local development
yarn test:coverage       # coverage report (V8 provider), enforces thresholds
yarn test:browser        # Playwright smoke tests in real browsers
yarn bench               # Vitest benchmark suite (bench/)
yarn docs:api            # Generate the HTML API docs (docs-api/)
```

All tests use the native Vitest API (`describe` / `it` / `expect`). Test files live in `test/*.js`, shared fixtures under `test/setup/`. Browser smoke tests are in `test-browser/` — first time you run them locally, `yarn playwright install` to fetch chromium / firefox / webkit binaries.

When you add a test for a bug fix or new behavior, add it to the file whose existing tests it logically belongs to. Migration plan and the assertion-mapping table are documented in [`docs/TESTING_MIGRATION.md`](./docs/TESTING_MIGRATION.md).

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

Releases are automated by [release-please](https://github.com/googleapis/release-please) — see [`.github/workflows/release-please.yml`](./.github/workflows/release-please.yml) and [`.github/release-please-config.json`](./.github/release-please-config.json).

What that means in practice :

- Every push to `master` (once the workflow's auto trigger is restored — currently `workflow_dispatch` only) updates an open "release PR" that maintains `CHANGELOG.md` and bumps the `version` in `package.json`.
- Merging the release PR creates the git tag and a GitHub release.
- **Use [conventional commits](https://www.conventionalcommits.org/)** in your PR titles / squash messages : `feat:`, `fix:`, `perf:`, `refactor:`, `docs:`, `test:`, `chore:`, `ci:`. Breaking changes are signalled by `feat!:` or `BREAKING CHANGE:` in the body.
- Visible changelog sections are `feat` (Features), `fix` (Bug Fixes), `perf` (Performance), `revert` (Reverts), `docs` (Documentation), `refactor` (Refactor). The rest are hidden but still tracked.

Don't bump `version` or edit `CHANGELOG.md` by hand for routine releases — release-please will fight you. The header version inside `backbone-relational.js` and the two mentions in `index.html` can lag until a manual sync ; that's an open follow-up if it bothers anyone.
