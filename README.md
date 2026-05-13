# Backbone-relational

Backbone-relational provides one-to-one, one-to-many and many-to-one relations between models for [Backbone](https://github.com/jashkenas/backbone). It augments `Backbone.Model` and `Backbone.Collection` to keep related models in sync.

Documentation: http://backbonerelational.org

—

## Overview

This repository contains the Backbone-relational library and its tests. The library is a single-file module intended for use in browser environments alongside Backbone and Underscore/Lodash.

## Tech stack

- Language: JavaScript (browser)
- Library: Backbone.js (peer dependency)
- Utility: Underscore (default) or Lodash (optional via alias)
- Test runner: Karma
- Test framework: QUnit
- Bundler for tests: Browserify (with optional `aliasify` transform)
- Package managers: npm and Yarn (both lockfiles present); Bower metadata is also provided

## Requirements

- Node.js (an LTS version is recommended)
- npm or Yarn
- A browser to run/debug tests locally:
  - Headless: PhantomJS (used in CI via Karma)
  - Local debug: Google Chrome

## Installation

Clone the repo and install dev dependencies:

```bash
# using npm
npm install

# or using Yarn
yarn install
```

Backbone-relational itself is a single file (`backbone-relational.js`). If you consume it directly in the browser, make sure Backbone and Underscore (or Lodash) are loaded first.

If you use Bower, metadata is available in `bower.json` with `main` set to `backbone-relational.js`.

## Usage

Include the script after Backbone and Underscore (or Lodash):

```html
<script src="underscore.js"></script>
<script src="backbone.js"></script>
<script src="backbone-relational.js"></script>
```

Then define relations on your `Backbone.Model` subclasses (see the documentation site for full API and examples).

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
- `bower.json` `main`: `backbone-relational.js`

## Scripts

Defined in `package.json`:

- `npm test` — Run the test suite once in PhantomJS via Karma.
- `npm run test:debug` — Start Karma in watch mode with Chrome for local debugging.

Notes:

- Tests are bundled with Browserify. By default, Underscore is used. To alias Underscore to Lodash for tests, Karma supports a `lodash` flag. Example:
  - Using npm: `npm test -- --lodash true` or `karma start --single-run --browsers PhantomJS --lodash true`
  - Using debug: `npm run test:debug -- --lodash true`

## Running tests

```bash
# run once in PhantomJS
npm test

# or with Yarn
yarn test

# debug in Chrome with file watching
npm run test:debug
```

Test files live in `test/*.js` with setup helpers under `test/setup/`. The Karma configuration is in `karma.conf.js`.

## Environment variables

No mandatory environment variables are required for running the library or tests.

Optional Karma flag:

- `lodash` (boolean): when true, tests alias `underscore` to `lodash` via `aliasify`.

## Project structure

```
.
├─ backbone-relational.js       # Library source (single-file)
├─ test/                        # QUnit tests and setup
│  ├─ setup/
│  └─ *.js
├─ karma.conf.js                # Karma test runner configuration
├─ index.html                   # Demo/landing page (repo site)
├─ static/                      # Site assets
├─ package.json                 # npm package metadata and scripts
├─ yarn.lock / package-lock.json# Lockfiles
├─ bower.json                   # Bower metadata
├─ LICENSE.txt                  # MIT license
└─ README.md                    # This file
```

## Browser support

The test suite is configured for PhantomJS (headless) and Chrome (local debug). Actual runtime compatibility depends on the Backbone/Underscore versions you use.

## Versioning and releases

The current `package.json` lists version `0.10.5`.

TODO:

- Document the release process (tags, changelog, publishing to npm/bower, website update).

## Contributing

See `CONTRIBUTING.md` for guidelines.

## License

Backbone-relational is released under the MIT License. See [`LICENSE.txt`](LICENSE.txt).

## Links

- Documentation: http://backbonerelational.org
- Original project contributors: https://github.com/PaulUithol/Backbone-relational/contributors
- This fork repository: https://github.com/compuzz-eventus/Backbone-relational
