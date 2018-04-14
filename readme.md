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

		Options 中文翻译选项
		  --watch, -w             测试和源文件更改时重新运行测试
		  --match, -m             只能运行匹配标题的测试（可重复）
		  --update-snapshots, -u  更新快照
		  --fail-fast             第一次测试失败后停止
		  --timeout, -T           设置全局超时
		  --serial, -s            连续运行测试
		  --concurrency, -c       同时运行的测试文件的最大数量（默认值：CPU核心） 
		  --verbose, -v           启用详细输出
		  --tap, -t               生成TAP输出
		  --no-cache              禁用编译器缓存
		  --color                 强制色彩输出
		  --no-color              禁用颜色输出

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

``` js
		` --watch, -w            测试和源文件更改时重新运行测试
		  --match, -m             只能运行匹配标题的测试（可重复）
		  --update-snapshots, -u  更新快照
		  --fail-fast             第一次测试失败后停止
		  --timeout, -T           设置全局超时
		  --serial, -s            串行测试
		  --concurrency, -c       同时运行的测试文件的最大数量（默认值：CPU核心） 
		  --verbose, -v           启用详细输出
		  --tap, -t               生成TAP输出
		  --no-cache              禁用编译器缓存
		  --color                 强制色彩输出
		  --no-color              禁用颜色输出`

		{
		failFast: conf.failFast,
		failWithoutAssertions: conf.failWithoutAssertions !== false,
		serial: conf.serial,
		require: arrify(conf.require),
		cacheEnabled: conf.cache,
		compileEnhancements: conf.compileEnhancements !== false,
		explicitTitles: conf.watch,
		match: arrify(conf.match),
		babelConfig: babelConfigHelper.validate(conf.babel),
		resolveTestsFrom: cli.input.length === 0 ? projectDir : process.cwd(), // 测试目录
		projectDir,
		timeout: conf.timeout,
		concurrency: conf.concurrency ? parseInt(conf.concurrency, 10) : 0,
		updateSnapshots: conf.updateSnapshots, 
		snapshotDir: conf.snapshotDir ? path.resolve(projectDir, conf.snapshotDir) : null,
		color: conf.color,
		workerArgv: cli.flags['--']
		}
		{
		files：`文件和目录路径以及选择哪些文件AVA将运行测试的全局模式。只使用扩展名为.js的文件。带有下划线前缀的文件将被忽略。运行所选目录中的所有.js文件`
		source：`文件，如果更改，会导致测试在手表模式下重新运行。有关详情，请参阅手表模式配方`
		match：`在package.json配置中通常不是很有用，但相当于在CLI中指定--match`
		failFast：`一旦测试失败，停止运行进一步的测试`
		failWithoutAssertions：`如果为false，如果不运行断言，则不会使测试失败`
		tap：`如果为true，则启用TAP记者`
		snapshotDir：`指定存储快照文件的固定位置。如果您的快照在错误的位置结束，请使用此选项`
		compileEnhancements：`如果为false，则禁用power-assert - 否则有助于提供更多描述性错误消息 - 并检测t.throws（）声明的不当使用`
		require：`在测试运行之前需要额外的模块。模块在工作进程中是必需的`
		babel：`测试文件特定的Babel选项。有关更多详情，请参阅我们的Babel配方`
		}
```

> 其中较为疑惑的应该是 `updateSnapshots` 和  `workerArgv`

