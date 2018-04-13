# ava

「 下一代未来测试 」

[![explain](http://llever.com/explain.svg)](https://github.com/chinanf-boy/Source-Explain)
    
Explanation

> "version": "1.0.0-beta.3"

[github source](https://github.com/avajs/ava)

~~[english](./README.en.md)~~

---

我们从 应用ava 的方式, 开始解释吧

1. 我们需要一个测试文件, `test.js`

``` js
import test from 'ava'

test('add', t =>{
    t.pass()
})
```

然后

2. 运行 `ava test.js`

而我们我们会分两个部分 进入ava 项目 

`「 1. cli | 2. test 」`

我们 自然是以 `1. cli` 为起点

---

本目录

---

## package.json

``` js
	"bin": "cli.js",
```

---

### 1. cli.js

`ava/cli.js`

``` js
#!/usr/bin/env node
'use strict';
const debug = require('debug')('ava');
const importLocal = require('import-local');

// 更倾向使用本地 ava
if (importLocal(__filename)) {
// 一般, 我们都是使用 「 ava ** 」 这种形式的命令行

// 而在被测试项目中, 我们需要使用 import test from 'ava', 就需要安装 ava 在 package.json 中

// 而 importLocal 就会 require 使用 被测试项目所安装的 ava cli 命令, 也就是回到最终ava项目的这个文件
	debug('Using local install of AVA');
} else {
	if (debug.enabled) {
        // 输出 信息 待仪
		require('@ladjs/time-require'); // eslint-disable-line import/no-unassigned-import
	}

	try {
		require('./lib/cli').run(); // <=== 最终运行的ava 项目
	} catch (err) {
		console.error(`\n  ${err.message}`);
		process.exit(1);
	}
}

```

---

### 2. lib-cli

`ava/lib/cli.js`

代码 19-136

> 

<details>

``` js

// ava 使用 什么 Promise 的呢
// 答案是 Bluebird https://github.com/petkaantonov/bluebird

// Bluebird specific
Promise.longStackTraces(); // ???

exports.run = () => {
    // 我们从 1. cli.js 中知道 ava 总是选择被测试项目中的 node_modules/.bin/ava 来运行
    const conf = pkgConf.sync('ava'); 
    // 所以这里就是, 在被测试项目的package.json 获取 配置

	const filepath = pkgConf.filepath(conf);// package.json 的目录
	const projectDir = filepath === null ? process.cwd() : path.dirname(filepath);// 项目目录

    // 用 meow 定义 命令行选项
	const cli = meow(`
		Usage
		  ava [<file|directory|glob> ...]

		Options
		  --watch, -w             Re-run tests when tests and source files change
		  --match, -m             Only run tests with matching title (Can be repeated)
		  --update-snapshots, -u  Update snapshots
		  --fail-fast             Stop after first test failure
		  --timeout, -T           Set global timeout
		  --serial, -s            Run tests serially
		  --concurrency, -c       Max number of test files running at the same time (Default: CPU cores)
		  --verbose, -v           Enable verbose output
		  --tap, -t               Generate TAP output
		  --no-cache              Disable the compiler cache
		  --color                 Force color output
		  --no-color              Disable color output

		Examples
		  ava
		  ava test.js test2.js
		  ava test-*.js
		  ava test

		Default patterns when no arguments:
		test.js test-*.js test/**/*.js **/__tests__/**/*.js **/*.test.js
	`, {
		flags: {
			watch: {
				type: 'boolean',
				alias: 'w'
			},
			match: {
				type: 'string',
				alias: 'm',
				default: conf.match
			},
			'update-snapshots': {
				type: 'boolean',
				alias: 'u'
			},
			'fail-fast': {
				type: 'boolean',
				default: conf.failFast
			},
			timeout: {
				type: 'string',
				alias: 'T',
				default: conf.timeout
			},
			serial: {
				type: 'boolean',
				alias: 's',
				default: conf.serial
			},
			concurrency: {
				type: 'string',
				alias: 'c',
				default: conf.concurrency
			},
			verbose: {
				type: 'boolean',
				alias: 'v',
				default: conf.verbose
			},
			tap: {
				type: 'boolean',
				alias: 't',
				default: conf.tap
			},
			cache: {
				type: 'boolean',
				default: conf.cache !== false
			},
			color: {
				type: 'boolean',
				default: 'color' in conf ? conf.color : require('supports-color').stdout !== false
			},
			'--': {
				type: 'string'
			}
		}
	});

	updateNotifier({pkg: cli.pkg}).notify(); // 更新-提示

	if (cli.flags.watch && cli.flags.tap && !conf.tap) {
		throw new Error(`${colors.error(figures.cross)} The TAP reporter is not available when using watch mode.`);
	}

	if (cli.flags.watch && isCi) {
		throw new Error(`${colors.error(figures.cross)} Watch mode is not available in CI, as it prevents AVA from terminating.`);
	}

	if (
		cli.flags.concurrency === '' ||
		(cli.flags.concurrency && (!Number.isInteger(Number.parseFloat(cli.flags.concurrency)) || parseInt(cli.flags.concurrency, 10) < 0))
	) {
		throw new Error(`${colors.error(figures.cross)} The --concurrency or -c flag must be provided with a nonnegative integer.`);
	}

	if ('source' in conf) {
		throw new Error(`${colors.error(figures.cross)} The 'source' option has been renamed. Use 'sources' instead.`);
	}

	// 合并配置, 
	Object.assign(conf, cli.flags);

    const api = new Api({
		failFast: conf.failFast,
		failWithoutAssertions: conf.failWithoutAssertions !== false,
		serial: conf.serial,
		require: arrify(conf.require),
		cacheEnabled: conf.cache,
		compileEnhancements: conf.compileEnhancements !== false,
		explicitTitles: conf.watch,
		match: arrify(conf.match),
		babelConfig: babelConfigHelper.validate(conf.babel),
		resolveTestsFrom: cli.input.length === 0 ? projectDir : process.cwd(),
		projectDir,
		timeout: conf.timeout,
		concurrency: conf.concurrency ? parseInt(conf.concurrency, 10) : 0,
		updateSnapshots: conf.updateSnapshots,
		snapshotDir: conf.snapshotDir ? path.resolve(projectDir, conf.snapshotDir) : null,
		color: conf.color,
		workerArgv: cli.flags['--']
	})
```

- 2.1 `new Api`

> [作为测试-总开关 ](#3-api)

- 2.2 [`babelConfigHelper`](./babel-config.md)

> 归纳-babel 的 配置

- 2.3 `Api 传入的值有什么东东`



</details>

### 3. Api

`ava/lib/api.js`

代码 34-40

> 

<details>

``` js
class Api extends EventEmitter {
	constructor(options) {
		super();

		this.options = Object.assign({match: []}, options);
        this.options.require = resolveModules(this.options.require);
        // 存储好 默认和目前 用户定义 选项值
    }
    // ...
```

- 3.1 `EventEmitter`

> 我们先说明 `on/emit `模式 

> 如果你不太了解可以看看[nodejs.cn](http://nodejs.cn/api/events.html)或者关于[mitt- 小小实现的on/emit](https://github.com/chinanf-boy/explain-mitt)

- 3.2 [`resolveModules`](#resolvemodules)

> 找寻需要用到的 类似babel-插件路径

</details>
 
## 其他

### resolveModules

> 模块名-去确定是否具有-模块路径, 没有则抛出错误

``` js
function resolveModules(modules) {
	return arrify(modules).map(name => {
        const modulePath = resolveCwd.silent(name);
        // 无法找到模块时返回null 而不是抛出。

		if (modulePath === null) {
			throw new Error(`Could not resolve required module '${name}'`);
		}

		return modulePath;
	});
}
```

- [resolveCwd](#resolve-cwd)

> 根据当前工作目录解析模块的路径 

---

### resolve-cwd

> 根据当前工作目录解析模块的路径 [->github](https://github.com/sindresorhus/resolve-cwd)

### arrify

>将值转换为数组 [->github](https://github.com/sindresorhus/arrify)