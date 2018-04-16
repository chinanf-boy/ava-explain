## test-worker.js

我们终于进入, 子进程对每个测试文件的操作了

`ava/lib/test-worker.js`

---

### 1. isFork

> 验证是否在子进程中

代码 7-21

``` js
// 这里是 test-worker.js 作为 运行的一个子进程

// 与使用 父进程-命令行cli.js 有通信的作用

// Check if the test is being run without AVA cli
{
	const path = require('path');
	const chalk = require('chalk'); // This processes the --color/--no-color argument passed by fork.js

	const isForked = typeof process.send === 'function'; // 看看是否有子进程
	if (!isForked) {
		const fp = path.relative('.', process.argv[1]);

		console.log();
		console.error('Test files must be run with the AVA CLI:\n\n    ' + chalk.grey.dim('$') + ' ' + chalk.cyan('ava ' + fp) + '\n');

		process.exit(1); // eslint-disable-line unicorn/no-process-exit
	}
}
```

- 1.1 有必要说说 为什么加个 `{ }`

    - 1. 作用域封闭, 变量安全

    - 2. `node` 能轻松知道, 噢用完不要了是吧! 内存回收

---

### 1-2. currently-unhandled

> 跟踪当前未处理的承诺拒绝的列表。

``` js
const currentlyUnhandled = require('currently-unhandled')();
```
> [->github](https://github.com/jamestalmage/currently-unhandled)

---

### 2. woker-options

>

代码 26-28

``` js
const adapter = require('./process-adapter'); // 
const serializeError = require('./serialize-error');
const opts = require('./worker-options').get();
```

- 2.1 [adapter](#adapter)

    - 1. 定义子进程与父进程的联系 send/on

    - 2. 获得从 `process.argv[2]` 获得 父进程传入子进程的 `args`, 并保存公共存储`worker-options`中 
    
        `const ps = childProcess.fork(path.join(__dirname, 'test-worker.js'), args, {})`

    - 3. 给出接口和工具函数[ 下面会讲到 ->adapter](#adapter)

在这里我们给出一些例子, 方便理解

> 尝试 `node child_process/parent.js` - 1. 定义子进程与父进程的联系 _send/on_ 

> 尝试 `node try-worker-options/index-get.js` - 2. 保存公共存储`worker-options`中

---

### 2-3. 

> 准备的一大堆

<details>

``` js

// Store details about the test run, to be sent to the parent process later.
//存储有关测试运行的详细信息，稍后将发送给父进程。
const dependencies = new Set();
const touchedFiles = new Set();

// Set when main.js is required (since test files should have `require('ava')`).
// 当 require(main.js)时设置（因为测试文件应该有`require（'ava'）`）。
let runner = null;

// Track when exiting begins, to avoid repeatedly sending stats, or sending
// individual test results once stats have been sent. This is necessary since
// exit() can be invoked from the worker process and over IPC.
//开始退出时跟踪，避免重复发送统计信息或发送
//一旦统计信息发送完毕后，单个测试结果。 这是必要的，因为
//可以从工作进程和IPC上调用 exit（）。
let exiting = false;
function exit() {
	if (exiting) {
		return;
	}
	exiting = true;

	// Reference the IPC channel so the exit sequence can be completed.
	adapter.forceRefChannel();

	const stats = {
		failCount: runner.stats.failCount + runner.stats.failedHookCount,
		knownFailureCount: runner.stats.knownFailureCount,
		passCount: runner.stats.passCount,
		skipCount: runner.stats.skipCount,
		testCount: runner.stats.testCount,
		todoCount: runner.stats.todoCount
	};
	adapter.send('results', {stats});
}

```

### 2.5 setRunner

> 从 runner.js 获得🉐️ runner

``` js
exports.setRunner = newRunner => {
	runner = newRunner;
	runner.on('dependency', file => {
		dependencies.add(file);
	});
	runner.on('touched', files => {
		for (const file of files) {
			touchedFiles.add(file);
		}
	});
	runner.on('start', started => {
		adapter.send('stats', {
			testCount: started.stats.testCount,
			hasExclusive: started.stats.hasExclusive
		});

		for (const partial of started.skippedTests) {
			adapter.send('test', {
				duration: null,
				error: null,
				failing: partial.failing,
				logs: [],
				skip: true,
				title: partial.title,
				todo: false,
				type: 'test'
			});
		}
		for (const title of started.todoTitles) {
			adapter.send('test', {
				duration: null,
				error: null,
				failing: false,
				logs: [],
				skip: true,
				title,
				todo: true,
				type: 'test'
			});
		}

		started.ended.then(() => {
			runner.saveSnapshotState();
			return exit();
		}).catch(err => {
			handleUncaughtException(err);
		});
	});
	runner.on('hook-failed', result => {
		adapter.send('test', {
			duration: result.duration,
			error: serializeError(result.error),
			failing: result.metadata.failing,
			logs: result.logs,
			skip: result.metadata.skip,
			title: result.title,
			todo: result.metadata.todo,
			type: result.metadata.type
		});
	});
	runner.on('test', result => {
		adapter.send('test', {
			duration: result.duration,
			error: result.passed ? null : serializeError(result.error),
			failing: result.metadata.failing,
			logs: result.logs,
			skip: result.metadata.skip,
			title: result.title,
			todo: result.metadata.todo,
			type: result.metadata.type
		});
	});
};

function attributeLeakedError(err) {
	if (!runner) {
		return false;
	}

	return runner.attributeLeakedError(err);
}

function handleUncaughtException(exception) {
	if (attributeLeakedError(exception)) {
		return;
	}

	let serialized;
	try {
		serialized = serializeError(exception);
	} catch (ignore) { // eslint-disable-line unicorn/catch-error-name
        // Avoid using serializeError
        // 避免使用serializeError
		const err = new Error('Failed to serialize uncaught exception');
		serialized = {
			avaAssertionError: false,
			name: err.name,
			message: err.message,
			stack: err.stack
		};
	}

	// Ensure the IPC channel is referenced. The uncaught exception will kick off
    // the teardown sequence, for which the messages must be received.
//确保IPC通道被引用。 未捕获的异常将启动
//必须接收消息的拆卸序列。
	adapter.forceRefChannel();

	adapter.send('uncaughtException', {exception: serialized});
}

const attributedRejections = new Set();
process.on('unhandledRejection', (reason, promise) => {
	if (attributeLeakedError(reason)) {
		attributedRejections.add(promise);
	}
});

process.on('uncaughtException', handleUncaughtException);

let tearingDown = false;
process.on('ava-teardown', () => {
    // AVA-teardown can be sent more than once
    // AVA-teardown可以多次发送
	if (tearingDown) {
		return;
	}
	tearingDown = true;

    // Reference the IPC channel so the teardown sequence can be completed.
    // 参考IPC通道，以便完成拆卸序列。
	adapter.forceRefChannel();

	let rejections = currentlyUnhandled()
		.filter(rejection => !attributedRejections.has(rejection.promise));

	if (rejections.length > 0) {
		rejections = rejections.map(rejection => {
			let reason = rejection.reason;
			if (!isObj(reason) || typeof reason.message !== 'string') {
				reason = {
					message: String(reason)
				};
			}
			return serializeError(reason);
		});

		adapter.send('unhandledRejections', {rejections});
	}

	// Include dependencies in the final teardown message. This ensures the full
	// set of dependencies is included no matter how the process exits, unless
	// it flat out crashes. Also include any files that AVA touched during the
    // test run. This allows the watcher to ignore modifications to those files.
//在最终拆解消息中包含依赖关系。 这确保了完整
//不管进程如何退出，都会包含依赖项集合，除非
//它平坦崩溃。 还包括在AVA期间触及的任何文件
// 测试运行。 这允许观察者忽略对这些文件的修改。
	adapter.send('teardown', {
		dependencies: Array.from(dependencies),
		touchedFiles: Array.from(touchedFiles)
	});
});

process.on('ava-exit', () => {
	process.exit(0); // eslint-disable-line xo/no-process-exit
});

process.on('ava-init-exit', () => {
	exit();
});

process.on('ava-peer-failed', () => {
	if (runner) {
		runner.interrupt();
	}
});

// Store value in case to prevent required modules from modifying it.
// 存储值以防止所需模块修改它。
const testPath = opts.file;

// Install before processing opts.require, so if helpers are added to the
// require configuration the *compiled* helper will be loaded.
//在处理opts.require之前安装，所以如果助手被添加到
//需要配置*编译*助手将被加载。
adapter.installDependencyTracking(dependencies, testPath);
adapter.installSourceMapSupport();
adapter.installPrecompilerHook();
```

</details>

---

### 3. require-testPath

> 请求-需要测试文件-完整路径

代码 239-264

``` js
try {
	(opts.require || []).forEach(x => {
		const required = require(x);
    // 一般是 自定义 babel 的 编译模块
		try {
			if (required[Symbol.for('esm\u200D:package')]) {
				require = required(module); // eslint-disable-line no-global-assign
			}
		} catch (_) {}
	});
	require(testPath);
} catch (err) {
	// 被测试文件 - 错误❌ 分析
	handleUncaughtException(err);
} finally {
	adapter.send('loaded-file', {avaRequired: Boolean(runner)});

	if (runner) {
		// Unreference the IPC channel if the test file required AVA. This stops it
		// from keeping the event loop busy, which means the `beforeExit` event can be
		// used to detect when tests stall.
		// If AVA was not required then the parent process will initiated a teardown
        // sequence, for which this process ought to stay active.
//如果测试文件需要AVA，则不要引用IPC通道。 这阻止了它
//保持事件循环繁忙，这意味着`beforeExit`事件可以
//用于检测测试何时停止。
//如果不需要AVA，则父进程将启动拆卸
//序列，这个过程应该保持活跃。
		adapter.unrefChannel();
	}
}
```

### 4. testPath

漫长阿, 终于到测试文件上场了,  记得我们的例子吗

``` js
import test from 'ava'

test('add', t =>{
    t.pass()
})
```

我们加速下, `package.json no main`

`ava/index.js`

``` js
// Ensure the same AVA install is loaded by the test file as by the test worker
// 确保测试文件加载与测试工作人员相同的AVA安装
if (process.env.AVA_PATH && process.env.AVA_PATH !== __dirname) {
	module.exports = require(process.env.AVA_PATH);
} else {
	module.exports = require('./lib/main');
}
```

`ava/lib/main.js`

``` js
const worker = require('./test-worker');
const Runner = require('./runner');
const opts = require('./worker-options').get(); // 公共存储

const runner = new Runner({
	failFast: opts.failFast,
	failWithoutAssertions: opts.failWithoutAssertions,
	file: opts.file,
	match: opts.match,
	projectDir: opts.projectDir,
	runOnlyExclusive: opts.runOnlyExclusive,
	serial: opts.serial,
	snapshotDir: opts.snapshotDir,
	updateSnapshots: opts.updateSnapshots
});

worker.setRunner(runner);

const makeCjsExport = () => {
	function test() {
		return runner.chain.apply(null, arguments);
	}
	return Object.assign(test, runner.chain);
};

// Support CommonJS modules by exporting a test function that can be fully
// chained. Also support ES module loaders by exporting __esModule and a
// default. Support `import * as ava from 'ava'` use cases by exporting a
// `test` member. Do all this whilst preventing `test.test.test() or
// `test.default.test()` chains, though in CommonJS `test.test()` is
// unavoidable.

//  通过导出完全可用的测试函数来支持CommonJS模块
//  链接。 通过导出 __esModule 和 a 来支持 ES模块加载器
//  默认. 支持 `import * as ava from 'ava'` 导出 `test`
//  成员。 做这一切，同时防止`test.test.test（）或
//  `test.default.test（）`链，尽管在CommonJS中`test.test（）`是
//  不可避免
module.exports = Object.assign(makeCjsExport(), {
	__esModule: true,
	default: runner.chain,
	test: runner.chain
});

```

- 4.1 `test-worker` 

> 上面我们就已经运行过一边了

- 4.2 `runner`

> 测试子进程的中枢呀 [-> runner.js](./runner.md) 我的头阿

- 4.3 `test == runner.chain`

> 最终运行 

``` js
runner.chain('add', t =>{
    t.pass()
})
```

### adapter

#### 