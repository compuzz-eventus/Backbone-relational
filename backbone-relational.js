/* vim: set tabstop=4 softtabstop=4 shiftwidth=4 noexpandtab: */
/**
 * Backbone-relational.js 0.11.0
 * (c) 2011-present Paul Uithol and contributors (https://github.com/PaulUithol/Backbone-relational/graphs/contributors)
 *
 * Backbone-relational may be freely distributed under the MIT license; see the accompanying LICENSE.txt.
 * For details and documentation: https://github.com/PaulUithol/Backbone-relational.
 * Depends on Backbone (and thus on Underscore as well): https://github.com/documentcloud/backbone.
 *
 * Example:
 *
 Zoo = Backbone.Relational.Model.extend({
 relations: [ {
 type: Backbone.Relational.HasMany,
 key: 'animals',
 relatedModel: 'Animal',
 reverseRelation: {
 key: 'livesIn',
 includeInJSON: 'id'
 // 'relatedModel' is automatically set to 'Zoo'; the 'relationType' to 'HasOne'.
 }
 } ],

 toString: function() {
 return this.get( 'name' );
 }
 });

 Animal = Backbone.Relational.Model.extend({
 toString: function() {
 return this.get( 'species' );
 }
 });

 // Creating the zoo will give it a collection with one animal in it: the monkey.
 // The animal created after that has a relation `livesIn` that points to the zoo it's currently associated with.
 // If you instantiate (or fetch) the zebra later, it will automatically be added.

 var zoo = new Zoo({
 name: 'Artis',
 animals: [ { id: 'monkey-1', species: 'Chimp' }, 'lion-1', 'zebra-1' ]
 });

 var lion = new Animal( { id: 'lion-1', species: 'Lion' } ),
 monkey = zoo.get( 'animals' ).first(),
 sameZoo = lion.get( 'livesIn' );
 */
