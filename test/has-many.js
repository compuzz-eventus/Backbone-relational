import { describe, it, beforeEach, expect } from 'vitest';
import initObjects from './setup/data.js';

describe('Backbone.Relational.HasMany', () => {
	beforeEach(initObjects);

	it("Listeners on 'add'/'remove'", () => {
		ourHouse
			.on('add:occupants', (model) => {
				expect(model).toBe(person1);
			})
			.on('remove:occupants', (model) => {
				expect(model).toBe(person1);
			});

		theirHouse
			.on('add:occupants', (model) => {
				expect(model).toBe(person1);
			})
			.on('remove:occupants', (model) => {
				expect(model).toBe(person1);
			});

		let count = 0;
		person1.on('change:livesIn', (model, attr) => {
			if (count === 0) {
				expect(attr).toBe(ourHouse);
			} else if (count === 1) {
				expect(attr).toBe(theirHouse);
			} else if (count === 2) {
				expect(attr).toBe(null);
			}

			count++;
		});

		ourHouse.get('occupants').add(person1);
		person1.set({ livesIn: theirHouse });
		theirHouse.get('occupants').remove(person1);
	});

	it("Listeners for 'add'/'remove', on a HasMany relation, for a Model with multiple relations", () => {
		const job1 = { company: oldCompany };
		const job2 = { company: oldCompany, person: person1 };
		const job3 = { person: person1 };
		let newJob = null;

		newCompany.on('add:employees', () => {
			throw new Error("person1 should only be added to 'oldCompany'.");
		});

		oldCompany.on('add:employees', (model) => {
			newJob = model;

			expect(model).toBeInstanceOf(Job);
			expect(model.get('company') instanceof Company && model.get('person') instanceof Person).toBe(true);
		});

		person1.on('add:jobs', (model) => {
			expect(model.get('company') === oldCompany && model.get('person') === person1).toBe(true);
		});

		const jobs = person1.get('jobs');

		jobs.add(job1);
		expect(jobs.length).toBe(1);

		newJob.destroy();
		expect(jobs.length).toBe(0);

		jobs.add(job2);
		expect(jobs.length).toBe(1);

		newJob.destroy();
		expect(jobs.length).toBe(0);

		const employees = oldCompany.get('employees');

		employees.add(job3);
		expect(employees.length).toBe(2);

		newJob.destroy();
		expect(employees.length).toBe(1);

		employees.add(job2);
		expect(employees.length).toBe(2);

		newJob.destroy();
		expect(employees.length).toBe(1);

		new Job({
			person: person1,
			company: oldCompany
		});

		expect(jobs.length === 1 && employees.length === 2).toBe(true);
	});

	it('The Collections used for HasMany relations are re-used if possible', () => {
		const collId = (ourHouse.get('occupants').id = 1);

		ourHouse.get('occupants').add(person1);
		expect(ourHouse.get('occupants').id).toBe(collId);

		ourHouse.set({ occupants: ['person-1'] });
		expect(ourHouse.get('occupants').id).toBe(collId);
		expect(ourHouse.get('occupants').length).toBe(1);

		ourHouse.set({ occupants: new Backbone.Relational.Collection() });
		expect(ourHouse.get('occupants').id).toBeUndefined();
	});

	it('On `set`, or creation, accept a collection or an array of ids/objects/models', () => {
		const visitor1 = new Visitor({ id: 'visitor-1', name: 'Mr. Pink' });
		const visitor2 = new Visitor({ id: 'visitor-2' });

		let zoo = new Zoo({ visitors: ['visitor-1', 'visitor-3'] });
		let visitors = zoo.get('visitors');

		expect(visitors.length).toBe(1);

		new Visitor({ id: 'visitor-3' });
		expect(visitors.length).toBe(2);

		zoo.set('visitors', [{ name: 'Incognito' }]);
		expect(visitors.length).toBe(1);

		zoo.set('visitors', []);
		expect(visitors.length).toBe(0);

		zoo = new Zoo({ visitors: [{ id: 'visitor-1' }, { id: 'visitor-4' }] });
		visitors = zoo.get('visitors');

		expect(visitors.length).toBe(2);
		expect(visitors.get('visitor-1').get('name')).toBe('Mr. Pink');

		zoo.set('visitors', [{ id: 'visitor-1' }, { id: 'visitor-5' }]);
		expect(visitors.length).toBe(2);

		zoo = new Zoo({ visitors: [visitor1] });
		visitors = zoo.get('visitors');

		expect(visitors.length).toBe(1);
		expect(visitors.first()).toBe(visitor1);

		zoo.set('visitors', [visitor2]);
		expect(visitors.length).toBe(1);
		expect(visitors.first()).toBe(visitor2);

		let visitorColl = new Backbone.Relational.Collection([visitor1, visitor2]);
		zoo = new Zoo({ visitors: visitorColl });
		visitors = zoo.get('visitors');

		expect(visitors.length).toBe(2);

		zoo.set('visitors', false);
		expect(visitors.length).toBe(0);

		visitorColl = new Backbone.Relational.Collection([visitor2]);
		zoo.set('visitors', visitorColl);
		expect(zoo.get('visitors')).toBe(visitorColl);
		expect(zoo.get('visitors').length).toBe(1);
	});

	it('On `set`, or creation, handle edge-cases where the server supplies a single object/id', () => {
		let zoo = new Zoo({
			animals: { id: 'lion-1' }
		});
		let animals = zoo.get('animals');

		expect(animals.length).toBe(1);

		zoo.set('animals', { id: 'lion-2' });
		expect(animals.length).toBe(1);

		const lion3 = new Animal({ id: 'lion-3' });
		zoo = new Zoo({
			animals: lion3
		});
		animals = zoo.get('animals');

		expect(animals.length).toBe(1);

		zoo.set('animals', null);
		expect(animals.length).toBe(0);

		zoo.set('animals', lion3);
		expect(animals.length).toBe(1);

		zoo = new Zoo({
			animals: 'lion-4'
		});
		animals = zoo.get('animals');

		expect(animals.length).toBe(0);

		new Animal({ id: 'lion-4' });
		expect(animals.length).toBe(1);

		zoo.set('animals', 'lion-5');
		expect(animals.length).toBe(0);

		new Animal({ id: 'lion-5' });
		expect(animals.length).toBe(1);

		zoo.set('animals', null);
		expect(animals.length).toBe(0);

		zoo = new Zoo({
			animals: 'lion-4'
		});
		animals = zoo.get('animals');

		expect(animals.length).toBe(1);

		zoo = new Zoo({
			animals: ''
		});
		animals = zoo.get('animals');

		expect(animals).toBeInstanceOf(AnimalCollection);
		expect(animals.length).toBe(0);
	});

	it("Setting a custom collection in 'collectionType' uses that collection for instantiation", () => {
		const zoo = new Zoo();

		zoo.set({
			animals: [{ species: 'Lion' }, { species: 'Zebra' }]
		});

		expect(zoo.get('animals').at(0).get('species')).toBe('Lion');
		expect(zoo.get('animals').at(1).get('species')).toBe('Zebra');

		expect(zoo.get('animals')).toBeInstanceOf(AnimalCollection);
	});

	it("Setting a new collection maintains that collection's current 'models'", () => {
		const zoo = new Zoo();

		const animals = new AnimalCollection([
			{ id: 1, species: 'Lion' },
			{ id: 2, species: 'Zebra' }
		]);

		zoo.set('animals', animals);

		expect(zoo.get('animals').length).toBe(2);

		const newAnimals = new AnimalCollection([
			{ id: 2, species: 'Zebra' },
			{ id: 3, species: 'Elephant' },
			{ id: 4, species: 'Tiger' }
		]);

		zoo.set('animals', newAnimals);

		expect(zoo.get('animals').length).toBe(3);
	});

	it("Models found in 'findRelated' are all added in one go (so 'sort' will only be called once)", () => {
		let count = 0;
		const sort = Backbone.Relational.Collection.prototype.sort;

		Backbone.Relational.Collection.prototype.sort = function () {
			count++;
		};

		AnimalCollection.prototype.comparator = $.noop;

		new Zoo({
			animals: [
				{ id: 1, species: 'Lion' },
				{ id: 2, species: 'Zebra' }
			]
		});

		expect(count).toBe(1);

		Backbone.Relational.Collection.prototype.sort = sort;
		delete AnimalCollection.prototype.comparator;
	});

	it('Raw-models set to a hasMany relation do trigger an add event in the underlying Collection with a correct index', () => {
		const zoo = new Zoo();

		const indexes = [];

		zoo.get('animals').on('add', (model, collection) => {
			indexes.push(collection.indexOf(model));
		});

		zoo.set('animals', [
			{ id: 1, species: 'Lion' },
			{ id: 2, species: 'Zebra' }
		]);

		expect(indexes[0]).toBe(0);
		expect(indexes[1]).toBe(1);
	});

	it('Models set to a hasMany relation do trigger an add event in the underlying Collection with a correct index', () => {
		const zoo = new Zoo();

		const indexes = [];

		zoo.get('animals').on('add', (model, collection) => {
			indexes.push(collection.indexOf(model));
		});

		zoo.set('animals', [new Animal({ id: 1, species: 'Lion' }), new Animal({ id: 2, species: 'Zebra' })]);

		expect(indexes[0]).toBe(0);
		expect(indexes[1]).toBe(1);
	});

	it("Sort event should be fired after the add event that caused it, even when using 'set'", () => {
		const zoo = new Zoo();
		const animals = zoo.get('animals');
		const events = [];

		animals.comparator = 'id';

		animals.on('add', () => {
			events.push('add');
		});
		animals.on('sort', () => {
			events.push('sort');
		});

		zoo.set('animals', [{ id: 'lion-2' }, { id: 'lion-1' }]);

		expect(animals.at(0).id).toBe('lion-1');
		expect(events).toEqual(['add', 'add', 'sort']);
	});

	it("The 'collectionKey' options is used to create references on generated Collections back to its RelationalModel", () => {
		const zoo = new Zoo({
			animals: ['lion-1', 'zebra-1']
		});

		expect(zoo.get('animals').livesIn).toBe(zoo);
		expect(zoo.get('animals').zoo).toBeUndefined();

		let FarmAnimal = Backbone.Relational.Model.extend();
		const Barn = Backbone.Relational.Model.extend({
			relations: [
				{
					type: Backbone.Relational.HasMany,
					key: 'animals',
					relatedModel: FarmAnimal,
					collectionKey: 'barn',
					reverseRelation: {
						key: 'livesIn',
						includeInJSON: 'id'
					}
				}
			]
		});
		const barn = new Barn({
			animals: ['chicken-1', 'cow-1']
		});

		expect(barn.get('animals').livesIn).toBeUndefined();
		expect(barn.get('animals').barn).toBe(barn);

		FarmAnimal = Backbone.Relational.Model.extend();
		const BarnNoKey = Backbone.Relational.Model.extend({
			relations: [
				{
					type: Backbone.Relational.HasMany,
					key: 'animals',
					relatedModel: FarmAnimal,
					collectionKey: false,
					reverseRelation: {
						key: 'livesIn',
						includeInJSON: 'id'
					}
				}
			]
		});
		const barnNoKey = new BarnNoKey({
			animals: ['chicken-1', 'cow-1']
		});

		expect(barnNoKey.get('animals').livesIn).toBeUndefined();
		expect(barnNoKey.get('animals').barn).toBeUndefined();
	});

	it('Polymorhpic relations', () => {
		const Location = Backbone.Relational.Model.extend();

		const Locatable = Backbone.Relational.Model.extend({
			relations: [
				{
					key: 'locations',
					type: 'HasMany',
					relatedModel: Location,
					reverseRelation: {
						key: 'locatable'
					}
				}
			]
		});

		const FirstLocatable = Locatable.extend();
		const SecondLocatable = Locatable.extend();

		const firstLocatable = new FirstLocatable();
		const secondLocatable = new SecondLocatable();

		const firstLocation = new Location({ id: 1, locatable: firstLocatable });
		const secondLocation = new Location({ id: 2, locatable: secondLocatable });

		expect(firstLocatable.get('locations').at(0)).toBe(firstLocation);
		expect(firstLocatable.get('locations').at(0).get('locatable')).toBe(firstLocatable);

		expect(secondLocatable.get('locations').at(0)).toBe(secondLocation);
		expect(secondLocatable.get('locations').at(0).get('locatable')).toBe(secondLocatable);
	});

	it('Cloned instances of persisted models should not be added to any existing collections', () => {
		let addedModels = 0;

		const zoo = new window.Zoo({
			visitors: [{ name: 'Incognito' }]
		});

		const visitor = new window.Visitor();

		zoo.get('visitors').on('add', () => {
			addedModels++;
		});

		visitor.clone();

		expect(addedModels).toBe(0);
	});
});
