import { describe, it, beforeEach, expect } from 'vitest';
import initObjects from './setup/data.js';

describe('Backbone.Relational.Store', () => {
	beforeEach(initObjects);

	it('Initialized', () => {
		// `initObjects` instantiates models of the following types: Person,
		// Job, Company, User, House and Password.
		expect(Backbone.Relational.store._collections.length).toBe(6);
	});

	it('getObjectByName', () => {
		expect(Backbone.Relational.store.getObjectByName('Backbone.Relational.Model')).toBe(Backbone.Relational.Model);
	});

	it('Add and remove from store', () => {
		const coll = Backbone.Relational.store.getCollection(person1);
		const length = coll.length;

		const person = new Person({
			id: 'person-10',
			name: 'Remi',
			resource_uri: 'person-10'
		});

		expect(coll.length).toBe(length + 1);

		const request = person.destroy();
		request.success();

		expect(coll.length).toBe(length);
	});

	it('addModelScope', () => {
		const models = {};
		Backbone.Relational.store.addModelScope(models);

		models.Book = Backbone.Relational.Model.extend({
			relations: [
				{
					type: Backbone.Relational.HasMany,
					key: 'pages',
					relatedModel: 'Page',
					createModels: false,
					reverseRelation: {
						key: 'book'
					}
				}
			]
		});
		models.Page = Backbone.Relational.Model.extend();

		const book = new models.Book();
		new models.Page({ book: book });

		expect(book.relations.length).toBe(1);
		expect(book.get('pages').length).toBe(1);
	});

	it('addModelScope with submodels and namespaces', () => {
		const ns = {};
		ns.People = {};
		Backbone.Relational.store.addModelScope(ns);

		ns.People.Person = Backbone.Relational.Model.extend({
			subModelTypes: {
				Student: 'People.Student'
			},
			iam: function () {
				return 'I am an abstract person';
			}
		});

		ns.People.Student = ns.People.Person.extend({
			iam: function () {
				return 'I am a student';
			}
		});

		ns.People.PersonCollection = Backbone.Relational.Collection.extend({
			model: ns.People.Person
		});

		const people = new ns.People.PersonCollection([{ name: 'Bob', type: 'Student' }]);

		expect(people.at(0).iam()).toBe('I am a student');
	});

	it('removeModelScope', () => {
		const models = {};
		Backbone.Relational.store.addModelScope(models);

		models.Page = Backbone.Relational.Model.extend();

		expect(Backbone.Relational.store.getObjectByName('Page')).toBe(models.Page);
		expect(Backbone.Relational.store.getObjectByName('Person')).toBe(window.Person);

		Backbone.Relational.store.removeModelScope(models);

		expect(Backbone.Relational.store.getObjectByName('Page')).toBeFalsy();
		expect(Backbone.Relational.store.getObjectByName('Person')).toBe(window.Person);

		Backbone.Relational.store.removeModelScope(window);

		expect(Backbone.Relational.store.getObjectByName('Person')).toBeFalsy();
	});

	it('unregister', () => {
		const animalStoreColl = Backbone.Relational.store.getCollection(Animal);
		let animals = null;
		let animal = null;

		// Single model
		animal = new Animal({ id: 'a1' });
		expect(Backbone.Relational.store.find(Animal, 'a1')).toBe(animal);

		Backbone.Relational.store.unregister(animal);
		expect(Backbone.Relational.store.find(Animal, 'a1')).toBe(null);

		animal = new Animal({ id: 'a2' });
		expect(Backbone.Relational.store.find(Animal, 'a2')).toBe(animal);

		animal.trigger('relational:unregister', animal);
		expect(Backbone.Relational.store.find(Animal, 'a2')).toBe(null);

		expect(animalStoreColl.size()).toBe(0);

		// Collection
		animals = new AnimalCollection([{ id: 'a3' }, { id: 'a4' }]);
		animal = animals.first();

		expect(Backbone.Relational.store.find(Animal, 'a3')).toBe(animal);
		expect(animalStoreColl.size()).toBe(2);

		Backbone.Relational.store.unregister(animals);
		expect(Backbone.Relational.store.find(Animal, 'a3')).toBe(null);

		expect(animalStoreColl.size()).toBe(0);

		// Store collection
		animals = new AnimalCollection([{ id: 'a5' }, { id: 'a6' }]);
		expect(animalStoreColl.size()).toBe(2);

		Backbone.Relational.store.unregister(animalStoreColl);
		expect(animalStoreColl.size()).toBe(0);

		// Model type
		animals = new AnimalCollection([{ id: 'a7' }, { id: 'a8' }]);
		expect(animalStoreColl.size()).toBe(2);

		Backbone.Relational.store.unregister(Animal);
		expect(animalStoreColl.size()).toBe(0);
	});

	it('`eventQueue` is unblocked again after a duplicate id error', () => {
		new Node({ id: 1 });

		expect(Backbone.Relational.eventQueue.isBlocked()).toBe(false);

		expect(() => {
			window.duplicateNode = new Node({ id: 1 });
		}).toThrow();

		expect(Backbone.Relational.eventQueue.isBlocked()).toBe(false);
	});

	it("Don't allow setting a duplicate `id`", () => {
		const a = new Zoo();
		const b = new Zoo({ id: 42 });

		expect(b.id).toBe(42);

		expect(() => a.set('id', 42)).toThrow();

		expect(a.id).toBeFalsy();
		expect(b.id).toBe(42);
	});

	it('Models are created from objects, can then be found, destroyed, cannot be found anymore', () => {
		const houseId = 'house-10';
		const personId = 'person-10';

		const anotherHouse = new House({
			id: houseId,
			location: 'no country for old men',
			resource_uri: houseId,
			occupants: [
				{
					id: personId,
					name: 'Remi',
					resource_uri: personId
				}
			]
		});

		expect(anotherHouse.get('occupants')).toBeInstanceOf(Backbone.Relational.Collection);
		expect(anotherHouse.get('occupants').get(personId)).toBeInstanceOf(Person);

		let person = Backbone.Relational.store.find(Person, personId);

		expect(person).toBeTruthy();

		let request = person.destroy();
		request.success();

		person = Backbone.Relational.store.find(Person, personId);

		expect(person).toBeFalsy();
		expect(anotherHouse.get('occupants').get(personId)).toBeFalsy();

		request = anotherHouse.destroy();
		request.success();

		const house = Backbone.Relational.store.find(House, houseId);

		expect(house).toBeFalsy();
	});

	it('Model.collection is the first collection a Model is added to by an end-user (not its Backbone.Relational.Store collection!)', () => {
		const person = new Person({ id: 5, name: 'New guy' });
		const personColl = new PersonCollection();
		personColl.add(person);
		expect(person.collection).toBe(personColl);
	});

	it("Models don't get added to the store until the get an id", () => {
		const storeColl = Backbone.Relational.store.getCollection(Node);
		const node1 = new Node({ id: 1 });
		const node2 = new Node();

		expect(storeColl.contains(node1)).toBe(true);
		expect(storeColl.contains(node2)).toBe(false);

		node2.set({ id: 2 });

		expect(storeColl.contains(node1)).toBe(true);
	});

	it("All models can be found after adding them to a Collection via 'Collection.reset'", () => {
		const nodes = [
			{ id: 1, parent: null },
			{ id: 2, parent: 1 },
			{ id: 3, parent: 4 },
			{ id: 4, parent: 1 }
		];

		const nodeList = new NodeList();
		nodeList.reset(nodes);

		const storeColl = Backbone.Relational.store.getCollection(Node);
		expect(storeColl.length).toBe(4);
		expect(Backbone.Relational.store.find(Node, 1)).toBeInstanceOf(Node);
		expect(Backbone.Relational.store.find(Node, 2)).toBeInstanceOf(Node);
		expect(Backbone.Relational.store.find(Node, 3)).toBeInstanceOf(Node);
		expect(Backbone.Relational.store.find(Node, 4)).toBeInstanceOf(Node);
	});

	it('Inheritance creates and uses a separate collection', () => {
		const whale = new Animal({ id: 1, species: 'whale' });
		expect(Backbone.Relational.store.find(Animal, 1)).toBe(whale);

		const numCollections = Backbone.Relational.store._collections.length;

		const Mammal = Animal.extend({
			urlRoot: '/mammal/'
		});

		const lion = new Mammal({ id: 1, species: 'lion' });
		const donkey = new Mammal({ id: 2, species: 'donkey' });

		expect(Backbone.Relational.store._collections.length).toBe(numCollections + 1);
		expect(Backbone.Relational.store.find(Animal, 1)).toBe(whale);
		expect(Backbone.Relational.store.find(Mammal, 1)).toBe(lion);
		expect(Backbone.Relational.store.find(Mammal, 2)).toBe(donkey);

		const Primate = Mammal.extend({
			urlRoot: '/primate/'
		});

		const gorilla = new Primate({ id: 1, species: 'gorilla' });

		expect(Backbone.Relational.store._collections.length).toBe(numCollections + 2);
		expect(Backbone.Relational.store.find(Primate, 1)).toBe(gorilla);
	});

	it("Inheritance with `subModelTypes` uses the same collection as the model's super", () => {
		const Mammal = Animal.extend({
			subModelTypes: {
				primate: 'Primate',
				carnivore: 'Carnivore'
			}
		});

		window.Primate = Mammal.extend();
		window.Carnivore = Mammal.extend();

		const lion = new Carnivore({ id: 1, species: 'lion' });
		const wolf = new Carnivore({ id: 2, species: 'wolf' });

		const numCollections = Backbone.Relational.store._collections.length;

		const whale = new Mammal({ id: 3, species: 'whale' });

		expect(Backbone.Relational.store._collections.length).toBe(numCollections);

		expect(Backbone.Relational.store.find(Mammal, 1)).toBe(lion);
		expect(Backbone.Relational.store.find(Mammal, 2)).toBe(wolf);
		expect(Backbone.Relational.store.find(Mammal, 3)).toBe(whale);
		expect(Backbone.Relational.store.find(Carnivore, 1)).toBe(lion);
		expect(Backbone.Relational.store.find(Carnivore, 2)).toBe(wolf);
		expect(Backbone.Relational.store.find(Carnivore, 3)).not.toBe(whale);

		const gorilla = new Primate({ id: 4, species: 'gorilla' });

		expect(Backbone.Relational.store._collections.length).toBe(numCollections);

		expect(Backbone.Relational.store.find(Animal, 4)).not.toBe(gorilla);
		expect(Backbone.Relational.store.find(Mammal, 4)).toBe(gorilla);
		expect(Backbone.Relational.store.find(Primate, 4)).toBe(gorilla);

		delete window.Primate;
		delete window.Carnivore;
	});

	it('findOrCreate does not modify attributes hash if parse is used, prior to creating new model', () => {
		const model = Backbone.Relational.Model.extend({
			parse: function (response) {
				response.id = response.id + 'something';
				return response;
			}
		});
		const attributes = { id: 42, foo: 'bar' };
		const testAttributes = { id: 42, foo: 'bar' };

		model.findOrCreate(attributes, { parse: true, merge: false, create: false });

		expect(attributes).toEqual(testAttributes);
	});
});
