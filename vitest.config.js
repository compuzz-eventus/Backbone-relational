import { defineConfig } from 'vitest/config';

export default defineConfig({
	test: {
		environment: 'happy-dom',
		globals: true,
		include: ['test/*.js'],
		exclude: ['node_modules/**', 'test/setup/**', 'bench/**'],
		setupFiles: ['./test/setup/environment.js'],
		benchmark: {
			include: ['bench/**/*.bench.js'],
			setupFiles: ['./test/setup/environment.js'],
			reporters: ['default']
		},
		coverage: {
			provider: 'v8',
			reporter: ['text', 'html', 'lcov'],
			include: ['backbone-relational.js'],
			reportsDirectory: 'coverage',
			thresholds: {
				lines: 90,
				statements: 90,
				functions: 90,
				branches: 78
			}
		}
	}
});
