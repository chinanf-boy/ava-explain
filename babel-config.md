## babel-config

`ava/lib/babel-config.js`

---

### 1. validate

> 验证 输入的babel配置真假

代码 16-30

``` js
function validate(conf) {
	if (conf === false) {
		return null;
	}

	if (conf === undefined) {
		return {testOptions: {}};
	}

	if (!conf || typeof conf !== 'object' || !conf.testOptions || typeof conf.testOptions !== 'object' || Array.isArray(conf.testOptions) || Object.keys(conf).length > 1) {
		throw new Error(`${colors.error(figures.cross)} Unexpected Babel configuration for AVA. See ${chalk.underline('https://github.com/avajs/ava/blob/master/docs/recipes/babel.md')} for allowed values.`);
	}

	return conf;
}
```

## 2. build

代码 83-194

> 此函数的使用是 `ava/api.js` 预编译测试文件时的编译构建

``` js
// `ava/api.js _buildBabelConfig`
		const promise = babelConfigHelper.build(this.options.projectDir, cacheDir, this.options.babelConfig, compileEnhancements);

```

<details>

``` js
function build(projectDir, cacheDir, userOptions, compileEnhancements) {
	if (!userOptions && !compileEnhancements) {
		return Promise.resolve(null);
	}

	// Note that Babel ignores empty string values, even for NODE_ENV. Here
	// default to 'test' unless NODE_ENV is defined, in which case fall back to
	// Babel's default of 'development' if it's empty.
// 请注意，即使对于 NODE_ENV，Babel 也会忽略空字符串值。 这里
// 默认为'test'，除非定义了NODE_ENV，在这种情况下如果它是空的
// 返回 Babel默认的'development'。
	const envName = process.env.BABEL_ENV || ('NODE_ENV' in process.env ? process.env.NODE_ENV : 'test') || 'development';

	// Compute a seed based on the Node.js version and the project directory.
	// Dependency hashes may vary based on the Node.js version, e.g. with the
	// @ava/stage-4 Babel preset. Sources and dependencies paths are absolute in
	// the generated module and verifier state. Those paths wouldn't necessarily
	// be valid if the project directory changes.
	// Also include `envName`, so options can be cached even if users change
	// BABEL_ENV or NODE_ENV between runs.
//根据 Node.js版本和项目目录 计算种子。
//相关性散列{hex}可能会根据 Node.js版本 而有所不同，例如 与
// @ava/stage-4 Babel预设。 源和依赖关系路径是绝对的
// 生成的模块和验证者状态。 那些路径不一定
// 如果项目目录发生更改，则该值有效。
// 也包含`envName`，所以即使用户改变，选项也可以被缓存
// BABEL_ENV 或 NODE_ENV 运行之间 。
	const seed = md5Hex([process.versions.node, projectDir, envName]);

	// Ensure cacheDir exists
	// 确保 cacheDir 存在
	makeDir.sync(cacheDir);

	// The file names predict where valid options may be cached, and thus should
	// include the seed.
//文件名称可以预测哪些有效选项可以被缓存，因此应该这样做
//包括种子。
	const optionsFile = path.join(cacheDir, `${seed}.babel-options.js`);
	const verifierFile = path.join(cacheDir, `${seed}.verifier.bin`);

	const baseOptions = {
		babelrc: false,
		plugins: [
			// TODO: Remove once Babel can parse this syntax unaided.
			// TODO：一旦Babel可以独立解析这个语法，就移除它。
			syntaxAsyncGeneratorsPath,
			syntaxObjectRestSpreadPath
		],
		presets: []
	};

	if (userOptions) { // 有用户 babel 要求
		// Always apply the stage-4 preset.
// 始终应用 stage4预设。
		baseOptions.presets.push(stage4Path);

		// By default extend the project's Babel configuration, but allow this to be
		// disabled through userOptions.
// 默认情况下，扩展项目的Babel配置，但允许这样做
// 禁用 userOptions。
		if (userOptions.testOptions.babelrc !== false) {
			baseOptions.babelrc = true;
		}
		if (userOptions.testOptions.extends) {
			baseOptions.extends = userOptions.testOptions.extends;
		}
	}

	// babel 基础配置
	const baseConfig = configManager.createConfig({
		dir: projectDir,
		fileType: 'JSON',
		hash: md5Hex(JSON.stringify(baseOptions)),
		options: baseOptions,
		source: '(AVA) baseConfig'
	});

	let intermediateConfig = baseConfig;
	if (userOptions && Object.keys(userOptions.testOptions).length > 0) {
		// At this level, babelrc *must* be false.
		// 在这个级别，babelrc *必须* 为false。
		const options = Object.assign({}, userOptions.testOptions, {babelrc: false});
		// Any extends option has been applied in baseConfig.
		// 任何扩展选项已应用于 baseConfig。
		delete options.extends;
		intermediateConfig = configManager.createConfig({
			dir: projectDir,
			fileType: 'JSON',
			hash: md5Hex(JSON.stringify(options)),
			options,
			source: path.join(projectDir, 'package.json') + '#ava.babel'
		});
		// 用另一个配置扩展配置
		intermediateConfig.extend(baseConfig);
	}

	let finalConfig = intermediateConfig;
	if (compileEnhancements) {// 是否禁用-错误信息输出
	// 不禁用
		finalConfig = configManager.createConfig({
			dir: projectDir,
			fileType: 'JSON',
			hash: '', // This is deterministic, so no actual value necessary.
			options: {
				babelrc: false,
				presets: [
					[transformTestFilesPath, {powerAssert: true}]
				]
			},
			source: '(AVA) compileEnhancements'
		});
		finalConfig.extend(intermediateConfig);
	}
	// 创建一个可以传递给上述函数的缓存对象
	const cache = configManager.prepareCache();
	return verifyExistingOptions(verifierFile, finalConfig, cache, envName)
		.then(cacheKeys => {
			if (cacheKeys) {
				return cacheKeys;
			}

			return resolveOptions(finalConfig, cache, envName, optionsFile, verifierFile);
		})
		.then(cacheKeys => {
//调用时可以提供环境名称getOptions()，例如 getOptions('production')。如果没有提供名称，或者名称不是字符串，则通过检查process.env.BABEL_ENV， process.env.NODE_ENV最终确定环境来确定环境'development'。

// cache如果已解析的配置包含JavaScript源，则必须提供第二个参数
			const getOptions = require(optionsFile).getOptions;
			return {
				getOptions() {
					return getOptions(envName, cache);
				},
				// Include the seed in the cache keys used to store compilation results.
				//将种子包含在用于存储编译结果的缓存键中。
				cacheKeys: Object.assign({seed}, cacheKeys)
			};
		});
}
```


