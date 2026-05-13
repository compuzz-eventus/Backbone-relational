import { bench, describe } from 'vitest';

const Backbone = window.Backbone;

Backbone.Relational.showWarnings = false;

const Child = Backbone.Relational.Model.extend({
	urlRoot: '/child/'
});

const Parent = Backbone.Relational.Model.extend({
	urlRoot: '/parent/',
	relations: [
		{
			type: Backbone.Relational.HasMany,
			key: 'children',
			relatedModel: Child,
			reverseRelation: { key: 'parent' }
		}
	]
});

const Parents = Backbone.Relational.Collection.extend({ model: Parent });

function buildData(parentCount, childrenPerParent) {
	const data = [];
	for (let i = 1; i <= parentCount; i++) {
		const children = [];
		for (let j = 1; j <= childrenPerParent; j++) {
			children.push({ id: `p-${i}-c${j}`, name: `child-${j}` });
		}
		data.push({ id: `p-${i}`, name: `parent-${i}`, children });
	}
	return data;
}

// Each bench iteration MUST reset the store inline — Tinybench setup hooks run
// once per `bench()` call, not per iteration, so without an inline reset
// successive iterations collide on ids and throw.
const BENCH_OPTS = { time: 500, warmupTime: 100 };

describe('Construction', () => {
	const SMALL = buildData(50, 3);
	const LARGE = buildData(300, 5);

	bench(
		'reset 50 parents × 3 children (HasMany + reverse)',
		() => {
			Backbone.Relational.store.reset();
			new Parents().reset(SMALL);
		},
		BENCH_OPTS
	);

	bench(
		'reset 300 parents × 5 children (HasMany + reverse)',
		() => {
			Backbone.Relational.store.reset();
			new Parents().reset(LARGE);
		},
		BENCH_OPTS
	);
});

describe('Mutation', () => {
	const DATA = buildData(100, 4);

	bench(
		'destroy 100 parents (cascades through children)',
		() => {
			Backbone.Relational.store.reset();
			const parents = new Parents();
			parents.reset(DATA);
			for (const p of parents.models.slice()) {
				for (const c of p.get('children').models.slice()) c.destroy();
				p.destroy();
			}
		},
		BENCH_OPTS
	);

	bench(
		'add/remove 100 children on one parent',
		() => {
			Backbone.Relational.store.reset();
			const parent = new Parent({ id: 'mut-parent' });
			const coll = parent.get('children');
			const children = [];
			for (let i = 1; i <= 100; i++) {
				const c = new Child({ id: `mut-c-${i}` });
				coll.add(c);
				children.push(c);
			}
			for (const c of children) coll.remove(c);
		},
		BENCH_OPTS
	);
});

describe('Serialization', () => {
	const DATA = buildData(100, 4);

	bench(
		'toJSON on 100 parents with 4 children each',
		() => {
			Backbone.Relational.store.reset();
			const parents = new Parents();
			parents.reset(DATA);
			parents.toJSON();
		},
		BENCH_OPTS
	);
});
