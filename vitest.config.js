import { defineConfig } from 'vitest/config';

export default defineConfig({
	test: {
		environment: 'happy-dom',
		globals: true,
		include: ['test/*.js'],
		exclude: ['node_modules/**', 'test/setup/**'],
		setupFiles: ['./test/setup/qunit-shim.js', './test/setup/environment.js'],
		coverage: {
			provider: 'v8',
			reporter: ['text', 'html', 'lcov'],
			include: ['backbone-relational.js'],
			reportsDirectory: 'coverage'
		}
	}
});
