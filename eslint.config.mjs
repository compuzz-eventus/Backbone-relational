import js from '@eslint/js';
import prettier from 'eslint-config-prettier';
import globals from 'globals';

/**
 * Flat config ESLint v9+ (remplace .eslintrc.json).
 *
 * Toutes les règles purement stylistiques (indent, quotes, comma-spacing,
 * brace-style, etc.) ont été retirées : Prettier les gère. `eslint-config-prettier`
 * en fin de chaîne désactive aussi tout vestige stylistique des presets
 * recommended au cas où.
 *
 * Les globals AMD/Node/navigateur restent déclarés pour le code UMD de
 * `backbone-relational.js`.
 */
export default [
	{
		ignores: ['node_modules/**', '.yarn/**', 'coverage/**', 'static/**', 'docs/**', 'docs-api/**', 'index.html']
	},

	// Configuration commune au code source et aux tests.
	{
		languageOptions: {
			ecmaVersion: 2022,
			sourceType: 'commonjs',
			globals: {
				...globals.browser,
				...globals.node,
				...globals.amd,
				attachEvent: 'readonly',
				detachEvent: 'readonly',
				// Backbone, Underscore et jQuery sont exposés sur window dans
				// l'environnement navigateur et utilisés directement par le
				// code UMD et par les tests.
				Backbone: 'readonly',
				_: 'readonly',
				$: 'readonly'
			}
		},
		rules: {
			'block-scoped-var': 'error',
			// `properties: 'never'` : les propriétés type `resource_uri` viennent
			// d'APIs REST externes et ne suivent pas la convention JS.
			camelcase: ['error', { properties: 'never' }],
			'dot-notation': ['error', { allowKeywords: false }],
			eqeqeq: ['error', 'smart'],
			'max-depth': ['warn', 4],
			'max-params': ['warn', 5],
			'new-cap': ['error', { newIsCapExceptions: ['model'] }],
			'no-alert': 'error',
			'no-caller': 'error',
			'no-console': 'error',
			'no-debugger': 'error',
			'no-delete-var': 'error',
			'no-div-regex': 'warn',
			'no-dupe-args': 'error',
			'no-dupe-keys': 'error',
			'no-duplicate-case': 'error',
			'no-else-return': 'warn',
			'no-empty-character-class': 'error',
			'no-eval': 'error',
			'no-ex-assign': 'error',
			'no-extend-native': 'error',
			'no-extra-boolean-cast': 'error',
			'no-fallthrough': 'error',
			'no-func-assign': 'error',
			'no-global-assign': 'error',
			'no-implied-eval': 'error',
			'no-inner-declarations': 'error',
			'no-irregular-whitespace': 'error',
			'no-label-var': 'error',
			'no-labels': 'error',
			'no-lone-blocks': 'error',
			'no-lonely-if': 'error',
			'no-multi-str': 'error',
			'no-new-object': 'error',
			'no-new-wrappers': 'error',
			'no-obj-calls': 'error',
			'no-octal': 'error',
			'no-octal-escape': 'error',
			'no-proto': 'error',
			'no-redeclare': 'error',
			'no-shadow': 'error',
			'no-throw-literal': 'error',
			'no-undef': 'error',
			'no-undef-init': 'error',
			'no-undefined': 'error',
			'no-unneeded-ternary': 'error',
			'no-unreachable': 'error',
			'no-unsafe-negation': 'warn',
			'no-unused-expressions': ['error', { allowTernary: true, allowShortCircuit: true }],
			'no-with': 'error',
			radix: 'error',
			'use-isnan': 'error',
			'valid-typeof': 'error'
		}
	},

	// Tests : globals supplémentaires (modèles définis par
	// `test/setup/objects.js` sur `window` et utilisés sans `var`).
	{
		files: ['test/**/*.js'],
		languageOptions: {
			globals: {
				// Modèles globaux exposés par test/setup/objects.js
				Zoo: 'readonly',
				Animal: 'readonly',
				AnimalCollection: 'readonly',
				Person: 'readonly',
				PersonCollection: 'readonly',
				User: 'readonly',
				House: 'readonly',
				Job: 'readonly',
				Company: 'readonly',
				Node: 'readonly',
				Password: 'readonly',
				NoteCollection: 'readonly',
				Thing: 'readonly',
				Project: 'readonly',
				// Modèles fixtures définis ad hoc dans certains fichiers de
				// test puis réutilisés ailleurs via le scope global.
				Carnivore: 'readonly',
				Primate: 'readonly',
				Address: 'readonly',
				Agent: 'readonly',
				Customer: 'readonly',
				Shop: 'readonly',
				Visitor: 'readonly',
				// Instances et fixtures globales (test/setup/data.js + ad hoc)
				person1: 'readonly',
				person2: 'readonly',
				person3: 'readonly',
				oldCompany: 'readonly',
				newCompany: 'readonly',
				ourHouse: 'readonly',
				theirHouse: 'readonly',
				duplicateNode: 'readonly',
				requests: 'readonly'
			}
		},
		rules: {
			// Les tests historiques utilisent volontiers `console.warn` / `console.log`
			// dans les helpers de diagnostic.
			'no-console': 'off',
			// Le code de test legacy déclare beaucoup de variables qui shadow
			// celles d'une portée externe (helpers, fixtures réutilisés).
			'no-shadow': 'off',
			// Des assertions du type `_.isObject(x) && ok(...)` sont courantes.
			'no-unused-expressions': 'off',
			// `assert.equal(x, undefined)` est plus expressif que la
			// comparaison à un sentinel.
			'no-undefined': 'off',
			// Les benchmarks redéclarent `var start`, `var parents` à dessein
			// pour mesurer plusieurs passages dans la même fonction.
			'no-redeclare': 'off',
			// `dot-notation` avec `allowKeywords: false` rejette `assert.throws`
			// (`throws` est un mot réservé en ES3) — non pertinent en ES5+.
			'dot-notation': ['error', { allowKeywords: true }],
			// Constructeurs locaux `Carnivore`, `Primate` etc. instanciés via
			// `new` après une affectation depuis `Model.extend(...)`.
			'new-cap': 'off',
			// `for (var i = 0; ...)` puis `i` réutilisé hors du for est un
			// idiome récurrent du code de test legacy.
			'block-scoped-var': 'off',
			// Certains tests réécrivent `duplicateNode` (fixture partagée).
			'no-global-assign': 'off'
		}
	},

	// Source legacy : code 2011 dont les "violations" sont volontaires.
	{
		files: ['backbone-relational.js'],
		rules: {
			// `console.warn` est gated par `module.showWarnings` : c'est le
			// canal de diagnostic officiel de la lib.
			'no-console': 'off',
			// Constructeurs dynamiques type `new this.relatedModel(...)`.
			'new-cap': 'off',
			// Shadowing intentionnel dans les closures de relations.
			'no-shadow': 'off',
			// `var` hoisting et réutilisation hors bloc — pattern ES5 voulu.
			'block-scoped-var': 'off',
			// `undefined` utilisé explicitement comme sentinel.
			'no-undefined': 'off',
			// Cosmétique : on l'a laissé en warning historiquement, mais
			// `eslint --fix` (lint-staged) le ré-écrit mal et casse l'indent
			// que Prettier vient d'appliquer. On désactive pour stopper
			// l'auto-fix destructeur sur ce fichier legacy.
			'no-else-return': 'off'
		}
	},

	// Setup files : configurations Node + ES Module.
	{
		files: ['vitest.config.js', 'eslint.config.mjs'],
		languageOptions: {
			sourceType: 'module',
			globals: {
				...globals.node
			}
		}
	},

	// ESM : wrapper de la lib + benchmarks Vitest natif.
	{
		files: ['**/*.mjs', 'bench/**/*.js'],
		languageOptions: {
			sourceType: 'module'
		}
	},

	// Tests Vitest natifs et setup files, tous en ESM.
	{
		files: ['test/**/*.js'],
		languageOptions: {
			sourceType: 'module'
		}
	},

	// Doit rester dernier : désactive toute règle qui entrerait en conflit avec Prettier.
	prettier
];
