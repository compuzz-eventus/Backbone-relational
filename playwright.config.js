import { defineConfig, devices } from '@playwright/test';

// Browser smoke tests for the UMD build. See test-browser/ for the page +
// specs. Vitest (in test/) keeps full logic coverage via happy-dom ; Playwright
// only validates that the script-tag distribution path works in a real engine.
export default defineConfig({
	testDir: './test-browser',
	testMatch: '**/*.spec.js',
	timeout: 30_000,
	expect: { timeout: 5_000 },
	fullyParallel: true,
	forbidOnly: !!process.env.CI,
	retries: process.env.CI ? 2 : 0,
	reporter: process.env.CI ? [['list'], ['github']] : 'list',

	use: {
		baseURL: 'http://127.0.0.1:8765',
		trace: 'on-first-retry'
	},

	projects: [
		{ name: 'chromium', use: { ...devices['Desktop Chrome'] } },
		{ name: 'firefox', use: { ...devices['Desktop Firefox'] } },
		{ name: 'webkit', use: { ...devices['Desktop Safari'] } }
	],

	webServer: {
		command: 'yarn http-server -p 8765 -s --cors',
		url: 'http://127.0.0.1:8765/test-browser/index.html',
		reuseExistingServer: !process.env.CI,
		stdout: 'ignore',
		stderr: 'pipe'
	}
});
