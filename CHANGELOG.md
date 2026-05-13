# Changelog

All notable changes to this fork are documented here. The format is based on
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and this project
adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

Upstream Backbone-relational's own release notes (0.10.0 and earlier) live in
[`index.html`](./index.html#change-log).

## [0.10.9] — 2026-05-13

Dev-toolchain refresh. **No runtime code change** — `backbone-relational.js`
is identical to 0.10.8, so consumers can upgrade as a drop-in patch. Test
suite still green (140/140).

### Changed
- **Package manager: Yarn 1 → Yarn 4 (via Corepack).** `packageManager` now
  pins `yarn@4.14.1`. A new `.yarnrc.yml` sets `nodeLinker: node-modules`
  (no PnP, browserify-era tooling stays compatible), `enableScripts: true`,
  and `approvedGitRepositories: ["**"]` for the github-hosted `backbone`
  fork. `yarn.lock` regenerated to Yarn 4's format. `.gitignore` extended
  with the standard Yarn 4 block.
- **Test runner: Karma + browserify + QUnit → Vitest + happy-dom.** Cuts
  the run from ~6 s (headless Chrome) to ~1.5 s (Node) and removes the
  Chrome dependency entirely. The 140 existing QUnit tests are run
  unchanged through `test/setup/qunit-shim.js`, a ~150-line adapter that
  maps `QUnit.module` / `QUnit.test` / `ok` / `equal` / `assert.async` /
  `assert.expect` onto Vitest's `it` / `expect`. `karma.conf.js` removed.
  Scripts: `yarn test` (single run) and `yarn test:watch` (watch mode).
- **`peerDependencies.backbone` normalized to `"*"`.** Yarn 4 rejects the
  legacy `github:owner/repo#semver:RANGE` form for peer ranges. The
  github source still resolves through `devDependencies`; runtime
  expectations are unchanged.

### Removed
- `karma`, `karma-browserify`, `karma-chrome-launcher`, `karma-qunit`,
  `qunit`, `browserify`, `watchify`, `aliasify`, `lodash` (was only there
  for the underscore↔lodash aliasify swap in karma.conf.js).

### Fixed
- Two strict-mode incompatibilities surfaced once Vitest started
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

[0.10.9]: https://github.com/compuzz-eventus/Backbone-relational/compare/0.10.8...0.10.9
[0.10.8]: https://github.com/compuzz-eventus/Backbone-relational/compare/0.10.7...0.10.8
