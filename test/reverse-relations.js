import { describe, it, beforeEach, expect } from 'vitest';
import initObjects from './setup/data.js';

describe('Reverse relations', () => {
	beforeEach(initObjects);

	it('Add and remove', () => {
		expect(ourHouse.get('occupants').length).toBe(1);
		expect(person1.get('livesIn')).toBe(null);

		ourHouse.get('occupants').add(person1);

		expect(ourHouse.get('occupants').length).toBe(2);
		expect(person1.get('livesIn') && person1.get('livesIn').id).toBe(ourHouse.id);

		person1.set({ livesIn: theirHouse });

		expect(theirHouse.get('occupants').length).toBe(1);
		expect(ourHouse.get('occupants').length).toBe(1);
		expect(person1.get('livesIn') && person1.get('livesIn').id).toBe(theirHouse.id);
	});

	it('Destroy removes models from reverse relations', () => {
		const zoo = new Zoo({ id: 1, animals: [2, 3, 4] });

		const rhino = new Animal({ id: 2, species: 'rhino' });
		const baboon = new Animal({ id: 3, species: 'baboon' });
		const hippo = new Animal({ id: 4, species: 'hippo' });

		expect(zoo.get('animals').length).toBe(3);

		rhino.destroy();

		expect(zoo.get('animals').length).toBe(2);
		expect(zoo.get('animals').get(baboon)).toBe(baboon);
		expect(rhino.get('zoo')).toBeFalsy();

		zoo.get('animals').remove(hippo);

		expect(zoo.get('animals').length).toBe(1);
		expect(hippo.get('zoo')).toBeFalsy();

		zoo.destroy();

		expect(zoo.get('animals').length).toBe(0);
		expect(baboon.get('zoo')).toBeFalsy();
	});

	it('HasOne relations to self (tree stucture)', () => {
		const child1 = new Node({ id: '2', parent: '1', name: 'First child' });
		const parent = new Node({ id: '1', name: 'Parent' });
		const child2 = new Node({ id: '3', parent: '1', name: 'Second child' });

		expect(parent.get('children').length).toBe(2);
		expect(parent.get('children').include(child1)).toBe(true);
		expect(parent.get('children').include(child2)).toBe(true);

		expect(child1.get('parent')).toBe(parent);
		expect(child1.get('children').length).toBe(0);

		expect(child2.get('parent')).toBe(parent);
		expect(child2.get('children').length).toBe(0);
	});

	it('Models referencing each other in the same relation', () => {
		const parent = new Node({ id: 1 });
		const child = new Node({ id: 2 });

		child.set('parent', parent);
		parent.save({ parent: child });

		expect(parent.get('parent')).toBe(child);
		expect(child.get('parent')).toBe(parent);
	});

	it('HasMany relations to self (tree structure)', () => {
		const child1 = new Node({ id: '2', name: 'First child' });
		const parent = new Node({ id: '1', children: ['2', '3'], name: 'Parent' });
		const child2 = new Node({ id: '3', name: 'Second child' });

		expect(parent.get('children').length).toBe(2);
		expect(parent.get('children').include(child1)).toBe(true);
		expect(parent.get('children').include(child2)).toBe(true);

		expect(child1.get('parent')).toBe(parent);
		expect(child1.get('children').length).toBe(0);

		expect(child2.get('parent')).toBe(parent);
		expect(child2.get('children').length).toBe(0);
	});

	it('HasOne relations to self (cycle, directed graph structure)', () => {
		const node1 = new Node({ id: '1', parent: '3', name: 'First node' });
		const node2 = new Node({ id: '2', parent: '1', name: 'Second node' });
		const node3 = new Node({ id: '3', parent: '2', name: 'Third node' });

		expect(node1.get('parent')).toBe(node3);
		expect(node1.get('children').length).toBe(1);
		expect(node1.get('children').at(0)).toBe(node2);

		expect(node2.get('parent')).toBe(node1);
		expect(node2.get('children').length).toBe(1);
		expect(node2.get('children').at(0)).toBe(node3);

		expect(node3.get('parent')).toBe(node2);
		expect(node3.get('children').length).toBe(1);
		expect(node3.get('children').at(0)).toBe(node1);
	});

	it("New objects (no 'id' yet) have working relations", () => {
		const person = new Person({
			name: 'Remi'
		});

		person.set({ user: { login: '1', email: '1' } });
		const user1 = person.get('user');

		expect(user1).toBeInstanceOf(User);
		expect(user1.get('login')).toBe('1');

		const user2 = new User({
			login: '2',
			email: '2'
		});

		expect(user2.get('person')).toBe(null);

		person.set({ user: user2 });

		expect(user1.get('person')).toBe(null);
		expect(person.get('user')).toBe(user2);
		expect(user2.get('person')).toBe(person);

		person2.set({ user: user2 });

		expect(person.get('user')).toBe(null);
		expect(person2.get('user')).toBe(user2);
		expect(user2.get('person')).toBe(person2);
	});

	it("'Save' objects (performing 'set' multiple times without and with id)", () => {
		person3
			.on('add:jobs', (model) => {
				const company = model.get('company');
				expect(
					company instanceof Company &&
						company.get('ceo').get('name') === 'Lunar boy' &&
						model.get('person') === person3
				).toBe(true);
			})
			.on('remove:jobs', () => {
				throw new Error("remove:jobs: 'person3' should not lose his job");
			});

		const company = new Company({
			name: 'Luna Corp.',
			ceo: {
				name: 'Lunar boy'
			},
			employees: [{ person: 'person-3' }]
		});

		company
			.on('add:employees', (model) => {
				const co = model.get('company');
				expect(
					co instanceof Company &&
						co.get('ceo').get('name') === 'Lunar boy' &&
						model.get('person') === person3
				).toBe(true);
			})
			.on('remove:employees', () => {
				// expected once
			});

		company.set({
			id: 'company-3',
			name: 'Big Corp.',
			ceo: {
				id: 'person-4',
				name: 'Lunar boy',
				resource_uri: 'person-4'
			},
			employees: [{ id: 'job-1', person: 'person-3', resource_uri: 'job-1' }],
			resource_uri: 'company-3'
		});

		company.set({
			employees: ['job-1']
		});
	});

	it("Set the same value a couple of time, by 'id' and object", () => {
		person1.set({ likesALot: 'person-2' });
		person1.set({ likesALot: person2 });

		expect(person1.get('likesALot')).toBe(person2);
		expect(person2.get('likedALotBy')).toBe(person1);

		person1.set({ likesALot: 'person-2' });

		expect(person1.get('likesALot')).toBe(person2);
		expect(person2.get('likedALotBy')).toBe(person1);
	});

	it('Numerical keys', () => {
		const child1 = new Node({ id: 2, name: 'First child' });
		const parent = new Node({ id: 1, children: [2, 3], name: 'Parent' });
		const child2 = new Node({ id: 3, name: 'Second child' });

		expect(parent.get('children').length).toBe(2);
		expect(parent.get('children').include(child1)).toBe(true);
		expect(parent.get('children').include(child2)).toBe(true);

		expect(child1.get('parent')).toBe(parent);
		expect(child1.get('children').length).toBe(0);

		expect(child2.get('parent')).toBe(parent);
		expect(child2.get('children').length).toBe(0);
	});

	it('Relations that use refs to other models (instead of keys)', () => {
		const child1 = new Node({ id: 2, name: 'First child' });
		const parent = new Node({ id: 1, children: [child1, 3], name: 'Parent' });
		const child2 = new Node({ id: 3, name: 'Second child' });

		expect(child1.get('parent')).toBe(parent);
		expect(child1.get('children').length).toBe(0);

		expect(parent.get('children').length).toBe(2);
		expect(parent.get('children').include(child1)).toBe(true);
		expect(parent.get('children').include(child2)).toBe(true);

		const child3 = new Node({ id: 4, parent: parent, name: 'Second child' });

		expect(parent.get('children').length).toBe(3);
		expect(parent.get('children').include(child3)).toBe(true);

		expect(child3.get('parent')).toBe(parent);
		expect(child3.get('children').length).toBe(0);
	});

	it("Add an already existing model (reverseRelation shouldn't exist yet) to a relation as a hash", () => {
		const Properties = Backbone.Relational.Model.extend({});
		const View = Backbone.Relational.Model.extend({
			relations: [
				{
					type: Backbone.Relational.HasMany,
					key: 'properties',
					relatedModel: Properties,
					reverseRelation: {
						type: Backbone.Relational.HasOne,
						key: 'view'
					}
				}
			]
		});

		const props = new Properties({ id: 1, key: 'width', value: '300px', view: 1 });
		const view = new View({
			id: 1,
			properties: [{ id: 1, key: 'width', value: '300px', view: 1 }]
		});

		expect(props.get('view')).toBe(view);
		expect(view.get('properties').include(props)).toBe(true);
	});

	it('Reverse relations are found for models that have not been instantiated and use .extend()', () => {
		const View = Backbone.Relational.Model.extend({});
		const Property = Backbone.Relational.Model.extend({
			relations: [
				{
					type: Backbone.Relational.HasOne,
					key: 'view',
					relatedModel: View,
					reverseRelation: {
						type: Backbone.Relational.HasMany,
						key: 'properties'
					}
				}
			]
		});
		void Property;

		const view = new View({
			id: 1,
			properties: [{ id: 1, key: 'width', value: '300px' }]
		});

		expect(view.get('properties')).toBeInstanceOf(Backbone.Relational.Collection);
	});

	it('Reverse relations found for models that have not been instantiated and run .setup() manually', () => {
		const __hasProp = {}.hasOwnProperty;
		const __extends = function (child, parent) {
			for (const key in parent) {
				if (__hasProp.call(parent, key)) child[key] = parent[key];
			}
			function ctor() {
				this.constructor = child;
			}
			ctor.prototype = parent.prototype;
			child.prototype = new ctor();
			child.__super__ = parent.prototype;
			return child;
		};

		const View = (function (Super) {
			__extends(LocalView, Super);
			Object.defineProperty(LocalView, 'name', { value: 'View', configurable: true });
			function LocalView() {
				return LocalView.__super__.constructor.apply(this, arguments);
			}
			return LocalView;
		})(Backbone.Relational.Model);

		View.setup();

		const Property = (function (Super) {
			__extends(LocalProperty, Super);
			Object.defineProperty(LocalProperty, 'name', { value: 'Property', configurable: true });
			function LocalProperty() {
				return LocalProperty.__super__.constructor.apply(this, arguments);
			}
			LocalProperty.prototype.relations = [
				{
					type: Backbone.Relational.HasOne,
					key: 'view',
					relatedModel: View,
					reverseRelation: {
						type: Backbone.Relational.HasMany,
						key: 'properties'
					}
				}
			];
			return LocalProperty;
		})(Backbone.Relational.Model);

		Property.setup();

		const view = new View({
			id: 1,
			properties: [{ id: 1, key: 'width', value: '300px' }]
		});

		expect(view.get('properties')).toBeInstanceOf(Backbone.Relational.Collection);
	});

	it('ReverseRelations are applied retroactively', () => {
		const NewUser = Backbone.Relational.Model.extend({});
		const NewPerson = Backbone.Relational.Model.extend({
			relations: [
				{
					type: Backbone.Relational.HasOne,
					key: 'user',
					relatedModel: NewUser,
					reverseRelation: {
						type: Backbone.Relational.HasOne,
						key: 'person'
					}
				}
			]
		});

		const user = new NewUser({ id: 'newuser-1' });
		const person = new NewPerson({ id: 'newperson-1', user: user });

		expect(person.get('user')).toBe(user);
		expect(user.get('person')).toBe(person);
	});

	it('ReverseRelations are applied retroactively (2)', () => {
		const models = {};
		Backbone.Relational.store.addModelScope(models);

		models.NewPerson = Backbone.Relational.Model.extend({
			relations: [
				{
					type: Backbone.Relational.HasOne,
					key: 'user',
					relatedModel: 'NewUser',
					reverseRelation: {
						type: Backbone.Relational.HasOne,
						key: 'person'
					}
				}
			]
		});
		models.NewUser = Backbone.Relational.Model.extend({});

		const user = new models.NewUser({ id: 'newuser-1', person: { id: 'newperson-1' } });

		expect(user.getRelations().length).toBe(1);
		expect(user.get('person')).toBeInstanceOf(models.NewPerson);
	});

	it('Deep reverse relation starting from a collection', () => {
		const nodes = new NodeList([
			{
				id: 1,
				children: [
					{
						id: 2,
						children: [
							{
								id: 3,
								children: [1]
							}
						]
					}
				]
			}
		]);

		const parent = nodes.first();
		expect(parent).toBeTruthy();

		expect(parent.collection).toBe(nodes);

		const child = parent.get('children').first();
		expect(child).toBeTruthy();
		expect(child.get('parent')).toBeTruthy();

		const grandchild = child.get('children').first();
		expect(grandchild).toBeTruthy();

		expect(grandchild.get('parent')).toBeTruthy();

		expect(grandchild.get('children').first()).toBe(parent);
		expect(parent.get('parent')).toBe(grandchild);
	});

	it('Deep reverse relation starting from a collection, with existing model', () => {
		new Node({ id: 1 });

		const nodes = new NodeList();
		nodes.set([
			{
				id: 1,
				children: [
					{
						id: 2,
						children: [
							{
								id: 3,
								children: [1]
							}
						]
					}
				]
			}
		]);

		const parent = nodes.first();
		expect(parent && parent.id === 1).toBe(true);

		const child = parent.get('children').first();
		expect(child).toBeTruthy();
		expect(child.get('parent')).toBeTruthy();

		const grandchild = child.get('children').first();
		expect(grandchild).toBeTruthy();

		expect(grandchild.get('parent')).toBeTruthy();

		expect(grandchild.get('children').first()).toBe(parent);
		expect(parent.get('parent')).toBe(grandchild);
	});
});
