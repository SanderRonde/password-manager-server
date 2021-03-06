const rollupResolve = require('rollup-plugin-node-resolve');
const rollupCommonJs = require('rollup-plugin-commonjs');
const requireHacker = require('require-hacker');
const htmlMinifier = require('html-minifier');
const htmlTypings = require('html-typings');
const uglifyCSS = require('uglifycss');
const watch = require('gulp-watch');
const uglify = require('uglify-es');
const babel = require('babel-core');
const crypto = require('crypto');
const rollup = require('rollup');
const chalk = require('chalk');
const fs = require('fs-extra');
const gulp = require('gulp');
const path = require('path');
const glob = require('glob');
const md5 = require('md5');

/**
 * Adds a description to given function
 * 
 * @template T
 * @param {string} description - The description of the task
 * @param {T} [toRun] - The function to execute
 * 
 * @returns {T} The task
 */
function addDescription(description, toRun) {
	toRun.description = description;
	return toRun;
}

/**
 * Dictionary with the descriptions for the tasks that registered one
 * 
 * @type {Map<string, string>}
 */
const descriptions = new Map();

/**
 * Generates a root task with given description
 * 	root tasks are meant to be called, contrary to
 *  child tasks which are just there to preserve
 *  structure and to be called for specific reasons.
 * 
 * @template T
 * @param {string} name - The name of the task
 * @param {string} description - The description of the task
 * @param {T} [toRun] - The function to execute
 * 
 * @returns {T} The task
 */
function genRootTask(name, description, toRun) {
	toRun.description = description;
	descriptions.set(name, description);
	return toRun;
}

/**
 * Generates a function with a dynamic name
 * 
 * @template T
 * @param {string} name - The name of the function
 * @param {T} target - The content of the function
 * 
 * @returns {T} The function with the new name
 */
function dynamicFunctionName(name, target) {
	const fn = new Function('target', `return function ${name}(){ return target() }`);
	return fn(target);
}

/**
 * Generates an async function with a dynamic name
 * 
 * @param {string} name - The name of the function
 * @param {Function} target - The content of the function
 * @param {string} [description] - A description for the function
 * 
 * @returns {(done: (error?: any) => void) => any} The function with the new name
 */
function dynamicFunctionNameAsync(name, target, description) {
	let fn = new Function('target', `return async function ${name}(){ return await target() }`);
	if (description) {
		return addDescription(description, fn(target));
	} else {
		return fn(target);
	}
}

/**
 * Capitalizes a string
 * 
 * @param {string} str - The string to capitalize
 * 
 * @returns {string} The capitalized string
 */
function capitalize(str) {
	return `${str[0].toUpperCase()}${str.slice(1)}`;
}

/**
 * Finds files with a glob pattern
 * 
 * @param {string} pattern - The pattern to use to search
 * 
 * @returns {Promise<string[]>} The found files
 */
function findWithGlob(pattern) {
	return new Promise((resolve, reject) => {
		glob(pattern, (err, matches) => {
			if (err) {
				reject(err);
			} else {
				resolve(matches);
			}
		});
	});
}

/**
 * Converts dashes to an uppercase char
 * 
 * @param {string} str - The string to transform
 * 
 * @returns {string} The transformed string
 */
function dashesToUppercase(str) {
	let newStr = '';
	for (let i = 0; i < str.length; i++) {
		const char = str[i];
		if (char === '-') {
			newStr += str[i + 1].toUpperCase();
			i += 1;
		} else {
			newStr += char;
		}
	}
	return newStr;
}

/**
 * Attempt to read a file
 * 
 * @param {string} filepath - The path to the file
 * 
 * @returns {Promise<{success: boolean;content: string;}>} - The read value and the state
 */
async function tryReadFile(filepath) {
	try {
		return {
			success: true,
			content: await fs.readFile(filepath, {
				encoding: 'utf8'
			})
		}
	} catch(e) {
		return {
			success: false,
			content: ''
		}
	}
}

