import { describe, it, beforeEach, expect } from 'vitest';
import { reset } from './setup/setup.js';

describe('Backbone.Relational.BlockingQueue', () => {
	beforeEach(reset);

	it('Block', () => {
		const queue = new Backbone.Relational.BlockingQueue();
		let count = 0;
		const increment = () => {
			count++;
		};
		const decrement = () => {
			count--;
		};

		queue.add(increment);
		expect(count).toBe(1);

		queue.add(decrement);
		expect(count).toBe(0);

		queue.block();
		queue.add(increment);

		expect(queue.isLocked()).toBe(true);
		expect(count).toBe(0);

		queue.block();
		queue.block();

		expect(queue._permitsUsed).toBe(3);

		queue.unblock();
		queue.unblock();
		queue.unblock();

		expect(count).toBe(1);
	});

	it('process continues after a queued handler throws', () => {
		const queue = new Backbone.Relational.BlockingQueue();
		const ran = [];

		queue.block();
		queue.add(() => {
			ran.push(1);
		});
		queue.add(() => {
			ran.push(2);
			throw new Error('simulated');
		});
		queue.add(() => {
			ran.push(3);
		});

		const origWarn = typeof console !== 'undefined' ? console.warn : null;
		if (origWarn) {
			console.warn = () => {};
		}
		try {
			queue.unblock();
		} finally {
			if (origWarn) {
				console.warn = origWarn;
			}
		}

		expect(ran).toEqual([1, 2, 3]);
	});
});
