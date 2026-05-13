import { describe, it, beforeEach, expect } from 'vitest';
import semver from 'semver';
import { reset } from './setup/setup.js';

describe('Backbone.Relational.Collection', () => {
	beforeEach(reset);

	it("Loading (fetching) multiple times updates the model, and relations's `keyContents`", () => {
		const collA = new Backbone.Relational.Collection();
		collA.model = User;
		const collB = new Backbone.Relational.Collection();
		collB.model = User;

		let name = 'User 1';
		collA.add({ id: '/user/1/', name: name });
		const user = collA.at(0);
		expect(user.get('name')).toBe(name);

		name = 'New name';
		collA.add({ id: '/user/1/', name: name }, { merge: true });
		const updatedUser = collA.at(0);
		expect(user.get('name')).toBe(name);
		expect(updatedUser.get('name')).toBe(name);

		name = 'Another new name';
		collB.add({ id: '/user/1/', name: name, title: 'Superuser' }, { merge: true });
		const updatedUser2 = collA.at(0);
		expect(user.get('name')).toBe(name);
		expect(updatedUser2.get('name')).toBe(name);

		expect(collA.get('/user/1/')).toBe(updatedUser);
		expect(collA.get('/user/1/')).toBe(updatedUser2);
		expect(collB.get('/user/1/')).toBe(user);
	});

	it('Loading (fetching) a collection multiple times updates related models as well (HasOne)', () => {
		const coll = new PersonCollection();
		coll.add({ id: 'person-10', name: 'Person', user: { id: 'user-10', login: 'User' } });

		const person = coll.at(0);
		const user = person.get('user');

		expect(user.get('login')).toBe('User');

		coll.add({ id: 'person-10', name: 'New person', user: { id: 'user-10', login: 'New user' } }, { merge: true });

		expect(person.get('name')).toBe('New person');
		expect(user.get('login')).toBe('New user');
	});

	it('Loading (fetching) a collection multiple times updates related models as well (HasMany)', () => {
		const coll = new Backbone.Relational.Collection();
		coll.model = Zoo;

		coll.add({ id: 'zoo-1', name: 'Zoo', animals: [{ id: 'lion-1', name: 'Mufasa' }] });
		const zoo = coll.at(0);
		const lion = zoo.get('animals').at(0);

		expect(lion.get('name')).toBe('Mufasa');

		coll.add({ id: 'zoo-1', name: 'Zoo Station', animals: [{ id: 'lion-1', name: 'Simba' }] }, { merge: true });

		expect(zoo.get('name')).toBe('Zoo Station');
		expect(lion.get('name')).toBe('Simba');
	});

	it('reset should use `merge: true` by default', () => {
		const nodeList = new NodeList();

		nodeList.add([{ id: 1 }, { id: 2, parent: 1 }]);

		const node1 = nodeList.get(1);
		const node2 = nodeList.get(2);

		expect(node2.get('parent')).toBe(node1);
		expect(node1.get('parent')).toBeFalsy();

		nodeList.reset([{ id: 1, parent: 2 }]);

		expect(node1.get('parent')).toBe(node2);
	});

	it("Return values for add/remove/reset/set match plain Backbone's", () => {
		const Car = Backbone.Relational.Model.extend();
		const Cars = Backbone.Relational.Collection.extend({ model: Car });
		const cars = new Cars();

		expect(cars.add({ name: 'A' })).toBeInstanceOf(Car);

		const added = cars.add([{ name: 'B' }, { name: 'C' }]);
		expect(_.isArray(added)).toBe(true);
		expect(added.length).toBe(2);

		expect(cars.remove(cars.at(0))).toBeInstanceOf(Car);
		const removed = cars.remove([cars.at(0), cars.at(1)]);
		expect(_.isArray(removed)).toBe(true);
		expect(removed.length).toBe(2);

		expect(cars.reset({ name: 'D' })).toBeInstanceOf(Car);
		const resetResult = cars.reset([{ name: 'E' }, { name: 'F' }]);
		expect(_.isArray(resetResult)).toBe(true);
		expect(resetResult.length).toBe(2);
		expect(cars.length).toBe(2);

		const e = cars.at(0);
		const f = cars.at(1);

		expect(cars.set(e)).toBeInstanceOf(Car);
		expect(_.isArray(cars.set([e, f]))).toBe(true);
		let result = cars.remove([]);

		if (semver.satisfies(Backbone.VERSION, '^1.3.1') || Array.isArray(result)) {
			expect(result.length).toBe(0);
		} else {
			expect(result).toBe(false);
		}
		expect(cars.length).toBe(2);

		result = cars.remove(null);
		expect(_.isUndefined(result)).toBe(true);
		expect(cars.length).toBe(2);

		result = cars.set([]);
		expect(_.isArray(result) && !result.length).toBe(true);
		expect(cars.length).toBe(0);

		cars.set([e, f]);
		expect(cars.length).toBe(2);

		const setNullResult = cars.set(null);
		expect(_.isUndefined(setNullResult) || setNullResult === cars).toBe(true);
		expect(cars.length).toBe(2);
	});

	it('add/remove/set (with `add`, `remove` and `merge` options)', () => {
		const coll = new AnimalCollection();

		coll.add({ id: '1', species: 'giraffe' });
		expect(coll.length).toBe(1);

		coll.add({ id: 1, species: 'giraffe' });
		expect(coll.length).toBe(1);

		coll.add([
			{ id: 1, species: 'giraffe' },
			{ id: 2, species: 'gorilla' }
		]);

		const giraffe = coll.get(1);
		const gorilla = coll.get(2);
		const dolphin = new Animal({ species: 'dolphin' });
		const hippo = new Animal({ id: 4, species: 'hippo' });

		expect(coll.length).toBe(2);

		coll.add(dolphin);
		expect(coll.length).toBe(3);

		coll.add({ id: 1, species: 'giraffe', name: 'Long John' });
		expect(coll.get(1).get('name')).toBeFalsy();

		coll.add({ id: 1, species: 'giraffe', name: 'Long John' }, { merge: true });
		expect(coll.get(1).get('name')).toBe('Long John');

		coll.remove(1);

		expect(coll.length).toBe(2);
		expect(coll.get(1)).toBeFalsy();

		coll.remove(dolphin);

		expect(coll.length).toBe(1);
		expect(coll.get(2)).toBe(gorilla);

		coll.add(giraffe);

		let options = { add: false, merge: false, remove: false };
		coll.set([dolphin, { id: 2, name: 'Silverback' }], options);

		expect(coll.length).toBe(2);
		expect(coll.get(2)).toBe(gorilla);
		expect(coll.get(2).get('name')).toBeFalsy();

		options = { add: true, merge: true, remove: true };
		coll.set([4, dolphin, { id: 2, name: 'Silverback' }], options);

		expect(coll.length).toBe(3);
		expect(coll.get(1)).toBeFalsy();
		expect(coll.get(2)).toBe(gorilla);
		expect(coll.get(3)).toBeFalsy();
		expect(coll.get(4)).toBe(hippo);
		expect(coll.get(dolphin)).toBe(dolphin);
		expect(gorilla.get('name')).toBe('Silverback');
	});

	it('add/remove/set on a relation (with `add`, `remove` and `merge` options)', () => {
		const zoo = new Zoo();
		const animals = zoo.get('animals');
		const a = new Animal({ id: 'a' });
		const b = new Animal({ id: 'b' });
		const c = new Animal({ id: 'c' });

		zoo.set('animals', [a]);
		expect(animals.length).toBe(1);

		zoo.set('animals', [a, b], { add: false, merge: true, remove: true });
		expect(animals.length).toBe(1);

		zoo.set('animals', [b], { add: false, merge: false, remove: true });
		expect(animals.length).toBe(0);

		zoo.set('animals', [{ id: 'a', species: 'a' }], { add: false, merge: true, remove: false });
		expect(animals.length).toBe(0);
		expect(a.get('species')).toBe('a');

		zoo.set('animals', [{ id: 'b', species: 'b' }], { add: true, merge: false, remove: false });
		expect(animals.length).toBe(1);
		expect(b.get('species')).toBeFalsy();

		zoo.set('animals', [{ id: 'c', species: 'c' }], { add: true, merge: false, remove: true });
		expect(animals.length).toBe(1);
		expect(animals.get('b')).toBeFalsy();
		expect(animals.get('c')).toBe(c);
		expect(c.get('species')).toBeFalsy();

		zoo.set('animals', [a, { id: 'b', species: 'b' }]);
		expect(animals.length).toBe(2);
		expect(b.get('species')).toBe('b');
		expect(animals.get('c')).toBeFalsy();

		zoo.set('animals', [{ id: 'c', species: 'c' }], { add: true, merge: true, remove: false });
		expect(animals.length).toBe(3);
		expect(c.get('species')).toBe('c');
	});

	it('`merge` on a nested relation', () => {
		const zoo = new Zoo({ id: 1, animals: [{ id: 'a' }] });
		const animals = zoo.get('animals');
		const a = animals.get('a');

		expect(a.get('livesIn')).toBe(zoo);

		const zoo2 = new Zoo({ id: 2, animals: [{ id: 'a', species: 'a' }] }, { merge: false });

		expect(a.get('livesIn')).toBe(zoo2);
		expect(a.get('species')).toBeFalsy();
	});

	it('pop', () => {
		const zoo = new Zoo({
			animals: [{ name: 'a' }]
		});
		const animals = zoo.get('animals');

		const a = animals.pop();
		const b = animals.pop();

		expect(a && a.get('name')).toBe('a');
		expect(typeof b).toBe('undefined');
	});

	it("Adding a new model doesn't `merge` it onto itself", () => {
		let coll;
		const TreeModel = Backbone.Relational.Model.extend({
			relations: [
				{
					key: 'parent',
					type: Backbone.Relational.HasOne
				}
			],

			initialize: function () {
				if (coll) {
					coll.add(this);
				}
			}
		});

		const TreeCollection = Backbone.Relational.Collection.extend({
			model: TreeModel
		});

		coll = new TreeCollection();
		let model = coll.set({ id: 'm2', name: 'new model', parent: 'm1' });

		expect(model).toBeInstanceOf(TreeModel);
		expect(coll.size()).toBe(1);

		expect(model.get('parent')).toBe(null);
		expect(model.get('name')).toBe('new model');
		expect(model.getIdsToFetch('parent')).toEqual(['m1']);

		model = coll.set({ id: 'm2', name: 'updated model', parent: 'm1' });
		expect(model.get('name')).toBe('updated model');
		expect(model.getIdsToFetch('parent')).toEqual(['m1']);
	});
});