(function (factory) {
	// Establish the root object, `window` (`self`) in the browser, or `global` on the server.
	// We use `self` instead of `window` for `WebWorker` support.
	const root =
		(typeof self == 'object' && self.self === self && self) ||
		(typeof global == 'object' && global.global === global && global);

	// Set up Backbone-relational for the environment. Start with AMD.
	if (typeof define === 'function' && define.amd) {
		define(['exports', 'backbone', 'underscore'], (exports, Backbone, _) => {
			factory(exports, Backbone, _, root);
		});
	}
	// Next for Node.js or CommonJS.
	else if (typeof exports !== 'undefined') {
		factory(exports, require('backbone'), require('underscore'), root);
	}
	// Finally, as a browser global. Use `root` here as it references `window`.
	else {
		root.Backbone.Relational = factory({}, root.Backbone, root._, root);
	}
})((module, Backbone, _, root) => {
	'use strict';

	/**
	 * Backbone-relational adds one-to-one and one-to-many relations to
	 * Backbone.Model + Backbone.Collection. All public classes live under
	 * `Backbone.Relational` once the library is loaded.
	 *
	 * @namespace Backbone.Relational
	 */

	module.Collection = Backbone.Collection.extend();

	/**
	 * Global toggle for diagnostic warnings emitted via `console.warn`.
	 * Default: `true`. Set to `false` in production if you want silence.
	 *
	 * @memberof Backbone.Relational
	 * @type {boolean}
	 */
	module.showWarnings = true;

	/**
	 * Partial Underscore emulation when _ is Lodash.
	 * Please try to write code that is compatible with both, but add
	 * compatibility code below otherwise.
	 */
	if (!_.any) {
		// We have Lodash, make it imitate Underscore a bit more.
		_.any = _.some;
		_.all = _.every;
		_.contains = _.includes;
		_.pluck = _.map;
		// Lodash 4 renamed Underscore's iterating `_.invoke` to `_.invokeMap`
		// (Lodash 4's own `_.invoke` is a single-value path lookup, not iterating).
		if (_.invokeMap) {
			_.invoke = _.invokeMap;
		}
	}

	/**
	 * Counting semaphore mixin. `acquire()`/`release()` increment/decrement
	 * `_permitsUsed`; `isLocked()` is `_permitsUsed > 0`. Used internally to
	 * prevent re-entrant `set()` calls during relation initialization.
	 *
	 * @class Semaphore
	 * @memberof Backbone.Relational
	 */
	module.Semaphore = {
		_permitsAvailable: null,
		_permitsUsed: 0,

		acquire: function () {
			if (this._permitsAvailable && this._permitsUsed >= this._permitsAvailable) {
				throw new Error('Max permits acquired');
			} else {
				this._permitsUsed++;
			}
		},

		release: function () {
			if (this._permitsUsed === 0) {
				throw new Error('All permits released');
			} else {
				this._permitsUsed--;
			}
		},

		isLocked: function () {
			return this._permitsUsed > 0;
		},

		setAvailablePermits: function (amount) {
			if (this._permitsUsed > amount) {
				throw new Error('Available permits cannot be less than used permits');
			}
			this._permitsAvailable = amount;
		}
	};

	/**
	 * A FIFO queue that accumulates handlers while blocked (`block()`) and
	 * runs them when unblocked (`unblock()`). Globally used as
	 * `Backbone.Relational.eventQueue` to defer `change`/`add`/`remove`
	 * events until all relations are stabilized.
	 *
	 * @class BlockingQueue
	 * @memberof Backbone.Relational
	 * @mixes Backbone.Relational.Semaphore
	 */
	module.BlockingQueue = function () {
		this._queue = [];
	};
	_.extend(module.BlockingQueue.prototype, module.Semaphore, {
		_queue: null,

		add: function (func) {
			if (this.isBlocked()) {
				this._queue.push(func);
			} else {
				func();
			}
		},

		// Some of the queued events may trigger other blocking events. By
		// copying the queue here it allows queued events to process closer to
		// the natural order.
		//
		// queue events [ 'A', 'B', 'C' ]
		// A handler of 'B' triggers 'D' and 'E'
		// By copying `this._queue` this executes:
		// [ 'A', 'B', 'D', 'E', 'C' ]
		// The same order the would have executed if they didn't have to be
		// delayed and queued.
		process: function () {
			const queue = this._queue;
			this._queue = [];
			queue.forEach((event) => {
				// Don't let one broken handler swallow the rest of the deferred events:
				// forEach would abort on the first throw and the remaining items have already
				// been moved out of `this._queue`, so they would be lost forever.
				try {
					event();
				} catch (e) {
					module.showWarnings &&
						typeof console !== 'undefined' &&
						console.warn('BlockingQueue: queued handler threw; continuing. %o', e);
				}
			});
		},

		block: function () {
			this.acquire();
		},

		unblock: function () {
			this.release();
			if (!this.isBlocked()) {
				this.process();
			}
		},

		isBlocked: function () {
			return this.isLocked();
		}
	});
	/**
	 * Global event queue. Accumulates external events ('add:<key>', 'remove:<key>' and 'change:<key>')
	 * until the top-level object is fully initialized (see 'Backbone.Relational.Model').
	 */
	module.eventQueue = new module.BlockingQueue();

	/**
	 * Global registry of every `Backbone.Relational.Model` ever created.
	 * Maintains one collection per model-type hierarchy so that
	 * `findOrCreate({id})` always returns the same instance — this is what
	 * allows two relations to converge on the same target without explicit
	 * wiring. Accessed via `Backbone.Relational.store` (singleton).
	 *
	 * @class Store
	 * @memberof Backbone.Relational
	 * @mixes Backbone.Events
	 */
	module.Store = function () {
		this._collections = [];
		this._reverseRelations = [];
		this._orphanRelations = [];
		this._subModels = [];
		this._modelScopes = [root];
	};
	_.extend(module.Store.prototype, Backbone.Events, {
		/**
		 * Create a new `Relation`. Called by the Model constructor for each
		 * descriptor in `relations`.
		 *
		 * @memberof Backbone.Relational.Store
		 * @instance
		 * @private
		 * @param {Backbone.Relational.Model} [model]
		 * @param {Object} relation
		 * @param {Object} [options]
		 */
		initializeRelation: function (model, relation, options) {
			const type = !_.isString(relation.type)
				? relation.type
				: module[relation.type] || this.getObjectByName(relation.type);
			if (type && type.prototype instanceof module.Relation) {
				const rel = new type(model, relation, options); // Also pushes the new Relation into `model._relations`
			} else {
				module.showWarnings &&
					typeof console !== 'undefined' &&
					console.warn('Relation=%o; missing or invalid relation type!', relation);
			}
		},

		/**
		 * Register a scope (namespace object) where `getObjectByName` should
		 * look up class names declared as strings. Use this when your models
		 * live under `MyApp.models.X` rather than `window.X`.
		 *
		 * @memberof Backbone.Relational.Store
		 * @instance
		 * @param {Object} scope Any object whose keys are class names.
		 * @example
		 * Backbone.Relational.store.addModelScope(MyApp.models);
		 *
		 * // Now this works even though Author isn't on window :
		 * const Post = Backbone.Relational.Model.extend({
		 *   relations: [{
		 *     type: Backbone.Relational.HasOne,
		 *     key: 'author',
		 *     relatedModel: 'Author'  // resolved via MyApp.models.Author
		 *   }]
		 * });
		 */
		addModelScope: function (scope) {
			this._modelScopes.push(scope);
		},

		/**
		 * Unregister a previously-added scope.
		 *
		 * @memberof Backbone.Relational.Store
		 * @instance
		 * @param {Object} scope
		 */
		removeModelScope: function (scope) {
			this._modelScopes = _.without(this._modelScopes, scope);
		},

		/**
		 * Register a subModelTypes mapping. Used internally to resolve the
		 * `_superModel` of each model later in `setupSuperModel`.
		 *
		 * @memberof Backbone.Relational.Store
		 * @instance
		 * @private
		 * @param {Object} subModelTypes
		 * @param {Function} superModelType
		 */
		addSubModels: function (subModelTypes, superModelType) {
			this._subModels.push({
				superModelType: superModelType,
				subModels: subModelTypes
			});
		},

		/**
		 * If `modelType` is registered as a subModel via `addSubModels`,
		 * wire up its `_superModel`, `_subModelTypeName`, and
		 * `_subModelTypeAttribute` so polymorphic resolution works.
		 *
		 * @memberof Backbone.Relational.Store
		 * @instance
		 * @private
		 * @param {Function} modelType
		 */
		setupSuperModel: function (modelType) {
			_.find(
				this._subModels,
				_.bind(function (subModelDef) {
					return _.filter(
						subModelDef.subModels || [],
						_.bind(function (subModelTypeName, typeValue) {
							const subModelType = this.getObjectByName(subModelTypeName);

							if (modelType === subModelType) {
								// Set 'modelType' as a child of the found superModel
								subModelDef.superModelType._subModels[typeValue] = modelType;

								// Set '_superModel', '_subModelTypeValue', and '_subModelTypeAttribute' on 'modelType'.
								modelType._superModel = subModelDef.superModelType;
								modelType._subModelTypeValue = typeValue;
								modelType._subModelTypeAttribute =
									subModelDef.superModelType.prototype.subModelTypeAttribute;
								return true;
							}
						}, this)
					).length;
				}, this)
			);
		},

		/**
		 * Register a reverse relation : added to the `relations` prototype
		 * of the target model AND retro-fitted on existing instances. The
		 * usual entry point is the `reverseRelation` option on a forward
		 * relation, not this method.
		 *
		 * @memberof Backbone.Relational.Store
		 * @instance
		 * @private
		 * @param {Object} relation
		 */
		addReverseRelation: function (relation) {
			const exists = _.any(this._reverseRelations, (rel) => {
				return _.all(relation || [], (val, key) => {
					return val === rel[key];
				});
			});

			if (!exists && relation.model && relation.type) {
				this._reverseRelations.push(relation);
				this._addRelation(relation.model, relation);
				this.retroFitRelation(relation);
			}
		},

		/**
		 * Deposit a `relation` whose `relatedModel` string can't be
		 * resolved yet. Retried by `processOrphanRelations` whenever a new
		 * model is created.
		 *
		 * @memberof Backbone.Relational.Store
		 * @instance
		 * @private
		 * @param {Object} relation
		 */
		addOrphanRelation: function (relation) {
			const exists = _.any(this._orphanRelations, (rel) => {
				return _.all(relation || [], (val, key) => {
					return val === rel[key];
				});
			});

			if (!exists && relation.model && relation.type) {
				this._orphanRelations.push(relation);
			}
		},

		/**
		 * Retry every orphan relation. Called by every Model constructor.
		 *
		 * @memberof Backbone.Relational.Store
		 * @instance
		 * @private
		 */
		processOrphanRelations: function () {
			// Called from every Model constructor; bail out fast when there's nothing to resolve.
			if (!this._orphanRelations.length) {
				return;
			}
			// Make sure to operate on a copy since we're removing while iterating
			_.each(
				this._orphanRelations.slice(0),
				_.bind(function (rel) {
					const relatedModel = module.store.getObjectByName(rel.relatedModel);
					if (relatedModel) {
						this.initializeRelation(null, rel);
						this._orphanRelations = _.without(this._orphanRelations, rel);
					}
				}, this)
			);
		},

		/**
		 * @memberof Backbone.Relational.Store
		 * @instance
		 * @private
		 * @param {Function} type
		 * @param {Object} relation
		 */
		_addRelation: function (type, relation) {
			if (!type.prototype.relations) {
				type.prototype.relations = [];
			}
			type.prototype.relations.push(relation);

			_.each(
				type._subModels || [],
				_.bind(function (subModel) {
					this._addRelation(subModel, relation);
				}, this)
			);
		},

		/**
		 * Apply a relation to every existing instance of its target model.
		 *
		 * @memberof Backbone.Relational.Store
		 * @instance
		 * @private
		 * @param {Object} relation
		 */
		retroFitRelation: function (relation) {
			const coll = this.getCollection(relation.model, false);
			coll &&
				coll.each(
					_.bind((model) => {
						if (!(model instanceof relation.model)) {
							return;
						}

						const rel = new relation.type(model, relation);
					}, this)
				);
		},

		/**
		 * The internal store collection for a given model type. All
		 * instances of that type are tracked here.
		 *
		 * @memberof Backbone.Relational.Store
		 * @instance
		 * @param {Backbone.Relational.Model} type Model class.
		 * @param {boolean} [create=true] Create the collection if none
		 *     exists for this type.
		 * @returns {?Backbone.Relational.Collection}
		 */
		getCollection: function (type, create) {
			if (type instanceof module.Model) {
				type = type.constructor;
			}

			let rootModel = type;
			while (rootModel._superModel) {
				rootModel = rootModel._superModel;
			}

			let coll = _.find(this._collections, (item) => {
				return item.model === rootModel;
			});

			if (!coll && create !== false) {
				coll = this._createCollection(rootModel);
			}

			return coll;
		},

		/**
		 * Resolve a model class given as a string. Dotted names are split
		 * and walked through each registered model scope. Returns the
		 * resolved class, or `undefined` if no scope contains it.
		 *
		 * @memberof Backbone.Relational.Store
		 * @instance
		 * @param {string} name e.g. `'Animal'` or `'MyApp.models.Animal'`.
		 * @returns {?Function}
		 */
		getObjectByName: function (name) {
			const parts = name.split('.');
			let type = null;

			_.find(
				this._modelScopes,
				_.bind((scope) => {
					type = _.reduce(
						parts || [],
						(memo, val) => {
							return memo ? memo[val] : undefined;
						},
						scope
					);

					if (type && type !== scope) {
						return true;
					}
				}, this)
			);

			return type;
		},

		/**
		 * Create the internal collection used by the store for `type`.
		 *
		 * @memberof Backbone.Relational.Store
		 * @instance
		 * @private
		 * @param {Function|Backbone.Relational.Model} type
		 * @returns {?Backbone.Relational.Collection}
		 */
		_createCollection: function (type) {
			let coll;

			// If 'type' is an instance, take its constructor
			if (type instanceof module.Model) {
				type = type.constructor;
			}

			// Type should inherit from Backbone.Relational.Model.
			if (type.prototype instanceof module.Model) {
				coll = new module.Collection();
				coll.model = type;

				this._collections.push(coll);
			}

			return coll;
		},

		/**
		 * Extract the id of `item`, whatever form it takes (string/number,
		 * Model instance, or attributes hash containing the idAttribute).
		 *
		 * @memberof Backbone.Relational.Store
		 * @instance
		 * @private
		 * @param {Function} type
		 * @param {string|number|Object|Backbone.Relational.Model} item
		 * @returns {?(string|number)}
		 */
		resolveIdForItem: function (type, item) {
			let id = _.isString(item) || _.isNumber(item) ? item : null;

			if (id === null) {
				if (item instanceof module.Model) {
					id = item.id;
				} else if (_.isObject(item)) {
					id = item[type.prototype.idAttribute];
				}
			}

			// Make all falsy values `null` (except for 0, which could be an id.. see '/issues/179')
			if (!id && id !== 0) {
				id = null;
			}

			return id;
		},

		/**
		 * Find an existing instance of `type` in the store. Pure lookup,
		 * never creates. Use `Model.findOrCreate(item)` when you may need
		 * to create.
		 *
		 * @memberof Backbone.Relational.Store
		 * @instance
		 * @param {Function} type Model class.
		 * @param {string|number|Object|Backbone.Relational.Model} item
		 *     An id, an attributes hash containing the idAttribute, or a
		 *     Model instance.
		 * @returns {?Backbone.Relational.Model}
		 */
		find: function (type, item) {
			const id = this.resolveIdForItem(type, item),
				coll = this.getCollection(type);

			// Because the found object could be of any of the type's superModel
			// types, only return it if it's actually of the type asked for.
			if (coll) {
				const obj = coll.get(id);

				if (obj instanceof type) {
					return obj;
				}
			}

			return null;
		},

		/**
		 * Add `model` to the store collection for its type. Preserves the
		 * user-facing `model.collection` reference if one was already set.
		 * Called automatically by the Model constructor when an id is
		 * present.
		 *
		 * @memberof Backbone.Relational.Store
		 * @instance
		 * @param {Backbone.Relational.Model} model
		 */
		register: function (model) {
			const coll = this.getCollection(model);

			if (coll) {
				const modelColl = model.collection;
				coll.add(model);
				model.collection = modelColl;
			}
		},

		/**
		 * Validate that `model` can claim `id` — i.e. no other instance of
		 * the same type already owns it. Throws if a duplicate is detected.
		 *
		 * @memberof Backbone.Relational.Store
		 * @instance
		 * @private
		 * @param {Backbone.Relational.Model} model
		 * @param {string|number} [id]
		 * @throws {Error} On duplicate id.
		 */
		checkId: function (model, id) {
			const coll = this.getCollection(model),
				duplicate = coll?.get(id);

			if (duplicate && model !== duplicate) {
				if (module.showWarnings && typeof console !== 'undefined') {
					console.warn('Duplicate id! Old RelationalModel=%o, new RelationalModel=%o', duplicate, model);
				}

				throw new Error(
					'Cannot instantiate more than one Backbone.Relational.Model with the same id per type!'
				);
			}
		},

		/**
		 * Refresh a model's id-based index in the store collection. Called
		 * by `Model.set` when the id changes.
		 *
		 * @memberof Backbone.Relational.Store
		 * @instance
		 * @private
		 * @param {Backbone.Relational.Model} model
		 */
		update: function (model) {
			const coll = this.getCollection(model);

			// Register a model if it isn't yet (which happens if it was created without an id).
			if (!coll.contains(model)) {
				this.register(model);
			}

			// This triggers updating the lookup indices kept in a collection
			coll._onModelEvent(`change:${model.idAttribute}`, model, coll);

			// Trigger an event on model so related models (having the model's new id in their keyContents) can add it.
			model.trigger('relational:change:id', model, coll);
		},

		/**
		 * Remove a model, a collection, or every instance of a type from
		 * the store. Stops listening and detaches the target so it can be
		 * garbage-collected.
		 *
		 * @memberof Backbone.Relational.Store
		 * @instance
		 * @param {Backbone.Relational.Model|Backbone.Relational.Collection|Function} type
		 *     A model instance to unregister, a collection (all its models),
		 *     or a model class (every instance of that type).
		 * @example
		 * // Drop a single instance
		 * Backbone.Relational.store.unregister(animal);
		 *
		 * // Drop every Animal in the store
		 * Backbone.Relational.store.unregister(Animal);
		 */
		unregister: function (type) {
			let coll, models;

			if (type instanceof Backbone.Model) {
				coll = this.getCollection(type);
				models = [type];
			} else if (type instanceof module.Collection) {
				coll = this.getCollection(type.model);
				models = _.clone(type.models);
			} else {
				coll = this.getCollection(type);
				models = _.clone(coll.models);
			}

			_.each(
				models,
				_.bind(function (model) {
					this.stopListening(model);
					_.invoke(model.getRelations(), 'stopListening');
				}, this)
			);

			// If we've unregistered an entire store collection, reset the collection (which is much faster).
			// Otherwise, remove each model one by one.
			if (_.contains(this._collections, type)) {
				coll.reset([]);
			} else {
				_.each(
					models,
					_.bind((model) => {
						if (coll.get(model)) {
							coll.remove(model);
						} else {
							coll.trigger('relational:remove', model, coll);
						}
					}, this)
				);
			}
		},

		/**
		 * Empty the store : drop all model instances and clear the
		 * scopes. Keeps `_reverseRelations` (the registered descriptors)
		 * since wiping them would force every model class to re-register
		 * its inverse relations.
		 *
		 * Most useful in test setup. Calling this mid-session in an app
		 * will detach all currently-known models from the store.
		 *
		 * @memberof Backbone.Relational.Store
		 * @instance
		 * @example
		 * // In a Vitest setup file
		 * import { beforeEach } from 'vitest';
		 * beforeEach(() => {
		 *   Backbone.Relational.store.reset();
		 *   Backbone.Relational.store.addModelScope(window);
		 * });
		 */
		reset: function () {
			this.stopListening();

			// Unregister each collection to remove event listeners
			_.each(
				this._collections,
				_.bind(function (coll) {
					this.unregister(coll);
				}, this)
			);

			this._collections = [];
			this._subModels = [];
			this._modelScopes = [root];
		}
	});
	module.store = new module.Store();

	/**
	 * Base class for `HasOne` and `HasMany`. One instance per (host model,
	 * relation key) pair. Created at the model's first `set()`, lives
	 * thereafter on `instance._relations[key]`. Internally fires
	 * `relational:<key>` events to regulate addition/removal of related
	 * models.
	 *
	 * Consumers don't construct `Relation` directly — declare them via the
	 * `relations: []` array on the host `Backbone.Relational.Model`. See
	 * `docs/GUIDE.md` for full usage.
	 *
	 * @class Relation
	 * @memberof Backbone.Relational
	 * @mixes Backbone.Events
	 * @mixes Backbone.Relational.Semaphore
	 *
	 * @param {Backbone.Relational.Model} [instance] Host model. If omitted,
	 *     the constructor only registers the optional `reverseRelation` on the
	 *     store and returns without further side effects.
	 * @param {Object} options Relation descriptor.
	 * @param {string} options.key Attribute name on the host model.
	 * @param {Function|string} options.relatedModel Target model class or its
	 *     string name (resolved lazily through `store.getObjectByName`).
	 * @param {boolean|string|string[]} [options.includeInJSON=true] What to
	 *     serialize when the host's `toJSON()` runs — `true` for the full
	 *     model, a string for one attribute, an array for several, or
	 *     `false` to exclude.
	 * @param {boolean} [options.createModels=true] If `false`, refuses to
	 *     create new models from raw data; only resolves existing ones.
	 * @param {string} [options.keySource] Attribute name on the *input* data
	 *     if it differs from `key` (consumed and removed from `attributes`).
	 * @param {string} [options.keyDestination] Attribute name to write to
	 *     in `toJSON()` if it differs from `key`.
	 * @param {boolean|Object} [options.autoFetch=false] Fetch unresolved
	 *     models at construction. Pass an object to forward to `fetch`.
	 * @param {boolean} [options.parse=false] Run `relatedModel.parse()` on
	 *     raw data before instantiation.
	 * @param {Object} [options.reverseRelation] Auto-generate the inverse
	 *     relation on `relatedModel`. Requires a `key` to fire. `type` is
	 *     inferred (`HasOne` → `HasMany` and vice versa) but can be
	 *     overridden.
	 * @param {Object} [opts] Backbone-style options forwarded to internal
	 *     `set` / `change` calls during initialization.
	 */
	module.Relation = function (instance, options, opts) {
		this.instance = instance;
		// Make sure 'options' is sane, and fill with defaults from subclasses and this object's prototype
		options = _.isObject(options) ? options : {};
		this.reverseRelation = _.defaults(options.reverseRelation || {}, this.options.reverseRelation);
		this.options = _.defaults(options, this.options, module.Relation.prototype.options);

		this.reverseRelation.type = !_.isString(this.reverseRelation.type)
			? this.reverseRelation.type
			: module[this.reverseRelation.type] || module.store.getObjectByName(this.reverseRelation.type);

		this.key = this.options.key;
		this.keySource = this.options.keySource || this.key;
		this.keyDestination = this.options.keyDestination || this.keySource || this.key;

		this.model = this.options.model || this.instance.constructor;

		this.relatedModel = this.options.relatedModel;

		if (_.isUndefined(this.relatedModel)) {
			this.relatedModel = this.model;
		}

		if (_.isFunction(this.relatedModel) && !(this.relatedModel.prototype instanceof module.Model)) {
			this.relatedModel = _.result(this, 'relatedModel');
		}
		if (_.isString(this.relatedModel)) {
			this.relatedModel = module.store.getObjectByName(this.relatedModel);
		}

		if (!this.checkPreconditions()) {
			return;
		}

		// Add the reverse relation on 'relatedModel' to the store's reverseRelations
		if (!this.options.isAutoRelation && this.reverseRelation.type && this.reverseRelation.key) {
			module.store.addReverseRelation(
				_.defaults(
					{
						isAutoRelation: true,
						model: this.relatedModel,
						relatedModel: this.model,
						reverseRelation: this.options // current relation is the 'reverseRelation' for its own reverseRelation
					},
					this.reverseRelation // Take further properties from this.reverseRelation (type, key, etc.)
				)
			);
		}

		if (instance) {
			let contentKey = this.keySource;
			if (contentKey !== this.key && _.isObject(this.instance.get(this.key))) {
				contentKey = this.key;
			}

			this.setKeyContents(this.instance.get(contentKey));
			this.relatedCollection = module.store.getCollection(this.relatedModel);

			// Explicitly clear 'keySource', to prevent a leaky abstraction if 'keySource' differs from 'key'.
			if (this.keySource !== this.key) {
				delete this.instance.attributes[this.keySource];
			}

			// Add this Relation to instance._relations
			this.instance._relations[this.key] = this;

			this.initialize(opts);

			if (this.options.autoFetch) {
				this.instance.getAsync(this.key, _.isObject(this.options.autoFetch) ? this.options.autoFetch : {});
			}

			// When 'relatedModel' are created or destroyed, check if it affects this relation.
			this.listenTo(this.instance, 'destroy', this.destroy)
				.listenTo(this.relatedCollection, 'relational:add relational:change:id', this.tryAddRelated)
				.listenTo(this.relatedCollection, 'relational:remove', this.removeRelated);
		}
	};
	// Fix inheritance :\
	module.Relation.extend = Backbone.Model.extend;
	// Set up all inheritable **Backbone.Relation** properties and methods.
	_.extend(module.Relation.prototype, Backbone.Events, module.Semaphore, {
		options: {
			createModels: true,
			includeInJSON: true,
			isAutoRelation: false,
			autoFetch: false,
			parse: false
		},

		instance: null,
		key: null,
		keyContents: null,
		relatedModel: null,
		relatedCollection: null,
		reverseRelation: null,
		related: null,

		/**
		 * Check pre-conditions before wiring the relation. Logs warnings
		 * and returns false on misconfiguration.
		 * @private
		 * @returns {boolean}
		 */
		checkPreconditions: function () {
			const i = this.instance,
				k = this.key,
				m = this.model,
				rm = this.relatedModel,
				warn = module.showWarnings && typeof console !== 'undefined';

			if (!m || !k || !rm) {
				warn && console.warn('Relation=%o: missing model, key or relatedModel (%o, %o, %o).', this, m, k, rm);
				return false;
			}
			// Check if the type in 'model' inherits from Backbone.Relational.Model
			if (!(m.prototype instanceof module.Model)) {
				warn &&
					console.warn('Relation=%o: model does not inherit from Backbone.Relational.Model (%o).', this, i);
				return false;
			}
			// Check if the type in 'relatedModel' inherits from Backbone.Relational.Model
			if (!(rm.prototype instanceof module.Model)) {
				warn &&
					console.warn(
						'Relation=%o: relatedModel does not inherit from Backbone.Relational.Model (%o).',
						this,
						rm
					);
				return false;
			}
			// Check if this is not a HasMany, and the reverse relation is HasMany as well
			if (this instanceof module.HasMany && this.reverseRelation.type === module.HasMany) {
				warn &&
					console.warn(
						'Relation=%o: relation is a HasMany, and the reverseRelation is HasMany as well.',
						this
					);
				return false;
			}
			// Check if we're not attempting to create a relationship on a `key` that's already used.
			if (i && _.keys(i._relations).length) {
				const existing = _.find(
					i._relations,
					_.bind((rel) => {
						return rel.key === k;
					}, this)
				);

				if (existing) {
					warn &&
						console.warn(
							'Cannot create relation=%o on %o for model=%o: already taken by relation=%o.',
							this,
							k,
							i,
							existing
						);
					return false;
				}
			}

			return true;
		},

		/**
		 * Replace this relation's `related` reference and the corresponding
		 * attribute on the host model.
		 * @private
		 * @param {Backbone.Model|Backbone.Relational.Collection} related
		 */
		setRelated: function (related) {
			this.related = related;
			this.instance.attributes[this.key] = related;
		},

		/**
		 * Test if `relation` (on a sibling model) is the reverse of this one.
		 * @private
		 * @param {Backbone.Relational.Relation} relation
		 * @returns {boolean}
		 */
		_isReverseRelation: function (relation) {
			return (
				relation.instance instanceof this.relatedModel &&
				this.reverseRelation.key === relation.key &&
				this.key === relation.reverseRelation.key
			);
		},

		/**
		 * Reverse-relation instances pointing back to this one.
		 * @private
		 * @param {Backbone.Relational.Model} [model] If omitted, uses
		 *     `this.related`.
		 * @returns {Backbone.Relational.Relation[]}
		 */
		getReverseRelations: function (model) {
			const reverseRelations = [];
			// Iterate over 'model', 'this.related.models' (if this.related is a module.Collection), or wrap 'this.related' in an array.
			const models = !_.isUndefined(model) ? [model] : this.related && (this.related.models || [this.related]);
			let relations = null;
			let relation = null;

			for (let i = 0; i < (models || []).length; i++) {
				relations = models[i].getRelations() || [];

				for (let j = 0; j < relations.length; j++) {
					relation = relations[j];

					if (this._isReverseRelation(relation)) {
						reverseRelations.push(relation);
					}
				}
			}

			return reverseRelations;
		},

		/**
		 * Tear down this relation when the host model is destroyed. Removes
		 * the model from each reverse relation and stops listening on the
		 * store.
		 * @private
		 */
		destroy: function () {
			this.stopListening();

			if (this instanceof module.HasOne) {
				this.setRelated(null);
			} else if (this instanceof module.HasMany) {
				this.setRelated(this._prepareCollection());
			}

			_.each(
				this.getReverseRelations(),
				_.bind(function (relation) {
					relation.removeRelated(this.instance);
				}, this)
			);
		}
	});

	/**
	 * 1-to-1 relation. `related` is a single `Backbone.Relational.Model` or
	 * `null`. The host's attribute (`get(key)`) returns the resolved model,
	 * not the raw id.
	 *
	 * @class HasOne
	 * @extends Backbone.Relational.Relation
	 * @memberof Backbone.Relational
	 */
	module.HasOne = module.Relation.extend({
		options: {
			reverseRelation: { type: 'HasMany' }
		},

		initialize: function (opts) {
			this.listenTo(this.instance, `relational:change:${this.key}`, this.onChange);

			const related = this.findRelated(opts);
			this.setRelated(related);

			// Notify new 'related' object of the new relation.
			_.each(
				this.getReverseRelations(),
				_.bind(function (relation) {
					relation.addRelated(this.instance, opts);
				}, this)
			);
		},

		/**
		 * Resolve and return the related model from the current
		 * `keyContents`. Returns `null` if nothing matches.
		 * @private
		 * @param {Object} [options]
		 * @returns {?Backbone.Model}
		 */
		findRelated: function (options) {
			let related = null;

			options = _.defaults({ parse: this.options.parse }, options);

			if (this.keyContents instanceof this.relatedModel) {
				related = this.keyContents;
			} else if (this.keyContents || this.keyContents === 0) {
				// since 0 can be a valid `id` as well
				const opts = _.defaults({ create: this.options.createModels }, options);
				related = this.relatedModel.findOrCreate(this.keyContents, opts);
			}

			// Nullify `keyId` if we have a related model; in case it was already part of the relation
			if (related) {
				this.keyId = null;
			}

			return related;
		},

		/**
		 * Normalize `keyContents` to an id for easier comparison.
		 * @private
		 * @param {string|number|Backbone.Model} keyContents
		 */
		setKeyContents: function (keyContents) {
			this.keyContents = keyContents;
			this.keyId = module.store.resolveIdForItem(this.relatedModel, this.keyContents);
		},

		/**
		 * Internal `change:<key>` handler. Re-wires the relation to the new
		 * target and propagates the change to old/new reverse relations.
		 * @private
		 */
		onChange: function (model, attr, options) {
			// Don't accept recursive calls to onChange (like onChange->findRelated->findOrCreate->initializeRelations->addRelated->onChange)
			if (this.isLocked()) {
				return;
			}
			this.acquire();
			options = options ? _.clone(options) : {};

			// 'options.__related' is set by 'addRelated'/'removeRelated'. If it is set, the change
			// is the result of a call from a relation. If it's not, the change is the result of
			// a 'set' call on this.instance.
			const changed = _.isUndefined(options.__related),
				oldRelated = changed ? this.related : options.__related;

			if (changed) {
				this.setKeyContents(attr);
				const related = this.findRelated(options);
				this.setRelated(related);
			}

			// Notify old 'related' object of the terminated relation
			if (oldRelated && this.related !== oldRelated) {
				_.each(
					this.getReverseRelations(oldRelated),
					_.bind(function (relation) {
						relation.removeRelated(this.instance, null, options);
					}, this)
				);
			}

			// Notify new 'related' object of the new relation. Note we do re-apply even if this.related is oldRelated;
			// that can be necessary for bi-directional relations if 'this.instance' was created after 'this.related'.
			// In that case, 'this.instance' will already know 'this.related', but the reverse might not exist yet.
			_.each(
				this.getReverseRelations(),
				_.bind(function (relation) {
					relation.addRelated(this.instance, options);
				}, this)
			);

			// Fire the 'change:<key>' event if 'related' was updated
			if (this.related === oldRelated && (!this.related || _.isEmpty(this.related.changed))) {
				// No real change in the related object: cleanup the spurious key Backbone.set put in
				// `this.instance.changed`, so a queued `change` handler doesn't see a stale changed map.
				if (this.instance.changed) {
					delete this.instance.changed[this.key];
				}
			} else if (!options.silent) {
				const dit = this;
				this.changed = true;
				module.eventQueue.add(() => {
					dit.instance.trigger(`change:${dit.key}`, dit.instance, dit.related, options, true);
					dit.changed = false;
				});
			}
			this.release();
		},

		/**
		 * When a new `relatedModel` lands in the store, see if its id
		 * matches a pending `keyContents` reference here.
		 * @private
		 */
		tryAddRelated: function (model, coll, options) {
			if ((this.keyId || this.keyId === 0) && model.id === this.keyId) {
				// since 0 can be a valid `id` as well
				this.addRelated(model, options);
				this.keyId = null;
			}
		},

		addRelated: function (model, options) {
			// Allow 'model' to set up its relations before proceeding.
			// (which can result in a call to 'addRelated' from a relation of 'model')
			const dit = this;
			model.queue(() => {
				if (model !== dit.related) {
					const oldRelated = dit.related || null;
					dit.setRelated(model);
					dit.onChange(dit.instance, model, _.defaults({ __related: oldRelated }, options));
				}
			});
		},

		removeRelated: function (model, coll, options) {
			if (!this.related) {
				return;
			}

			if (model === this.related) {
				const oldRelated = this.related || null;
				this.setRelated(null);
				this.onChange(this.instance, model, _.defaults({ __related: oldRelated }, options));
			}
		}
	});

	/**
	 * 1-to-N relation. `related` is a `Backbone.Relational.Collection`
	 * (always — even when empty). Supports `collectionType`,
	 * `collectionOptions`, and `collectionKey` for customizing the
	 * underlying collection.
	 *
	 * @class HasMany
	 * @extends Backbone.Relational.Relation
	 * @memberof Backbone.Relational
	 */
	module.HasMany = module.Relation.extend({
		collectionType: null,

		options: {
			reverseRelation: { type: 'HasOne' },
			collectionType: module.Collection,
			collectionKey: true,
			collectionOptions: {}
		},

		initialize: function (opts) {
			this.listenTo(this.instance, `relational:change:${this.key}`, this.onChange);

			// Handle a custom 'collectionType'
			this.collectionType = this.options.collectionType;
			if (
				_.isFunction(this.collectionType) &&
				this.collectionType !== module.Collection &&
				!(this.collectionType.prototype instanceof module.Collection)
			) {
				this.collectionType = _.result(this, 'collectionType');
			}
			if (_.isString(this.collectionType)) {
				this.collectionType = module.store.getObjectByName(this.collectionType);
			}
			if (
				this.collectionType !== module.Collection &&
				!(this.collectionType.prototype instanceof module.Collection)
			) {
				throw new Error('`collectionType` must inherit from module.Collection');
			}

			const related = this.findRelated(opts);
			this.setRelated(related);
		},

		/**
		 * Bind events and `collectionKey` on a HasMany's backing collection.
		 * Creates a new collection of `collectionType` if `collection` is
		 * omitted.
		 * @private
		 * @param {Backbone.Relational.Collection} [collection]
		 * @returns {Backbone.Relational.Collection}
		 */
		_prepareCollection: function (collection) {
			if (this.related) {
				this.stopListening(this.related);
			}

			if (!collection || !(collection instanceof module.Collection)) {
				const options = _.isFunction(this.options.collectionOptions)
					? this.options.collectionOptions(this.instance)
					: this.options.collectionOptions;

				collection = new this.collectionType(null, options);
			}

			collection.model = this.relatedModel;

			if (this.options.collectionKey) {
				const key =
					this.options.collectionKey === true ? this.options.reverseRelation.key : this.options.collectionKey;

				if (collection[key] && collection[key] !== this.instance) {
					if (module.showWarnings && typeof console !== 'undefined') {
						console.warn(
							'Relation=%o; collectionKey=%s already exists on collection=%o',
							this,
							key,
							this.options.collectionKey
						);
					}
				} else if (key) {
					collection[key] = this.instance;
				}
			}

			this.listenTo(collection, 'relational:add', this.handleAddition)
				.listenTo(collection, 'relational:remove', this.handleRemoval)
				.listenTo(collection, 'relational:reset', this.handleReset);

			return collection;
		},

		/**
		 * Resolve the related collection from the current `keyContents`.
		 * @private
		 * @param {Object} [options]
		 * @returns {Backbone.Relational.Collection}
		 */
		findRelated: function (options) {
			let related = null;

			options = _.defaults({ parse: this.options.parse }, options);

			// Replace 'this.related' by 'this.keyContents' if it is a module.Collection
			if (this.keyContents instanceof module.Collection) {
				this._prepareCollection(this.keyContents);
				related = this.keyContents;
			}
			// Otherwise, 'this.keyContents' should be an array of related object ids.
			// Re-use the current 'this.related' if it is a module.Collection; otherwise, create a new collection.
			else {
				const toAdd = [];

				_.each(
					this.keyContents,
					_.bind(function (attributes) {
						let model = null;

						if (attributes instanceof this.relatedModel) {
							model = attributes;
						} else {
							// If `merge` is true, update models here, instead of during update.
							model =
								_.isObject(attributes) && options.parse && this.relatedModel.prototype.parse
									? this.relatedModel.prototype.parse(_.clone(attributes), options)
									: attributes;
						}

						model && toAdd.push(model);
					}, this)
				);

				if (this.related instanceof module.Collection) {
					related = this.related;
				} else {
					related = this._prepareCollection();
				}

				// By now, `parse` will already have been executed just above for models if specified.
				// Disable to prevent additional calls.
				related.set(toAdd, _.defaults({ parse: false }, options));
			}

			// Remove entries from `keyIds` that were already part of the relation (and are thus 'unchanged')
			this.keyIds = _.difference(this.keyIds, _.pluck(related.models, 'id'));

			return related;
		},

		/**
		 * Normalize `keyContents` to a list of ids for easier comparison.
		 * @private
		 * @param {string|number|Array|Backbone.Relational.Collection} keyContents
		 */
		setKeyContents: function (keyContents) {
			this.keyContents = keyContents instanceof module.Collection ? keyContents : null;
			this.keyIds = [];

			if (!this.keyContents && (keyContents || keyContents === 0)) {
				// since 0 can be a valid `id` as well
				// Handle cases the an API/user supplies just an Object/id instead of an Array
				this.keyContents = _.isArray(keyContents) ? keyContents : [keyContents];

				_.each(
					this.keyContents,
					_.bind(function (item) {
						const itemId = module.store.resolveIdForItem(this.relatedModel, item);
						if (itemId || itemId === 0) {
							this.keyIds.push(itemId);
						}
					}, this)
				);
			}
		},

		/**
		 * Internal `change:<key>` handler for HasMany. Diffs old/new
		 * contents and emits `add`/`remove`/`reset` accordingly.
		 * @private
		 */
		onChange: function (model, attr, options) {
			// Don't accept recursive calls to onChange (mirrors HasOne.onChange).
			if (this.isLocked()) {
				return;
			}
			this.acquire();

			try {
				options = options ? _.clone(options) : {};
				this.setKeyContents(attr);
				this.changed = false;

				const related = this.findRelated(options);
				this.setRelated(related);

				if (!options.silent) {
					const dit = this;
					module.eventQueue.add(() => {
						// The `changed` flag can be set in `handleAddition` or `handleRemoval`
						if (dit.changed) {
							dit.instance.trigger(`change:${dit.key}`, dit.instance, dit.related, options, true);
							dit.changed = false;
						}
					});
				}
			} finally {
				this.release();
			}
		},

		/**
		 * Internal: triggers `add` on the host and notifies the reverse
		 * relation (HasOne side) of the new pointer.
		 * @private
		 */
		handleAddition: function (model, coll, options) {
			//console.debug('handleAddition called; args=%o', arguments);
			options = options ? _.clone(options) : {};
			this.changed = true;

			_.each(
				this.getReverseRelations(model),
				_.bind(function (relation) {
					relation.addRelated(this.instance, options);
				}, this)
			);

			// Only trigger 'add' once the newly added model is initialized (so, has its relations set up)
			const dit = this;
			!options.silent &&
				module.eventQueue.add(() => {
					dit.instance.trigger(`add:${dit.key}`, model, dit.related, options);
				});
		},

		/**
		 * Internal: triggers `remove` on the host and clears the reverse
		 * pointer (HasOne) on the removed item.
		 * @private
		 */
		handleRemoval: function (model, coll, options) {
			//console.debug('handleRemoval called; args=%o', arguments);
			options = options ? _.clone(options) : {};
			this.changed = true;

			_.each(
				this.getReverseRelations(model),
				_.bind(function (relation) {
					relation.removeRelated(this.instance, null, options);
				}, this)
			);

			const dit = this;
			!options.silent &&
				module.eventQueue.add(() => {
					dit.instance.trigger(`remove:${dit.key}`, model, dit.related, options);
				});
		},

		handleReset: function (coll, options) {
			const dit = this;
			options = options ? _.clone(options) : {};
			!options.silent &&
				module.eventQueue.add(() => {
					dit.instance.trigger(`reset:${dit.key}`, dit.related, options);
				});
		},

		/**
		 * @private
		 */
		tryAddRelated: function (model, coll, options) {
			const item = _.contains(this.keyIds, model.id);

			if (item) {
				this.addRelated(model, options);
				this.keyIds = _.without(this.keyIds, model.id);
			}
		},

		addRelated: function (model, options) {
			// Allow 'model' to set up its relations before proceeding.
			// (which can result in a call to 'addRelated' from a relation of 'model')
			const dit = this;
			model.queue(() => {
				if (dit.related && !dit.related.get(model)) {
					dit.related.add(model, _.defaults({ parse: false }, options));
				}
			});
		},

		removeRelated: function (model, coll, options) {
			if (!this.related) {
				return;
			}

			if (this.related.get(model)) {
				this.related.remove(model, options);
			}
		}
	});

	/**
	 * Backbone.Model with relations. Extend it instead of `Backbone.Model`
	 * for any model that participates in HasOne / HasMany relations.
	 *
	 * Additional events compared to `Backbone.Model` :
	 *   - `add:<key>(model, collection, options)` — relation HasMany got
	 *     an item.
	 *   - `remove:<key>(model, collection, options)` — relation HasMany
	 *     lost an item.
	 *   - `change:<key>(model, related, options)` — relation changed
	 *     (also fired for HasOne).
	 *
	 * Adds these instance methods : `getRelations`, `getRelation`,
	 * `getIdsToFetch`, `getAsync`. Adds static methods : `findOrCreate`,
	 * `find`, `findModel`, `build`, `setup`.
	 *
	 * @class Model
	 * @extends Backbone.Model
	 * @memberof Backbone.Relational
	 * @mixes Backbone.Relational.Semaphore
	 *
	 * @example
	 * const Zoo = Backbone.Relational.Model.extend({
	 *   urlRoot: '/zoo/',
	 *   relations: [{
	 *     type: Backbone.Relational.HasMany,
	 *     key: 'animals',
	 *     relatedModel: 'Animal',
	 *     reverseRelation: { key: 'livesIn', includeInJSON: 'id' }
	 *   }]
	 * });
	 */
	module.Model = Backbone.Model.extend(
		{
			relations: null, // Relation descriptions on the prototype
			_relations: null, // Relation instances
			_isInitialized: false,
			_deferProcessing: false,
			_queue: null,
			_attributeChangeFired: false, // Keeps track of `change` event firing under some conditions (like nested `set`s)

			subModelTypeAttribute: 'type',
			subModelTypes: null,

			constructor: function (attributes, options) {
				// Nasty hack, for cases like 'model.get( <HasMany key> ).add( item )'.
				// Defer 'processQueue', so that when 'Relation.createModels' is used we trigger 'HasMany'
				// collection events only after the model is really fully set up.
				// Example: event for "p.on( 'add:jobs' )" -> "p.get('jobs').add( { company: c.id, person: p.id } )".
				if (options?.collection) {
					const dit = this,
						collection = (this.collection = options.collection);

					// Clone options before stripping `collection` so we don't mutate the caller's object
					// (which may be shared across multiple calls). `collection` is removed so it doesn't
					// cascade down to nested models built from these options.
					options = _.omit(options, 'collection');

					this._deferProcessing = true;

					const processQueue = function (model) {
						if (model === dit) {
							dit._deferProcessing = false;
							dit.processQueue();
							collection.off('relational:add', processQueue);
						}
					};
					collection.on('relational:add', processQueue);

					// So we do process the queue eventually, regardless of whether this model actually gets added to 'options.collection'.
					_.defer(() => {
						processQueue(dit);
					});
				}

				module.store.processOrphanRelations();
				module.store.listenTo(this, 'relational:unregister', module.store.unregister);

				this._queue = new module.BlockingQueue();
				this._queue.block();
				module.eventQueue.block();

				try {
					Backbone.Model.call(this, attributes, options);
				} finally {
					// Try to run the global queue holding external events
					module.eventQueue.unblock();
				}
			},

			/**
			 * `Backbone.Events.trigger` override that queues `change` and
			 * `change:*` events through `eventQueue` until all relations
			 * are stabilized. Public-facing behavior is unchanged ;
			 * consumers can call `.trigger()` as before.
			 * @private
			 */
			trigger: function (eventName) {
				if (eventName === 'change' || eventName.indexOf('change:') === 0) {
					const dit = this,
						args = arguments;

					if (!module.eventQueue.isLocked()) {
						// If we're not in a more complicated nested scenario, fire the change event right away
						Backbone.Model.prototype.trigger.apply(dit, args);
					} else {
						module.eventQueue.add(() => {
							// Determine if the `change` event is still valid, now that all relations are populated
							let changed = true;
							if (eventName === 'change') {
								// `hasChanged` may have gotten reset by nested calls to `set`.
								changed = dit.hasChanged() || dit._attributeChangeFired;
								dit._attributeChangeFired = false;
							} else {
								const attr = eventName.slice(7),
									rel = dit.getRelation(attr);

								if (rel) {
									// If `attr` is a relation, `change:attr` get triggered from `Relation.onChange`.
									// These take precedence over `change:attr` events triggered by `Model.set`.
									// The relation sets a fourth attribute to `true`. If this attribute is present,
									// continue triggering this event; otherwise, it's from `Model.set` and should be stopped.
									changed = args[4] === true;

									// If this event was triggered by a relation, set the right value in `this.changed`
									// (a Collection or Model instead of raw data).
									if (changed) {
										dit.changed[attr] = args[2];
									}
									// Otherwise, this event is from `Model.set`. If the relation doesn't report a change,
									// remove attr from `dit.changed` so `hasChanged` doesn't take it into account.
									else if (!rel.changed) {
										delete dit.changed[attr];
									}
								} else if (changed) {
									dit._attributeChangeFired = true;
								}
							}

							changed && Backbone.Model.prototype.trigger.apply(dit, args);
						});
					}
				} else if (eventName === 'destroy') {
					Backbone.Model.prototype.trigger.apply(this, arguments);
					module.store.unregister(this);
				} else {
					Backbone.Model.prototype.trigger.apply(this, arguments);
				}

				return this;
			},

			/**
			 * Build a Relation instance for each entry in `this.relations`.
			 * Called from the first `set()` triggered by the constructor.
			 * @private
			 */
			initializeRelations: function (options) {
				this.acquire(); // Setting up relations often also involve calls to 'set', and we only want to enter this function once
				this._relations = {};

				try {
					_.each(
						this.relations || [],
						_.bind(function (rel) {
							module.store.initializeRelation(this, rel, options);
						}, this)
					);
					this._isInitialized = true;
				} finally {
					// Always release the semaphore even if a relation init threw, otherwise the
					// model stays `isLocked()` forever and updateRelations becomes a no-op.
					this.release();
				}
				this.processQueue();
			},

			/**
			 * Notify this model's relations about the attributes that
			 * changed in the current `set()`. Internal — called by `set`.
			 * @private
			 * @param {Object} [changedAttrs]
			 * @param {Object} [options]
			 */
			updateRelations: function (changedAttrs, options) {
				if (this._isInitialized && !this.isLocked()) {
					_.each(
						this._relations,
						_.bind(function (rel) {
							if (!changedAttrs || rel.keySource in changedAttrs || rel.key in changedAttrs) {
								// Fetch data in `rel.keySource` if data got set in there, or `rel.key` otherwise
								const value = this.attributes[rel.keySource] || this.attributes[rel.key],
									attr = changedAttrs && (changedAttrs[rel.keySource] || changedAttrs[rel.key]);

								// Update a relation if its value differs from this model's attributes, or it's been explicitly nullified.
								// Which can also happen before the originally intended related model has been found (`val` is null).
								if (rel.related !== value || (value === null && attr === null)) {
									this.trigger(`relational:change:${rel.key}`, this, value, options || {});
								}
							}

							// Explicitly clear 'keySource', to prevent a leaky abstraction if 'keySource' differs from 'key'.
							if (rel.keySource !== rel.key) {
								delete this.attributes[rel.keySource];
							}
						}, this)
					);
				}
			},

			/**
			 * Defer `func` until this model is fully initialized, then run
			 * it. If init is already complete, `func` runs synchronously.
			 * Used by Relation handlers that need a stable model state.
			 *
			 * @memberof Backbone.Relational.Model
			 * @instance
			 * @param {Function} func
			 */
			queue: function (func) {
				this._queue.add(func);
			},

			/**
			 * Drain this model's deferred-action queue. Internal.
			 * @private
			 */
			processQueue: function () {
				if (this._isInitialized && !this._deferProcessing && this._queue.isBlocked()) {
					this._queue.unblock();
				}
			},

			/**
			 * Get a specific relation by attribute name.
			 *
			 * @memberof Backbone.Relational.Model
			 * @instance
			 * @param {string} attr The relation key to look for.
			 * @returns {?Backbone.Relational.Relation} The Relation
			 *     instance, or `null` if no relation matches `attr`.
			 * @example
			 * const rel = post.getRelation('author');
			 * if (rel) {
			 *   console.log(rel.type, rel.key, rel.relatedModel);
			 * }
			 */
			getRelation: function (attr) {
				return this._relations[attr];
			},

			/**
			 * All Relation instances declared on this model.
			 *
			 * @memberof Backbone.Relational.Model
			 * @instance
			 * @returns {Backbone.Relational.Relation[]}
			 */
			getRelations: function () {
				return _.values(this._relations);
			},

			/**
			 * Ids that `getAsync` would actually fetch — the unresolved ones.
			 * Useful for previewing the network cost before calling
			 * `getAsync`, or for batching across multiple hosts.
			 *
			 * @memberof Backbone.Relational.Model
			 * @instance
			 * @param {string|Backbone.Relational.Relation} attr Relation
			 *     key or instance.
			 * @param {boolean} [refresh=false] Include already-resolved ids
			 *     (forces a refetch of existing models).
			 * @returns {Array} List of ids to fetch (may be empty).
			 */
			getIdsToFetch: function (attr, refresh) {
				const rel = attr instanceof module.Relation ? attr : this.getRelation(attr),
					ids = rel
						? (rel.keyIds && rel.keyIds.slice(0)) || (rel.keyId || rel.keyId === 0 ? [rel.keyId] : [])
						: [];

				// On `refresh`, add the ids for current models in the relation to `idsToFetch`
				if (refresh) {
					const models = rel.related && (rel.related.models || [rel.related]);
					_.each(models, (model) => {
						if (model.id || model.id === 0) {
							ids.push(model.id);
						}
					});
				}

				return ids;
			},

			/**
			 * Fetch a relation's missing models on demand. Returns a promise
			 * that resolves to the resolved relation (model or collection).
			 * When `Collection.url` is a function that returns a different
			 * URL given a set of ids, `getAsync` uses it once for a batched
			 * fetch ; otherwise it issues one request per missing id.
			 *
			 * @memberof Backbone.Relational.Model
			 * @instance
			 * @param {string} attr Relation key.
			 * @param {Object} [options] Forwarded to `Backbone.Model.fetch`
			 *     and `Backbone.sync` (plus the extra options below).
			 * @param {boolean} [options.refresh=false] Also refetch
			 *     already-resolved models.
			 * @param {boolean} [options.add=true] Passed to
			 *     `Collection.set` on the related collection.
			 * @param {boolean} [options.remove=false] Same.
			 * @param {Function} [options.success] Called per fetched model
			 *     once data lands.
			 * @param {Function} [options.error] Called per failed model.
			 * @returns {Promise} jQuery Deferred (or equivalent depending
			 *     on `Backbone.$`). `done(contents)` receives whatever
			 *     `Backbone.Model.prototype.get.call(this, attr)` returns.
			 * @example
			 * server.getAsync('instances', { refresh: true })
			 *   .then(coll => renderInstances(coll));
			 */
			getAsync: function (attr, options) {
				// Set default `options` for fetch
				options = { add: true, remove: false, refresh: false, ...options };

				const dit = this;
				let requests = [];
				const rel = this.getRelation(attr);
				const idsToFetch = rel && this.getIdsToFetch(rel, options.refresh);
				const coll = rel && (rel.related instanceof module.Collection ? rel.related : rel.relatedCollection);

				if (idsToFetch && idsToFetch.length) {
					let models = [];
					const createdModels = [];
					let setUrl;
					const createModels = function () {
						// Find (or create) a model for each one that is to be fetched
						models = _.map(
							idsToFetch,
							_.bind((id) => {
								let model = rel.relatedModel.findModel(id);

								if (!model) {
									const attrs = {};
									attrs[rel.relatedModel.prototype.idAttribute] = id;
									model = rel.relatedModel.findOrCreate(attrs, options);
									createdModels.push(model);
								}

								return model;
							}, this)
						);
					};

					// Try if the 'collection' can provide a url to fetch a set of models in one request.
					// This assumes that when 'module.Collection.url' is a function, it can handle building of set urls.
					// To make sure it can, test if the url we got by supplying a list of models to fetch is different from
					// the one supplied for the default fetch action (without args to 'url').
					if (coll instanceof module.Collection && _.isFunction(coll.url)) {
						const defaultUrl = coll.url();
						setUrl = coll.url(idsToFetch);

						if (setUrl === defaultUrl) {
							createModels();
							setUrl = coll.url(models);

							if (setUrl === defaultUrl) {
								setUrl = null;
							}
						}
					}

					if (setUrl) {
						// Do a single request to fetch all models
						const origSuccess = options.success;
						const opts = _.defaults(
							{
								error: function () {
									_.each(createdModels, (model) => {
										model.trigger('destroy', model, model.collection, options);
									});

									options.error?.apply(models, arguments);
								},
								url: setUrl
							},
							options
						);

						if (origSuccess) {
							// Normalize the success callback shape to match the per-model path:
							// call `success(model, response, options)` once per requested id,
							// regardless of whether we ended up using the batch URL or the
							// per-model URL. Without this, users get `success(collection, ...)`
							// for batch and `success(model, ...)` for per-model from the same
							// `autoFetch.success` declaration.
							opts.success = function (collection, response, fetchOpts) {
								_.each(idsToFetch, (id) => {
									const m = rel.relatedModel.findModel(id);
									if (m) origSuccess.call(fetchOpts && fetchOpts.context, m, response, fetchOpts);
								});
							};
						}

						requests = [coll.fetch(opts)];
					} else {
						// Make a request per model to fetch
						if (!models.length) {
							createModels();
						}

						requests = _.map(
							models,
							_.bind((model) => {
								const opts = _.defaults(
									{
										error: function () {
											if (_.contains(createdModels, model)) {
												model.trigger('destroy', model, model.collection, options);
											}
											options.error?.apply(models, arguments);
										}
									},
									options
								);
								return model.fetch(opts);
							}, this)
						);
					}
				}

				return this.deferArray(requests).then(() => {
					return Backbone.Model.prototype.get.call(dit, attr);
				});
			},

			deferArray: function (deferArray) {
				return Backbone.$.when(...deferArray);
			},

			set: function (key, value, options) {
				module.eventQueue.block();

				// Duplicate backbone's behavior to allow separate key/value parameters, instead of a single 'attributes' object
				let attributes, result;

				if (_.isObject(key) || key == null) {
					attributes = key;
					options = value;
				} else {
					attributes = {};
					attributes[key] = value;
				}

				try {
					const id = this.id,
						newId = attributes && this.idAttribute in attributes && attributes[this.idAttribute];

					// Check if we're not setting a duplicate id before actually calling `set`.
					module.store.checkId(this, newId);

					result = Backbone.Model.prototype.set.apply(this, arguments);

					// Ideal place to set up relations, if this is the first time we're here for this model
					if (!this._isInitialized && !this.isLocked()) {
						this.constructor.initializeModelHierarchy();

						// Only register models that have an id. A model will be registered when/if it gets an id later on.
						if (newId || newId === 0) {
							module.store.register(this);
						}

						this.initializeRelations(options);
					}
					// The store should know about an `id` update asap
					else if (newId && newId !== id) {
						module.store.update(this);
					}

					if (attributes) {
						this.updateRelations(attributes, options);
					}
				} finally {
					// Try to run the global queue holding external events
					module.eventQueue.unblock();
				}

				return result;
			},

			clone: function () {
				const attributes = _.clone(this.attributes);
				if (!_.isUndefined(attributes[this.idAttribute])) {
					attributes[this.idAttribute] = null;
				}

				_.each(this.getRelations(), (rel) => {
					delete attributes[rel.key];
				});

				return new this.constructor(attributes);
			},

			/**
			 * Serialize the model to a plain object. Each relation is
			 * serialized according to its `includeInJSON` setting :
			 *   - `true` → full `relatedModel.toJSON()`
			 *   - `'id'` → just the id
			 *   - `['k1', 'k2']` → projection
			 *   - `false` → omitted
			 *
			 * Cycle-safe : a model already visited in the current pass is
			 * replaced with `{id}` to prevent stack overflows.
			 *
			 * @memberof Backbone.Relational.Model
			 * @instance
			 * @param {Object} [options] `options._visited` carries the
			 *     in-flight visited set ; pass the same options object
			 *     through nested calls to preserve it.
			 * @returns {Object}
			 */
			toJSON: function (options) {
				// If this Model has already been fully serialized in this branch once, return to avoid loops
				if (this.isLocked()) {
					return this.id;
				}

				this.acquire();
				const json = Backbone.Model.prototype.toJSON.call(this, options);

				if (this.constructor._superModel && !(this.constructor._subModelTypeAttribute in json)) {
					json[this.constructor._subModelTypeAttribute] = this.constructor._subModelTypeValue;
				}

				function serializeMaybe(v, options) {
					if (!v) return v;
					if (_.isFunction(v.toJSON)) return v.toJSON(options);
					if (v instanceof Backbone.Collection) return v.toJSON(options);
					return v;
				}

				_.each(this._relations, (rel) => {
					const related = json[rel.key];
					const includeInJSON = rel.options.includeInJSON;
					let value = null;

					if (includeInJSON === true) {
						if (related && _.isFunction(related.toJSON)) {
							value = related.toJSON(options);
						}
					} else if (_.isString(includeInJSON)) {
						if (related instanceof module.Collection) {
							const plucked = related.pluck(includeInJSON);
							value = _.map(plucked, (v) => {
								return serializeMaybe(v, options);
							});
						} else if (related instanceof Backbone.Model) {
							const attrVal = related.get(includeInJSON);
							value = serializeMaybe(attrVal, options);
						}

						if (includeInJSON === rel.relatedModel.prototype.idAttribute) {
							if (rel instanceof module.HasMany) {
								value = (value || []).concat(rel.keyIds);
							} else if (rel instanceof module.HasOne) {
								value = value || rel.keyId;

								if (!value && !_.isObject(rel.keyContents)) {
									value = rel.keyContents || null;
								}
							}
						}
					} else if (_.isArray(includeInJSON)) {
						if (related instanceof Backbone.Collection) {
							value = [];
							related.each((model) => {
								const curJson = {};
								_.each(includeInJSON, (key) => {
									const v = model.get(key);
									curJson[key] = serializeMaybe(v, options);
								});
								value.push(curJson);
							});
						} else if (related instanceof Backbone.Model) {
							value = {};
							_.each(includeInJSON, (key) => {
								const v = related.get(key);
								value[key] = serializeMaybe(v, options);
							});
						}
					} else {
						delete json[rel.key];
					}

					// In case of `wait: true`, Backbone will simply push whatever's passed into `save` into attributes.
					// We'll want to get this information into the JSON, even if it doesn't conform to our normal
					// expectations of what's contained in it (no model/collection for a relation, etc).
					if (value === null && options?.wait) {
						value = related;
					}

					if (includeInJSON) {
						json[rel.keyDestination] = value;
					}

					if (rel.keyDestination !== rel.key) {
						delete json[rel.key];
					}
				});

				const relationKeys = _.pluck(this._relations, 'key');
				_.each(json, (val, key) => {
					if (_.contains(relationKeys, key)) return; // déjà géré ci-dessus
					if (!val) return;

					if (_.isFunction(val.toJSON)) {
						try {
							json[key] = val.toJSON(options);
						} catch (e) {
							module.showWarnings &&
								typeof console !== 'undefined' &&
								console.warn('toJSON: failed to serialize attribute %o; %o', key, e);
						}
						return;
					}

					if (val instanceof Backbone.Collection) {
						try {
							json[key] = val.toJSON(options);
						} catch (e) {
							module.showWarnings &&
								typeof console !== 'undefined' &&
								console.warn('toJSON: failed to serialize attribute %o; %o', key, e);
						}
					}
				});

				this.release();
				return json;
			}
		},
		{
			/**
			 * Class-setup hook. Called automatically by the overridden
			 * `extend()` whenever a subclass is created — registers reverse
			 * relations from `relations` against the store. Override only if
			 * you really need to customize how a class registers itself.
			 *
			 * @memberof Backbone.Relational.Model
			 * @static
			 * @param {Function} [superModel]
			 * @returns {Function} The class (this), for chaining.
			 */
			setup: function (superModel) {
				// We don't want to share a relations array with a parent, as this will cause problems with reverse
				// relations. Since `relations` may also be a property or function, only use slice if we have an array.
				this.prototype.relations = (this.prototype.relations || []).slice(0);

				this._subModels = {};
				this._superModel = null;

				// If this model has 'subModelTypes' itself, remember them in the store
				if (this.prototype.hasOwnProperty('subModelTypes')) {
					module.store.addSubModels(this.prototype.subModelTypes, this);
				}
				// The 'subModelTypes' property should not be inherited, so reset it.
				else {
					this.prototype.subModelTypes = null;
				}

				// Initialize all reverseRelations that belong to this new model.
				_.each(
					this.prototype.relations || [],
					_.bind(function (rel) {
						if (!rel.model) {
							rel.model = this;
						}

						if (rel.reverseRelation && rel.model === this) {
							let preInitialize = true;
							if (_.isString(rel.relatedModel)) {
								/**
								 * The related model might not be defined for two reasons
								 *  1. it is related to itself
								 *  2. it never gets defined, e.g. a typo
								 *  3. the model hasn't been defined yet, but will be later
								 * In neither of these cases do we need to pre-initialize reverse relations.
								 * However, for 3. (which is, to us, indistinguishable from 2.), we do need to attempt
								 * setting up this relation again later, in case the related model is defined later.
								 */
								const relatedModel = module.store.getObjectByName(rel.relatedModel);
								preInitialize = relatedModel && relatedModel.prototype instanceof module.Model;
							}

							if (preInitialize) {
								module.store.initializeRelation(null, rel);
							} else if (_.isString(rel.relatedModel)) {
								module.store.addOrphanRelation(rel);
							}
						}
					}, this)
				);

				return this;
			},

			/**
			 * Instantiate the right concrete class given raw attributes.
			 * Resolves `subModelTypes` so polymorphic data (`{type: 'dog'}`)
			 * lands on the matching subclass.
			 *
			 * @memberof Backbone.Relational.Model
			 * @static
			 * @param {Object} attributes
			 * @param {Object} [options]
			 * @returns {Backbone.Relational.Model}
			 */
			build: function (attributes, options) {
				// 'build' is a possible entrypoint; it's possible no model hierarchy has been determined yet.
				this.initializeModelHierarchy();

				// Determine what type of (sub)model should be built if applicable.
				const model = this._findSubModelType(this, attributes) || this;

				return new model(attributes, options);
			},

			/**
			 * Walk the `subModelTypes` tree to find which class should be
			 * instantiated for `attributes`. Returns the resolved class
			 * (or `null` if no match).
			 * @private
			 * @param {Function} type
			 * @param {Object} attributes
			 * @returns {?Function}
			 */
			_findSubModelType: function (type, attributes) {
				if (type._subModels && type.prototype.subModelTypeAttribute in attributes) {
					let subModelTypeAttribute = attributes[type.prototype.subModelTypeAttribute];
					let subModelType = type._subModels[subModelTypeAttribute];
					if (subModelType) {
						return subModelType;
					}
					// Recurse into subModelTypes to find a match
					for (subModelTypeAttribute in type._subModels) {
						subModelType = this._findSubModelType(type._subModels[subModelTypeAttribute], attributes);
						if (subModelType) {
							return subModelType;
						}
					}
				}
				return null;
			},

			/**
			 * Set up the super/sub model graph for this class. Called by
			 * `setup` and the first call to `build`.
			 * @private
			 */
			initializeModelHierarchy: function () {
				// Inherit any relations that have been defined in the parent model.
				this.inheritRelations();

				// If we came here through 'build' for a model that has 'subModelTypes' then try to initialize the ones that
				// haven't been resolved yet.
				if (this.prototype.subModelTypes) {
					const resolvedSubModels = _.keys(this._subModels);
					const unresolvedSubModels = _.omit(this.prototype.subModelTypes, resolvedSubModels);
					_.each(unresolvedSubModels, (subModelTypeName) => {
						const subModelType = module.store.getObjectByName(subModelTypeName);
						subModelType && subModelType.initializeModelHierarchy();
					});
				}
			},

			/**
			 * Copy relations from the super-model into this class's prototype.
			 * @private
			 */
			inheritRelations: function () {
				// Bail out if we've been here before.
				if (!_.isUndefined(this._superModel) && !_.isNull(this._superModel)) {
					return;
				}
				// Try to initialize the _superModel.
				module.store.setupSuperModel(this);

				// If a superModel has been found, copy relations from the _superModel if they haven't been inherited automatically
				// (due to a redefinition of 'relations').
				if (this._superModel) {
					// The _superModel needs a chance to initialize its own inherited relations before we attempt to inherit relations
					// from the _superModel. You don't want to call 'initializeModelHierarchy' because that could cause sub-models of
					// this class to inherit their relations before this class has had chance to inherit it's relations.
					this._superModel.inheritRelations();
					if (this._superModel.prototype.relations) {
						// Find relations that exist on the '_superModel', but not yet on this model.
						const inheritedRelations = _.filter(
							this._superModel.prototype.relations || [],
							_.bind(function (superRel) {
								return !_.any(
									this.prototype.relations || [],
									_.bind((rel) => {
										return superRel.relatedModel === rel.relatedModel && superRel.key === rel.key;
									}, this)
								);
							}, this)
						);

						this.prototype.relations = inheritedRelations.concat(this.prototype.relations);
					}
				}
				// Otherwise, make sure we don't get here again for this type by making '_superModel' false so we fail the
				// isUndefined/isNull check next time.
				else {
					this._superModel = false;
				}
			},

			/**
			 * Look up an instance in the store ; create it if missing and
			 * `options.create !== false`. The canonical entry point for any
			 * code that constructs models from external data — guarantees a
			 * single instance per id per type.
			 *
			 *   - `attributes` is a string / number → treated as the id.
			 *   - `attributes` is an object and found in the store → the
			 *     existing instance is updated with `attributes` unless
			 *     `options.merge === false`.
			 *   - Not found and `options.create === false` → returns `null`.
			 *
			 * @memberof Backbone.Relational.Model
			 * @static
			 * @param {Object|string|number} attributes Model id, or
			 *     attributes hash to create/update.
			 * @param {Object} [options]
			 * @param {boolean} [options.create=true] If `false`, only
			 *     looks up — returns `null` if the model isn't found.
			 * @param {boolean} [options.merge=true] If `false`, found
			 *     models keep their existing attributes.
			 * @param {boolean} [options.parse=false] Run `model.parse()`
			 *     on `attributes` before the merge/create.
			 * @returns {?Backbone.Relational.Model}
			 * @example
			 * // Get-or-create from raw data
			 * const author = Author.findOrCreate({ id: 1, name: 'Asimov' });
			 *
			 * // Pure lookup by id (no creation)
			 * const cached = Author.findOrCreate(1, { create: false });
			 *
			 * // Keep existing attributes if already in store
			 * Author.findOrCreate({ id: 1, name: 'NEW' }, { merge: false });
			 */
			findOrCreate: function (attributes, options) {
				options || (options = {});
				const parsedAttributes =
					_.isObject(attributes) && options.parse && this.prototype.parse
						? this.prototype.parse(_.clone(attributes), options)
						: attributes;

				// If specified, use a custom `find` function to match up existing models to the given attributes.
				// Otherwise, try to find an instance of 'this' model type in the store
				let model = this.findModel(parsedAttributes);

				// If we found an instance, update it with the data in 'item' (unless 'options.merge' is false).
				// If not, create an instance (unless 'options.create' is false).
				if (_.isObject(attributes)) {
					if (model && options.merge !== false) {
						// Make sure `options.collection` and `options.url` doesn't cascade to nested models
						delete options.collection;
						delete options.url;

						model.set(parsedAttributes, options);
					} else if (!model && options.create !== false) {
						model = this.build(parsedAttributes, _.defaults({ parse: false }, options));
					}
				}

				return model;
			},

			/**
			 * Pure lookup variant of {@link Backbone.Relational.Model.findOrCreate}.
			 * Never creates a new model — returns `null` if no match exists
			 * in the store. Equivalent to `findOrCreate(attrs, { create: false })`.
			 *
			 * @memberof Backbone.Relational.Model
			 * @static
			 * @param {Object|string|number} attributes
			 * @param {Object} [options]
			 * @returns {?Backbone.Relational.Model}
			 */
			find: function (attributes, options) {
				options || (options = {});
				options.create = false;
				return this.findOrCreate(attributes, options);
			},

			/**
			 * Override-friendly hook used by `findOrCreate` / `find` to
			 * match incoming attributes against existing instances. Default
			 * looks up by `idAttribute` in the store. Override if your data
			 * model uses a non-id matcher (e.g. a slug or a composite key).
			 *
			 * @memberof Backbone.Relational.Model
			 * @static
			 * @param {Object} attributes
			 * @returns {?Backbone.Relational.Model}
			 */
			findModel: function (attributes) {
				return module.store.find(this, attributes);
			}
		}
	);
	_.extend(module.Model.prototype, module.Semaphore);

	/**
	 * Override module.Collection._prepareModel, so objects will be built using the correct type
	 * if the collection.model has subModels.
	 * Attempts to find a model for `attrs` in Backbone.store through `findOrCreate`
	 * (which sets the new properties on it if found), or instantiates a new model.
	 */
	module.Collection.prototype.__prepareModel = module.Collection.prototype._prepareModel;
	module.Collection.prototype._prepareModel = function (attrs, options) {
		let model;

		if (attrs instanceof Backbone.Model) {
			if (!attrs.collection) {
				attrs.collection = this;
			}
			model = attrs;
		} else {
			options = options ? _.clone(options) : {};
			options.collection = this;

			if (typeof this.model.findOrCreate !== 'undefined') {
				model = this.model.findOrCreate(attrs, options);
			} else {
				model = new this.model(attrs, options);
			}

			if (model?.validationError) {
				this.trigger('invalid', this, attrs, options);
				model = false;
			}
		}

		return model;
	};

	/**
	 * Override module.Collection.set, so we'll create objects from attributes where required,
	 * and update the existing models. Also, trigger 'relational:add'.
	 */
	const set = (module.Collection.prototype.__set = module.Collection.prototype.set);
	module.Collection.prototype.set = function (models, options) {
		// Short-circuit if this Collection doesn't hold RelationalModels
		if (!(this.model.prototype instanceof module.Model)) {
			return set.call(this, models, options);
		}

		if (options?.parse) {
			models = this.parse(models, options);
		}

		const singular = !_.isArray(models);
		const newModels = [];
		let toAdd = [];
		let model = null;

		models = singular ? (models ? [models] : []) : _.clone(models);

		//console.debug( 'calling add on coll=%o; model=%o, options=%o', this, models, options );
		for (let i = 0; i < models.length; i++) {
			model = models[i];
			if (!(model instanceof Backbone.Model)) {
				model = module.Collection.prototype._prepareModel.call(this, model, options);
			}

			if (model) {
				toAdd.push(model);

				if (!(this.get(model) || this.get(model.cid))) {
					newModels.push(model);
				}
				// If we arrive in `add` while performing a `set` (after a create, so the model gains an `id`),
				// we may get here before `_onModelEvent` has had the chance to update `_byId`.
				else if (model.id != null) {
					this._byId[model.id] = model;
				}
			}
		}

		// Add 'models' in a single batch, so the original add will only be called once (and thus 'sort', etc).
		// If `parse` was specified, the collection and contained models have been parsed now.
		toAdd = singular ? (toAdd.length ? toAdd[0] : null) : toAdd;
		// Force `merge: false` (overriding any caller-provided value): `findOrCreate` above already
		// merged the incoming attributes into the existing model. Letting Backbone re-merge here
		// would redo that work and re-fire `change:*` events for the second time.
		const result = set.call(this, toAdd, _.defaults({ merge: false, parse: false }, options));

		for (let i = 0; i < newModels.length; i++) {
			model = newModels[i];
			// Fire a `relational:add` event for any model in `newModels` that has actually been added to the collection.
			if (this.get(model) || this.get(model.cid)) {
				this.trigger('relational:add', model, this, options);
			}
		}

		return result;
	};

	/**
	 * Override 'module.Collection._removeModels' to trigger 'relational:remove'.
	 */
	const _removeModels = (module.Collection.prototype.___removeModels = module.Collection.prototype._removeModels);
	module.Collection.prototype._removeModels = function (models, options) {
		// Short-circuit if this Collection doesn't hold RelationalModels
		if (!(this.model.prototype instanceof module.Model)) {
			return _removeModels.call(this, models, options);
		}

		const toRemove = [];

		//console.debug('calling remove on coll=%o; models=%o, options=%o', this, models, options );
		_.each(
			models,
			_.bind(function (model) {
				model = this.get(model) || this.get(model?.cid);
				model && toRemove.push(model);
			}, this)
		);

		const result = _removeModels.call(this, toRemove, options);

		_.each(
			toRemove,
			_.bind(function (model) {
				this.trigger('relational:remove', model, this, options);
			}, this)
		);

		return result;
	};

	/**
	 * Override 'module.Collection.reset' to trigger 'relational:reset'.
	 */
	const reset = (module.Collection.prototype.__reset = module.Collection.prototype.reset);
	module.Collection.prototype.reset = function (models, options) {
		options = { merge: true, ...options };
		const result = reset.call(this, models, options);

		if (this.model.prototype instanceof module.Model) {
			this.trigger('relational:reset', this, options);
		}

		return result;
	};

	/**
	 * Override 'module.Collection.sort' to trigger 'relational:reset'.
	 */
	const sort = (module.Collection.prototype.__sort = module.Collection.prototype.sort);
	module.Collection.prototype.sort = function (options) {
		const result = sort.call(this, options);

		if (this.model.prototype instanceof module.Model) {
			this.trigger('relational:reset', this, options);
		}

		return result;
	};

	/**
	 * Override 'module.Collection.trigger' so 'add', 'remove' and 'reset' events are queued until relations
	 * are ready.
	 */
	const trigger = (module.Collection.prototype.__trigger = module.Collection.prototype.trigger);
	module.Collection.prototype.trigger = function (eventName) {
		// Short-circuit if this Collection doesn't hold RelationalModels
		if (!(this.model.prototype instanceof module.Model)) {
			return trigger.apply(this, arguments);
		}

		if (
			eventName === 'add' ||
			eventName === 'remove' ||
			eventName === 'reset' ||
			eventName === 'sort' ||
			eventName === 'update'
		) {
			const dit = this;
			let args = arguments;

			if (_.isObject(args[3])) {
				args = _.toArray(args);
				// the fourth argument is the option object.
				// we need to clone it, as it could be modified while we wait on the eventQueue to be unblocked
				args[3] = _.clone(args[3]);
			}

			module.eventQueue.add(() => {
				trigger.apply(dit, args);
			});
		} else {
			trigger.apply(this, arguments);
		}

		return this;
	};

	// Override .extend() to automatically call .setup()
	module.Model.extend = function (protoProps, classProps) {
		const child = Backbone.Model.extend.apply(this, arguments);

		child.setup(this);

		return child;
	};
	return module;
});
