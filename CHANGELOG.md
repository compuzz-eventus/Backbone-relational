# Changelog

All notable changes to this fork are documented here. The format is based on
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and this project
adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

Upstream Backbone-relational's own release notes (0.10.0 and earlier) live in
[`index.html`](./index.html#change-log).

## [0.11.0] — 2026-05-13

Major dev-toolchain refresh and modernization. The library source itself
is essentially unchanged — `backbone-relational.js` differs from 0.10.8
by 2 characters (`==` → `===` in the UMD root detection, see Fixed
below). This release modernizes everything around the source: package
manager, test runner, linter/formatter, CI, Backbone peer requirement,
and developer ergonomics.

Test suite: 140/140 OK in ~1.5 s (vs ~6 s under Karma + Chrome).

### Breaking
- **`peerDependencies.backbone` tightened from `"*"` to `">=1.7.0"`.**
  This release tracks the ES2022 modernization of the
  `compuzz-eventus/backbone` fork (now `1.7.0`). Consumers still on
  Backbone 1.6.x will see a peer-dependency warning on install.
- **`engines.node` declared as `">=22"`** to match the CI matrix.
  Older Node versions install with a warning but are not supported.

### Added
- **`yarn test:coverage`** — Vitest V8 coverage reporter. Current
  coverage on `backbone-relational.js`: **92.6 % statements, 80.4 %
  branches, 93.3 % functions** out of the box.
- **husky + lint-staged pre-commit hook** — runs `prettier --write` then
  `eslint --fix` on staged files. Wired via the `prepare` script so
  `yarn install` enables the hook automatically.
- **`yarn lint`, `yarn lint:fix`, `yarn format`, `yarn format:check`**
  scripts.
- **GitHub Actions workflow** (`.github/workflows/test.yml`) with two
  jobs in parallel: `Lint & format` (Node 24, Prettier check + ESLint)
  and `tests` (matrix Node 22 + 24).
- **`.git-blame-ignore-revs`** so `git blame` skips the Prettier reformat
  commit and surfaces the real authors.
- **`.gitattributes`** normalizing line endings to LF across the repo.

### Changed
- **Package manager: Yarn 1 → Yarn 4 (via Corepack).** `packageManager`
  now pins `yarn@4.14.1`. New `.yarnrc.yml` with `nodeLinker: node-modules`
  (no PnP, browserify-era tooling stays compatible), `enableScripts: true`,
  and `approvedGitRepositories: ["**"]` for the github-hosted Backbone
  fork. `yarn.lock` regenerated.
- **Backbone bumped to 1.7.0** (ES2022 modernization,
  `compuzz-eventus/backbone` commit `26271ba9`).
- **Test runner: Karma + browserify + QUnit → Vitest + happy-dom.**
  Removes the Chrome dependency entirely. The 140 existing QUnit tests
  run unchanged through `test/setup/qunit-shim.js`, a ~150-line adapter
  that maps `QUnit.module` / `QUnit.test` / `ok` / `equal` /
  `assert.async` / `assert.expect` onto Vitest's `it` / `expect`.
- **Lint: ESLint 9 (`.eslintrc.json`) → ESLint 10 flat config
  (`eslint.config.mjs`).** Style rules removed (delegated to Prettier).
  Metric rules (`eqeqeq`, `no-shadow`, `no-undef`,
  `no-unused-expressions`, etc.) preserved, with targeted relaxations
  for the legacy source and tests.
- **Format: Prettier 3** introduced. Convention: tabs/4, single quotes,
  no trailing comma, LF, `printWidth: 120`. JSON/YAML/Markdown stay in
  spaces/2.
- **CI: Travis → GitHub Actions.** `.travis.yml` targeted Node 8 +
  PhantomJS + karma-cli — completely obsolete.
- **README and CONTRIBUTING.md** rewritten to reflect the new toolchain.
- **`.editorconfig`** realigned with the actual convention (tabs/4 in
  `.js`; the file previously declared spaces/2 but the code has used
  tabs since 2011).

### Removed
- `karma`, `karma-browserify`, `karma-chrome-launcher`, `karma-qunit`,
  `qunit`, `browserify`, `watchify`, `aliasify`, `lodash` (was only
  there for the underscore↔lodash aliasify swap in `karma.conf.js`).
- `karma.conf.js`.
- `bower.json` and the `bower_components/` directory. Bower has been
  deprecated since 2017 and the upstream Backbone fork has dropped its
  Bower metadata.
- `.travis.yml`.
- `.eslintrc.json` (replaced by flat config).

### Fixed
- **`backbone-relational.js` UMD root detection** (lines 52-53):
  `self.self == self` and `global.global == global` → `===`. Strictly
  equivalent (an object compared to itself) but satisfies `eqeqeq` and
  is clearer.
- **Two strict-mode incompatibilities** surfaced once Vitest started
  evaluating test files as ES modules (Karma + browserify ran them in
  sloppy mode). Both were silent no-ops historically:
  - `test/relational-model.js` `constructor.find` test: `person = ...`
    now declared with `var`.
  - `test/reverse-relations.js` CoffeeScript-style class fixtures:
    `View.name = 'View'` / `Property.name = 'Property'` replaced with
    `Object.defineProperty(..., 'name', { value: ..., configurable: true })`
    (assigning to `Function.name` throws in strict mode).

## [0.10.8] — 2026-05-12

A focused bug-fix and hardening pass over the plugin's relation lifecycle,
event-firing precision, and the autoFetch subsystem. No new features. Five of
the fixes below ship with regression tests that have been verified to fail
when their fix commit is reverted.

### Fixed
- **`Store.unregister` silently leaked listeners under Lodash 4.** The
  Underscore/Lodash compat shim covered `any`/`all`/`contains`/`pluck` but
  not `_.invoke`, whose signature is incompatible between Underscore (iterating
  method-call) and Lodash 4 (single-object path lookup). `_.invoke` is now
  aliased to `_.invokeMap` when Lodash is detected, so `stopListening` is
  actually called on each Relation during unregister.
- **`getAsync('nonexistent')` threw `Cannot read properties of undefined`.**
  The `coll` derivation in `getAsync` dereferenced `rel.related` without
  guarding `rel`, while `idsToFetch` had the guard one line above. Both are
  now consistent.
- **`HasMany.removeRelated` crashed if `this.related` was null.** `HasOne`
  had the guard, `HasMany` didn't. Aligned.
- **`toJSON` silently swallowed every exception** from a nested `toJSON` /
  collection serialization, masking real bugs (including the stack-overflow
  symptom that motivated commits `b7da281` / `6864eef`). The fallback `catch`
  now logs a warning gated on `module.showWarnings`, while still skipping the
  bad attribute so partial serialization succeeds.
- **`trigger`'s event-name filter was too broad.** The check
  `eventName.length > 5 && eventName.indexOf('change') === 0` queued any
  event whose name started with `change` (e.g. `changeset`). The queued
  handler then set `_attributeChangeFired = true` via the "no relation,
  changed" branch, causing the next `change` event to fire even when nothing
  had actually changed. Now restricted to `change` and `change:<attr>`.
- **`Model` constructor mutated the caller's `options.collection`.**
  `delete options.collection` modified an object that callers often share
  across constructions (e.g. in loops). The constructor now uses `_.omit` to
  produce a clone and forwards it explicitly via `Backbone.Model.call`.
- **`Collection._removeModels` override polluted `Backbone.Collection`'s
  prototype.** The wrapper was placed on `Backbone.Collection.prototype`
  while every other Collection override (`set`, `reset`, `sort`, `trigger`)
  targeted `module.Collection.prototype`. Now consistent — vanilla
  Backbone.Collection instances in the same app no longer pay the wrapper
  cost. **Behavior change**: previously, a plain
  `Backbone.Collection.extend({ model: SomeRelationalModel })` half-worked
  — it emitted `relational:remove` (from the prototype-wide override) but
  not `relational:add` (which was on `module.Collection.prototype` only),
  so reverse relations updated on remove but not on add. From 0.10.8
  neither is emitted from a vanilla `Backbone.Collection`. Use
  `Backbone.Relational.Collection.extend(...)` for any collection that
  holds relational models. All in-tree tests and `index.html` examples
  have been updated accordingly.
- **`HasMany.onChange` had no recursion guard.** `HasOne.onChange` used the
  `isLocked / acquire / release` pattern to break recursion through
  `findRelated → findOrCreate → initializeRelations → addRelated → onChange`.
  `HasMany.onChange` did not, leaving it vulnerable to the same loop under
  custom `collectionType` or unusual reverse-relation graphs. Mirrored the
  pattern.
- **`initializeRelations` left the model permanently `isLocked()` on init
  throw.** A throw inside the `_.each` skipped the `this.release()` call
  below, after which `updateRelations` silently short-circuited for the rest
  of the model's lifetime. Wrapped in `try/finally`.
- **`BlockingQueue.process` dropped queued events if any handler threw.**
  `process()` snapshots `this._queue` into a local before iterating and
  empties the field. If one queued handler threw, `forEach` aborted and the
  remaining items — already moved out of the queue — were lost. Each
  handler is now isolated with `try/catch`, with the throw surfaced via
  `module.showWarnings` and processing continuing.
- **`autoFetch.success` delivered an inconsistent signature.** In the
  per-model fetch path Backbone called the user's success with
  `(model, response, options)`, but in the batch URL path it called
  `(collection, response, options)`. Same `autoFetch` declaration, two
  different shapes depending on whether `coll.url(idsToFetch)` happened to
  return a different URL from `coll.url()` — invisible to the caller.
  Normalized: the user's `success` is now called once per requested id with
  `(model, response, options)` in both paths.

### Performance
- **`processOrphanRelations` fast-path.** This is invoked from every Model
  constructor; it now returns immediately when `_orphanRelations` is empty
  (the common case once the app's model classes are all registered), avoiding
  the `slice` / `_.each` / `_.bind` overhead on hot paths.

### Documentation
- **`docs/ARCHITECTURE.md` §4.3** documents the autoFetch system: where it
  fires, the three configuration shapes (`false` / `true` / object), the
  resolution flow through `getAsync` including store-level dedup, the batch
  vs per-model paths, and the known limitations (construction-only,
  no cross-instance batching, no auto-refresh of partially-loaded stubs).
- **`docs/ARCHITECTURE.md` §10 invariant #6** records that the `_.defaults`
  mutation in the `Relation` constructor (lines 591-593) is load-bearing:
  `Store.addReverseRelation`'s dedup compares descriptors by `===` on every
  field, so cloning instead of mutating breaks dedup and produces
  exponential reverse-relation re-registration on every model construction.
  A previous review attempt to "fix" this regressed `benchmarks.js` into
  a Karma timeout.
- **Header example refreshed** from `Backbone.HasMany` (stale) to
  `Backbone.Relational.HasMany` (matches what tests use today). Copyright
  range updated to `2011-present`.
- **`Collection.set`'s forced `merge: false`** is now commented at the call
  site to explain why the caller-provided `merge` is overridden
  (`findOrCreate` has already merged the attributes once; re-merging would
  duplicate work and re-fire `change:*`).

### Added (tests)
Five regression tests now pin the highest-impact fixes above. Each was
verified to fail with its fix `git revert`'d and pass with the fix restored:

- `BlockingQueue.process` continues after a queued handler throws
- `trigger` does not pollute `_attributeChangeFired` on `'change'`-prefixed
  custom events like `'changeset'`
- `getAsync` on an unknown relation key does not throw
- `Model` constructor does not mutate the caller's `options.collection`
- `initializeRelations` releases the semaphore when a relation init throws

135 → 140 karma tests, all green.

## [0.10.7] — earlier in this session

Stabilization pass — see commit history. Restored pre-`7e00ac4`
change-tracking semantics that the upstream caches/refactors had broken
(`events.js` tests 1 and 3 regressed otherwise), and refreshed the test
toolchain (Karma 0.13 → 6, PhantomJS → ChromeHeadless, QUnit 1 → 2 with a
compat shim, jQuery 2.2 → 4.0). Backbone peerDependency retargeted to the
[`compuzz-eventus/backbone`](https://github.com/compuzz-eventus/backbone)
fork at `>=1.6.3`.

## [0.10.0] and earlier
See [`index.html` § Change Log](./index.html#change-log) for the upstream
PaulUithol release notes.

[0.11.0]: https://github.com/compuzz-eventus/Backbone-relational/compare/0.10.8...0.11.0
[0.10.8]: https://github.com/compuzz-eventus/Backbone-relational/compare/0.10.7...0.10.8
