# Backbone-relational

Backbone-relational provides one-to-one, one-to-many and many-to-one relations between models for [Backbone](https://github.com/jashkenas/backbone). It augments `Backbone.Model` and `Backbone.Collection` to keep related models in sync.

Documentation: http://backbonerelational.org

—

## Overview

This repository contains the Backbone-relational library and its tests. The library is a single-file UMD module (`backbone-relational.js`) intended for use in browser environments alongside Backbone and Underscore (or Lodash). Tests run in Node via a happy-dom environment, so no browser is required for development.

## Tech stack

- **Library**: single-file UMD JavaScript (`backbone-relational.js`), ES2022
- **Peer dependency**: [Backbone.js](https://github.com/jashkenas/backbone) (this fork targets [`compuzz-eventus/backbone`](https://github.com/compuzz-eventus/backbone) ≥ 1.7.0)
- **Utility**: Underscore (default), Lodash 4 also supported via the internal compat layer
- **Test runner**: [Vitest](https://vitest.dev/) 4 with the `happy-dom` environment (139 tests, native `describe`/`it`/`expect`)
- **Browser smoke tests**: [Playwright](https://playwright.dev) — chromium / firefox / webkit smoke specs in `test-browser/`
- **Benchmarks**: Vitest's `bench()` API in `bench/`
- **API docs**: [JSDoc](https://jsdoc.app/) generates an HTML site to `docs-api/`
- **Lint & format**: ESLint 10 (flat config) + Prettier 3 + actionlint on workflows
- **Package manager**: Yarn 4 via [Corepack](https://nodejs.org/api/corepack.html)
- **CI**: GitHub Actions (Node 22 + 24)
- **Release automation**: [release-please](https://github.com/googleapis/release-please) — reads conventional commits and maintains a release PR with bumped version + CHANGELOG
- **Dependency updates**: [Renovate](https://docs.renovatebot.com/) — weekly grouped PRs

## Requirements

- **Node.js 22 or 24** (the CI matrix). Other recent LTS versions likely work but are not tested.
- **Corepack** (shipped with Node ≥ 16) — used to pin Yarn 4. Run `corepack enable` once per machine.
- **Browsers are optional**: the Vitest suite uses happy-dom in Node and needs nothing else. The `yarn test:browser` Playwright smoke tests need browser binaries — `yarn playwright install chromium` (or `--with-deps` on Linux) the first time.

## Installation

Clone the repo and install dev dependencies:

```bash
corepack enable        # one-time, enables Yarn 4 from packageManager
yarn install
```

Backbone-relational itself is a single file (`backbone-relational.js`). If you consume it directly in the browser, make sure Backbone and Underscore (or Lodash) are loaded first.

## Usage

Include the script after Backbone and Underscore (or Lodash):

```html
<script src="underscore.js"></script>
<script src="backbone.js"></script>
<script src="backbone-relational.js"></script>
```

Then define relations on your `Backbone.Model` subclasses (see the documentation site for full API and examples).

> **Reference documentation in this repo**
>
> - [`docs/GUIDE.md`](./docs/GUIDE.md) — usage guide ("when to use what") with decision tables, code patterns, and gotchas, for consumers of the library.
> - [`docs/ARCHITECTURE.md`](./docs/ARCHITECTURE.md) — internal architecture (event queue, semaphore, init order, refactor history), for contributors and debuggers.

> **Important — `Backbone.Collection` behavior change (since 0.10.8)**
>
> Reverse-relation hooks (`relational:add` / `relational:remove`) are only emitted by `Backbone.Relational.Collection`, **not** by vanilla `Backbone.Collection`. If you `extend` from `Backbone.Collection` with `model: SomeRelationalModel`, reverse relations will not update automatically. Use `Backbone.Relational.Collection.extend({ model: ... })` for any collection that holds relational models.

### Cycle-safe serialization (toJSON)

Backbone-relational models can reference each other in cycles (e.g., parent ↔ child). Deep serialization without care can cause a stack overflow.

This fork makes `RelationalModel#toJSON` cycle-safe by default:

- During a `toJSON` pass, the library tracks already visited objects in `options._visited` (a `WeakSet` when available, otherwise an array).
- If a model is encountered again in the same pass, it returns a minimal representation to break the recursion: `{ id: model.id }` when an id exists, otherwise a shallow clone of its attributes.
- The same `options` object is propagated to nested `toJSON` calls to preserve the visited set.

Recommendations:

- Prefer configuring reverse relations with `includeInJSON: 'id'` (or `false`) to explicitly control payload shape and size.
- The cycle guard is a safety net to prevent crashes when configuration is incomplete, in development or production.

Note: If you manually call `toJSON` across multiple objects and want bounded deep serialization, pass the same `options` object so that `options._visited` is preserved.

## Entry points

- Browser/global build: `backbone-relational.js` (UMD/vanilla script)
- `package.json` `main` (CommonJS): `backbone-relational.js`
- `package.json` `module` / `exports.import` (ESM): `backbone-relational.mjs`

### ESM usage

```js
import Relational, { Model, Collection, HasOne, HasMany, store } from 'backbone-relational';

const Author = Model.extend({ urlRoot: '/authors/' });
```

The `.mjs` is a thin facade over the same UMD source — it imports the CommonJS
module and re-exports it via named + default exports. It also mirrors the
assignment to `Backbone.Relational` for legacy code that reaches for the global.

## Scripts

Defined in `package.json`:

| Script               | Description                                                             |
| -------------------- | ----------------------------------------------------------------------- |
| `yarn test`          | Run the full Vitest suite once (happy-dom). ~1.5 s, 139 tests.          |
| `yarn test:watch`    | Run Vitest in watch mode for local development.                         |
| `yarn test:coverage` | Run Vitest with V8 coverage. Thresholds enforced in `vitest.config.js`. |
| `yarn test:browser`  | Run the Playwright smoke specs in real browsers.                        |
| `yarn bench`         | Run the Vitest benchmark suite once (`bench/`).                         |
| `yarn docs:api`      | Generate the HTML API docs into `docs-api/` via JSDoc.                  |
| `yarn lint`          | Run ESLint on the whole repo.                                           |
| `yarn lint:fix`      | Run ESLint with `--fix` to auto-correct what can be fixed.              |
| `yarn format`        | Format every file via Prettier.                                         |
| `yarn format:check`  | Check that every file matches Prettier without writing.                 |

## Running tests

```bash
yarn test                                # Vitest suite, ~1.5 s
yarn test:watch                          # watch mode
yarn test:coverage                       # with V8 coverage gate
yarn test:browser                        # Playwright smoke tests (real browsers)
yarn playwright install chromium         # one-time: install Playwright's chromium
```

Test files live in `test/*.js` with shared fixtures and helpers under `test/setup/`. All tests use the native Vitest API (`describe`/`it`/`expect`). The Vitest configuration is in `vitest.config.js`.

Browser smoke tests live in `test-browser/` and exercise the UMD distribution path in a real engine (chromium, firefox, webkit). They're not a replacement for the Vitest suite — they only check that script-tag loading still exposes a usable `Backbone.Relational`.

## Project structure

```
.
├─ backbone-relational.js       # Library source (single-file UMD, ES2022)
├─ backbone-relational.mjs      # ESM wrapper (re-exports from the UMD)
├─ test/                        # Vitest test suite
│  ├─ setup/
│  │  ├─ environment.js         # Boots Backbone/_/$ and the AJAX mock
│  │  ├─ objects.js             # Fixture models (Zoo, Animal, …)
│  │  └─ data.js                # Fixture instances (person1, ourHouse, …)
│  └─ *.js                      # 11 test files, 139 tests, native Vitest API
├─ test-browser/                # Playwright smoke tests
│  ├─ index.html                # Page that script-tag-loads the lib
│  └─ smoke.spec.js             # API surface + HasMany + store dedup specs
├─ bench/relations.bench.js     # Vitest bench() suite
├─ vitest.config.js             # Vitest configuration (happy-dom + bench + coverage)
├─ playwright.config.js         # Playwright configuration
├─ .jsdoc.json                  # JSDoc config for `yarn docs:api`
├─ eslint.config.mjs            # ESLint flat config (v10)
├─ .prettierrc.json             # Prettier configuration
├─ .github/workflows/           # CI workflows (test, browser, bench, docs,
│                               #   release-please, stale, all workflow_dispatch
│                               #   only until billing is enabled)
├─ .github/renovate.json        # Renovate dependency-update config
├─ .github/release-please-*.json # release-please config + manifest
├─ codecov.yml                  # Codecov project + patch coverage gates
├─ index.html                   # Demo/landing page (repo site)
├─ docs/                        # Usage + architecture + migration docs
├─ static/                      # Landing-page assets
├─ CHANGELOG.md                 # Release notes (maintained by release-please)
├─ SECURITY.md                  # Vulnerability disclosure policy
├─ package.json                 # npm package metadata + scripts
├─ yarn.lock                    # Lockfile (Yarn 4)
├─ LICENSE.txt                  # MIT license
└─ README.md                    # This file
```

## Browser support

The library is ES2022 UMD : it uses `const`/`let`, arrow functions, template literals, optional chaining, and spread, which all major browsers have supported for years. Runtime target is anything that runs your Backbone version.

Testing happens at two levels :

- **Logic** : Vitest with happy-dom (Node) — fast, covers every relation, event, and edge case (`yarn test`, 139 tests).
- **Distribution path** : Playwright smoke tests in real chromium / firefox / webkit (`yarn test:browser`) — checks that `<script src=…>` loading works end-to-end.

## Versioning and releases

Current version: see `package.json` (`version` field). Release notes live in [`CHANGELOG.md`](./CHANGELOG.md), formatted per [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and following [Semantic Versioning](https://semver.org/spec/v2.0.0.html). For releases ≤ 0.10.0 (upstream), see the legacy notes in [`index.html`](./index.html#change-log).

## Contributing

See [`CONTRIBUTING.md`](./CONTRIBUTING.md) for guidelines.

## License

Backbone-relational is released under the MIT License. See [`LICENSE.txt`](./LICENSE.txt).

## Links

- Documentation: http://backbonerelational.org
- Original project contributors: https://github.com/PaulUithol/Backbone-relational/contributors
- This fork repository: https://github.com/compuzz-eventus/Backbone-relational
