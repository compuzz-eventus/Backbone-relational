/* QUnit 1.x compatibility shim to run legacy tests on QUnit 2.x
   - Provides globals: module, test, asyncTest, ok, notOk, equal, notEqual,
     deepEqual, strictEqual, throws, expect, stop, start
   - Maps old module({ setup, teardown }) to QUnit.module with hooks
*/
(function() {
  function init() {
    if (!window.QUnit) { return; }
    var Q = window.QUnit;
    var legacyHooks = { beforeEach: null, afterEach: null };

  function currentAssert() {
    // During a test, QUnit.config.current is the test object
    // It exposes .assert in QUnit 2
    return (Q.config && Q.config.current && Q.config.current.assert) || Q.assert;
  }

  // Assertions
  window.ok = function(value, message) { currentAssert().ok(!!value, message); };
  window.notOk = function(value, message) { currentAssert().notOk(value, message); };
  window.equal = function(a, b, message) { currentAssert().equal(a, b, message); };
  window.notEqual = function(a, b, message) { currentAssert().notEqual(a, b, message); };
  window.deepEqual = function(a, b, message) { currentAssert().deepEqual(a, b, message); };
  window.strictEqual = function(a, b, message) { currentAssert().strictEqual(a, b, message); };
  window.throws = function(block, expected, message) { currentAssert().throws(block, expected, message); };
  window.raises = window.throws;
  window.expect = function(n) { currentAssert().expect(n); };

  // Async control (legacy aliases)
  window.stop = function() { currentAssert().timeout && currentAssert().timeout(0); };
  window.start = function() { /* no-op in QUnit 2; async handled via done() */ };

  // module adapter
  var originalModule = Q.module.bind(Q);
  var legacyModule = function(name, optsOrCb, nestedCb) {
    // If QUnit 2-style callback provided, delegate directly
    if (typeof optsOrCb === 'function' || typeof nestedCb === 'function') {
      return originalModule(name, optsOrCb, nestedCb);
    }
    if (!optsOrCb || typeof optsOrCb === 'function') {
      // QUnit 1 style: module(name, function(){ ... }); Rare in this repo; pass through
      return originalModule(name, optsOrCb);
    }
    var opts = optsOrCb || {};
    // Remember hooks to emulate QUnit 1 global module-scoped hooks
    legacyHooks = { beforeEach: null, afterEach: null };
    legacyHooks.beforeEach = (typeof opts.setup === 'function') ? opts.setup : (typeof opts.beforeEach === 'function' ? opts.beforeEach : null);
    legacyHooks.afterEach = (typeof opts.teardown === 'function') ? opts.teardown : (typeof opts.afterEach === 'function' ? opts.afterEach : null);
    // Also register an empty module so reporter groups tests under the module name
    originalModule(name, function(){});
  };
  window.module = legacyModule;
  Q.module = legacyModule;

  // test adapters
  var originalTest = Q.test.bind(Q);
  function wrapTest(fn) {
    return function(name, expectedOrCallback, maybeCallback) {
      var expected, callback;
      if (typeof expectedOrCallback === 'number') {
        expected = expectedOrCallback;
        callback = maybeCallback;
      } else {
        callback = expectedOrCallback;
      }
      // QUnit 1 used global assertions; our shim keeps that working
      return fn(name, function(assert) {
        // expose assert on QUnit to help certain patterns
        Q.assert = assert;
        // Run legacy beforeEach
        if (typeof legacyHooks.beforeEach === 'function') {
          try { legacyHooks.beforeEach.call(this); } catch(e) { /* let QUnit catch in test */ }
        }
        var ret;
        if (typeof expected === 'number') {
          assert.expect(expected);
        }
        try {
          ret = callback.call(this, assert);
        } finally {
          if (typeof legacyHooks.afterEach === 'function') {
            try { legacyHooks.afterEach.call(this); } catch(e) { /* ignore */ }
          }
        }
        return ret;
      });
    };
  }
  var patchedTest = wrapTest(originalTest);
  window.test = patchedTest;
  Q.test = patchedTest;
  window.asyncTest = function(name, callback) {
    originalTest(name, function(assert) {
      var done = assert.async();
      Q.assert = assert;
      if (typeof legacyHooks.beforeEach === 'function') {
        try { legacyHooks.beforeEach.call(this); } catch(e) {}
      }
      var finished = false;
      function finish() {
        if (finished) return; finished = true;
        if (typeof legacyHooks.afterEach === 'function') {
          try { legacyHooks.afterEach.call(this); } catch(e) {}
        }
        done();
      }
      try {
        var result = callback.call(this, assert);
        if (result && typeof result.then === 'function') {
          result.then(function(){ finish(); }, function(){ finish(); });
        } else {
          finish();
        }
      } catch (e) {
        finish();
        throw e;
      }
    });
  };
  Q.asyncTest = window.asyncTest;
  }

  if (window.QUnit) {
    init();
  } else if (window.addEventListener) {
    window.addEventListener('load', init);
  } else {
    var old = window.onload;
    window.onload = function() { if (old) old(); init(); };
  }
})();