/* Shared */
(() => {
	/**
	 * Converts a JSON object string to typings
	 * 
	 * @param {string} str - The initial name
	 * 
	 * @returns {string} The new string
	 */
	function stringToType(str) {
		return str.replace(/":( )?"((\w|#|\.|\|)+)"/g, '": $2');
	}
	
	/**
	 * Formats a JSON object
	 * 
	 * @param {string} str - The input string
	 * 
	 * @returns {string} The prettified string
	 */
	function prettyify(str) {
		if (str === '{}') {
			return '{}';
		}
		str = str
			.replace(/"((#|\.)?\w+)": ((\w|\|)+),/g, '"$1": $3,')
			.replace(/"((#|\.)?\w+)": ((\w|\|)+)},/g, '"$1": $3\n},')
			.replace(/"(\w+)":{/g, '"$1":{\n')
			.replace(/\n},"/g, '\n},\n"')
			.replace(/{\n}/g, '{ }')
			.replace(/"(\w+)": (\w+)}}/g, '\t"$1": $2\n}\n}')
			.replace(/{"/g, '{\n"')
			.replace(/:"{ }",/, ':{ },\n')
			.replace(/,/g, ';')
			.replace(/(\s+)\}/g, ';\n}')
		const split = str.split('\n');
		return split.join('\n');
	}

	/**
	 * Formats a typings object into a string
	 * 
	 * @param {{[key: string]: string}} typings - The query object
	 * 
	 * @returns {string} The query map
	 */
	function formatTypings(typings) {
		return prettyify(stringToType(JSON.stringify(typings, null, '\t')))
	}

	/**
	 * Creates a component query map for given component
	 * 
	 * @param {string} name - The name of the component
	 * @param {HTMLTypings.TypingsObj} queryObj - The query object
	 * 
	 * @returns {string} The query map
	 */
	function createComponentQueryMap(name, queryObj) {
		const {
			// @ts-ignore
			classes, ids, selectors, tags
		} = queryObj;
		const prefix = capitalize(dashesToUppercase(name));
		return `export type ${prefix}SelectorMap = ${formatTypings(selectors)}

export type ${prefix}IDMap = ${formatTypings(ids)}

export type ${prefix}ClassMap = ${formatTypings(classes)}

export type ${prefix}TagMap = ${formatTypings(tags)}`
	}
	
	/**
	 * Strips invalid values from a query map (such as ${classNames(...
	 * 
	 * @param {{[key: string]: string;}} queryObj - The query object
	 * 
	 * @returns {HTMLTypings.TypingsObj} The query map
	 */
	function stripInvalidValues(obj) {
		const newObj = {};
		for (const key in obj) {
			if (obj[key].indexOf('${') === -1 &&
				key.indexOf('${') === -1) {
					newObj[key] = obj[key];
				}
		}
		return newObj;
	}

	/**
	 * Strips invalid values from a query map obj (such as ${classNames(...
	 * 
	 * @param {HTMLTypings.TypingsObj} queryObj - The query object
	 * 
	 * @returns {HTMLTypings.TypingsObj} The query map
	 */
	function stripInvalidValuesObj(queryObj) {
		return {
			classes: stripInvalidValues(queryObj.classes),
			ids: stripInvalidValues(queryObj.ids),
			selectors: stripInvalidValues(queryObj.selectors),
			modules: queryObj.modules,
			tags: stripInvalidValues(queryObj.tags || {})
		}
	}

	gulp.task('defs.components', addDescription('Generates ID definitions for components', async () => {
		await Promise.all((await findWithGlob('shared/components/**/*.html.ts')).map(async (fileName) => {
			const componentName = fileName.split('/').pop().split('.')[0];
			const defs = await htmlTypings.extractFileTypes(fileName, true);
			await fs.writeFile(path.join(path.dirname(fileName), `${componentName}-querymap.d.ts`),
				createComponentQueryMap(componentName, 
					stripInvalidValuesObj(defs)));
		}));
	}));

	gulp.task('defs', genRootTask('defs', 
		'Generates TS definitions required for development and compilation', 
		gulp.parallel('defs.components')));

	gulp.task('copytheme', 
		addDescription('Duplicates the theme file, allowing it to be used' + 
			'in both CommonJS and ES6 import files', async () => {
				const baseDir = path.join(__dirname, 'shared/components/theming/theme');
				const src = await fs.readFile(
					path.join(baseDir, 'theme.ts')); 
				await Promise.all([
					fs.writeFile(path.join(baseDir, 'theme.cjs.ts'), src),
					fs.writeFile(path.join(baseDir, 'theme.es.ts'), src)
				]);
			}));

	gulp.task('precompile', genRootTask('precompile',
		'Tasks that should be run before compiling typescript',
		gulp.parallel('defs', 'copytheme')));
})();

/* Run mode (dev/prod) */
/**
 * The type of run (development or production)
 * 
 * @type {'prod'|'dev'}
 */
let mode = "prod";
(() => {
	gulp.task('env:dev', addDescription('Sets the type of run to development mode for the following tasks', 
		async function setEnv() {
			mode = 'dev';
		}));

	gulp.task('env:prod', addDescription('Sets the type of run to production mode for the following tasks', 
		async function setEnv() {
			mode = 'prod';
		}));
})();

/* Dashboard */
const dashboard = (() => {
	const SRC_DIR = path.join(__dirname, 'server/app/actions/server/webserver/client/src/');
	const BUILD_DIR = path.join(__dirname, 'server/app/actions/server/webserver/client/build/');
	const ROUTES = ['login', 'dashboard'];

	/**
	 * Bundles the serviceworker and writes it
	 */
	const rollupServiceWorker = addDescription('Bundles the serviceworker',
		async function rollupServiceWorker() {
			const input = path.join(SRC_DIR, `serviceworker.js`);
			const output = path.join(BUILD_DIR, `serviceworker.js`);	

			const bundle = await rollup.rollup({
				input,
				onwarn(warning) {
					if (typeof warning !== 'string' && warning.code === 'THIS_IS_UNDEFINED') {
						//Typescript inserted helper method, ignore it
						return;
					}
					console.log(warning);
				},
				plugins: [
					rollupResolve({
						module: true,
						browser: true
					})
				]
			});

			await bundle.write({
				format: 'iife',
				file: output
			});
		});

	gulp.task('dashboard.bundle.serviceworker.bundle', addDescription('Bundles the serviceworker',
		gulp.series(
			rollupServiceWorker
		)));
	gulp.task('dashboard.bundle.serviceworker', addDescription('Bundles the serviceworker and minifies it',
		gulp.series(
			'dashboard.bundle.serviceworker.bundle',
			addDescription('Puts the server\'s public key in the serviceworker', 
				async function signPublic() {
					if (mode === 'dev') {
						return;
					}

					const res = await tryReadFile(path.join(__dirname, 'certs/versions.pub'));
					if (!res.success) {
						console.log('Failed to find public key in certs/versions.pub, not signing serviceworker');
						return;
					}
					const file = await fs.readFile(
						path.join(BUILD_DIR, `serviceworker.js`), {
							encoding: 'utf8'
						});
					await fs.writeFile(path.join(BUILD_DIR, `serviceworker.js`), 
						file.replace(/\SERVER_PUBLIC_KEY_START.*SERVER_PUBLIC_KEY_END/,
							`${res.content}`), {
							encoding: 'utf8'
						});
				}),
			addDescription('Minifies the serviceworker',
				async function minifyServiceWorker() {
					const file = await fs.readFile(
						path.join(BUILD_DIR, `serviceworker.js`), {
							encoding: 'utf8'
						});
					const result = uglify.minify(file, {
						keep_classnames: true,
						ecma: 6
					});
					if (result.error) {
						throw result.error;
					}
					await fs.writeFile(path.join(BUILD_DIR, `serviceworker.js`), 
						result.code, {
							encoding: 'utf8'
						});
				})
		)));

	/**
	 * Does {onFound} to content while {findPattern} returns true
	 * 
	 * @param {string} content - The content to manipulate
	 * @param {() => boolean} findPattern - The function to test whether to continue
	 * @param {(content: string) => string} onFound - The function to call while 
	 * 	the pattern is being found
	 * 
	 * @returns {string} - The final content
	 */
	function doWhilePatternFound(content, findPattern, onFound) {
		while (findPattern(content)) {
			content = onFound(content);
		}
		return content;
	}


	class Style {	
		constructor({
			className, id, tag
		}, _link) {
			this._link = _link;
			this._id = id;
			this._tag = tag;
			this._className = className;
			this.MARKER = '';
		}
	
		_connectLinks(dataType) {
			if (!this._link) {
				return '';
			}
			if (this._link.type === 'and') {
				return this._link.style.getDataType(dataType);
			} else if (this._link.type === 'or') {
				return `, ${this._link.style.getDataType(dataType)}`;
			}
			return '';
		}
	
		getDataType(dataType) {
			switch (dataType) {
				case 'id':
					return this.id;
				case 'class':
					return this.className;
				case 'tag':
					return this.tag;
			}
		}
	
		get id() {
			return `#${this._id || 'undef'}${this._connectLinks('id')}`;
		}
	
		get className() {
			return `.${this._className || 'undef'}${this._connectLinks('class')}`;
		}
	
		get tag() {
			return `${this._tag || 'undef'}${this._connectLinks('tag')}`;
		}
	
		_clone() {
			return {
				id: this._id,
				className: this._className,
				tag: this._tag
			}
		}
	
		or(style) {
			return new Style(this._clone(), {
				type: 'or',
				style
			});
		}
	
		and(style) {
			return new Style(this._clone(), {
				type: 'and',
				style
			});
		}
	
		withClass(className) {
			return new Style(this._clone(), {
				type: 'and',
				style: new Style({
					className: className
				})
			});
		}

		static styles() {
			return {
				id: new Proxy({}, {
					get(_, id) {
						return new Style({
							id: id
						});
					}
				}),
				class: new Proxy({}, {
					get(_, className) {
						return new Style({
							className: className
						});
					}
				}),
				tag: new Proxy({}, {
					get(_, tag) {
						return new Style({
							tag: tag
						});
					}
				})
			}
		}
	}

	gulp.task('dashboard.bundle.js', addDescription('Bundles the TS files into a single bundle',
		gulp.series(
			gulp.series(
				addDescription('Preprocesses CSS selectors', 
					async function preprocessCSS() {
						const files = await findWithGlob('shared/components/**/*.css.js');
						await Promise.all(files.map(async (file) => {
							const content = await fs.readFile(file, {
								encoding: 'utf8'
							});

							const replaced = content.replace(/<style>((.|\n|\r)*?)<\/style>/g, (_, innerContent) => {
								return `<style>${innerContent.replace(/\${(this\.styles\.(.|\n)*)\}/g, (_, expression) => {
									return eval(expression.replace(/this\.styles\./g, 'Style.styles().'));
								})}</style>`;
							});

							await fs.writeFile(file, replaced, {
								encoding: 'utf8'
							});
						}));
					}),
				addDescription('Minifies the CSS of components',
					async function minifyCSS() {
						const files = await findWithGlob('shared/components/**/*.css.js');
						await Promise.all(files.map(async (file) => {
							const content = await fs.readFile(file, {
								encoding: 'utf8'
							});

							const replaced = content.replace(/<style>((.|\n|\r)*?)<\/style>/g, (substring, innerContent) => {
								return `<style>${uglifyCSS.processString(innerContent, { })}</style>`;
							});

							await fs.writeFile(file, replaced, {
								encoding: 'utf8'
							});
						}));
					})
			),
			gulp.parallel('dashboard.bundle.serviceworker', ...ROUTES.map((route) => {
				const input = path.join(SRC_DIR, 'entrypoints/', route, `${route}-page.js`);
				const output = path.join(BUILD_DIR, 'entrypoints/', route, `${route}-page.js`);

				return gulp.series(
					dynamicFunctionNameAsync(`bundleJS${capitalize(route)}`, async () => {
						const bundle = await rollup.rollup({
							input,
							onwarn(warning) {
								if (typeof warning !== 'string' && warning.code === 'THIS_IS_UNDEFINED') {
									//Typescript inserted helper method, ignore it
									return;
								}
								if (typeof warning !== 'string' && warning.code === 'MISSING_GLOBAL_NAME') {
									return;
								}
								console.log(warning);
							},
							external: (id) => {
								if (id.indexOf('dev-passwords') > -1) {
									return true;
								}
								return false;
							},
							plugins: [
								rollupResolve({
									module: true,
									browser: true
								}),
								rollupCommonJs({
									namedExports: {
										'node_modules/js-sha512/src/sha512.js': [
											'sha512', 
											'sha512_256'
										],
										'node_modules/aes-js/index.js': [
											'AES',
											'Counter',
											'ModeOfOperation',
											'utils',
											'padding',
											'_arrayTest'
										],
										'node_modules/u2f-api/dist/index.js': [
											'ErrorCodes',
											'ErrorNames',
											'isSupported',
											'ensureSupport',
											'register',
											'sign'
										]
									}
								})
							]
						});

						await bundle.write({
							format: 'iife',
							file: output
						});
						if (route === 'dashboard') {
							const fileContent = await fs.readFile(output, {
								encoding: 'utf8'
							});
							await fs.writeFile(output, fileContent
								.split('\n').slice(0, -2).join('\n') +
									`\n}({}));`)
						}
					}, `Bundles the files for the ${route} route`),
					dynamicFunctionNameAsync(`minifyJS${capitalize(route)}`, async () => {
						const file = await fs.readFile(output, {
							encoding: 'utf8'
						});
						const result = uglify.minify(file, {
							keep_classnames: true,
							ecma: 6
						});
						if (result.error) {
							throw result.error;
						}
						await fs.writeFile(output, result.code, {
							encoding: 'utf8'
						});
					}, `Minifies the bundle for the ${route} route`))
			})))));

	gulp.task('dashboard.bundle', addDescription('Runs bundling tasks', 
		gulp.parallel(
			'dashboard.bundle.js'
		)));

	const CACHE_PAGES = [
		'/login_offline',
		'/dashboard_offline'
	];
	
	const CACHE_COMPONENTS = [
		'/entrypoints/login/login-page.js',
		'/entrypoints/dashboard/dashboard-page.js'
	];

	/**
	 * Calls the render function without actually
	 *  having any requests/responses
	 * 
	 * @param {(req: Request, res: Response) => void} fn - The function to call
	 * 
	 * @returns {Promise<string>} A promise with the rendered content
	 */
	function fakeRender(fn) {
		return new Promise((resolve) => {
			let content = '';
			fn({ cookies: {} }, {
				write(data) {
					content += data;
				},
				contentType() {},
				header() {},
				end() {
					resolve(content);
				}
			})
		});
	}

	/**
	 * Signs given string using the given key (if shouldSign is true)
	 * 
	 * @param {string} content - The data to sign
	 * @param {WebCrypto} webcrypto - The webcrypto object
	 * @param {NodeWebcryptoOpenSSL.CryptoKey} key - The key to use
	 * @param {boolean} shouldSign - Whether to sign the data
	 * 
	 * @returns {Promise<string>} The signed data
	 */
	async function signContent(content, webcrypto, key, shouldSign) {
		if (shouldSign) {
			return Buffer.from(await webcrypto.subtle.sign({
				name: 'RSASSA-PKCS1-v1_5',
				hash: 'SHA-256'
			}, key, Buffer.from(content, 'utf8'))).toString('hex');
		} else {
			return md5(content);
		}
	}

	gulp.task('dashboard.meta.signPrivate', addDescription('Generates the hashes for all ' +
		'cached files and signs them using the certs/versions.priv and certs/versions.pub ' +
		'keys', async () => {
			const res = await tryReadFile(path.join(__dirname, 'certs/versions.priv'));
			const shouldSign = res.success;
			const key = res.content;
			if (!shouldSign) {
				console.log('Failed to find private key in certs/versions.priv, ' + 
					'not signing versions.json file contents');
			}

			const WebCrypto = require('node-webcrypto-ossl');
			const webcrypto = new WebCrypto();
			const cryptoKey = shouldSign ? await webcrypto.subtle.importKey('jwk', 
				JSON.parse(key), {
					name: 'RSASSA-PKCS1-v1_5',
					hash: 'SHA-256'
				}, false, ['sign']) : null;

			const versions = {};
			await Promise.all([
				...CACHE_PAGES.map(async (page) => {
					const { RoutesDashboard } = require('./server/app/actions/server/webserver/server/routes/dashboard/routes-dashboard');
					const route = new RoutesDashboard({
						config: {}
					});
					const content = await fakeRender(route[page.slice(1)].bind(route))

					versions[page] = await signContent(content, webcrypto, cryptoKey, shouldSign);
				}),
				...CACHE_COMPONENTS.map(async (component) => {
					const filePath = path.join(__dirname, 
						'server/app/actions/server/webserver/client/build/',
						component.slice(1));
					const content = await fs.readFile(filePath, {
						encoding: 'utf8'
					});
					versions[component] = await signContent(content, webcrypto, cryptoKey, shouldSign);
				}),
				(async () => {
					const sw = await fs.readFile(
						path.join(BUILD_DIR, `serviceworker.js`), {
							encoding: 'utf8'
						});
					versions['/serviceworker.js'] = await signContent(sw, webcrypto, cryptoKey, shouldSign);
				})()
			]);
			const versionsPath = path.join(__dirname, 
				'server/app/actions/server/webserver/client/build/',
				'versions.json');
			await fs.mkdirp(path.dirname(versionsPath));
			await fs.writeFile(versionsPath, JSON.stringify(versions, null, '\t'), {
					encoding: 'utf8'
				});
		}));

	gulp.task('dashboard.meta', addDescription('Runs meta tasks (not directly related to the content served)',
		gulp.parallel(
			'dashboard.meta.signPrivate'
		)));

	gulp.task('dashboard', addDescription('Runs tasks for the dashboard (web version)', 
		gulp.series(
			'dashboard.bundle',
			'dashboard.meta'
		)));

	gulp.task('dashboard:dev', genRootTask('dashboard:dev',
		'Runs the dashboard task in development mode',
		gulp.series('env:dev', 'dashboard')));

	gulp.task('dashboard:prod',	genRootTask('dashboard:prod',
		'Runs the dashboard task in production mode',
		gulp.series('env:prod', 'dashboard')));

	return {
		SRC_DIR,
		rollupServiceWorker
	}
})();

/** Testing */
(() => {
	/**
	 * Generates bundles for every component, allowing them
	 *  to be loaded at test time
	 * 
	 * @returns {Promise<string[]>} The bundled components
	 */
	function getComponentFiles() {
		return new Promise((resolve, reject) => {
			glob(path.join(__dirname, 'test/ui/integration/components') +
				'/**/*.bundled.js', async (err, matches) => {
					if (err) {
						reject(err);
						return;
					}
					resolve(matches);
				});
		});
	}

	/**
	 * Converts dashes to uppercase chars
	 * 	for example: a-bc-de -> aBcDe
	 * 
	 * @param {string} str - The string to convert
	 * 
	 * @returns {string} The converted string
	 */
	function dashesToUppercase(str) {
		let newStr = '';
		for (let i = 0; i < str.length; i++) {
			const char = str[i];
			if (char === '-') {
				newStr += str[i + 1].toUpperCase();
				i += 1;
			} else {
				newStr += char;
			}
		}
		return newStr;
	}

	gulp.task('pretest.genbundles', addDescription('Generates component bundles', 
		async function genComponentBundles() {
			const files = await getComponentFiles();
			await Promise.all(files.map(async (file) => {
				const bundle = await rollup.rollup({
					input: file,
					onwarn(warning) {
						if (typeof warning !== 'string' && warning.code === 'THIS_IS_UNDEFINED') {
							//Typescript inserted helper method, ignore it
							return;
						}
						console.log(warning);
					},
					plugins: [
						rollupResolve({
							module: true,
							browser: true
						}),
						rollupCommonJs({
							namedExports: {
								'node_modules/js-sha512/src/sha512.js': [
									'sha512', 
									'sha512_256'
								],
								'node_modules/aes-js/index.js': [
									'AES',
									'Counter',
									'ModeOfOperation',
									'utils',
									'padding',
									'_arrayTest'
								]
							}
						})
					]
				});
				const outDir = path.join(__dirname, 'test/ui/served/bundles/');
				await fs.mkdirp(outDir);
				const base = path.basename(file).split('.');
				const outFile = path.join(outDir, `${base[0]}.${base.slice(-1)[0]}`);
				await bundle.write({
					format: 'iife',
					name: 'exported',
					file: outFile
				});
			}));
		}
	));

	gulp.task('pretest.genhtml', addDescription('Generates servable HTML files',
		async function genWebPages() {
			const files = await findWithGlob(`${
				path.join(__dirname, 'test/ui/integration/components/')
			}/**/*.json`);
			await Promise.all(files.map(async (file) => {
				const config = JSON.parse(await fs.readFile(file, {
					encoding: 'utf8'
				}));
				const html = `${await fs.readFile(
					path.join(path.dirname(file), config.html), {
						encoding: 'utf8'
					})}
					<script src="bundles/${config.bundleName}.js"></script>`;
				const outPath = path.join(__dirname, 
					`test/ui/served/${config.name}.html`);
				await fs.mkdirp(path.dirname(outPath));
				await fs.writeFile(outPath, html, {
						encoding: 'utf8'
					});
			}));
		}));

	gulp.task('pretest', genRootTask('pretest', 'Prepares the project for testing', 
		gulp.series(
			'dashboard:dev',
			'pretest.genbundles',
			'pretest.genhtml'
		)));
})();

/** Watching */
(() => {
	gulp.task('watch.serviceworker', addDescription('Bundles the serviceworker on change', async () => {
		dashboard.rollupServiceWorker();
		return watch(path.join(dashboard.SRC_DIR, `serviceworker.js`), dashboard.rollupServiceWorker);
	}));

	gulp.task('watch', genRootTask('watch', 'Watches files for changes' + 
		' and runs necessary tasks on change', 
			gulp.series('env:dev', gulp.parallel('watch.serviceworker'))));
})();

/** Meta */
(() => {
	/**
	 * Repeats given {char} {amount} times
	 * 
	 * @param {string} char - The char to repeat
	 * @param {number} amount - The amount of times to repeat it
	 * 
	 * @returns {string} The new string
	 */
	function repeat(char, amount) {
		return new Array(amount).fill(char).join('');
	}

	gulp.task('tasks', genRootTask('tasks', 'Lists all top-level tasks', async () => {
		console.log('These are the top-level tasks:');
		console.log('');

		const longest = Array.from(descriptions.keys()).map(k => k.length)
			.reduce((prev, current) => {
				return Math.max(prev, current);
			}, 0);

		for (const [ task, description ] of descriptions.entries()) {
			console.log(`${chalk.bold(task)}${
				repeat(' ', longest - task.length)} - ${description}`);
		}
	}));

	gulp.task('default', genRootTask('default' ,'The default task (runs everything)', 
		gulp.series('dashboard')));
})();