[snapshots en 官方解释](https://github.com/avajs/ava#snapshot-testing)

至于 [workerArgv 需要讲到单次测试子进程使用的选项](./main.md#workerargv)

</details>

---

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

> 我们先说明 `on/emit `模式 , 请先了解清楚后, 再继续

> 如果你不太了解可以看看[nodejs.cn](http://nodejs.cn/api/events.html)或者关于[mitt- 小小实现的on/emit](https://github.com/chinanf-boy/explain-mitt)

- 3.2 [`resolveModules`](#resolvemodules)

> 找寻需要用到的 类似babel-插件路径

</details>
 
 ---


### 4. cli-logger

`ava/lib/cli.js`

代码 156-169

<details>

让我们回到`ava/lib/cli.js`

在我们保存好我们选项**conf**之后, 我们再一次决定测试数据-日志输出方式

[请转到cli-logger.explain.md](./cli-logger.explain.md#1-日志形式)

如果你对此还不想了解！ 😊

> 其实不影响后面的重要逻辑的解释

</details>

---


### 5. runStatus

`ava/lib/cli.js`

代码 171-178

<details>

> 运行测试-状态

我们在 [4. cli-logger](#4-cli-logger) 有了 日志工具,

但是我们要把 测试-状态与日志工具拼接 `logger <-> runStatus`

才能 错❌ 就是 输出错误,对✅ 就是 输出正确

``` js
// 定义 触发 test-run 函数
	api.on('test-run', runStatus => {
		reporter.api = runStatus;
		runStatus.on('test', logger.test);
		runStatus.on('error', logger.unhandledError);

		runStatus.on('stdout', logger.stdout);
		runStatus.on('stderr', logger.stderr);
	});
```

- 5.1 runStatus

> [请转到 runStatus.md](./runStatus.md)


</details>

---

### 6-7. watch

`ava/lib/cli.js`

代码 180-209

> 这小段是分 是否观察文件 不退出进程

这一段很重要, 

- 观察吧 导致 [6. Watcher 观察者](#6-watcher)的运行

- 不观察吧 直接运行 [7. api-run](#7-api-run) 测试运行

<details>

``` js
const files = cli.input.length ? cli.input : arrify(conf.files); // 测试-文件, 未打磨

	if (conf.watch) {
		try {
			const watcher = new Watcher(logger, api, files, arrify(conf.sources));
			watcher.observeStdin(process.stdin);
		} catch (err) {
			if (err.name === 'AvaError') {
				// An AvaError may be thrown if `chokidar` is not installed. Log it nicely.
				console.error(`  ${colors.error(figures.cross)} ${err.message}`);
				logger.exit(1);
			} else {
				// Rethrow so it becomes an uncaught exception
				throw err;
			}
		}
	} else {
		api.run(files)
			.then(runStatus => {
				logger.finish(runStatus);
				logger.exit(runStatus.failCount > 0 || runStatus.rejectionCount > 0 || runStatus.exceptionCount > 0 ? 1 : 0);
			})
			.catch(err => {
				// Don't swallow exceptions. Note that any expected error should already
				// have been logged.
				setImmediate(() => {
					throw err;
				});
			});
	}
```

</details>

---

### 6. Watcher

`ava/lib/cli.js`

代码 183-195

<details>

也许你可以先看 [7. api-run 了解一次运行情况再来看 Watcher噢😯](#7-api-run)

``` js
		try {
			const watcher = new Watcher(logger, api, files, arrify(conf.sources));
			watcher.observeStdin(process.stdin);
		} catch (err) {
			if (err.name === 'AvaError') {
				// An AvaError may be thrown if `chokidar` is not installed. Log it nicely.
				console.error(`  ${colors.error(figures.cross)} ${err.message}`);
				logger.exit(1);
			} else {
				// Rethrow so it becomes an uncaught exception
				throw err;
			}
		}
```

- 6.1 watcher

> [请转到 watcher.md](./watcher.md)


</details>

---

### 7. api-run

`ava/lib/cli.js`

代码 197-208

<details>

``` js
		api.run(files)
			.then(runStatus => {
				logger.finish(runStatus);
				logger.exit(runStatus.failCount > 0 || runStatus.rejectionCount > 0 || runStatus.exceptionCount > 0 ? 1 : 0);
			})
			.catch(err => {
				// Don't swallow exceptions. Note that any expected error should already
				// have been logged.
				setImmediate(() => {
					throw err;
				});
			});
```
</details>

- 7.1 api-run

> [请转到 api-run.md](./api-run.md)

---


## 8 总结

无可否认, 软件经过解释, 似乎失去了一整个的使用和方便.

正如一个苹果🍎, 作为苹果研究的人眼里👀, 可不仅仅是吃的东西

我们也是, 软件使用, 让我们方便, 但我们仍需要知道每一段, 每一个字符串

的代码是如何运作的, 因为我们是`Coder`!

最后我们来描绘一下 ava 运作流程

// 未完成

---

## 其他

> 有关作者 那些 小kuku

<details>


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
</details>