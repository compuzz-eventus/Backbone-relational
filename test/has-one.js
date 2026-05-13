import { describe, it, beforeEach, expect } from 'vitest';
import initObjects from './setup/data.js';

describe('Backbone.Relational.HasOne', () => {
	beforeEach(initObjects);

	it('HasOne relations on Person are set up properly', () => {
		expect(person1.get('likesALot')).toBe(person2);
		expect(person1.get('user').id).toBe('user-1');
		expect(person2.get('likesALot')).toBe(person1);
	});

	it('Reverse HasOne relations on Person are set up properly', () => {
		expect(person1.get('likedALotBy')).toBe(person2);
		expect(person1.get('user').get('person')).toBe(person1);
		expect(person2.get('likedALotBy')).toBe(person1);
	});

	it("'set' triggers 'change' and 'update', on a HasOne relation, for a Model with multiple relations", () => {
		const password = new Password({ plaintext: 'asdf' });
		const oldLogin = person1.get('user').get('login');

		person1.on('change', (model) => {
			expect(model.get('user')).toBeInstanceOf(User);
			expect(model.previous('user').get('login')).toBe(oldLogin);
		});

		person1.on('change:user', (model) => {
			expect(model.get('user')).toBeInstanceOf(User);
			expect(model.previous('user').get('login')).toBe(oldLogin);
		});

		person1.on('change:user', (model, attr) => {
			expect(model.get('user')).toBeInstanceOf(User);
			expect(attr.get('person')).toBe(person1);
			expect(attr.get('password')).toBeInstanceOf(Password);
			expect(attr.get('password').get('plaintext')).toBe('qwerty');
		});

		const userData = { login: 'me@hotmail.com', password: { plaintext: 'qwerty' } };
		person1.set({ user: userData });

		const user = person1.get('user').on('change:password', (model, attr) => {
			expect(attr.get('plaintext')).toBe('asdf');
		});

		user.set({ password: password });
	});

	it("'set' doesn't triggers 'change' and 'change:' when passed `silent: true`", () => {
		person1.on('change', () => {
			throw new Error("'change' should not get triggered");
		});

		person1.on('change:user', () => {
			throw new Error("'change:user' should not get triggered");
		});

		expect(person1.get('user')).toBeInstanceOf(User);

		const user = new User({ login: 'me@hotmail.com', password: { plaintext: 'qwerty' } });
		person1.set('user', user, { silent: true });

		expect(person1.get('user')).toBe(user);
	});

	it("'unset' triggers 'change' and 'change:<key>'", () => {
		person1.on('change', (model) => {
			expect(model.get('user')).toBe(null);
		});

		person1.on('change:user', (model, attr) => {
			expect(attr).toBe(null);
		});

		expect(person1.get('user')).toBeInstanceOf(User);

		const user = person1.get('user');
		person1.unset('user');

		expect(user.get('person')).toBe(null);
	});

	it("'clear' triggers 'change' and 'change:<key>'", () => {
		person1.on('change', (model) => {
			expect(model.get('user')).toBe(null);
		});

		person1.on('change:user', (model, attr) => {
			expect(attr).toBe(null);
		});

		expect(person1.get('user')).toBeInstanceOf(User);

		const user = person1.get('user');
		person1.clear();

		expect(user.get('person')).toBe(null);
	});
});
