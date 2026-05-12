# backbone-relational — Architecture interne

Document de référence sur le comportement interne du plugin. Garde-le à jour quand le code change.

## 1. Layout du fichier

Tout vit dans `backbone-relational.js` (~2100 lignes), exposé via IIFE qui supporte AMD, CommonJS, et global. Le paramètre de l'IIFE s'appelle `module` (l'objet exporté), à ne pas confondre avec le `module` Node.

```
module.Semaphore      — mixin compteur (acquire/release/isLocked)
module.BlockingQueue  — file FIFO bloquante, hérite de Semaphore
module.eventQueue     — instance singleton de BlockingQueue
module.Store          — registre global des modèles + relations
module.store          — instance singleton de Store
module.Relation       — classe de base
module.HasOne         — relation 1-1
module.HasMany        — relation 1-N (related = Collection)
module.Model          — Backbone.Model + relations
module.Collection     — Backbone.Collection avec overrides
```

`module.Model.extend()` est patché en bas du fichier pour appeler `setup()` automatiquement, qui initialise les reverseRelations.

## 2. Concepts clés

### 2.1 Semaphore — compteur de verrous

`acquire()` incrémente `_permitsUsed`, `release()` décrémente. `isLocked()` retourne `_permitsUsed > 0`. Utilisé partout pour empêcher la récursion (un Model est "locked" pendant son `set`, pendant l'init de ses relations, etc.).

### 2.2 BlockingQueue — file différée

```
add(fn) ─ si bloquée, push dans _queue ; sinon, exécute immédiatement
block()  ─ acquire()
unblock()─ release() ; si plus bloquée, process() pour vider la file
process()─ copie la file dans une locale, vide _queue, exécute chaque fn
```

Le `process()` recopie la file AVANT de la vider, pour que les `add` faits par les handlers (cas typique : un handler queue d'autres events) soient traités dans l'ordre naturel — voir le commentaire lignes 140-149.

### 2.3 eventQueue — file globale des change events

`module.eventQueue` est utilisée pour différer les events `change`, `change:*`, `add:*`, `remove:*`, `reset:*` jusqu'à ce que toutes les relations soient stabilisées.

- **Bloquée** par : `Model.constructor`, `Model.set`, `Collection.trigger` indirectement (chacun appelle `block()` à l'entrée, `unblock()` au finally).
- **Déclenche** la vidange dès que l'imbrication la plus externe finit.

Pendant qu'elle est bloquée, tout `model.trigger('change…')` ou `coll.trigger('add'/'remove'/'reset'/'sort'/'update')` est mis en attente. C'est ce qui garantit qu'un consommateur n'observe pas un état partiellement reconstruit lors d'une cascade.

### 2.4 BlockingQueue par modèle (`_queue`)

Chaque `Model` a un `this._queue = new BlockingQueue()` bloqué dans le constructeur et débloqué par `processQueue()` quand le modèle est `_isInitialized` et pas en `_deferProcessing`. Utilisé par `Relation.addRelated` via `model.queue(fn)` pour attendre que le modèle finisse son init avant de continuer une mutation de relation.

## 3. Store — registre global

`module.store` (instance unique) maintient :

- `_collections` — une `Backbone.Collection` par "racine de hiérarchie de modèle" (un même supermodèle partage sa collection avec ses sous-modèles). Sert au lookup `findOrCreate`.
- `_reverseRelations` — descripteurs des reverse relations déjà enregistrées (pour éviter les doublons).
- `_orphanRelations` — relations dont le `relatedModel` n'a pas encore été résolu (string non encore exposé sur le scope).
- `_subModels` — table de correspondance superModelType → subModelTypes.
- `_modelScopes` — où chercher un modèle par nom de string (`getObjectByName`). Par défaut, contient le `root` (window/global).

### 3.1 register / unregister / checkId / update

- `register(model)` — ajoute le modèle à la collection store (qui correspond à sa racine de hiérarchie). Préserve `model.collection` (l'éventuelle collection utilisateur).
- `checkId(model, id)` — refuse d'instancier deux modèles avec le même id par type. Lève une erreur.
- `update(model)` — appelé par `Model.set` quand `id` change. Met à jour les index `_byId` de la collection store via `_onModelEvent` ; déclenche `relational:change:id` (signal pour `HasOne.tryAddRelated`).
- `unregister(modelOrCollOrType)` — décroche `listenTo`s, retire de la collection. Sur un type complet, fait un `reset([])`.

### 3.2 Résolution de modèles par nom

`getObjectByName('A.B.C')` split le nom sur `.`, parcourt `_modelScopes` jusqu'à trouver. Permet `relatedModel: 'Zoo'` au lieu d'une référence directe (utile pour les cycles).

## 4. Relation — classe de base

```
new Relation(instance, options, opts)
```

Le constructeur :
1. Fusionne `options` avec `Relation.prototype.options` (defaults: `createModels=true`, `includeInJSON=true`, `isAutoRelation=false`, `autoFetch=false`, `parse=false`).
2. Résout `relatedModel` (peut être une fonction, une string, ou un constructeur).
3. `checkPreconditions()` (model/key/relatedModel présents, héritage de `module.Model`, pas de HasMany ↔ HasMany, key pas déjà prise).
4. Si `reverseRelation.key` est défini et que c'est pas une auto-relation, enregistre la reverse relation côté store.
5. Si `instance` est fourni : `setKeyContents(get(key))`, push dans `instance._relations[key]`, appelle `initialize(opts)` (spécifique HasOne/HasMany), déclenche `autoFetch` si configuré (§4.3), écoute `destroy`/`relational:add`/`relational:remove` sur la `relatedCollection`.

### 4.1 setRelated

```js
setRelated(related) {
    this.related = related;
    this.instance.attributes[this.key] = related;
}
```

**Effet de bord majeur** : écrase la valeur brute mise dans `attributes[key]` par `Backbone.Model.set` avec l'objet relationnel résolu (Model ou Collection). Si on a fait `animal.set('livesIn', 'z1')`, Backbone met `'z1'` dans `attributes`, puis `setRelated` le remplace par le modèle Zoo correspondant.

### 4.2 getReverseRelations(model?)

Pour chaque modèle dans `model` (ou `this.related` / `this.related.models`), retourne les relations qui sont la reverse de celle-ci. Utilisé pour propager add/remove vers le côté inverse.

### 4.3 autoFetch

Option par-relation qui déclenche automatiquement un fetch des modèles non-encore-chargés au moment de la construction de l'instance hôte.

**Déclenchement** : ligne 669-671, à la fin du constructeur `Relation`, juste après `this.initialize(opts)` :

```js
if (this.options.autoFetch) {
    this.instance.getAsync(this.key, _.isObject(this.options.autoFetch) ? this.options.autoFetch : {});
}
```

**Configuration** :

| Valeur | Comportement |
|---|---|
| `false` / absent | Pas de fetch (défaut) |
| `true` | Fetch avec options vides `{}` |
| `{ success, error, ... }` | Fetch avec ces options (forwardées à `Backbone.sync`) |

**Flow** : `getAsync(key, opts)` calcule `idsToFetch` à partir de `rel.keyId`/`rel.keyIds` (les ids référencés mais pas encore matérialisés en modèles peuplés), puis :
- tente un fetch batch via `coll.url(idsToFetch)` si la `Collection` du `relatedModel` fournit une URL différente pour un set d'ids ;
- sinon, un `model.fetch(opts)` par id manquant.

Les modèles déjà résolus au store (présents dans `rel.related.models`) sont exclus via `_.difference(keyIds, _.pluck(related.models, 'id'))` en sortie de `findRelated` (L1057). D'où : deux Shops qui référencent le même customer ne lancent qu'**une** requête au total.

**Cas HasOne** : si `keyContents` est une string (id sans données), `findRelated` ne crée pas l'instance (car `_.isObject('id') === false` dans `findOrCreate`), `keyId` reste set. `getAsync` voit `idsToFetch = [keyId]`, crée alors un `findOrCreate({id: keyId})` (cette fois un objet ⇒ création), puis `model.fetch`. Une requête.

**Cas HasMany** : chaque id non-résolu génère un fetch séparé (sauf si la coll a une URL batch). `success`/`error` sont invoqués **N fois** (une par fetch), pas une seule fois en agrégé.

**Limitations à connaître** :

- **Une fois seulement** — `autoFetch` ne se redéclenche pas sur les `set` ultérieurs. Pour rafraîchir, appeler `getAsync(key, {refresh: true})` manuellement.
- **Pas de refresh automatique des stubs** — un modèle déjà au store mais jamais fetch (créé avec juste un `{id}` par exemple) est considéré "résolu" et exclu de `idsToFetch`. Il faut `{refresh: true}` pour le forcer.
- **Pas de batching cross-instances** — N constructions = N cycles de fetches indépendants.
- **Auto-relations** — la reverse générée automatiquement (`isAutoRelation: true`) n'hérite d'`autoFetch` que si l'user l'a mis explicitement dans `reverseRelation.autoFetch`.
- **Pendant la construction** — `fetch` renvoie un Deferred immédiat, le reste est async. Pas de race avec l'`eventQueue` bloquée du constructeur.

## 5. HasOne

`related` est un `Backbone.Model` ou `null`.

### 5.1 onChange — handler central

Déclenché par `relational:change:<key>` (émis par `Model.updateRelations`) ou par `HasOne.addRelated`/`removeRelated` (qui passent `options.__related`).

```
- bail-out si this.isLocked() (anti-récursion)
- acquire()
- changed = options.__related undefined ? on traite un set utilisateur : on traite une notif de relation
- oldRelated = changed ? this.related : options.__related
- si changed:
    - setKeyContents(attr)            ; normalise en {id, keyContents}
    - related = findRelated(options)  ; lookup ou findOrCreate
    - setRelated(related)             ; écrase attributes[key]
- si oldRelated && this.related !== oldRelated:
    - getReverseRelations(oldRelated).removeRelated(this.instance)
- getReverseRelations(this.related).addRelated(this.instance)
- si this.related === oldRelated && _.isEmpty(this.related.changed):
    - delete this.instance.changed[this.key]   ← cleanup spurious "changed"
- sinon, !options.silent:
    - this.changed = true
    - eventQueue.add(() => trigger('change:'+key, instance, related, options, true))
- release()
```

Le cleanup `delete this.instance.changed[this.key]` est **critique** : `Backbone.Model.set('livesIn', 'z1')` voit `attributes.livesIn = <Zoo model>` ≠ `'z1'`, donc met `livesIn` dans `changed`. Puis `HasOne.onChange` résout `'z1'` vers le même Zoo (no-op), restaure `attributes.livesIn = <Zoo>`, mais `this.changed[livesIn]` est resté. Sans le `delete`, un `change` event va se déclencher en queue alors qu'il ne s'est rien passé sémantiquement.

**Voir** : commits `c61129b` (revert 7b40025) et `ee639c1` (restore pre-7e00ac4) qui ont restauré ce cleanup après deux refactors malheureux.

### 5.2 addRelated / removeRelated

Appelés par le côté reverse (un HasMany typiquement) pour notifier ce HasOne. Passent par `model.queue` pour attendre que le modèle finisse son init, puis re-déclenchent `onChange` avec `options.__related = oldRelated`.

## 6. HasMany

`related` est une `module.Collection` (par défaut, ou `collectionType` custom).

### 6.1 onChange

```
- setKeyContents(attr)                       ; calcule keyIds[]
- this.changed = false
- related = findRelated(options)             ; peuple/met-à-jour la collection
- setRelated(related)
- !options.silent: eventQueue.add(() => {
      if (this.changed) trigger('change:'+key, …, true)
  })
```

`this.changed` est mis à `true` par `handleAddition` / `handleRemoval` (les events `relational:add`/`relational:remove` de la collection). Si rien n'a vraiment changé, `this.changed` reste à `false` et l'event n'est pas émis.

### 6.2 findRelated

- Si `keyContents` est déjà une Collection : la prépare (collectionKey, listeners) et la prend telle quelle.
- Sinon : itère sur les items (ids ou objects), résout en modèles, appelle `related.set(toAdd, {parse: false})` sur la collection cible.

### 6.3 handleAddition / handleRemoval / handleReset

Branchés sur `relational:add`, `relational:remove`, `relational:reset` de la `related` collection (events émis par le Collection.set/remove/reset overridés, voir §8).

- `handleAddition(model)` : `this.changed = true`, propage `addRelated` aux reverse relations, queue `add:<key>` sur l'instance parente.
- `handleRemoval(model)` : `this.changed = true`, propage `removeRelated`, queue `remove:<key>`.
- `handleReset()` : queue `reset:<key>`.

## 7. Model — comportement de `set`

### 7.1 Le flow

```js
set: function (key, value, options) {
    module.eventQueue.block();
    // 1. Normaliser (key, value) ou (attrs) → attributes
    // 2. checkId(this, newId)
    // 3. Backbone.Model.prototype.set.apply(this, arguments)
    //    → met à jour this.attributes
    //    → calcule this.changed = { … }
    //    → trigger change:<attr> et change (en queue, voir §7.2)
    // 4. Si premier set: initializeModelHierarchy + (register si id) + initializeRelations
    // 5. Sinon, si newId !== id: store.update(this)
    // 6. Si attributes: this.updateRelations(attributes, options)
    //    → pour chaque relation dont la key est dans attributes:
    //      trigger 'relational:change:<key>' → onChange du Relation
    module.eventQueue.unblock();  // vide la file
    return result;
}
```

### 7.2 trigger override

Tout `trigger('change' | 'change:*')` est intercepté :

- si `eventQueue` est **débloquée** → fire immédiatement (cas trivial, hors set).
- sinon → push une closure dans la file. La closure recompute si l'event est encore légitime au moment du process.

Logique du process pour `change` :
- `changed = this.hasChanged() || this._attributeChangeFired`
- `_attributeChangeFired` flag est set quand un `change:<attr>` a été émis pour un attribut non-relationnel pendant que la queue est bloquée. Sert à conserver la trace même si `this.changed` a été muté par d'autres set imbriqués.

Logique du process pour `change:<attr>` :
- si `attr` n'est pas une key de relation → fire et set `_attributeChangeFired = true`.
- si `attr` est une relation :
    - si l'event vient d'une relation (`args[4] === true`) → fire, et set `this.changed[attr] = newValue` (objet relationnel propre).
    - sinon (vient de `Backbone.Model.set`) → fire **seulement si** `rel.changed === true`. Sinon, `delete this.changed[attr]` pour qu'un `change` queueé ultérieurement ne se déclenche pas inutilement.

L'invariant : un seul `change:<key>` est émis par relation, soit "depuis Backbone.set" soit "depuis la relation", jamais les deux. Le flag `args[4] === true` distingue les deux.

### 7.3 updateRelations

```js
_.each(this._relations, rel => {
    if (rel.keySource in changedAttrs || rel.key in changedAttrs) {
        var value = this.attributes[rel.keySource] || this.attributes[rel.key];
        if (rel.related !== value || (value === null && attr === null)) {
            this.trigger('relational:change:' + rel.key, this, value, options);
        }
    }
    // nettoyage keySource si différent de key
});
```

Ce trigger fait passer dans `HasOne.onChange` ou `HasMany.onChange`. Il n'est pas dans la file (`relational:*` n'est pas un event `change*`).

### 7.4 _attributeChangeFired

Flag transitoire sur le modèle, set à `true` quand un `change:<non-relation-attr>` est traité depuis la file. Lu par le handler de `change` (queueé). Reset à `false` à la lecture.

Raison d'être : entre le moment où Backbone.set met `this.changed = {foo: …}` et le moment où la queue traite le `change`, un autre `set` peut avoir réinitialisé `this.changed = {}`. Le flag conserve la trace que "quelque chose a réellement changé".

## 8. Collection — overrides

`module.Collection.prototype.set` est wrappée :
- short-circuit si le collection.model n'est pas une `module.Model` (pas relationnel).
- pré-traite chaque `model` via `_prepareModel` qui appelle `findOrCreate` (au lieu d'un `new` aveugle) → réutilise les instances déjà au store.
- Appelle l'original avec `{merge: false}` (le merge a déjà été fait par `findOrCreate`).
- Pour chaque modèle dans `newModels` : `trigger('relational:add', model, this)`.

Mêmes overrides pour `_removeModels` (trigger `relational:remove`), `reset` (`relational:reset`), `sort` (`relational:reset`).

`trigger` est aussi wrappé : les events `add`/`remove`/`reset`/`sort`/`update` sont mis dans `module.eventQueue` (clone des options pour éviter mutation pendant l'attente). Les autres events passent.

## 9. Historique des refactors problématiques

| Commit | Date | Diagnostic |
|--------|------|------------|
| `7e00ac4` | juillet 2025 | "refactor relation handling in toJSON and updateRelations". A supprimé le cleanup `delete this.instance.changed[this.key]` dans HasOne.onChange et ajouté la logique `originalChanged` / `beforeUpdateChanged` dans Model.set. Casse les cas no-op de relations (cf. events.js test 1). Restauration partielle dans `ee639c1`. |
| `7b40025` | juillet 2025 | "enhance relation handling with optimizations". A introduit 5 caches synchrones (`_firedChangeEvents`, `_hasChangedCache`, `_relationEventsFired`, `_inUpdateRelations`, `_hasModelChanges`) censés dédupliquer les events. En réalité : (a) le cache `_firedChangeEvents` indexé sur le tri des clés `changed` supprime des events distincts qui modifient les mêmes clés ; (b) tous les caches sont vidés au `_.defer` (microtask suivant), donc plusieurs set synchrones partagent un état corrompu. Reverté en `c61129b`. |
| `b7da281` / `6864eef` | (récent) | "try to fix stack overflow in toJSON" puis revert. Symptôme typique des effets de bord des caches ci-dessus. |

**Leçon** : la logique d'event-firing dans cette lib repose sur des invariants subtils entre `Backbone.Model.set`, le `eventQueue` bloquant, et `HasOne/HasMany.onChange`. Toute "optimisation" qui touche `this.changed`, met en cache `hasChanged()`, ou ajoute des flags de dédup doit être validée contre l'ensemble des tests `events.js` et `relational-model.js` avant merge.

## 10. Invariants à préserver

1. **`this.instance.changed[key]` doit être nettoyé** quand `HasOne.onChange` détermine que la relation n'a pas réellement bougé (même `related` object, même `changed` sur le related). Sans ça, un `change` event parasite est émis.
2. **Ne pas conserver `this.changed` à travers les appels `set`**. Backbone vide `this.changed` au début de chaque top-level set. Toute logique qui sauve+restaure cet état fait fuiter des clés entre sets, et le handler `change` queueé voit alors un état mensonger.
3. **`module.eventQueue` ne doit jamais être vidée prématurément**. Le bloc/unbloc fonctionne en pile (sémaphore). Si on `unblock()` trop tôt, des consommateurs voient un état partiel (relations pas encore reliées).
4. **`args[4] === true` est le marqueur** "cet event change:<key> vient du Relation, pas de Backbone.Model.set". Critique pour le filtrage dans le `trigger` override.
5. **`HasOne.setRelated` écrase `attributes[key]`** avec le modèle relationnel résolu. Donc après `animal.set('livesIn', 'z1')`, on lit `animal.attributes.livesIn === <Zoo model>`, pas `'z1'`.
6. **La mutation `_.defaults` dans `module.Relation` constructeur est load-bearing**. Lignes 591-593 :
    ```js
    this.reverseRelation = _.defaults(options.reverseRelation || {}, this.options.reverseRelation);
    this.options = _.defaults(options, this.options, module.Relation.prototype.options);
    ```
    Ces appels mutent le descripteur de relation passé par l'appelant — c'est volontaire. `Store.addReverseRelation` (L271-275) dédoublonne via `_.all(relation, (val, key) => val === rel[key])` : une égalité `===` sur **tous** les champs du descripteur, y compris les sous-objets `reverseRelation`. Si on clone (`_.defaults({}, options, …)`) côté constructeur, chaque construction produit un nouveau `this.options` et donc un nouveau descripteur de reverse — le dédoublonnage échoue, et chaque instance de modèle ré-enregistre la même reverse relation. Sur N parents × M enfants, c'est exponentiel (benchmarks.js "Creation and destruction" passe en timeout). **Garder la mutation**, ou refactorer le dédoublonnage pour comparer un sous-ensemble de champs (`model`, `relatedModel`, `type`, `key`) plutôt que le descripteur complet.
