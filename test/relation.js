import { describe, it, beforeEach, expect } from 'vitest';
import initObjects from './setup/data.js';
import { reset } from './setup/setup.js';

describe('Backbone.Relational.Relation options', () => {
	beforeEach(initObjects);

	it('`includeInJSON` (Person to JSON)', () => {
		let json = person1.toJSON();
		expect(json.user_id).toBe('user-1');
		expect(json.likesALot).toBeInstanceOf(Object);
		expect(json.likesALot.likesALot).toBe('person-1');

		json = person1.get('user').toJSON();
		expect(json.person).toBe('boy');

		json = person2.toJSON();
		expect(person2.get('livesIn')).toBeInstanceOf(House);
		expect(json.livesIn).toBeUndefined();

		json = person3.toJSON();
		expect(json.user_id).toBe(null);
		expect(json.likesALot).toBe(null);
	});

	it('`includeInJSON` (Zoo to JSON)', () => {
		const zoo = new Zoo({
			id: 0,
			name: 'Artis',
			city: 'Amsterdam',
			animals: [
				new Animal({ id: 1, species: 'bear', name: 'Baloo' }),
				new Animal({ id: 2, species: 'tiger', name: 'Shere Khan' })
			]
		});

		const jsonZoo = zoo.toJSON();
		const jsonBear = jsonZoo.animals[0];

		expect(_.isArray(jsonZoo.animals)).toBe(true);
		expect(jsonZoo.animals.length).toBe(2);
		expect(jsonBear.id).toBe(1);
		expect(jsonBear.species).toBe('bear');
		expect(jsonBear.name).toBeFalsy();

		const tiger = zoo.get('animals').get(1);
		const jsonTiger = tiger.toJSON();

		expect(_.isObject(jsonTiger.livesIn) && !_.isArray(jsonTiger.livesIn)).toBe(true);
		expect(jsonTiger.livesIn.id).toBe(0);
		expect(jsonTiger.livesIn.name).toBe('Artis');
		expect(jsonTiger.livesIn.city).toBeFalsy();
	});

	it("'createModels' is false", () => {
		const NewUser = Backbone.Relational.Model.extend({});
		const NewPerson = Backbone.Relational.Model.extend({
			relations: [
				{
					type: Backbone.Relational.HasOne,
					key: 'user',
					relatedModel: NewUser,
					createModels: false
				}
			]
		});

		const person = new NewPerson({
			id: 'newperson-1',
			resource_uri: 'newperson-1',
			user: { id: 'newuser-1', resource_uri: 'newuser-1' }
		});

		expect(person.get('user') == null).toBe(true);

		const user = new NewUser({ id: 'newuser-1', name: 'SuperUser' });

		expect(person.get('user')).toBe(user);
		expect(person.get('user').get('resource_uri') == null).toBe(true);
	});

	it('Relations load from both `keySource` and `key`', () => {
		const Property = Backbone.Relational.Model.extend({
			idAttribute: 'property_id'
		});
		const View = Backbone.Relational.Model.extend({
			idAttribute: 'id',

			relations: [
				{
					type: Backbone.Relational.HasMany,
					key: 'properties',
					keySource: 'property_ids',
					relatedModel: Property,
					reverseRelation: {
						key: 'view',
						keySource: 'view_id'
					}
				}
			]
		});

		const property1 = new Property({
			property_id: 1,
			key: 'width',
			value: 500,
			view_id: 5
		});

		const view = new View({
			id: 5,
			property_ids: [2]
		});

		const property2 = new Property({
			property_id: 2,
			key: 'height',
			value: 400
		});

		expect(view.get('properties') && view.get('properties').length === 2).toBe(true);
		expect(typeof view.get('property_ids')).toBe('undefined');

		view.set('properties', [property1, property2]);
		expect(view.get('properties') && view.get('properties').length === 2).toBe(true);

		view.set('property_ids', [1, 2]);
		expect(view.get('properties') && view.get('properties').length === 2).toBe(true);
	});

	it("`keySource` is emptied after a set, doesn't get confused by `unset`", () => {
		const SubModel = Backbone.Relational.Model.extend();

		const Model = Backbone.Relational.Model.extend({
			relations: [
				{
					type: Backbone.Relational.HasOne,
					key: 'submodel',
					keySource: 'sub_data',
					relatedModel: SubModel
				}
			]
		});

		const inst = new Model({ id: 123 });

		inst.set({
			id: 123,
			some_field: 'some_value',
			sub_data: {
				id: 321,
				key: 'value'
			},
			to_unset: 'unset value'
		});

		expect(inst.get('submodel').get('key')).toBe('value');
		inst.set({ to_unset: '' }, { unset: true });
		expect(inst.get('submodel').get('key')).toBe('value');

		expect(typeof inst.get('sub_data')).toBe('undefined');
		expect(typeof inst.get('submodel')).not.toBe('undefined');
		expect(inst.get('submodel')).toBeInstanceOf(SubModel);

		inst.set({
			sub_data: {
				id: 321,
				key: 'value2'
			}
		});

		expect(typeof inst.get('sub_data')).toBe('undefined');
		expect(typeof inst.get('submodel')).not.toBe('undefined');
		expect(inst.get('submodel').get('key')).toBe('value2');
	});

	it("'keyDestination' saves to 'key'", () => {
		const Property = Backbone.Relational.Model.extend({
			idAttribute: 'property_id'
		});
		const View = Backbone.Relational.Model.extend({
			idAttribute: 'id',

			relations: [
				{
					type: Backbone.Relational.HasMany,
					key: 'properties',
					keyDestination: 'properties_attributes',
					relatedModel: Property,
					reverseRelation: {
						key: 'view',
						keyDestination: 'view_attributes',
						includeInJSON: true
					}
				}
			]
		});

		new Property({
			property_id: 1,
			key: 'width',
			value: 500,
			view: 5
		});

		const view = new View({
			id: 5,
			properties: [2]
		});

		new Property({
			property_id: 2,
			key: 'height',
			value: 400
		});

		const viewJSON = view.toJSON();
		expect(viewJSON.properties_attributes && viewJSON.properties_attributes.length === 2).toBe(true);
		expect(typeof viewJSON.properties).toBe('undefined');
	});

	it("'collectionOptions' sets the options on the created HasMany Collections", () => {
		const shop = new Shop({ id: 1 });
		expect(shop.get('customers').url).toBe('shop/' + shop.id + '/customers/');
	});

	it('`parse` with deeply nested relations', () => {
		let collParseCalled = 0;
		let modelParseCalled = 0;

		const Job = Backbone.Relational.Model.extend({});

		const JobCollection = Backbone.Relational.Collection.extend({
			model: Job,

			parse: function (resp) {
				collParseCalled++;
				return resp.data || resp;
			}
		});

		const Company = Backbone.Relational.Model.extend({
			relations: [
				{
					type: 'HasMany',
					key: 'employees',
					parse: true,
					relatedModel: Job,
					collectionType: JobCollection,
					reverseRelation: {
						key: 'company'
					}
				}
			]
		});

		const LocalPerson = Backbone.Relational.Model.extend({
			relations: [
				{
					type: 'HasMany',
					key: 'jobs',
					parse: true,
					relatedModel: Job,
					collectionType: JobCollection,
					reverseRelation: {
						key: 'person',
						parse: false
					}
				}
			],

			parse: function (resp) {
				modelParseCalled++;
				const data = _.clone(resp.model);
				data.id = data.id.uri;
				return data;
			}
		});
		// reference the var to avoid no-unused-vars
		void LocalPerson;

		Company.prototype.parse = Job.prototype.parse = function (resp) {
			modelParseCalled++;
			const data = _.clone(resp.model);
			data.id = data.id.uri;
			return data;
		};

		const data = {
			model: {
				id: { uri: 'c1' },
				employees: [
					{
						model: {
							id: { uri: 'e1' },
							person: {
								id: 'p1',
								jobs: ['e1', { model: { id: { uri: 'e3' } } }]
							}
						}
					},
					{
						model: {
							id: { uri: 'e2' },
							person: {
								id: 'p2'
							}
						}
					}
				]
			}
		};

		const company = new Company(data, { parse: true });
		const employees = company.get('employees');
		const job = employees.first();
		const person = job.get('person');

		expect(job && job.id === 'e1').toBe(true);
		expect(person && person.id === 'p1').toBe(true);

		expect(modelParseCalled).toBe(4);
		expect(collParseCalled).toBe(0);
	});
});

