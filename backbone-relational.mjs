// ESM wrapper around the UMD source (backbone-relational.js).
//
// The single-file UMD module exposes Backbone-relational via three paths:
// AMD, CommonJS, and a browser global on `window.Backbone.Relational`. Modern
// consumers using `import` want a real ESM entry — this wrapper provides it
// without introducing a bundler. It re-exports the populated module under
// both a default export and named exports, and also mirrors the assignment
// to `Backbone.Relational` so legacy code that reaches for the global still
// works when this wrapper is the entry point.
//
// The .js source remains the source of truth; this file is a thin facade.

import Backbone from 'backbone';
import Relational from './backbone-relational.js';

if (typeof Backbone === 'object' && Backbone && !Backbone.Relational) {
	Backbone.Relational = Relational;
}

export default Relational;

export const { Model, Collection, HasOne, HasMany, Relation, Semaphore, BlockingQueue, store, eventQueue } = Relational;
