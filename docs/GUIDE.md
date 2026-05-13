# backbone-relational — Guide d'utilisation

Guide orienté **décisions** pour consommer la lib dans un projet. Pour chaque besoin courant, ce document indique l'outil approprié, comment l'utiliser, et les pièges à éviter (avec références au code source de `backbone-relational.js`).

Pour les internals (event queue, semaphore, ordre d'init, refactors passés), voir [`ARCHITECTURE.md`](./ARCHITECTURE.md).

---

## Table des matières

1. [À qui s'adresse ce guide](#1-à-qui-sadresse-ce-guide)
2. [Modèle mental : Store, Model, Relation](#2-modèle-mental--store-model-relation)
3. [Définir une relation 1-1 (HasOne)](#3-définir-une-relation-1-1-hasone)
4. [Définir une relation 1-N (HasMany)](#4-définir-une-relation-1-n-hasmany)
5. [Relations bidirectionnelles (`reverseRelation`)](#5-relations-bidirectionnelles-reverserelation)
6. [Sérialisation propre (`includeInJSON`, cycles)](#6-sérialisation-propre-includeinjson-cycles)
7. [Chargement à la demande vs automatique](#7-chargement-à-la-demande-vs-automatique)
8. [Polymorphisme (`subModelTypes`)](#8-polymorphisme-submodeltypes)
9. [Déduplication d'instances (`findOrCreate`)](#9-déduplication-dinstances-findorcreate)
10. [Écouter les changements (events)](#10-écouter-les-changements-events)
11. [Références circulaires et déclarations différées](#11-références-circulaires-et-déclarations-différées)
12. [Nettoyer le store entre tests](#12-nettoyer-le-store-entre-tests)
13. [Référence : options de relation](#13-référence--options-de-relation)
14. [Référence : méthodes Model & Collection](#14-référence--méthodes-model--collection)
15. [Matrice de décision : quand utiliser quoi](#15-matrice-de-décision--quand-utiliser-quoi)

---

## 1. À qui s'adresse ce guide

Tu connais Backbone (`Model`, `Collection`, `sync`) et tu veux exploiter `backbone-relational` au maximum sans réinventer ce qu'il fait déjà. Le guide te dit **quand** utiliser chaque feature, **comment** la câbler dans ton code, et **quels pièges** elle a.

Pré-requis :

```html
<script src="underscore.js"></script>
<script src="backbone.js"></script>
<script src="backbone-relational.js"></script>
```

Toutes les classes vivent sous `Backbone.Relational.*` (`Model`, `Collection`, `HasOne`, `HasMany`, `Relation`, `Semaphore`, `BlockingQueue`, `store`). Voir `backbone-relational.js:67`.

---

## 2. Modèle mental : Store, Model, Relation

Trois acteurs suffisent pour comprendre 90 % de la lib.

### 2.1 Le Store global

Singleton accessible via `Backbone.Relational.store` (`backbone-relational.js:626`). Il maintient **une instance par id par type** : deux appels `Animal.findOrCreate({id: 1, ...})` retournent **le même** objet JavaScript. C'est ce qui permet aux relations de "se retrouver" même quand des modèles sont créés à des endroits différents du code.

Conséquence pratique : tu n'as pas besoin de "registre de modèles" maison. Le store fait office de cache d'identité.

### 2.2 Le Model relationnel

`Backbone.Relational.Model` étend `Backbone.Model` et :
- déclare un tableau `relations: [...]` (lu à `extend()`),
- garde les relations résolues dans `this._relations` (map par clé),
- expose `getAsync`, `getRelation`, `getIdsToFetch`, `findOrCreate`, `find` en plus de l'API Backbone.

```js
var Zoo = Backbone.Relational.Model.extend({
    urlRoot: '/zoo/',
    relations: [
        { type: Backbone.Relational.HasMany, key: 'animals', relatedModel: 'Animal' }
    ]
});
```

### 2.3 La Relation

Une instance de `HasOne` ou `HasMany` est créée **par instance hôte** au premier `set()` (`backbone-relational.js:1445`). Elle :
- normalise le contenu brut de la clé (ids, objets, `Collection`),
- résout les modèles liés via le store,
- écoute les events du store (`relational:add`, `relational:remove`, `relational:change:id`) pour se mettre à jour quand de nouveaux modèles entrent en jeu.

C'est aussi la Relation qui déclenche `autoFetch` (`backbone-relational.js:712-714`).

### 2.4 L'eventQueue

Pendant `new Model({...})` et `model.set(...)`, les events `change`, `add`, `remove`, `reset` sont **mis en attente** dans `module.eventQueue` (`backbone-relational.js:193`). Ils ne se déclenchent qu'une fois toutes les relations stabilisées. Tu n'as donc jamais à observer un état partiel — un handler `change` voit toujours un modèle cohérent. Détails : [`ARCHITECTURE.md`](./ARCHITECTURE.md#23-eventqueue--file-globale-des-change-events).

### 2.5 Ordre exact à la construction

```
new Model(attrs, opts)
  ├─ eventQueue.block()
  ├─ Backbone constructor → set(attrs)
  │   └─ initializeRelations()
  │       └─ pour chaque relation :
  │           new Relation(instance, options)
  │             ├─ setKeyContents()  ← extrait ids
  │             ├─ findRelated()     ← résout via store.findOrCreate
  │             ├─ setRelated()
  │             ├─ initialize()      ← spécifique HasOne / HasMany
  │             └─ si autoFetch → getAsync()
  ├─ eventQueue.unblock() → flush des events accumulés
  └─ _queue.unblock() → handlers d'init différés (addRelated, etc.)
```

Repère-toi sur cette séquence pour comprendre pourquoi tel hook se déclenche à tel moment.

---

## 3. Définir une relation 1-1 (HasOne)

**Quand l'utiliser** : un Post a un Author, une Order a un Customer, un Profile a un User. Chaque côté pointe vers un seul modèle.

### 3.1 Forme minimale

```js
var Author = Backbone.Relational.Model.extend({
    urlRoot: '/authors/'
});

var Post = Backbone.Relational.Model.extend({
    urlRoot: '/posts/',
    relations: [
        {
            type: Backbone.Relational.HasOne,
            key: 'author',
            relatedModel: Author
        }
    ]
});
```

### 3.2 Comportement

| Tu écris | Ce qui se passe |
|---|---|
| `new Post({ author: 42 })` | Le store cherche `Author#42`. S'il n'existe pas, il crée un stub `Author({id:42})`. `post.get('author')` renvoie l'instance. |
| `new Post({ author: { id: 42, name: 'X' } })` | Idem, mais l'instance est peuplée avec `name`. Si elle existait déjà, ses attributs sont **fusionnés** (merge). |
| `new Post({ author: existingAuthor })` | L'instance fournie est utilisée telle quelle. |
| `post.set('author', null)` | La relation est cassée, `change:author` est émis. |
| `post.get('author')` | Retourne le `Model` lié ou `null`, **jamais** un id brut (voir invariant 5 dans ARCHITECTURE). |

### 3.3 Pièges

- **Stub ≠ chargé** : `new Post({author: 42})` crée un `Author` qui n'a que `{id: 42}`. Pour le peupler depuis le serveur, fais `post.get('author').fetch()` ou `post.getAsync('author')`.
- **`includeInJSON` par défaut = `true`** (`backbone-relational.js:728`) : `post.toJSON()` sérialise l'auteur entier, ce qui crée des payloads énormes et des cycles. Configure-le presque toujours (voir §6).
- **L'attribut est remplacé** : après `post.set('author', 42)`, `post.attributes.author` contient le **Model**, pas `42`. Pour récupérer l'id brut, lis-le via `post.get('author').id`.

---

## 4. Définir une relation 1-N (HasMany)

**Quand l'utiliser** : un Zoo a des Animals, un Server a des Instances, un Customer a des Orders. Le côté "many" est une `Backbone.Relational.Collection`.

### 4.1 Forme minimale

```js
var Instance = Backbone.Relational.Model.extend({
    urlRoot: '/instances/'
});

var InstanceCollection = Backbone.Relational.Collection.extend({
    model: Instance
});

var Server = Backbone.Relational.Model.extend({
    urlRoot: '/servers/',
    relations: [
        {
            type: Backbone.Relational.HasMany,
            key: 'instances',
            relatedModel: Instance,
            collectionType: InstanceCollection
        }
    ]
});
```

`server.get('instances')` renvoie une `InstanceCollection`. Tu peux faire `server.get('instances').add({...})` — le nouvel item sera automatiquement lié au serveur si la reverse est configurée (§5).

### 4.2 `collectionType` (recommandé mais optionnel)

Si omis, c'est une `Backbone.Relational.Collection` générique. Tu en as besoin dès que tu veux :
- un `url` custom sur la collection (pour des fetches nested : `/servers/:id/instances`),
- un `comparator`,
- des méthodes spécifiques sur la collection (`getActiveOnes()`, etc.).

Référence collection comme classe **ou** string : `collectionType: 'InstanceCollection'` fonctionne si `window.InstanceCollection` (ou un `modelScope` enregistré) le résout (`backbone-relational.js:1048`).

### 4.3 `collectionOptions` — options par instance hôte

Fonction qui reçoit l'instance parent et renvoie les options passées au constructeur de la collection (`backbone-relational.js:1041, 1082`). Utile pour les URLs nested :

```js
{
    type: Backbone.Relational.HasMany,
    key: 'instances',
    relatedModel: 'Instance',
    collectionType: 'InstanceCollection',
    collectionOptions: function (server) {
        return { url: '/servers/' + server.id + '/instances' };
    }
}
```

```js
var InstanceCollection = Backbone.Relational.Collection.extend({
    model: Instance,
    initialize: function (models, options) {
        options || (options = {});
        this.url = options.url;
    }
});
```

Exemple complet dans `test/setup/objects.js:254-284`.

### 4.4 `collectionKey` — accès parent → collection

Par défaut, la collection liée reçoit un attribut nommé d'après la **reverse relation** pointant vers le parent (`backbone-relational.js:1091`). Tu peux :
- mettre `collectionKey: 'owningServer'` pour nommer la clé toi-même,
- mettre `collectionKey: false` pour la désactiver.

### 4.5 Pièges

- **Collection alimentée ≠ collection chargée** : `server.get('instances').length` peut être > 0 même si rien n'a été fetché — la lib crée des stubs à partir des ids.
- **`Backbone.Collection` natif ne déclenche pas les reverse hooks** (cf. README) : utilise toujours `Backbone.Relational.Collection.extend()`.
- **Les sets de `HasMany` font de l'union par défaut**, pas du remplacement. Pour remplacer : `coll.reset(newModels)` ou `model.set('instances', new_array, {remove: true})`.

---

## 5. Relations bidirectionnelles (`reverseRelation`)

**Quand l'utiliser** : à chaque fois qu'une relation a un sens dans les deux directions. Si `Server` a des `Instance`s, alors chaque `Instance` a un `Server`. Tu veux pouvoir naviguer dans les deux sens **sans** déclarer la relation deux fois et **sans** maintenance manuelle quand tu attaches/détaches.

### 5.1 Comment ça marche

Tu déclares la relation **d'un seul côté**, avec une sous-section `reverseRelation`. La lib :
1. enregistre cette reverse au store (`backbone-relational.js:297`),
2. l'applique rétroactivement à toutes les instances de `relatedModel` déjà créées (`retroFitRelation`, ligne 373),
3. la pose automatiquement sur toutes celles à créer ensuite.

```js
var Server = Backbone.Relational.Model.extend({
    urlRoot: '/servers/',
    relations: [
        {
            type: Backbone.Relational.HasMany,
            key: 'instances',
            relatedModel: 'Instance',
            reverseRelation: {
                key: 'server',
                includeInJSON: 'id'
            }
        }
    ]
});

var Instance = Backbone.Relational.Model.extend({
    urlRoot: '/instances/'
    // PAS de relations:[] — la reverse est posée automatiquement
});

var s = new Server({id: 1});
var i = new Instance({id: 10});
s.get('instances').add(i);
i.get('server') === s; // → true, sans rien câbler
```

### 5.2 Symétrie de propagation

Quand une relation bidirectionnelle est en place, **toute** mutation propage l'autre côté :

| Tu fais | Effet automatique |
|---|---|
| `s.get('instances').add(i)` | `i.set('server', s)` |
| `i.set('server', s)` | `s.get('instances').add(i)` |
| `s.get('instances').remove(i)` | `i.unset('server')` |
| `i.set('server', s2)` | `s.get('instances').remove(i)` + `s2.get('instances').add(i)` |

C'est ça la magie principale de la lib. Si tu écris du code maison pour synchroniser deux collections, c'est probablement remplaçable par une `reverseRelation`.

### 5.3 Type implicite de la reverse

| Côté déclaré | Reverse par défaut |
|---|---|
| `HasMany` | `HasOne` (`backbone-relational.js:1038`) |
| `HasOne` | `HasMany` (`backbone-relational.js:882`) |

Pour avoir HasOne ↔ HasOne, **précise** `reverseRelation: { type: HasOne, key: ... }` explicitement.

> Note : HasMany ↔ HasMany est **interdit** (`checkPreconditions` rejette ; voir `ARCHITECTURE.md:84`). Modélise via une table de jointure (un modèle pivot) si tu en as besoin.

### 5.4 Pièges

- **`reverseRelation.key` est obligatoire** sinon aucune reverse n'est créée (silencieux).
- **`autoFetch` n'est pas hérité côté reverse** sauf si tu le mets dans `reverseRelation.autoFetch: true` explicitement.
- **`includeInJSON` côté reverse** : à configurer sinon `instance.toJSON()` ré-inclut le serveur entier → payloads gonflés + cycles. Convention sûre : `includeInJSON: 'id'` côté reverse.
- **L'ordre de déclaration ne compte pas** : tu peux déclarer `Instance` avant `Server`. Le store stocke les relations "orphelines" et les résout dès que le modèle cible est connu (`processOrphanRelations`, ligne 331).

---

## 6. Sérialisation propre (`includeInJSON`, cycles)

### 6.1 Le problème

Par défaut, `toJSON()` sérialise **tout l'objet lié** (`includeInJSON: true`, `backbone-relational.js:728`). Avec des relations bidirectionnelles, tu risques :
- un payload énorme (Server inclut Instance qui inclut Server qui inclut Instance…),
- une stack overflow si la lib ne se protégeait pas.

Cette fork **est cycle-safe** : `toJSON` détecte la récursion via `options._visited` et remplace les modèles déjà visités par `{id}` (voir README §"Cycle-safe serialization"). Mais le filet n'évite pas un payload bavard — il évite seulement le crash.

### 6.2 Les quatre valeurs de `includeInJSON`

| Valeur | Sérialisation | Cas d'usage |
|---|---|---|
| `true` (défaut) | Modèle complet via `relatedModel.toJSON()` | À éviter en pratique, surtout sur reverse |
| `'id'` | L'id seul (string/number) | **Cas par défaut recommandé** : envoyer la clé étrangère |
| `['id', 'name']` | Sous-ensemble d'attributs | Si le serveur attend un objet projeté |
| `false` | Exclu du JSON | Si la relation est purement client-side |

```js
{
    type: HasMany,
    key: 'instances',
    relatedModel: 'Instance',
    includeInJSON: 'id',              // forward : envoyer juste les ids
    reverseRelation: {
        key: 'server',
        includeInJSON: 'id'           // reverse : pareil, pour éviter le cycle
    }
}
```

### 6.3 Convention recommandée

| Côté | `includeInJSON` typique |
|---|---|
| HasOne forward | `'id'` (ou clé string spécifique : `'name'` pour des slug-as-fk) |
| HasMany forward | `'id'` ou `false` (souvent on ne POSTe pas les enfants en bloc) |
| Reverse (auto-générée) | `'id'` ou `false` |

Configure systématiquement — les défauts t'amèneront à des bugs subtils en prod.

### 6.4 `keyDestination` — renommer la clé en sortie

Si l'API attend `author_id` mais ton attribut côté client s'appelle `author` :

```js
{ type: HasOne, key: 'author', keyDestination: 'author_id', relatedModel: 'Author', includeInJSON: 'id' }
```

À l'inverse, `keySource` indique d'où **lire** la clé brute en entrée — utile pour normaliser un payload serveur asymétrique :

```js
// serveur envoie : { author_id: 42 }, on veut model.get('author')
{ type: HasOne, key: 'author', keySource: 'author_id', relatedModel: 'Author' }
```

Voir `backbone-relational.js:656-657, 702-705`.

---

## 7. Chargement à la demande vs automatique

C'est la décision qui change le plus la performance perçue de ton app. Trois mécanismes coexistent.

### 7.1 Décision rapide

| Tu veux… | Outil |
|---|---|
| Tirer les liés à chaque construction d'un hôte | `autoFetch: true` sur la relation |
| Tirer uniquement sur action utilisateur (clic, route) | `model.getAsync(key)` manuel, **pas** d'`autoFetch` |
| Forcer un refetch de modèles déjà résolus | `model.getAsync(key, {refresh: true})` |
| Une seule requête pour N enfants | `Collection.url = function(models) {…}` |
| Précharger en idle un set d'hôtes probables | boucle sur `getAsync` en `requestIdleCallback` |

### 7.2 `autoFetch` — fetch implicite à la construction

```js
{ type: HasOne, key: 'address', relatedModel: 'Address', autoFetch: true }
{ type: HasMany, key: 'instances', relatedModel: 'Instance', autoFetch: {
    success: function (model, response) { /* … */ },
    error:   function (model, response) { /* … */ }
}}
```

Déclenché dans le constructeur de `Relation` (`backbone-relational.js:712-714`). Une seule fois — pas redéclenché sur les `set` suivants.

**À utiliser quand** :
- la relation est **toujours** nécessaire pour rendre l'hôte (rare),
- l'app charge un seul hôte à la fois (page de détail, pas une liste).

**À éviter quand** :
- tu construis une liste de N hôtes (N fetches en cascade — chaque hôte tire ses liés),
- les liés sont volumineux ou non utilisés tant que l'utilisateur n'a pas cliqué.

### 7.3 `getAsync` — fetch explicite à la demande

Retourne une promesse (`jQuery.Deferred` ou équivalent selon `Backbone.$`), résolue avec le contenu de la relation (`backbone-relational.js:1564-1677`).

```js
server.getAsync('instances')
    .then(function (instances) {
        // instances est ce que server.get('instances') renvoie : ici une Collection
    });

// avec options Backbone.sync
server.getAsync('instances', {
    refresh: true,
    success: function (model, response, opts) { /* par id fetché */ },
    error:   function (model, response, opts) { /* idem */ }
});
```

Options notables :

| Option | Effet |
|---|---|
| `refresh: true` | Re-fetch les ids déjà résolus en plus de ceux qui manquent |
| `add` / `remove` (par défaut `true`/`false`) | Passées à `Backbone.Collection.set` côté collection liée |
| Toute option `Backbone.sync` | Forwardée à `fetch()` (`headers`, `data`, `dataType`, etc.) |

### 7.4 Pattern type : table → détail (lazy-load)

```js
// Listing : aucun fetch lié
serversCollection.fetch();

// Clic sur une ligne
function showServerDetail (server) {
    return server.fetch()                       // remplit `instances: [ids]`
        .then(function () {
            return server.getAsync('instances'); // tire les manquants
        })
        .then(function (instances) {
            renderDetail(server, instances);
        });
}
```

**Pourquoi pas `autoFetch`** : à la construction des `Server` dans la table, on n'a pas besoin des instances. `autoFetch` les tirerait toutes — gaspillage.

### 7.5 Batch URL — N enfants en 1 requête

`getAsync` détecte automatiquement le mode batch si `Collection.url` est une **fonction** qui renvoie une URL différente quand on lui passe un tableau d'ids (`backbone-relational.js:1601-1613`) :

```js
var InstanceCollection = Backbone.Relational.Collection.extend({
    model: Instance,
    url: function (models) {
        if (models && models.length) {
            var ids = _.map(models, function (m) { return m.id || m; });
            return '/instances/set/' + ids.join(';');
        }
        return '/instances/';
    }
});
```

Sans ça, 12 ids = 12 requêtes. Avec, 12 ids = 1 requête. Le `success` est normalisé : il est appelé une fois par id, comme en mode non-batch (`backbone-relational.js:1639-1644`).

### 7.6 Pièges du chargement

- **Stub considéré résolu** : un modèle créé avec juste `{id}` (par exemple parce qu'il est arrivé en référence dans un payload) n'est **pas** rechargé par `getAsync` standard. Il faut `{refresh: true}`. Voir `ARCHITECTURE.md:136`.
- **`autoFetch` ne se redéclenche jamais** : utile uniquement à la construction de l'instance hôte. Pour rafraîchir, c'est `getAsync(key, {refresh: true})`.
- **Pas de dédup cross-instance pour `autoFetch`** dans le sens "deux hôtes qui se construisent en série" : chaque construction lance son cycle. Mais le store dédoublonne tout de même au niveau modèles liés (deux hôtes référençant le même enfant → 1 fetch total) — `backbone-relational.js:1057`.
- **`success`/`error` callbacks** d'`autoFetch` sont appelés **par id** en mode non-batch.

---

## 8. Polymorphisme (`subModelTypes`)

**Quand l'utiliser** : tu as une hiérarchie de modèles qui partagent un endpoint, une collection, ou des relations. Exemple : `Animal` est la base, `Dog` / `Cat` sont des sous-types, et le serveur envoie `[{type:'dog',...}, {type:'cat',...}]` dans une seule collection.

### 8.1 Forme

```js
var Animal = Backbone.Relational.Model.extend({
    urlRoot: '/animals/',
    subModelTypes: {
        'dog': 'Dog',
        'cat': 'Cat'
    },
    subModelTypeAttribute: 'type'   // (défaut : 'type')
});

var Dog = Animal.extend({
    bark: function () { /* … */ }
});

var Cat = Animal.extend({
    purr: function () { /* … */ }
});
```

`Animal.findOrCreate({type: 'dog', id: 1, name: 'Rex'})` crée un `Dog`, pas un `Animal`. La résolution se fait dans `build` → `_findSubModelType` (`backbone-relational.js:1934, 1953`).

### 8.2 Effets concrets

- **Une seule collection de store partagée** par toute la hiérarchie : `Dog.findOrCreate({id:1})` et `Animal.findOrCreate({id:1})` retournent **la même** instance.
- **Les relations sont héritées** du super-modèle. Pas besoin de redéclarer dans `Dog` / `Cat`.
- **`toJSON` ajoute automatiquement** `{type: 'dog'}` pour les sous-classes (`backbone-relational.js:1758`).
- **Une `HasMany`** avec `relatedModel: 'Animal'` accepte indifféremment des `Dog` et `Cat` et conserve leur sous-type.

### 8.3 Renommer l'attribut discriminant

```js
subModelTypeAttribute: 'kind'   // si le serveur envoie {kind: 'dog', …}
```

### 8.4 Pièges

- **L'ordre d'extend compte** : déclare les sous-modèles **après** la base. Sinon `setup` ne peut pas relier la hiérarchie au moment où il en a besoin (le store a un mécanisme orphan-relation mais pas orphan-subModels).
- **Une instance ne change pas de classe en cours de vie** : si le `type` change à `set`, l'instance reste de sa classe d'origine. Pour vraiment "muter", il faut destroy + recréer.
- **Sous-modèles dans `subModelTypes` doivent être joignables par `getObjectByName`** : soit la classe est sur le scope global, soit tu l'enregistres via `Backbone.Relational.store.addModelScope(myScope)`.

---

## 9. Déduplication d'instances (`findOrCreate`)

**Quand l'utiliser** : à chaque fois que tu instancies un modèle depuis un payload arbitraire. Le store garantit alors qu'il n'existe **qu'une seule instance** par id.

### 9.1 `Model.findOrCreate(attrs, opts)`

```js
var a = Animal.findOrCreate({id: 1, name: 'Rex'});
var b = Animal.findOrCreate({id: 1, name: 'Rex2'});
a === b;        // → true
a.get('name');  // → 'Rex2' (merge par défaut)
```

Options utiles (`backbone-relational.js:2041`) :

| Option | Effet |
|---|---|
| `create: false` | Ne crée pas si absent — retourne `null`. (Équivalent à `Model.find`.) |
| `merge: false` | Si une instance existe, ne fusionne pas les nouveaux attributs. |
| `parse: true` | Applique `model.parse(attrs)` avant le merge/create. |

### 9.2 `Model.find(attrs)` — lookup pur

Raccourci pour `findOrCreate(attrs, {create: false})` (`backbone-relational.js:2079`). Idéal pour vérifier l'existence sans effet de bord.

### 9.3 Pourquoi c'est central

Toutes les relations s'appuient là-dessus. Quand `new Server({instances: [{id:1}, {id:2}]})` s'exécute, chaque sous-objet passe par `findOrCreate`. Conséquence : si une instance était déjà en mémoire (peuplée par un autre serveur), elle est **réutilisée** et fusionnée — pas remplacée.

### 9.4 `findModel` — personnaliser le matching

Hook surchargeable si tu veux une autre clé que `id` (`backbone-relational.js:2091`) :

```js
var Customer = Backbone.Relational.Model.extend({
    idAttribute: 'uuid'
    // findModel par défaut : store.find(this, attrs) → matche sur uuid
});
```

Tu peux aussi surcharger `findModel` pour matcher sur un attribut composite si nécessaire.

### 9.5 Pièges

- **Deux modèles du même type avec le même id sont interdits** : `checkId` (`backbone-relational.js:528`) lève une erreur si tu essaies. Si tu vois ça, c'est probablement que tu instancies via `new` au lieu de `findOrCreate`.
- **`new Server({id: 1})` quand un `Server#1` existe déjà → erreur**. Toujours passer par `findOrCreate` pour des modèles potentiellement déjà en store.
- **Le store ne libère pas tout seul** : appelle `model.destroy()` (route DELETE + event `destroy` → `store.unregister`) ou directement `Backbone.Relational.store.unregister(model)` pour nettoyer.

---

## 10. Écouter les changements (events)

`backbone-relational` ajoute à Backbone une couche d'events spécifiques aux relations et garantit (via `eventQueue`) qu'aucun handler n'observe un état partiel.

### 10.1 Events que tu vas écouter

| Event | Émis par | Quand |
|---|---|---|
| `change:<key>` | Model | La relation `<key>` a changé (HasOne : nouvelle cible ; HasMany : reset/add/remove agrégé) |
| `add:<key>` | Model | Un item a été ajouté à la HasMany `<key>` |
| `remove:<key>` | Model | Un item a été retiré de la HasMany `<key>` |
| `reset:<key>` | Model | La HasMany `<key>` a été `reset` ou `sort` |
| `relational:add` | Collection | Modèle ajouté à une collection relationnelle (toutes confondues) |
| `relational:remove` | Collection | Idem retrait |
| `relational:reset` | Collection | Idem reset/sort |

### 10.2 Signatures

```js
post.on('change:author', function (model, newAuthor, options) { /* … */ });

server.on('add:instances',    function (instance, collection, options) { /* … */ });
server.on('remove:instances', function (instance, collection, options) { /* … */ });
server.on('reset:instances',  function (collection, options) { /* … */ });

instancesCollection.on('relational:add',    function (model, collection, options) { /* … */ });
instancesCollection.on('relational:remove', function (model, collection, options) { /* … */ });
instancesCollection.on('relational:reset',  function (collection, options) { /* … */ });
```

### 10.3 `relational:*` vs `add` / `remove` / `reset`

Backbone natif émet `add`, `remove`, `reset` sur les collections. La lib les met **en file** dans `eventQueue` jusqu'à ce que les relations soient stabilisées (`backbone-relational.js:2260+`). Les versions `relational:*` sont émises **après** la stabilisation et te garantissent un état cohérent.

> Règle simple : pour de la logique métier qui dépend de la cohérence des relations, écoute `relational:*`. Pour de l'UI réactive simple, `add`/`remove`/`reset` natifs marchent aussi (ils sont juste émis un peu plus tard via la queue).

### 10.4 Pièges

- **Pas de `change` parasite sur les "no-op"** : si tu fais `post.set('author', currentAuthor)` (déjà la même cible), aucun event n'est émis (invariant 1 dans `ARCHITECTURE.md`). C'est intentionnel.
- **Listeners attachés depuis `Model.initialize` voient l'init** : à ce moment, les relations ne sont pas encore stabilisées. Écoute plutôt depuis l'extérieur (vue, contrôleur).
- **Ne mute pas les options dans un handler** : la lib clone les options avant queueing (`backbone-relational.js:2282`), mais c'est fragile si tu enchaînes des trigger custom.

---

## 11. Références circulaires et déclarations différées

**Quand tu en as besoin** : `Author` a une `HasOne` vers `BestFriend` (un autre Author), ou deux modèles se référencent mutuellement et tu ne peux pas tous les déclarer avant.

### 11.1 `relatedModel` comme string

```js
var Author = Backbone.Relational.Model.extend({
    urlRoot: '/authors/',
    relations: [
        {
            type: Backbone.Relational.HasOne,
            key: 'bestFriend',
            relatedModel: 'Author'   // ← string, résolue paresseusement
        }
    ]
});
```

Au moment où la relation est utilisée, la lib résout `'Author'` via `Backbone.Relational.store.getObjectByName('Author')` (`backbone-relational.js:419`), qui parcourt les `modelScopes` enregistrés. Le premier scope est `window` (ou l'objet global Node).

### 11.2 Quand la classe n'est pas globale

Si tes modèles vivent dans `MyApp.models.Author` mais pas dans `window.Author`, enregistre le scope :

```js
Backbone.Relational.store.addModelScope(MyApp.models);
// ou plusieurs niveaux : addModelScope(MyApp)  → 'models.Author' fonctionne aussi
```

`getObjectByName` accepte des chemins pointés : `relatedModel: 'models.Author'`.

### 11.3 Relations orphelines

Si `Post.relations` référence `'Author'` mais que `Author` n'est pas encore déclaré, la relation est mise de côté dans `store._orphanRelations`. Dès qu'un nouveau modèle est créé, `processOrphanRelations` (`backbone-relational.js:331`) retente toutes les orphelines en attente.

Conséquence : **l'ordre de déclaration ne compte pas**. Tu peux importer tes modèles dans n'importe quel ordre.

### 11.4 Pièges

- **String mal orthographiée = relation silencieusement orpheline** : aucune erreur, juste pas de relation câblée. Vérifie via `myModel.getRelation('key')` (doit renvoyer une instance, pas `null`).
- **`showWarnings` désactivé** : la lib log les soucis de résolution. Garde-le à `true` (`Backbone.Relational.showWarnings = true`, défaut, ligne 73) au moins en dev.

---

## 12. Nettoyer le store entre tests

Le store est global. Si tes tests créent des modèles avec ids fixes, le deuxième test va se manger un `checkId` error parce que l'instance précédente y est encore. Solutions :

### 12.1 Reset complet

```js
beforeEach(function () {
    Backbone.Relational.store.reset();   // backbone-relational.js:610
});
```

`reset` vide les collections du store, les scopes, les sous-modèles. **Ne supprime pas** les `_reverseRelations` (intentionnel : elles décrivent ta config, pas tes données).

### 12.2 Unregister ciblé

```js
Backbone.Relational.store.unregister(Animal);            // tout un type
Backbone.Relational.store.unregister(animalInstance);    // une instance
Backbone.Relational.store.unregister(someCollection);    // une collection
```

`unregister` (`backbone-relational.js:566`) décroche les listeners et `reset([])` la collection store correspondante.

### 12.3 Pièges

- **`store.reset()` ne réinitialise pas les classes** : si tu as ré-ouvert une classe avec `extend` dans le test, l'ancien layout des relations reste. C'est rarement un problème mais ça pique si tu fais des fixtures dynamiques.
- **Les modèles globaux (singletons applicatifs) seront perdus** : ne pas appeler `reset` en cours de session utilisateur, seulement dans le setup de tests ou lors d'un logout volontaire.

---

## 13. Référence : options de relation

Toutes les clés acceptées dans `relations: [{ ... }]`. Lignes citées dans `backbone-relational.js`.

### 13.1 Options communes (HasOne et HasMany)

| Option | Type | Défaut | Description |
|---|---|---|---|
| `type` | `HasOne` / `HasMany` / string | — (obligatoire) | Type de relation. Ligne 880 / 1034. |
| `key` | string | — (obligatoire) | Nom de l'attribut côté hôte. Ligne 655. |
| `relatedModel` | Class / string | — (obligatoire) | Modèle cible. String résolue paresseusement via `getObjectByName`. Ligne 661. |
| `keySource` | string | = `key` | Clé brute côté serveur si différente. Supprimée des `attributes` après lecture. Lignes 656, 702-705. |
| `keyDestination` | string | = `key` | Clé à utiliser dans `toJSON()`. Ligne 657. |
| `includeInJSON` | bool / string / string[] | `true` | `true` = objet complet ; `'id'` = id seul ; `['a','b']` = sous-ensemble ; `false` = exclu. Ligne 728, 1771. |
| `createModels` | bool | `true` | Si `false`, n'instancie pas depuis des données brutes — exige des instances existantes. Ligne 727. |
| `parse` | bool | `false` | Si `true`, applique `relatedModel.prototype.parse` avant l'ajout. Ligne 731. |
| `autoFetch` | bool / object | `false` | `true` → fetch à la construction ; objet → options de fetch (`success`, `error`, headers…). Lignes 712, 730. |
| `reverseRelation` | object | absent | Définit la relation inverse à créer auto. Voir §13.3. Lignes 648, 679-690. |

### 13.2 Options spécifiques HasMany

| Option | Type | Défaut | Description |
|---|---|---|---|
| `collectionType` | Class / string | `Backbone.Relational.Collection` | Classe de collection. Doit hériter de `module.Collection`. Lignes 1039, 1048. |
| `collectionKey` | bool / string | `true` | `true` = nom auto (clé de la reverse) ; string = nom donné ; `false` = aucune clé. Lignes 1040, 1091. |
| `collectionOptions` | object / function(instance) | `{}` | Options passées au constructeur de la collection. La fonction reçoit l'instance hôte. Lignes 1041, 1082. |

### 13.3 Options de `reverseRelation`

| Option | Type | Description |
|---|---|---|
| `key` | string | **Obligatoire pour activer** la reverse. Si absent, aucune reverse n'est créée. |
| `type` | `HasOne` / `HasMany` | Inverse implicite : `HasOne→HasMany`, `HasMany→HasOne`. À surcharger pour `HasOne↔HasOne`. Lignes 882, 1038. |
| `includeInJSON` | bool / string / string[] | À configurer pour éviter les cycles JSON. Convention : `'id'`. |
| `autoFetch` | bool / object | Pas hérité du forward. À répéter ici si souhaité. |
| `relatedModel` | (auto) | Posée automatiquement au modèle parent. Ne pas spécifier. Ligne 685. |
| `isAutoRelation` | (auto) | Posée à `true`. Ne pas spécifier. Ligne 683. |

---

## 14. Référence : méthodes Model & Collection

### 14.1 `Backbone.Relational.Model` — instance

| Méthode | Signature | Description / ligne |
|---|---|---|
| `get(key)` | `(key)` → value/model/collection | Surcharge native ; pour une relation, renvoie le modèle/collection résolu. |
| `set(attrs, opts?)` | `(attrs, opts)` → `this` | Surcharge ; intègre `initializeRelations` + `updateRelations` + queue events. Ligne 1683. |
| `toJSON(opts?)` | `(opts)` → object | Cycle-safe via `opts._visited`. Respecte `includeInJSON`. Ligne 1749. |
| `getRelation(key)` | `(key)` → `Relation` / `null` | Récupère l'instance de Relation pour cette clé. Ligne 1518. |
| `getRelations()` | `()` → `Relation[]` | Toutes les relations de l'instance. Ligne 1526. |
| `getIdsToFetch(attr, refresh?)` | `(attr, refresh)` → `id[]` | Ids qui seraient fetchés par `getAsync`. Ligne 1536. |
| `getAsync(attr, opts?)` | `(attr, opts)` → promise | Charge les manquants ; options `refresh`, `add`, `remove`, `success`, `error`, + opts `Backbone.sync`. Ligne 1564. |
| `clone()` | `()` → `Model` | Clone sans id ni relations. Ligne 1733. |
| `queue(fn)` | `(fn)` | Ajoute à la file différée du modèle (`_queue`). Ligne 1500. |

### 14.2 `Backbone.Relational.Model` — statique

| Méthode | Signature | Description / ligne |
|---|---|---|
| `extend(proto, statics?)` | `(...)` → subclass | Surcharge ; appelle `setup()` automatiquement. Ligne 2295. |
| `findOrCreate(attrs, opts?)` | `(attrs, opts)` → `Model` | Lookup + merge ou create. Options : `create`, `merge`, `parse`. Ligne 2041. |
| `find(attrs)` | `(attrs)` → `Model` / `null` | Raccourci `findOrCreate(attrs, {create: false})`. Ligne 2079. |
| `findModel(attrs)` | `(attrs)` → `Model` / `null` | Hook surchargeable pour personnaliser le matching. Ligne 2091. |
| `build(attrs, opts?)` | `(attrs, opts)` → `Model` | Crée une instance ; résout le sous-type via `subModelTypes`. Ligne 1934. |
| `setup(superModel?)` | `()` | Appelée auto par `extend`. Initialise hiérarchie et reverse relations. Ligne 1875. |

### 14.3 `Backbone.Relational.Collection`

| Méthode | Description / ligne |
|---|---|
| `set(models, opts?)` | Surcharge ; passe par `findOrCreate` pour chaque modèle. Émet `relational:add`. Ligne 2137. |
| `_removeModels(models, opts?)` | Surcharge ; émet `relational:remove`. Ligne 2198. |
| `reset(models?, opts?)` | Surcharge ; émet `relational:reset`. Ligne 2231. |
| `sort(opts?)` | Surcharge ; émet `relational:reset`. Ligne 2246. |
| `trigger(name, ...)` | Surcharge ; met `add`/`remove`/`reset`/`sort`/`update` en `eventQueue`. Ligne 2260. |

### 14.4 `Backbone.Relational.store`

| Méthode | Description / ligne |
|---|---|
| `find(Type, item)` | Cherche dans le store sans créer. Ligne 492. |
| `register(model)` / `unregister(target)` | Gestion manuelle. Lignes 513, 566. |
| `getCollection(Type, create?)` | Collection interne pour un type. Ligne 393. |
| `getObjectByName(name)` | Résout une string en classe via les `modelScopes`. Ligne 419. |
| `addModelScope(scope)` / `removeModelScope(scope)` | Élargit la résolution de noms. Lignes 230, 238. |
| `addSubModels(map, superType)` | Enregistre une hiérarchie polymorphe (rare en usage direct). Ligne 249. |
| `reset()` | Vide le store (collections, scopes, _subModels). Préserve `_reverseRelations`. Ligne 610. |
| `processOrphanRelations()` | Retente les relations dont `relatedModel` était en string non résolue. Ligne 331. |

### 14.5 Configuration globale

| Symbole | Description |
|---|---|
| `Backbone.Relational.showWarnings` | `true` par défaut. Active les logs d'avertissement (résolution ratée, duplications, etc.). Ligne 73. |
| `Backbone.Relational.store` | Singleton du store. Ligne 626. |
| `Backbone.Relational.eventQueue` | File globale des events différés. Rarement manipulée directement. |

---

## 15. Matrice de décision : quand utiliser quoi

Tableau de référence rapide. Lis la colonne "Tu veux…" et applique la solution.

| Tu veux… | Solution |
|---|---|
| Naviguer A → B et B → A sans code de sync | **`reverseRelation`** sur la relation déclarée. §5 |
| Charger les liés à chaque construction | `autoFetch: true` sur la relation. §7.2 |
| Charger les liés uniquement au clic | **`getAsync`** dans le handler, pas d'`autoFetch`. §7.3-7.4 |
| Re-fetch des modèles déjà résolus | `getAsync(key, {refresh: true})`. §7.6 |
| Une seule requête pour N enfants | `Collection.url = function(models) {...}`. §7.5 |
| Envoyer juste les FK au serveur | `includeInJSON: 'id'` sur la relation (et la reverse). §6 |
| Recevoir une clé serveur avec un autre nom | `keySource: 'server_name'`. §6.4 |
| Renvoyer une clé serveur avec un autre nom | `keyDestination: 'server_name'`. §6.4 |
| Modèles polymorphes (dog/cat/animal) | `subModelTypes: {…}` sur le modèle de base. §8 |
| Une seule instance par id en mémoire | Toujours passer par `Model.findOrCreate`. §9 |
| Vérifier existence sans créer | `Model.find(attrs)`. §9.2 |
| Hook custom de matching | Surcharger `Model.findModel`. §9.4 |
| Lookup par string (`'MyApp.Animal'`) | `Backbone.Relational.store.addModelScope(MyApp)`. §11.2 |
| Réagir à un changement de relation | Listener `change:<key>` (HasOne) ou `add:<key>`/`remove:<key>` (HasMany). §10 |
| Réagir au niveau collection (toute Collection) | `relational:add` / `relational:remove` / `relational:reset`. §10.3 |
| URL nested par hôte (`/servers/:id/instances`) | `collectionOptions: function(instance) { return {url: …}; }` + collection lit `options.url`. §4.3 |
| Comparator/methods custom sur la collection | `collectionType: MyCollection` (qui étend `Backbone.Relational.Collection`). §4.2 |
| Cycles (Author ↔ Author) | `relatedModel: 'Author'` (string) + `toJSON` cycle-safe (auto) + `includeInJSON: 'id'`. §11 |
| Désactiver la sérialisation d'une relation | `includeInJSON: false`. §6.2 |
| Reset complet entre tests | `Backbone.Relational.store.reset()` dans `beforeEach`. §12.1 |
| Détacher une instance précise | `Backbone.Relational.store.unregister(model)` ou `model.destroy()`. §12.2 |

---

## Annexe : fichiers de tests par thématique

Quand un comportement t'intrigue, l'exemple existe presque toujours déjà.

| Fichier | Thèmes |
|---|---|
| `test/relational-model.js` | `getRelations`, `getAsync`, `autoFetch`, `clone`, `toJSON`, `findOrCreate`, polymorphisme |
| `test/has-one.js` | Toutes les particularités HasOne |
| `test/has-many.js` | HasMany, `collectionType`, `collectionKey`, `collectionOptions` |
| `test/reverse-relations.js` | `reverseRelation`, propagation, cycles, retrofit |
| `test/events.js` | `change:*`, `add:*`, `remove:*`, ordering via `eventQueue` |
| `test/relation.js` | `includeInJSON`, `createModels`, `parse`, `keySource`, `keyDestination` |
| `test/store.js` | API du store, scopes, register/unregister |
| `test/collection.js` | `relational:add/remove/reset`, comportement collection |
| `test/blocking-queue.js`, `test/semaphore.js` | Primitives bas-niveau |

Pour les fixtures partagées (modèles `Zoo`, `Animal`, `Shop`, `Customer`, etc.) : `test/setup/objects.js`.

