// Imported by Vitest as a setupFile (see vitest.config.js).
//
// Side-effect import : `./objects.js` bootstraps the globals
// (window.Backbone, window._, window.$, Backbone.Relational) and defines the
// fixture models on `window`. We do it via import rather than re-doing the
// setup here because ESM hoists imports — defining models requires those
// globals to exist first.
import './objects.js';

if (!window.console) {
	const names = [
		'log',
		'debug',
		'info',
		'warn',
		'error',
		'assert',
		'dir',
		'dirxml',
		'group',
		'groupEnd',
		'time',
		'timeEnd',
		'count',
		'trace',
		'profile',
		'profileEnd'
	];
	window.console = {};
	for (const name of names) window.console[name] = function () {};
}

window.requests = [];

Backbone.ajax = function (settings) {
	const callbackContext = settings.context || this;
	let dfd = new $.Deferred();

	dfd = _.extend(settings, dfd);

	dfd.respond = function (status, responseText) {
		/**
		 * Trigger success/error with arguments like jQuery would:
		 *   if (isSuccess) {
		 *     deferred.resolveWith(callbackContext, [success, statusText, jqXHR]);
		 *   } else {
		 *     deferred.rejectWith(callbackContext, [jqXHR, statusText, error]);
		 *   }
		 */
		if ((status >= 200 && status < 300) || status === 304) {
			_.isFunction(settings.success) && settings.success(responseText, 'success', dfd);
			dfd.resolveWith(callbackContext, [responseText, 'success', dfd]);
		} else {
			_.isFunction(settings.error) && settings.error(responseText, 'error', 'Internal Server Error');
			dfd.rejectWith(callbackContext, [dfd, 'error', 'Internal Server Error']);
		}
	};

	// Add the request before triggering callbacks that may get us in here again
	window.requests.push(dfd);

	// If a `response` has been defined, execute it.
	// If status < 299, trigger 'success'; otherwise, trigger 'error'
	if (settings.response && settings.response.status) {
		dfd.respond(settings.response.status, settings.response.responseText);
	}

	return dfd;
};

Backbone.Model.prototype.url = function () {
	// Use the 'resource_uri' if possible
	let url = this.get('resource_uri');

	// Try to have the collection construct a url
	if (!url && this.collection) {
		url = this.collection.url && _.isFunction(this.collection.url) ? this.collection.url() : this.collection.url;
	}

	// Fallback to 'urlRoot'
	if (!url && this.urlRoot) {
		url = this.urlRoot + this.id;
	}

	if (!url) {
		throw new Error('Url could not be determined!');
	}

	return url;
};
