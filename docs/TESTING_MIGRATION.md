# Migration des tests : QUnit 1.x → Vitest natif

Les tests historiques ont été écrits contre l'API QUnit 1.x. Un shim
(`test/setup/qunit-shim.js`) les fait tourner sous Vitest sans modification.
Ce shim est une dette tolérable mais une dette quand même : il complique la
lecture, masque les features modernes de Vitest (`vi.mock`, `test.each`,
`it.concurrent`, snapshots, fixtures fluides), et oblige chaque nouveau
contributeur à apprendre deux APIs.

Ce document décrit le plan de migration incrémental.

## Statut

| Fichier | Lignes | Tests | État |
|---|---|---|---|
| `test/semaphore.js` | ~30 | 1 | ✅ **Migré** (pilote) |
| `test/blocking-queue.js` | ~120 | ~5 | À migrer |
| `test/backbone.js` | ~250 | ~10 | À migrer |
| `test/store.js` | ~300 | ~12 | À migrer |
| `test/relation.js` | ~500 | ~20 | À migrer |
| `test/collection.js` | ~700 | ~25 | À migrer |
| `test/events.js` | ~800 | ~25 | À migrer |
| `test/has-one.js` | ~900 | ~30 | À migrer |
| `test/has-many.js` | ~1300 | ~35 | À migrer |
| `test/reverse-relations.js` | ~1200 | ~30 | À migrer |
| `test/relational-model.js` | ~1500 | ~45 | À migrer |

**Ordre recommandé** : du plus petit au plus gros, pour rôder le pattern avant
de s'attaquer aux fichiers complexes (`has-many.js`, `relational-model.js`).

## Pattern de migration

Comparer `test/semaphore.js` (migré) et n'importe quel autre fichier non
migré. Les transformations sont mécaniques.

### Imports en tête

```js
// Avant : aucun import, on s'appuie sur les globals via qunit-shim
// Après :
import { describe, it, beforeEach, afterEach, expect } from 'vitest';
import { reset } from './setup/setup.js';
```

Pour les tests async, ajouter `vi`/`waitFor` selon les besoins.

### `QUnit.module` → `describe` + hooks

```js
// Avant
QUnit.module('Name', { setup: reset, teardown: cleanup });

// Après
describe('Name', () => {
    beforeEach(reset);
    afterEach(cleanup);
    // ... it() ici
});
```

### `QUnit.test` → `it`

```js
// Avant
QUnit.test('does X', 5, function () { /* ... */ });
QUnit.test('does Y', function (assert) { /* ... */ });

// Après
it('does X', () => { /* ... */ });
it('does Y', () => { /* ... */ });
```

Le `5` (`expectedAssertions` de QUnit) n'a pas d'équivalent direct en Vitest
et n'est généralement plus nécessaire : si `expect()` n'est pas appelé, le
test passe quand même. Si tu tiens à le préserver, utilise
`expect.hasAssertions()` en début de test ou compte les assertions à la main.

### Helpers d'assertion

| QUnit | Vitest |
|---|---|
| `ok(value [, msg])` | `expect(value).toBeTruthy()` |
| `notOk(value [, msg])` | `expect(value).toBeFalsy()` |
| `equal(actual, expected [, msg])` | `expect(actual).toBe(expected)` (ou `.toEqual` pour objets) |
| `strictEqual(a, b [, msg])` | `expect(a).toBe(b)` |
| `notEqual(a, b [, msg])` | `expect(a).not.toBe(b)` |
| `deepEqual(a, b [, msg])` | `expect(a).toEqual(b)` |
| `notDeepEqual(a, b [, msg])` | `expect(a).not.toEqual(b)` |
| `throws(fn, [matcher, msg])` | `expect(fn).toThrow(matcher)` |
| `assert.expect(N)` | (retirer — voir ci-dessus) |

> Le message QUnit (3ème argument) disparaît dans Vitest. La trace de pile
> et le nom du `it()` portent l'info contextuelle. Si un message était
> vraiment porteur, intègre-le dans le nom du test (`it('does X when Y')`).

### Tests asynchrones

```js
// Avant
QUnit.test('async X', function (assert) {
    var done = assert.async();
    someAsync().then(function () {
        ok(true);
        done();
    });
});

// Après
it('async X', async () => {
    await someAsync();
    expect(true).toBe(true);   // ou une vraie assertion
});
```

Pour les Backbone fetch mockés via `window.requests`, ne pas oublier de
résoudre la requête (`requests[0].respond(200, {...})`).

### Globals encore utilisables

`window.Backbone`, `window._`, `window.$`, `window.requests`, les fixtures
(`window.Zoo`, `window.Animal`, etc.) restent globales — exposées par
`test/setup/environment.js` qui est chargé en `setupFile`. La migration
**n'oblige pas** à les importer.

> Évolution propre (optionnelle) : remplacer ces globals par des imports
> explicites (`import _ from 'underscore';` etc.). À faire en *deuxième*
> passe, fichier par fichier, après la migration QUnit → Vitest.

## Workflow conseillé

1. Choisir un fichier (le plus petit non migré, voir tableau).
2. Lancer juste ce fichier en watch : `yarn test:watch test/<file>.js`.
3. Transformer mécaniquement les blocs `QUnit.module` / `QUnit.test`.
4. Convertir les assertions ligne à ligne.
5. Lancer le fichier seul, corriger ce qui casse.
6. Lancer la suite complète (`yarn test`) pour s'assurer qu'aucune fuite de
   state inter-fichier n'a été introduite.
7. Commiter `test: migrate <file>.js to native Vitest API`.

## Quand virer le shim ?

Une fois tous les fichiers migrés :
1. Retirer `./test/setup/qunit-shim.js` du tableau `setupFiles` dans
   `vitest.config.js`.
2. Supprimer le fichier `test/setup/qunit-shim.js`.
3. Lancer la suite — si elle passe, commiter
   `chore(tests): drop QUnit shim now that all tests are native Vitest`.
