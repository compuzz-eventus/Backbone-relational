# Migration des tests : QUnit 1.x → Vitest natif

> **Status : terminée.** Les 11 fichiers de test ont été migrés depuis l'API
> QUnit 1.x vers l'API native Vitest (`describe`/`it`/`expect`). Le shim
> `test/setup/qunit-shim.js` a été supprimé. Ce document reste comme
> référence du pattern de migration au cas où d'autres tests legacy
> devaient être convertis (collections externes, plugins, etc.).

## Pattern de migration

### Imports en tête

```js
import { describe, it, beforeEach, afterEach, expect } from 'vitest';
import { reset } from './setup/setup.js';
// ou (pour les tests qui dépendent des fixtures Person/Company/House/…) :
import initObjects from './setup/data.js';
```

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

Le compte d'assertions QUnit (`5` ci-dessus) n'a pas d'équivalent direct en
Vitest. Si tu veux le préserver, utilise `expect.hasAssertions()` en début
de test, ou compte à la main. Dans la pratique, le nom du `it()` est plus
parlant que le compte.

### Helpers d'assertion

| QUnit | Vitest |
|---|---|
| `ok(value)` | `expect(value).toBeTruthy()` |
| `notOk(value)` | `expect(value).toBeFalsy()` |
| `equal(actual, expected)` | `expect(actual).toBe(expected)` (ou `.toEqual` pour objets) |
| `strictEqual(a, b)` | `expect(a).toBe(b)` |
| `notEqual(a, b)` | `expect(a).not.toBe(b)` |
| `deepEqual(a, b)` | `expect(a).toEqual(b)` |
| `notDeepEqual(a, b)` | `expect(a).not.toEqual(b)` |
| `throws(fn, matcher)` | `expect(fn).toThrow(matcher)` |
| `assert.expect(N)` | (retirer) |

> Le message QUnit (3ᵉ argument) disparaît dans Vitest. La trace de pile
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
    expect(true).toBe(true);
});
```

Pour les Backbone fetch mockés via `window.requests`, ne pas oublier de
résoudre la requête (`requests[0].respond(200, {...})`). Pour le pattern
deferred (`done(callback)`) — voir `test/relational-model.js` "getAsync" :
emballe le `done` callback dans un `new Promise((resolve) => {...})` et
`await` la promesse en fin de test.

### Globals encore utilisables

`window.Backbone`, `window._`, `window.$`, `window.requests`, les fixtures
(`window.Zoo`, `window.Animal`, etc.) restent globales — exposées par
`test/setup/environment.js` qui est chargé en `setupFile`.

> Évolution propre (optionnelle) : remplacer ces globals par des imports
> explicites (`import _ from 'underscore';` etc.). Pas nécessaire pour le
> bon fonctionnement des tests — c'est une question de style.