- [configManager](https://github.com/novemberborn/hullabaloo-config-manager)

> 管理复杂的Babel配置链，避免重复工作并启用有效的缓存。

- [verifyExistingOptions](#3.1-verifyexistingoptions)

> 证实存在选项

- [resolveOptions](#3.2-resolveoptions)

</details>

## 3. babel-config-内置函数

### 3.0 require.resolve

``` js
const syntaxAsyncGeneratorsPath = require.resolve('@babel/plugin-syntax-async-generators');
const syntaxObjectRestSpreadPath = require.resolve('@babel/plugin-syntax-object-rest-spread');
const transformTestFilesPath = require.resolve('@ava/babel-preset-transform-test-files');
```

> 只获得-文件路径, 不运行

<details>


### 3.1 verifyExistingOptions

> 确认存在选项的可靠性, 任何缓存哈希值

``` js
function verifyExistingOptions(verifierFile, baseConfig, cache, envName) {
	return new Promise((resolve, reject) => {
		try {
			resolve(fs.readFileSync(verifierFile));
		} catch (err) {
			if (err && err.code === 'ENOENT') {
				resolve(null);
			} else {
				reject(err);
			}
		}
	})
		.then(buffer => {
			if (!buffer) {
				return null;
			}
			// 创建 verifier 对象
			const verifier = configManager.restoreVerifier(buffer);
			const fixedSourceHashes = new Map();
			fixedSourceHashes.set(baseConfig.source, baseConfig.hash);
			if (baseConfig.extends) {
				fixedSourceHashes.set(baseConfig.extends.source, baseConfig.extends.hash);
			}
			// 验证配置是否对当前环境仍然有效。
			return verifier.verifyEnv(envName, {sources: fixedSourceHashes}, cache)
				.then(result => {
					if (!result.cacheKeys) {
						return null;
					}

					// 如果它的dependenciesChanged属性是true插件或预设依赖关系已经改变，但配置本身仍然有效。
					if (result.dependenciesChanged) {
						// 写入
						fs.writeFileSync(verifierFile, result.verifier.toBuffer());
						// 将验证者状态序列化为一个Buffer对象
					}
					// 缓存钥匙-哈希值
					return result.cacheKeys;
				});
		});
}

```

### 3.2 resolveOptions

> 使用选项来配好-babel-config, 且缓存

``` js
function resolveOptions(baseConfig, cache, envName, optionsFile, verifierFile) { // eslint-disable-line max-params
	// 异步解析配置链
	return configManager.fromConfig(baseConfig, {cache, 
	// 提供expectedEnvNames配置链可能包含JavaScript源（如.babelrc.js文件）
	expectedEnvNames: [envName]})
		.then(result => {
			// 生成一个导出getOptions() 函数的Node.js兼容的JavaScript模块。
			fs.writeFileSync(optionsFile, result.generateModule());
			// 异步哈希插件和预设解析配置的依赖项以及配置源，并用Verifier 对象解决承诺。
			return result.createVerifier()
				.then(verifier => {
					fs.writeFileSync(verifierFile, verifier.toBuffer());
					// 返回适用于当前环境的插件和预设依赖关系的缓存键和配置源。
					return verifier.cacheKeysForEnv(envName);
				});
		});
}

```


</details>