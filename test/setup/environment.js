var _ = window._ = require('underscore');
var $ = window.$ = require('jquery');
var Backbone = window.Backbone = require('backbone');

// QUnit 1.x compatibility shims (these tests were written against the 1.x API).
// `karma-qunit` injects QUnit on `window` before this file runs.
(function () {
	if (typeof QUnit === 'undefined') return;

	// Map the legacy `setup`/`teardown` keys on QUnit.module hooks to `beforeEach`/`afterEach`.
	var origModule = QUnit.module;
	QUnit.module = function (name, hooks, nested) {
		if (hooks && typeof hooks === 'object') {
			if (hooks.setup && !hooks.beforeEach) hooks.beforeEach = hooks.setup;
			if (hooks.teardown && !hooks.afterEach) hooks.afterEach = hooks.teardown;
		}
		return origModule.apply(QUnit, arguments);
	};

	// Wrap QUnit.test so the legacy 3-arg form `(name, expected, fn)` keeps working,
	// and so global assertion helpers (`ok`, `equal`, ...) work without an `assert` param.
	var assertMethods = [
		'ok', 'notOk', 'equal', 'notEqual', 'strictEqual', 'notStrictEqual',
		'deepEqual', 'notDeepEqual', 'propEqual', 'notPropEqual',
		'throws', 'raises', 'expect'
	];
	var origTest = QUnit.test;
	QUnit.test = function (name, callbackOrExpected, maybeCallback) {
		var expected, callback;
		if (typeof callbackOrExpected === 'number') {
			expected = callbackOrExpected;
			callback = maybeCallback;
		} else {
			callback = callbackOrExpected;
		}

		return origTest.call(QUnit, name, function (assert) {
			if (typeof expected === 'number') assert.expect(expected);

			var saved = {};
			assertMethods.forEach(function (m) {
				if (typeof assert[m] === 'function') {
					saved[m] = window[m];
					window[m] = assert[m].bind(assert);
				}
			});
			try {
				return callback.call(this, assert);
			} finally {
				assertMethods.forEach(function (m) {
					if (m in saved) window[m] = saved[m];
				});
			}
		});
	};
})();

//sessionStorage.clear();
if ( ! window.console ) {
	var names = [ 'log', 'debug', 'info', 'warn', 'error', 'assert', 'dir', 'dirxml',
	'group', 'groupEnd', 'time', 'timeEnd', 'count', 'trace', 'profile', 'profileEnd' ];
	window.console = {};
	for ( var i = 0; i < names.length; ++i )
		window.console[ names[i] ] = function() {};
}

window.requests = [];

Backbone.ajax = function( settings ) {
	var callbackContext = settings.context || this,
		dfd = new $.Deferred();

	dfd = _.extend( settings, dfd );

	dfd.respond = function( status, responseText ) {
		/**
		 * Trigger success/error with arguments like jQuery would:
		 * // Success/Error
		 * if ( isSuccess ) {
		 *   deferred.resolveWith( callbackContext, [ success, statusText, jqXHR ] );
		 * } else {
		 *   deferred.rejectWith( callbackContext, [ jqXHR, statusText, error ] );
		 * }
		 */
		if ( status >= 200 && status < 300 || status === 304 ) {
			_.isFunction( settings.success ) && settings.success( responseText, 'success', dfd );
			dfd.resolveWith( callbackContext, [ responseText, 'success', dfd ] );
		}
		else {
			_.isFunction( settings.error ) && settings.error( responseText, 'error', 'Internal Server Error' );
			dfd.rejectWith( callbackContext, [ dfd, 'error', 'Internal Server Error' ] );
		}
	};

	// Add the request before triggering callbacks that may get us in here again
	window.requests.push( dfd );

	// If a `response` has been defined, execute it.
	// If status < 299, trigger 'success'; otherwise, trigger 'error'
	if ( settings.response && settings.response.status ) {
		dfd.respond( settings.response.status, settings.response.responseText );
	}

	return dfd;
};

Backbone.Model.prototype.url = function() {
	// Use the 'resource_uri' if possible
	var url = this.get( 'resource_uri' );

	// Try to have the collection construct a url
	if ( !url && this.collection ) {
		url = this.collection.url && _.isFunction( this.collection.url ) ? this.collection.url() : this.collection.url;
	}

	// Fallback to 'urlRoot'
	if ( !url && this.urlRoot ) {
		url = this.urlRoot + this.id;
	}

	if ( !url ) {
		throw new Error( 'Url could not be determined!' );
	}

	return url;
};
