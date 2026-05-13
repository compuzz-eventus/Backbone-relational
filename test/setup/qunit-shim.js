import { it, expect } from 'vitest';

/**
 * QUnit -> Vitest shim.
 *
 * Les 16 fichiers de test ont été écrits contre l'API QUnit 1.x. Plutôt que de
 * les convertir un par un vers describe/it/expect, on expose un objet `QUnit`
 * minimal qui dispatche vers `it`/`expect` importés explicitement depuis vitest.
 * Les helpers d'assertion (`ok`, `equal`, etc.) restent accessibles globalement
 * comme avant.
 *
 * Note: malgré `globals: true` dans vitest.config, l'`expect` global de Vitest 4
 * ne renvoie pas la chaîne d'assertions attendue dans un contexte de setupFile.
 * On importe donc `expect` explicitement.
 *
 * Compatibilité couverte :
 *  - QUnit.module(name, { setup|beforeEach, teardown|afterEach })
 *  - QUnit.test(name [, expectedAssertions], fn(assert?))
 *  - assert.async() pour les tests asynchrones
 *  - assert.expect(N) pour vérifier le nombre d'assertions
 *  - assert.{ok,notOk,equal,notEqual,strictEqual,notStrictEqual,
 *            deepEqual,notDeepEqual,propEqual,notPropEqual,throws,raises}
 *  - mêmes méthodes exposées comme globals quand le test ne reçoit pas `assert`.
 */

const HELPERS = [
	'ok',
	'notOk',
	'equal',
	'notEqual',
	'strictEqual',
	'notStrictEqual',
	'deepEqual',
	'notDeepEqual',
	'propEqual',
	'notPropEqual',
	'throws',
	'raises',
	'expect'
];

function makeAssert() {
	let count = 0;
	let expected = null;
	const pendingAsync = [];

	const inc = () => {
		count++;
	};

	const a = {
		ok(value, message) {
			inc();
			expect(value, message).toBeTruthy();
		},
		notOk(value, message) {
			inc();
			expect(value, message).toBeFalsy();
		},
		equal(actual, expectedVal, message) {
			inc();
			// QUnit.equal compare en `==` (loose). On approxime : `==` direct si l'un est primitif.
			if (actual == expectedVal) return; // eslint-disable-line eqeqeq
			expect(actual, message).toEqual(expectedVal);
		},
		notEqual(actual, expectedVal, message) {
			inc();
			if (actual != expectedVal) return; // eslint-disable-line eqeqeq
			expect(actual, message).not.toEqual(expectedVal);
		},
		strictEqual(actual, expectedVal, message) {
			inc();
			expect(actual, message).toBe(expectedVal);
		},
		notStrictEqual(actual, expectedVal, message) {
			inc();
			expect(actual, message).not.toBe(expectedVal);
		},
		deepEqual(actual, expectedVal, message) {
			inc();
			expect(actual, message).toEqual(expectedVal);
		},
		notDeepEqual(actual, expectedVal, message) {
			inc();
			expect(actual, message).not.toEqual(expectedVal);
		},
		propEqual(actual, expectedVal, message) {
			inc();
			expect(actual, message).toEqual(expectedVal);
		},
		notPropEqual(actual, expectedVal, message) {
			inc();
			expect(actual, message).not.toEqual(expectedVal);
		},
		throws(block, expectedError, message) {
			inc();
			if (typeof expectedError === 'string') {
				message = expectedError;
				expectedError = undefined;
			}
			if (expectedError === undefined) {
				expect(block, message).toThrow();
			} else {
				expect(block, message).toThrow(expectedError);
			}
		},
		raises(...args) {
			return a.throws(...args);
		},
		expect(n) {
			expected = n;
		},
		async() {
			let resolve;
			const p = new Promise((res) => {
				resolve = res;
			});
			pendingAsync.push(p);
			return () => resolve();
		}
	};

	return {
		assert: a,
		getCount: () => count,
		getExpected: () => expected,
		waitAsync: () => Promise.all(pendingAsync)
	};
}

function installGlobals(assert) {
	const saved = {};
	for (const name of HELPERS) {
		if (typeof assert[name] === 'function') {
			saved[name] = globalThis[name];
			globalThis[name] = assert[name].bind(assert);
		}
	}
	return saved;
}

function uninstallGlobals(saved) {
	for (const name of HELPERS) {
		if (name in saved) globalThis[name] = saved[name];
	}
}

let currentModule = '';
let currentSetup = null;
let currentTeardown = null;

globalThis.QUnit = {
	module(name, hooks) {
		currentModule = name;
		if (hooks && typeof hooks === 'object') {
			currentSetup = hooks.beforeEach || hooks.setup || null;
			currentTeardown = hooks.afterEach || hooks.teardown || null;
		} else if (typeof hooks === 'function') {
			currentSetup = hooks;
			currentTeardown = null;
		} else {
			currentSetup = null;
			currentTeardown = null;
		}
	},

	test(name, expectedOrFn, maybeFn) {
		let expected, fn;
		if (typeof expectedOrFn === 'number') {
			expected = expectedOrFn;
			fn = maybeFn;
		} else {
			fn = expectedOrFn;
		}

		const setup = currentSetup;
		const teardown = currentTeardown;
		const fullName = currentModule ? `${currentModule} > ${name}` : name;

		it(fullName, async () => {
			if (setup) await setup();
			const ctx = makeAssert();
			const saved = installGlobals(ctx.assert);
			try {
				const ret = fn.call(globalThis, ctx.assert);
				if (ret && typeof ret.then === 'function') await ret;
				await ctx.waitAsync();

				const explicitExpect = ctx.getExpected();
				const declaredExpected = explicitExpect != null ? explicitExpect : expected;
				if (typeof declaredExpected === 'number') {
					expect(ctx.getCount(), `Expected ${declaredExpected} assertions, got ${ctx.getCount()}`).toBe(
						declaredExpected
					);
				}
			} finally {
				uninstallGlobals(saved);
				if (teardown) await teardown();
			}
		});
	}
};