describe('Backbone.Relational.Relation preconditions', () => {
	beforeEach(reset);

	it("'type', 'key', 'relatedModel' are required properties", () => {
		const Properties = Backbone.Relational.Model.extend({});
		let View = Backbone.Relational.Model.extend({
			relations: [
				{
					key: 'listProperties',
					relatedModel: Properties
				}
			]
		});

		let view = new View();
		expect(_.size(view._relations)).toBe(0);
		expect(view.getRelations().length).toBe(0);

		View = Backbone.Relational.Model.extend({
			relations: [
				{
					type: Backbone.Relational.HasOne,
					relatedModel: Properties
				}
			]
		});

		view = new View();
		expect(_.size(view._relations)).toBe(0);

		View = Backbone.Relational.Model.extend({
			relations: [
				{
					type: Backbone.Relational.HasOne,
					key: 'parentView'
				}
			]
		});

		view = new View();
		expect(_.size(view._relations)).toBe(1);
		expect(view.getRelation('parentView').relatedModel).toBe(View);
	});

	it("'type' can be a string or an object reference", () => {
		const Properties = Backbone.Relational.Model.extend({});
		let View = Backbone.Relational.Model.extend({
			relations: [
				{
					type: 'Backbone.Relational.HasOne',
					key: 'listProperties',
					relatedModel: Properties
				}
			]
		});

		let view = new View();
		expect(_.size(view._relations)).toBe(1);

		View = Backbone.Relational.Model.extend({
			relations: [
				{
					type: 'HasOne',
					key: 'listProperties',
					relatedModel: Properties
				}
			]
		});

		view = new View();
		expect(_.size(view._relations)).toBe(1);

		View = Backbone.Relational.Model.extend({
			relations: [
				{
					type: Backbone.Relational.HasOne,
					key: 'listProperties',
					relatedModel: Properties
				}
			]
		});

		view = new View();
		expect(_.size(view._relations)).toBe(1);
	});

	it("'key' can be a string or an object reference", () => {
		const Properties = Backbone.Relational.Model.extend({});
		let View = Backbone.Relational.Model.extend({
			relations: [
				{
					type: Backbone.Relational.HasOne,
					key: 'listProperties',
					relatedModel: Properties
				}
			]
		});

		let view = new View();
		expect(_.size(view._relations)).toBe(1);

		View = Backbone.Relational.Model.extend({
			relations: [
				{
					type: Backbone.Relational.HasOne,
					key: 'listProperties',
					relatedModel: Properties
				}
			]
		});

		view = new View();
		expect(_.size(view._relations)).toBe(1);
	});

	it('HasMany with a reverseRelation HasMany is not allowed', () => {
		const User = Backbone.Relational.Model.extend({});
		const Password = Backbone.Relational.Model.extend({
			relations: [
				{
					type: 'HasMany',
					key: 'users',
					relatedModel: User,
					reverseRelation: {
						type: 'HasMany',
						key: 'passwords'
					}
				}
			]
		});

		const password = new Password({
			plaintext: 'qwerty',
			users: ['person-1', 'person-2', 'person-3']
		});

		expect(_.size(password._relations)).toBe(0);
	});

	it('Duplicate relations not allowed (two simple relations)', () => {
		const Properties = Backbone.Relational.Model.extend({});
		const View = Backbone.Relational.Model.extend({
			relations: [
				{
					type: Backbone.Relational.HasOne,
					key: 'properties',
					relatedModel: Properties
				},
				{
					type: Backbone.Relational.HasOne,
					key: 'properties',
					relatedModel: Properties
				}
			]
		});

		const view = new View();
		view.set({ properties: new Properties() });
		expect(_.size(view._relations)).toBe(1);
	});

	it('Duplicate relations not allowed (one relation with a reverse relation, one without)', () => {
		const Properties = Backbone.Relational.Model.extend({});
		const View = Backbone.Relational.Model.extend({
			relations: [
				{
					type: Backbone.Relational.HasOne,
					key: 'properties',
					relatedModel: Properties,
					reverseRelation: {
						type: Backbone.Relational.HasOne,
						key: 'view'
					}
				},
				{
					type: Backbone.Relational.HasOne,
					key: 'properties',
					relatedModel: Properties
				}
			]
		});

		const view = new View();
		view.set({ properties: new Properties() });
		expect(_.size(view._relations)).toBe(1);
	});

	it('Duplicate relations not allowed (two relations with reverse relations)', () => {
		const Properties = Backbone.Relational.Model.extend({});
		const View = Backbone.Relational.Model.extend({
			relations: [
				{
					type: Backbone.Relational.HasOne,
					key: 'properties',
					relatedModel: Properties,
					reverseRelation: {
						type: Backbone.Relational.HasOne,
						key: 'view'
					}
				},
				{
					type: Backbone.Relational.HasOne,
					key: 'properties',
					relatedModel: Properties,
					reverseRelation: {
						type: Backbone.Relational.HasOne,
						key: 'view'
					}
				}
			]
		});

		const view = new View();
		view.set({ properties: new Properties() });
		expect(_.size(view._relations)).toBe(1);
	});

	it('Duplicate relations not allowed (different relations, reverse relations)', () => {
		const Properties = Backbone.Relational.Model.extend({});
		const View = Backbone.Relational.Model.extend({
			relations: [
				{
					type: Backbone.Relational.HasOne,
					key: 'listProperties',
					relatedModel: Properties,
					reverseRelation: {
						type: Backbone.Relational.HasOne,
						key: 'view'
					}
				},
				{
					type: Backbone.Relational.HasOne,
					key: 'windowProperties',
					relatedModel: Properties,
					reverseRelation: {
						type: Backbone.Relational.HasOne,
						key: 'view'
					}
				}
			]
		});

		const view = new View();
		const prop1 = new Properties({ name: 'a' });
		const prop2 = new Properties({ name: 'b' });

		view.set({ listProperties: prop1, windowProperties: prop2 });

		expect(_.size(view._relations)).toBe(2);
		expect(_.size(prop1._relations)).toBe(1);
		expect(view.get('listProperties').get('name')).toBe('a');
		expect(view.get('windowProperties').get('name')).toBe('b');
	});
});

