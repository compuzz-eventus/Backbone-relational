import { describe, it, beforeEach, expect } from 'vitest';
import { reset } from './setup/setup.js';

// Pilot for the QUnit → native Vitest migration. See docs/TESTING_MIGRATION.md
// for the full plan. Backbone and Underscore remain global via
// test/setup/environment.js (loaded as a setupFile).

describe('Backbone.Relational.Semaphore', () => {
	beforeEach(reset);

	it('Unbounded — acquire/release with optional permit cap', () => {
		const semaphore = _.extend({}, Backbone.Relational.Semaphore);

		expect(semaphore.isLocked()).toBe(false);

		semaphore.acquire();
		expect(semaphore.isLocked()).toBe(true);

		semaphore.acquire();
		expect(semaphore._permitsUsed).toBe(2);

		semaphore.setAvailablePermits(4);
		expect(semaphore._permitsAvailable).toBe(4);

		semaphore.acquire();
		semaphore.acquire();
		expect(semaphore._permitsUsed).toBe(4);

		expect(() => semaphore.acquire()).toThrow('Max permits acquired');

		semaphore.release();
		expect(semaphore._permitsUsed).toBe(3);

		semaphore.release();
		semaphore.release();
		semaphore.release();
		expect(semaphore._permitsUsed).toBe(0);
		expect(semaphore.isLocked()).toBe(false);

		expect(() => semaphore.release()).toThrow('All permits released');
	});
});
