/**
 * Reset variables that are persistent across tests, specifically
 * `window.requests` and the state of `Backbone.Relational.store`.
 *
 * Note: we **mutate** the existing eventQueue rather than replacing it.
 * Under Vite's CJS-to-ESM interop, the imported `Relational` default and
 * `Backbone.Relational` are a synthetic namespace whose properties are a
 * snapshot of the CJS module.exports at load time. The lib's internal
 * closure references the original `module.exports`. Reassigning
 * `Backbone.Relational.eventQueue = new BlockingQueue()` would only update
 * the snapshot — the closure-captured eventQueue would stay locked from
 * a previous test. Mutating the existing instance in place keeps both
 * views consistent.
 */
export function reset() {
	window.requests = [];

	Backbone.Relational.store.reset();
	Backbone.Relational.store.addModelScope(window);

	const eq = Backbone.Relational.eventQueue;
	eq._queue.length = 0;
	eq._permitsUsed = 0;
}
