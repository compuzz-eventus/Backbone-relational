QUnit.module('Backbone.Relational.BlockingQueue', { setup: require('./setup/setup').reset });

QUnit.test('Block', function () {
	var queue = new Backbone.Relational.BlockingQueue();
	var count = 0;
	var increment = function () {
		count++;
	};
	var decrement = function () {
		count--;
	};

	queue.add(increment);
	ok(count === 1, 'Increment executed right away');

	queue.add(decrement);
	ok(count === 0, 'Decrement executed right away');

	queue.block();
	queue.add(increment);

	ok(queue.isLocked(), 'Queue is blocked');
	equal(count, 0, 'Increment did not execute right away');

	queue.block();
	queue.block();

	equal(queue._permitsUsed, 3, '_permitsUsed should be incremented to 3');

	queue.unblock();
	queue.unblock();
	queue.unblock();

	equal(count, 1, 'Increment executed');
});

QUnit.test('process continues after a queued handler throws', function () {
	var queue = new Backbone.Relational.BlockingQueue();
	var ran = [];

	queue.block();
	queue.add(function () {
		ran.push(1);
	});
	queue.add(function () {
		ran.push(2);
		throw new Error('simulated');
	});
	queue.add(function () {
		ran.push(3);
	});

	// The fix logs a warning when a handler throws; silence it during the test.
	var origWarn = typeof console !== 'undefined' ? console.warn : null;
	if (origWarn) {
		console.warn = function () {};
	}
	try {
		queue.unblock();
	} finally {
		if (origWarn) {
			console.warn = origWarn;
		}
	}

	deepEqual(ran, [1, 2, 3], 'all three handlers ran despite the middle one throwing');
});