describe('Backbone.Relational.Relation general', () => {
	beforeEach(reset);

	it('Only valid models (no validation failure) should be added to a relation', () => {
		const zoo = new Zoo();

		zoo.on('add:animals', (animal) => {
			expect(animal).toBeInstanceOf(Animal);
		});

		new Animal({ name: 'Jumbo', species: 'elephant', weight: 2000, livesIn: zoo });
		expect(zoo.get('animals').length).toBe(1);

		zoo.get('animals').add({ name: 'Big guy', species: 'elephant', weight: 13000 }, { validate: true });

		expect(zoo.get('animals').length).toBe(1);
	});

	it('Updating (retrieving) a model keeps relation consistency intact', () => {
		const zoo = new Zoo();

		const lion = new Animal({
			species: 'Lion',
			livesIn: zoo
		});

		expect(zoo.get('animals').length).toBe(1);

		lion.set({
			id: 5,
			species: 'Lion',
			livesIn: zoo
		});

		expect(zoo.get('animals').length).toBe(1);

		zoo.set({
			name: 'Dierenpark Amersfoort',
			animals: [5]
		});

		expect(zoo.get('animals').length).toBe(1);
		expect(zoo.get('animals').at(0)).toBe(lion);
		expect(lion.get('livesIn')).toBe(zoo);

		const elephant = new Animal({
			species: 'Elephant',
			livesIn: zoo
		});

		expect(zoo.get('animals').length).toBe(2);
		expect(elephant.get('livesIn')).toBe(zoo);

		zoo.set({
			id: 2
		});

		expect(zoo.get('animals').length).toBe(2);
		expect(lion.get('livesIn')).toBe(zoo);
		expect(elephant.get('livesIn')).toBe(zoo);
	});

	it('Setting id on objects with reverse relations updates related collection correctly', () => {
		const zoo1 = new Zoo();

		expect(zoo1.get('animals').size()).toBe(0);

		const lion = new Animal({ livesIn: 2 });
		zoo1.set('id', 2);

		expect(lion.get('livesIn')).toBe(zoo1);
		expect(zoo1.get('animals').length).toBe(1);
		expect(zoo1.get('animals').at(0)).toBe(lion);
		expect(zoo1.get('animals').get(lion)).toBe(lion);

		lion.set({ id: 5, livesIn: 2 });

		expect(lion.get('livesIn')).toBe(zoo1);
		expect(zoo1.get('animals').length).toBe(1);
		expect(zoo1.get('animals').at(0)).toBe(lion);
		expect(zoo1.get('animals').get(lion)).toBe(lion);

		const elephant = new Animal({ id: 6 });
		const tiger = new Animal({ id: 7 });
		const zoo2 = new Zoo({ animals: [6] });

		expect(elephant.get('livesIn')).toBe(zoo2);
		expect(zoo2.get('animals').length).toBe(1);
		expect(zoo2.get('animals').at(0)).toBe(elephant);
		expect(zoo2.get('animals').get(elephant)).toBe(elephant);

		zoo2.set({ id: 5, animals: [6, 7] });

		expect(elephant.get('livesIn')).toBe(zoo2);
		expect(tiger.get('livesIn')).toBe(zoo2);
		expect(zoo2.get('animals').length).toBe(2);
		expect(zoo2.get('animals').at(0)).toBe(elephant);
		expect(zoo2.get('animals').at(1)).toBe(tiger);
		expect(zoo2.get('animals').get(elephant)).toBe(elephant);
		expect(zoo2.get('animals').get(tiger)).toBe(tiger);
	});

	it('Collections can be passed as attributes on creation', () => {
		const animals = new AnimalCollection([
			{ id: 1, species: 'Lion' },
			{ id: 2, species: 'Zebra' }
		]);

		const zoo = new Zoo({ animals: animals });

		expect(zoo.get('animals')).toBe(animals);
		expect(zoo.get('animals').length).toBe(2);

		zoo.destroy();

		const newZoo = new Zoo({ animals: animals.models });

		expect(newZoo.get('animals').length).toBe(2);
	});

	it('Models can be passed as attributes on creation', () => {
		const artis = new Zoo({ name: 'Artis' });

		const animal = new Animal({ species: 'Hippo', livesIn: artis });

		expect(artis.get('animals').at(0)).toBe(animal);
		expect(animal.get('livesIn')).toBe(artis);
	});

	it('id checking handles `undefined`, `null`, `0` ids properly', () => {
		let parent = new Node();
		let child = new Node({ parent: parent });

		expect(child.get('parent')).toBe(parent);
		parent.destroy();
		expect(child.get('parent')).toBe(null);

		new Node();
		expect(child.get('parent')).toBe(null);

		child = new Node({ parent: 0 });
		expect(child.get('parent')).toBe(null);

		parent = new Node({ id: 0 });
		expect(child.get('parent')).toBe(parent);

		child.destroy();
		parent.destroy();

		parent = new Node({ id: 0 });
		expect(parent.get('children').length).toBe(0);

		child = new Node({ parent: 0 });
		expect(child.get('parent')).toBe(parent);
	});

	it('Relations are not affected by `silent: true`', () => {
		const ceo = new Person({ id: 1 });
		const company = new Company(
			{
				employees: [{ id: 2 }, { id: 3 }, 4],
				ceo: 1
			},
			{ silent: true }
		);
		const employees = company.get('employees');
		const employee = employees.first();

		expect(company.get('ceo')).toBe(ceo);
		expect(employees).toBeInstanceOf(Backbone.Relational.Collection);
		expect(employees.length).toBe(2);

		employee.set('company', null, { silent: true });
		expect(employees.length).toBe(1);

		employees.add(employee, { silent: true });
		expect(employee.get('company')).toBe(company);

		ceo.set('runs', null, { silent: true });
		expect(company.get('ceo')).toBeFalsy();

		new Job({ id: 4 });
		expect(employees.length).toBe(3);
	});

	it('Repeated model initialization and a collection should not break existing models', () => {
		const dataCompanyA = {
			id: 'company-a',
			name: 'Big Corp.',
			employees: [{ id: 'job-a' }, { id: 'job-b' }]
		};
		const dataCompanyB = {
			id: 'company-b',
			name: 'Small Corp.',
			employees: []
		};

		const companyA = new Company(dataCompanyA);

		expect(() => new Company(dataCompanyA)).toThrow();

		expect(companyA.get('employees')).toBeInstanceOf(Backbone.Relational.Collection);
		expect(companyA.get('employees').length).toBe(2);

		const CompanyCollection = Backbone.Relational.Collection.extend({
			model: Company
		});
		const companyCollection = new CompanyCollection([dataCompanyA, dataCompanyB]);

		expect(companyCollection.get(dataCompanyA.id)).toBe(companyA);
		expect(companyA.get('employees')).toBeInstanceOf(Backbone.Relational.Collection);
		expect(companyA.get('employees').length).toBe(2);
	});

	it('Destroy removes models from (non-reverse) relations', () => {
		const agent = new Agent({ id: 1, customers: [2, 3, 4], address: { city: 'Utrecht' } });

		const c2 = new Customer({ id: 2 });
		const c3 = new Customer({ id: 3 });
		const c4 = new Customer({ id: 4 });

		expect(agent.get('customers').length).toBe(3);

		c2.destroy();

		expect(agent.get('customers').length).toBe(2);
		expect(agent.get('customers').get(c3)).toBe(c3);
		expect(agent.get('customers').get(c4)).toBe(c4);

		agent.get('customers').remove(c3);

		expect(agent.get('customers').length).toBe(1);

		expect(agent.get('address')).toBeInstanceOf(Address);

		agent.get('address').destroy();

		expect(agent.get('address')).toBeFalsy();

		agent.destroy();

		expect(agent.get('customers').length).toBe(0);
	});

	it("If keySource is used, don't remove a model that is present in the key attribute", () => {
		const ForumPost = Backbone.Relational.Model.extend({});
		const Forum = Backbone.Relational.Model.extend({
			relations: [
				{
					type: Backbone.Relational.HasMany,
					key: 'posts',
					relatedModel: ForumPost,
					reverseRelation: {
						key: 'forum',
						keySource: 'forum_id'
					}
				}
			]
		});

		const testPost = new ForumPost({
			id: 1,
			title: 'Hello World',
			forum: { id: 1, title: 'Cupcakes' }
		});

		const testForum = Forum.findOrCreate(1);

		expect(testPost.get('forum')).not.toBe(null);
		expect(testPost.get('forum').get('title')).toBe('Cupcakes');
		expect(testForum.get('title')).toBe('Cupcakes');

		const testPost2 = new ForumPost({
			id: 3,
			title: 'Hello World',
			forum: { id: 2, title: 'Donuts' },
			forum_id: 3
		});

		expect(testPost2.get('forum')).not.toBe(null);
		expect(testPost2.get('forum').get('title')).toBe('Donuts');
		expect(testPost2.getRelation('forum').keyContents).toEqual({ id: 2, title: 'Donuts' });
		expect(testPost2.getRelation('forum').keyId).toBe(null);

		const testPost3 = new ForumPost({
			id: 4,
			title: 'Hello World',
			forum: null,
			forum_id: 3
		});

		expect(testPost3.get('forum')).toBe(null);
		expect(testPost3.getRelation('forum').keyId).toBe(3);
	});

	// GH-187
	it('Can pass related model in constructor', () => {
		const A = Backbone.Relational.Model.extend();
		const B = Backbone.Relational.Model.extend({
			relations: [
				{
					type: Backbone.Relational.HasOne,
					key: 'a',
					keySource: 'a_id',
					relatedModel: A
				}
			]
		});

		const a1 = new A({ id: 'a1' });
		const b1 = new B();
		b1.set('a', a1);
		expect(b1.get('a')).toBeInstanceOf(A);
		expect(b1.get('a').id).toBe('a1');

		const a2 = new A({ id: 'a2' });
		const b2 = new B({ a: a2 });
		expect(b2.get('a')).toBeInstanceOf(A);
		expect(b2.get('a').id).toBe('a2');
	});
});
