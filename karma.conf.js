module.exports = function(config) {
	var browserifyOptions = {
		debug: true
	};
	if (config.lodash) browserifyOptions.transform = [
		['aliasify', {
			aliases: {
				underscore: 'lodash',
			},
		}],
	];
	config.set({
		frameworks: [
			'browserify',
			'qunit'
		],
		plugins: [
			'karma-browserify',
			'karma-chrome-launcher',
			'karma-qunit'
		],

		files: [
			'test/setup/qunit1-shim.js',
			'test/setup/environment.js',
			'test/*.js'
		],

		preprocessors: {
			'test/**/*.js': [ 'browserify' ]
		},

		browserify: browserifyOptions,

		browsers: ['ChromeHeadless'],

		autoWatch: false,
		port: 9877,
		colors: true,
		singleRun: true,
		logLevel: config.LOG_INFO
	});
}
