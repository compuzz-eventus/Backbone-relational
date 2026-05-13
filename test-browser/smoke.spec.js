// Smoke tests that exercise the UMD build in a real browser via Playwright.
// The happy-dom-based Vitest suite covers the lib's logic exhaustively;
// these tests only verify that the script-tag/UMD distribution path still
// works end-to-end : underscore + jquery + backbone load globally, then the
// lib exposes Backbone.Relational with usable Model/Collection/HasMany.

import { test, expect } from '@playwright/test';

test.beforeEach(async ({ page }) => {
	await page.goto('/test-browser/index.html');
	// Wait until the UMD script has run and exposed the global.
	await page.waitForFunction(() => typeof window.Backbone?.Relational?.Model === 'function');
});

test('exposes Backbone.Relational on the global', async ({ page }) => {
	const surface = await page.evaluate(() => {
		const R = window.Backbone.Relational;
		return {
			hasModel: typeof R.Model === 'function',
			hasCollection: typeof R.Collection === 'function',
			hasHasOne: typeof R.HasOne === 'function',
			hasHasMany: typeof R.HasMany === 'function',
			hasStore: typeof R.store === 'object' && R.store !== null,
			storeIsSingleton: R.store === R.store
		};
	});

	expect(surface).toEqual({
		hasModel: true,
		hasCollection: true,
		hasHasOne: true,
		hasHasMany: true,
		hasStore: true,
		storeIsSingleton: true
	});
});

test('HasMany + reverseRelation propagates correctly in a real browser', async ({ page }) => {
	const result = await page.evaluate(() => {
		const { Model, Collection, HasMany } = window.Backbone.Relational;

		const Animal = Model.extend({ urlRoot: '/animal/' });

		const Zoo = Model.extend({
			urlRoot: '/zoo/',
			relations: [
				{
					type: HasMany,
					key: 'animals',
					relatedModel: Animal,
					reverseRelation: { key: 'livesIn', includeInJSON: 'id' }
				}
			]
		});

		void Collection;

		const zoo = new Zoo({ id: 'z1', animals: [{ id: 'a1', species: 'Lion' }] });
		const animal = zoo.get('animals').at(0);

		return {
			animalsIsCollection: zoo.get('animals') instanceof window.Backbone.Collection,
			animalsLength: zoo.get('animals').length,
			animalSpecies: animal.get('species'),
			reverseLink: animal.get('livesIn') === zoo,
			jsonShape: animal.toJSON()
		};
	});

	expect(result.animalsIsCollection).toBe(true);
	expect(result.animalsLength).toBe(1);
	expect(result.animalSpecies).toBe('Lion');
	expect(result.reverseLink).toBe(true);
	expect(result.jsonShape.livesIn).toBe('z1');
});

test('store deduplicates instances across constructions', async ({ page }) => {
	const result = await page.evaluate(() => {
		const { Model } = window.Backbone.Relational;
		const Author = Model.extend({ urlRoot: '/authors/' });

		const a1 = Author.findOrCreate({ id: 1, name: 'A' });
		const a2 = Author.findOrCreate({ id: 1, name: 'B' });

		return {
			sameInstance: a1 === a2,
			mergedName: a1.get('name')
		};
	});

	expect(result.sameInstance).toBe(true);
	expect(result.mergedName).toBe('B');
});
