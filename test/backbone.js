import { describe, it, beforeEach, expect } from 'vitest';
import { reset } from './setup/setup.js';

describe('General / Backbone', () => {
	beforeEach(reset);

	it('Prototypes, constructors and inheritance', () => {
		const Model = Backbone.Model.extend();
		const i = new Backbone.Model();
		const iModel = new Model();

		const RelModel = Backbone.Relational.Model.extend();
		const iRel = new Backbone.Relational.Model();
		const iRelModel = new RelModel();

		expect(Backbone.Model.constructor === Backbone.Relational.Model.constructor).toBe(true);

		expect(Backbone.Model).not.toBe(Backbone.Relational.Model);
		expect(Backbone.Model).toBe(Backbone.Model.prototype.constructor);
		expect(Backbone.Relational.Model).toBe(Backbone.Relational.Model.prototype.constructor);
		expect(Backbone.Model.prototype.constructor).not.toBe(Backbone.Relational.Model.prototype.constructor);

		expect(Model.prototype instanceof Backbone.Model).toBe(true);
		expect(Model.prototype instanceof Backbone.Relational.Model).toBe(false);
		expect(RelModel.prototype instanceof Backbone.Model).toBe(true);
		expect(Backbone.Relational.Model.prototype instanceof Backbone.Model).toBe(true);
		expect(RelModel.prototype instanceof Backbone.Relational.Model).toBe(true);

		expect(i instanceof Backbone.Model).toBe(true);
		expect(i instanceof Backbone.Relational.Model).toBe(false);
		expect(iRel instanceof Backbone.Model).toBe(true);
		expect(iRel instanceof Backbone.Relational.Model).toBe(true);

		expect(iModel instanceof Backbone.Model).toBe(true);
		expect(iModel instanceof Backbone.Relational.Model).toBe(false);
		expect(iRelModel instanceof Backbone.Model).toBe(true);
		expect(iRelModel instanceof Backbone.Relational.Model).toBe(true);
	});

	it('Collection#set', () => {
		const a = new Backbone.Model({ id: 3, label: 'a' });
		const b = new Backbone.Model({ id: 2, label: 'b' });
		const col = new Backbone.Relational.Collection([a]);

		col.set([a, b], { add: true, merge: false, remove: true });
		expect(col.length).toBe(2);
	});
});
