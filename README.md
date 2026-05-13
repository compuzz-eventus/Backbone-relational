# Backbone-relational

Backbone-relational provides one-to-one, one-to-many and many-to-one relations between models for [Backbone](https://github.com/jashkenas/backbone). It augments `Backbone.Model` and `Backbone.Collection` to keep related models in sync.

Documentation: http://backbonerelational.org

—

## Overview

This repository contains the Backbone-relational library and its tests. The library is a single-file UMD module (`backbone-relational.js`) intended for use in browser environments alongside Backbone and Underscore (or Lodash). Tests run in Node via a happy-dom environment, so no browser is required for development.

## Tech stack

- **Library**: single-file UMD JavaScript (`backbone-relational.js`)
- **Peer dependency**: [Backbone.js](https://github.com/jashkenas/backbone) (this fork targets [`compuzz-eventus/backbone`](https://github.com/compuzz-eventus/backbone) ≥ 1.6.3)
- **Utility**: Underscore (default), Lodash 4 also supported via the internal compat layer
- **Test runner**: [Vitest](https://vitest.dev/) 4 with the `happy-dom` environment
- **Test API**: legacy QUnit 1.x tests run unchanged via a thin shim (`test/setup/qunit-shim.js`) that dispatches to Vitest's `it`/`expect`
- **Lint & format**: ESLint 10 (flat config) + Prettier 3
- **Package manager**: Yarn 4 via [Corepack](https://nodejs.org/api/corepack.html)
- **CI**: GitHub Actions (Node 22 + 24)

## Requirements

- **Node.js 22 or 24** (the CI matrix). Other recent LTS versions likely work but are not tested.
- **Corepack** (shipped with Node ≥ 16) — used to pin Yarn 4. Run `corepack enable` once per machine.
- **No browser is needed** to run the test suite locally; happy-dom provides the DOM in Node.

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
- `package.json` `main`: `backbone-relational.js`

## Scripts

Defined in `package.json`:

| Script              | Description                                                |
| ------------------- | ---------------------------------------------------------- |
| `yarn test`         | Run the full Vitest suite once (happy-dom).                |
| `yarn test:watch`   | Run Vitest in watch mode for local development.            |
| `yarn lint`         | Run ESLint on the whole repo.                              |
| `yarn lint:fix`     | Run ESLint with `--fix` to auto-correct what can be fixed. |
| `yarn format`       | Format every file via Prettier.                            |
| `yarn format:check` | Check that every file matches Prettier without writing.    |

## Running tests

```bash
yarn test            # single run, ~1.5s
yarn test:watch      # watch mode, re-runs on file changes
```

Test files live in `test/*.js` with shared fixtures and helpers under `test/setup/`. The Vitest configuration is in `vitest.config.js`; the QUnit-to-Vitest adapter lives in `test/setup/qunit-shim.js`.

## Project structure

```
.
├─ backbone-relational.js       # Library source (single-file UMD)
├─ test/                        # QUnit tests + setup helpers
│  ├─ setup/
│  │  ├─ environment.js         # Boots Backbone/_/$ and the AJAX mock
│  │  ├─ objects.js             # Fixture models (Zoo, Animal, …)
│  │  ├─ data.js                # Fixture instances (person1, ourHouse, …)
│  │  └─ qunit-shim.js          # QUnit 1.x → Vitest adapter
│  └─ *.js                      # The 16 test files (140 tests total)
├─ vitest.config.js             # Vitest configuration (happy-dom, setupFiles)
├─ eslint.config.mjs            # ESLint flat config (v9+)
├─ .prettierrc.json             # Prettier configuration
├─ .github/workflows/test.yml   # CI: lint job + test matrix (Node 22, 24)
├─ index.html                   # Demo/landing page (repo site)
├─ docs/                        # Architecture docs
├─ static/                      # Site assets
├─ CHANGELOG.md                 # Release notes (Keep a Changelog)
├─ package.json                 # npm package metadata + scripts
├─ yarn.lock                    # Lockfile (Yarn 4)
├─ LICENSE.txt                  # MIT license
└─ README.md                    # This file
```

## Browser support

The library itself is plain ES5 UMD and runs in any browser supported by your Backbone version. The test suite no longer requires a browser — it runs in Node with happy-dom — so "browser support" refers only to runtime targets, not the test toolchain.

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
