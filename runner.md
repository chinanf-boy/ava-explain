## runner

此 runner 是 单个测试子进程的控制台

我想, 在进入本节时, 你应该对` test.** api 有一定熟悉` 不如是否 `test.serial` 是否`test.failing` 

---

``` js
// ava/lib/main.js
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
```

---

### 1. constructor

`ava/lib/runner.js`

<details>

``` js

class Runner extends EventEmitter {
	constructor(options) {
		super();

		options = options || {};
		this.failFast = options.failFast === true;
		this.failWithoutAssertions = options.failWithoutAssertions !== false;
		this.file = options.file;
		this.match = options.match || [];
		this.projectDir = options.projectDir;
		this.runOnlyExclusive = options.runOnlyExclusive === true;
		this.serial = options.serial === true;
		this.snapshotDir = options.snapshotDir;
		this.updateSnapshots = options.updateSnapshots;

		this.activeRunnables = new Set();
		this.boundCompareTestSnapshot = this.compareTestSnapshot.bind(this);
		this.interrupted = false;
		this.snapshots = null;
		this.stats = {
			failCount: 0,
			failedHookCount: 0,
			hasExclusive: false,
			knownFailureCount: 0,
			passCount: 0,
			skipCount: 0,
			testCount: 0,
			todoCount: 0
		};
		this.tasks = {
			after: [],
			afterAlways: [],
			afterEach: [],
			afterEachAlways: [],
			before: [],
			beforeEach: [],
			concurrent: [],
			serial: [],
			todo: []
		};

		const uniqueTestTitles = new Set();
		let hasStarted = false;
		let scheduledStart = false;
		this.chain = createChain((metadata, args) => {
			// 用户输出的 test("title", t =>{})
			// 去到 args 中 ["title", t =>{}]
			if (hasStarted) {
				throw new Error('All tests and hooks must be declared synchronously in your test file, and cannot be nested within other tests or hooks.');
			}
			if (!scheduledStart) {
				scheduledStart = true;
				process.nextTick(() => {
					hasStarted = true;
					this.start(); // <==== 在从测试文件中拿到所有测试定义后, 下一个事件循环 运行开始
				});
			}

			// title
			const specifiedTitle = typeof args[0] === 'string' ?
				args.shift() :
				'';
			// t => {}
			const implementations = Array.isArray(args[0]) ?
				args.shift() :
				args.splice(0, 1);

			if (metadata.todo) {
				if (implementations.length > 0) {
					throw new TypeError('`todo` tests are not allowed to have an implementation. Use `test.skip()` for tests with an implementation.');
				}

				if (specifiedTitle === '') {
					throw new TypeError('`todo` tests require a title');
				}

				if (uniqueTestTitles.has(specifiedTitle)) {
					throw new Error(`Duplicate test title: ${specifiedTitle}`);
				} else {
					uniqueTestTitles.add(specifiedTitle);
				}

				if (this.match.length > 0) {
					// --match selects TODO tests.
					if (matcher([specifiedTitle], this.match).length === 1) {
						metadata.exclusive = true;
						this.stats.hasExclusive = true;
					}
				}

				this.tasks.todo.push({title: specifiedTitle, metadata});
			} else {
				if (implementations.length === 0) {
					//test("add ", 没有函数) 抛出错误
					throw new TypeError('expected an implementation. Use `test.todo()` for tests without an implementation.');
				}

				for (const implementation of implementations) {
					let title = implementation.title ?
						implementation.title.apply(implementation, [specifiedTitle].concat(args)) :
						specifiedTitle;

					if (typeof title !== 'string') {
						throw new TypeError('Test & hook titles must be strings');
					}

					if (title === '') {
						if (metadata.type === 'test') {
							throw new TypeError('Tests must have a title');
						} else if (metadata.always) {
							title = `${metadata.type}.always hook`;
						} else {
							title = `${metadata.type} hook`;
						}
					}

					if (metadata.type === 'test') {
						if (uniqueTestTitles.has(title)) {
							throw new Error(`Duplicate test title: ${title}`);
						} else {
							uniqueTestTitles.add(title);
						}
					}

					const task = {
						title,
						implementation,
						args,
						metadata: Object.assign({}, metadata)
					};

					if (metadata.type === 'test') {
						if (this.match.length > 0) {
							// --match overrides .only()
							task.metadata.exclusive = matcher([title], this.match).length === 1;
						}
						if (task.metadata.exclusive) {
							this.stats.hasExclusive = true;
						}

						this.tasks[metadata.serial ? 'serial' : 'concurrent'].push(task);
					} else if (!metadata.skipped) {
						this.tasks[metadata.type + (metadata.always ? 'Always' : '')].push(task);
					}
				}
			}
		}, {
			serial: false,
			exclusive: false,
			skipped: false,
			todo: false,
			failing: false,
			callback: false,
			always: false
		});
	}
```

- 1.1 this.chain

> 可以看到, 最重要的就是这一段

在 测试文件 `import test from 'ava'` 中 应用 [`ava/lib/main.js`](./test-worker.md#4-testpath) 也看到了

`test == runner.chain`

---

- 1.2 [createChain](#2-createchain)

> 分类测试 test.cb test.fail ...


- 1.3 [真相-一个运行函数](#运行函数)

> 我们在 甚至没有变量名的 `(metadata, args) => { ` 中做了什么 , 请先看完 [2. createChain](#2-createchain)

</details>

### 2. createChain

`ava/lib/create-chain.js`

代码 61-107

<details>

``` js
function createChain(fn, defaults) {
	// Test chaining rules:
	// * `serial` must come at the start
	// * `only` and `skip` must come at the end
	// * `failing` must come at the end, but can be followed by `only` and `skip`
	// * `only` and `skip` cannot be chained together
    // * no repeating
//测试链接规则：
// *`serial`必须在一开始
// *`only`和`skip`必须在最后出现
// *`fail'必须在最后出现，但可以跟随`only`和`skip`
// *`only`和`skip`不能链接在一起
// *不重复
	const root = startChain('test', fn, Object.assign({}, defaults, {type: 'test'}));
	extendChain(root, 'cb', 'callback');
	extendChain(root, 'failing');
	extendChain(root, 'only', 'exclusive');
	extendChain(root, 'serial');
	extendChain(root, 'skip', 'skipped');
	extendChain(root.cb, 'failing');
	extendChain(root.cb, 'only', 'exclusive');
	extendChain(root.cb, 'skip', 'skipped');
	extendChain(root.cb.failing, 'only', 'exclusive');
	extendChain(root.cb.failing, 'skip', 'skipped');
	extendChain(root.failing, 'only', 'exclusive');
	extendChain(root.failing, 'skip', 'skipped');
	extendChain(root.serial, 'cb', 'callback');
	extendChain(root.serial, 'failing');
	extendChain(root.serial, 'only', 'exclusive');
	extendChain(root.serial, 'skip', 'skipped');
	extendChain(root.serial.cb, 'failing');
	extendChain(root.serial.cb, 'only', 'exclusive');
	extendChain(root.serial.cb, 'skip', 'skipped');
	extendChain(root.serial.cb.failing, 'only', 'exclusive');
	extendChain(root.serial.cb.failing, 'skip', 'skipped');

	root.after = createHookChain(startChain('test.after', fn, Object.assign({}, defaults, {type: 'after'})), true);
	root.afterEach = createHookChain(startChain('test.afterEach', fn, Object.assign({}, defaults, {type: 'afterEach'})), true);
	root.before = createHookChain(startChain('test.before', fn, Object.assign({}, defaults, {type: 'before'})), false);
	root.beforeEach = createHookChain(startChain('test.beforeEach', fn, Object.assign({}, defaults, {type: 'beforeEach'})), false);

	root.serial.after = createHookChain(startChain('test.after', fn, Object.assign({}, defaults, {serial: true, type: 'after'})), true);
	root.serial.afterEach = createHookChain(startChain('test.afterEach', fn, Object.assign({}, defaults, {serial: true, type: 'afterEach'})), true);
	root.serial.before = createHookChain(startChain('test.before', fn, Object.assign({}, defaults, {serial: true, type: 'before'})), false);
	root.serial.beforeEach = createHookChain(startChain('test.beforeEach', fn, Object.assign({}, defaults, {serial: true, type: 'beforeEach'})), false);

	// "todo" tests cannot be chained. Allow todo tests to be flagged as needing
    // to be serial.
//“todo”测试不能被链接。 允许 todo tests 被标记为需要
//是串行的。
	root.todo = startChain('test.todo', fn, Object.assign({}, defaults, {type: 'test', todo: true}));
	root.serial.todo = startChain('test.serial.todo', fn, Object.assign({}, defaults, {serial: true, type: 'test', todo: true}));

	return root; // 返回 函数塔
}
```

- 2.1 [startChain](#startchain)

> 开始-组建测试链条

- 2.2 [extendChain](#extendchain)

> 扩展-测试链条

- 2.3 [createHookChain](#createhookchain)

> 创建链条钩子

---

#### 初始化小结

> 我们返回的 `root` 是一个函数 _塔_ 

真相就是 只需要一个[`运行函数`](#运行函数), 而每一层不同的只有传入 `运行函数的 args`

> 如果你看完了 ,那么我们回去 [`ava/lib/main.js` -> `worker.setRunner(runner);`](./test-worker.md#2.5-setrunner)

---

### 3. 测试

代码 167-473

<details>

``` js
// Runner 的 函数
	compareTestSnapshot(options) {
		if (!this.snapshots) {
			this.snapshots = snapshotManager.load({
				file: this.file,
				fixedLocation: this.snapshotDir,
				name: path.basename(this.file),
				projectDir: this.projectDir,
				relFile: path.relative(this.projectDir, this.file),
				testDir: path.dirname(this.file),
				updating: this.updateSnapshots
			});
			this.emit('dependency', this.snapshots.snapPath);
		}

		return this.snapshots.compare(options);
	}

	saveSnapshotState() {
		if (this.snapshots) {
			const files = this.snapshots.save();
			if (files) {
				this.emit('touched', files);
			}
		} else if (this.updateSnapshots) {
			// TODO: There may be unused snapshot files if no test caused the
			// snapshots to be loaded. Prune them. But not if tests (including hooks!)
			// were skipped. Perhaps emit a warning if this occurs?
		}
	}

	onRun(runnable) {
		this.activeRunnables.add(runnable);
	}

	onRunComplete(runnable) {
		this.activeRunnables.delete(runnable);
	}

	attributeLeakedError(err) {
		for (const runnable of this.activeRunnables) {
			if (runnable.attributeLeakedError(err)) {
				return true;
			}
		}
		return false;
	}

	beforeExitHandler() {
		for (const runnable of this.activeRunnables) {
			runnable.finishDueToInactivity();
		}
	}

	runMultiple(runnables) {
		let allPassed = true;
		const storedResults = [];
		const runAndStoreResult = runnable => {
			return this.runSingle(runnable).then(result => {
				if (!result.passed) {
					allPassed = false;
				}
				storedResults.push(result);
			});
		};

		let waitForSerial = Promise.resolve();
		return runnables.reduce((prev, runnable) => {
			if (runnable.metadata.serial || this.serial) {
				waitForSerial = prev.then(() => {
					// Serial runnables run as long as there was no previous failure, unless
					// the runnable should always be run.
					return (allPassed || runnable.metadata.always) && runAndStoreResult(runnable);
				});
				return waitForSerial;
			}

			return Promise.all([
				prev,
				waitForSerial.then(() => {
					// Concurrent runnables are kicked off after the previous serial
					// runnables have completed, as long as there was no previous failure
					// (or if the runnable should always be run). One concurrent runnable's
					// failure does not prevent the next runnable from running.
					return (allPassed || runnable.metadata.always) && runAndStoreResult(runnable);
				})
			]);
		}, waitForSerial).then(() => ({allPassed, storedResults}));
	}

	runSingle(runnable) {
		this.onRun(runnable);
		return runnable.run().then(result => {
			// If run() throws or rejects then the entire test run crashes, so
			// onRunComplete() doesn't *have* to be inside a finally().
			this.onRunComplete(runnable);
			return result;
		});
	}

	runHooks(tasks, contextRef, titleSuffix) {
		const hooks = tasks.map(task => new Runnable({
			contextRef,
			failWithoutAssertions: false,
			fn: task.args.length === 0 ?
				task.implementation :
				t => task.implementation.apply(null, [t].concat(task.args)),
			compareTestSnapshot: this.boundCompareTestSnapshot,
			updateSnapshots: this.updateSnapshots,
			metadata: task.metadata,
			title: `${task.title}${titleSuffix || ''}`
		}));
		return this.runMultiple(hooks, this.serial).then(outcome => {
			if (outcome.allPassed) {
				return true;
			}

			// Only emit results for failed hooks.
			for (const result of outcome.storedResults) {
				if (!result.passed) {
					this.stats.failedHookCount++;
					this.emit('hook-failed', result);
				}
			}
			return false;
		});
	}

	runTest(task, contextRef) {
		const hookSuffix = ` for ${task.title}`;
		return this.runHooks(this.tasks.beforeEach, contextRef, hookSuffix).then(hooksOk => {
			// Don't run the test if a `beforeEach` hook failed.
			if (!hooksOk) {
				return false;
			}

			const test = new Runnable({
				contextRef,
				failWithoutAssertions: this.failWithoutAssertions,
				fn: task.args.length === 0 ?
					task.implementation :
					t => task.implementation.apply(null, [t].concat(task.args)),
				compareTestSnapshot: this.boundCompareTestSnapshot,
				updateSnapshots: this.updateSnapshots,
				metadata: task.metadata,
				title: task.title
			});
			return this.runSingle(test).then(result => {
				if (!result.passed) {
					this.stats.failCount++;
					this.emit('test', result);
					// Don't run `afterEach` hooks if the test failed.
					return false;
				}

				if (result.metadata.failing) {
					this.stats.knownFailureCount++;
				} else {
					this.stats.passCount++;
				}
				this.emit('test', result);
				return this.runHooks(this.tasks.afterEach, contextRef, hookSuffix);
			});
		}).then(hooksAndTestOk => {
			return this.runHooks(this.tasks.afterEachAlways, contextRef, hookSuffix).then(alwaysOk => {
				return hooksAndTestOk && alwaysOk;
			});
		});
	}

	start() {
		const runOnlyExclusive = this.stats.hasExclusive || this.runOnlyExclusive;

		const todoTitles = [];
		for (const task of this.tasks.todo) {
			if (runOnlyExclusive && !task.metadata.exclusive) {
				continue;
			}

			this.stats.testCount++;
			this.stats.todoCount++;
			todoTitles.push(task.title);
		}

		const concurrentTests = [];
		const serialTests = [];
		const skippedTests = [];
		for (const task of this.tasks.serial) {
			if (runOnlyExclusive && !task.metadata.exclusive) {
				continue;
			}

			this.stats.testCount++;
			if (task.metadata.skipped) {
				this.stats.skipCount++;
				skippedTests.push({
					failing: task.metadata.failing,
					title: task.title
				});
			} else {
				serialTests.push(task);
			}
		}
		for (const task of this.tasks.concurrent) {
			if (runOnlyExclusive && !task.metadata.exclusive) {
				continue;
			}

			this.stats.testCount++;
			if (task.metadata.skipped) {
				this.stats.skipCount++;
				skippedTests.push({
					failing: task.metadata.failing,
					title: task.title
				});
			} else if (this.serial) {
				serialTests.push(task);
			} else {
				concurrentTests.push(task);
			}
		}

		if (concurrentTests.length === 0 && serialTests.length === 0) {
			this.emit('start', {
				// `ended` is always resolved with `undefined`.
				ended: Promise.resolve(undefined),
				skippedTests,
				stats: this.stats,
				todoTitles
			});
			// Don't run any hooks if there are no tests to run.
			return;
		}

		const contextRef = new ContextRef();

		// Note that the hooks and tests always begin running asynchronously.
		const beforePromise = this.runHooks(this.tasks.before, contextRef);
		const serialPromise = beforePromise.then(beforeHooksOk => {
			// Don't run tests if a `before` hook failed.
			if (!beforeHooksOk) {
				return false;
			}

			return serialTests.reduce((prev, task) => {
				return prev.then(prevOk => {
					// Don't start tests after an interrupt.
					if (this.interrupted) {
						return prevOk;
					}

					// Prevent subsequent tests from running if `failFast` is enabled and
					// the previous test failed.
					if (!prevOk && this.failFast) {
						return false;
					}

					return this.runTest(task, contextRef.copy());
				});
			}, Promise.resolve(true));
		});
		const concurrentPromise = Promise.all([beforePromise, serialPromise]).then(prevOkays => {
			const beforeHooksOk = prevOkays[0];
			const serialOk = prevOkays[1];
			// Don't run tests if a `before` hook failed, or if `failFast` is enabled
			// and a previous serial test failed.
			if (!beforeHooksOk || (!serialOk && this.failFast)) {
				return false;
			}

			// Don't start tests after an interrupt.
			if (this.interrupted) {
				return true;
			}

			// If a concurrent test fails, even if `failFast` is enabled it won't
			// stop other concurrent tests from running.
			return Promise.all(concurrentTests.map(task => {
				return this.runTest(task, contextRef.copy());
			})).then(allOkays => allOkays.every(ok => ok));
		});

		const beforeExitHandler = this.beforeExitHandler.bind(this);
		process.on('beforeExit', beforeExitHandler);

		const ended = concurrentPromise
			// Only run `after` hooks if all hooks and tests passed.
			.then(ok => ok && this.runHooks(this.tasks.after, contextRef))
			// Always run `after.always` hooks.
			.then(() => this.runHooks(this.tasks.afterAlways, contextRef))
			.then(() => {
				process.removeListener('beforeExit', beforeExitHandler);
				// `ended` is always resolved with `undefined`.
				return undefined;
			});

		this.emit('start', {
			ended,
			skippedTests,
			stats: this.stats,
			todoTitles
		});
	}

	interrupt() {
		this.interrupted = true;
	}
}

module.exports = Runner;

```


</details>

---



---

</details>

#### startChain

代码 2-11

``` js
const chainRegistry = new WeakMap();

function startChain(name, call, defaults) {
	const fn = function () {
		call(Object.assign({}, defaults), Array.from(arguments));
	};
	Object.defineProperty(fn, 'name', {value: name});
	chainRegistry.set(fn, {call, defaults, fullName: name});
	return fn;
}
```

- `WeakMap`

> WeakMap 对象是一组键/值对的集合，其中的键是弱引用的。其键必须是对象，而值可以是任意的。[->mdn](https://developer.mozilla.org/zh-CN/docs/Web/JavaScript/Reference/Global_Objects/WeakMap)

- `	return fn === test`

经过～～～漫长的参数, `createChain(fn ` -> `startChain('test', fn` -> `	return fn;` -> `createChain(){... return root;}`

-

🧠 在这, 我们看到 `test` 的函数定义

``` js
// test == fn
	const fn = function () {
		call(Object.assign({}, defaults), Array.from(arguments));
	};
```

当我们 在测试文件中定义 `test('title', t =>{ } )`

函数参数`'title', t =>{ } ` 都去到了 `Array.from(arguments));`

_call(Object.assign({}, defaults), `['title', t =>{ } ]`);_

> 那么 call 是什么来路, 记得 [runner 初始化](#1-constructor)

``` js
// 代码 54
 this.chain = createChain((metadata, args) => {
     // 这个 没有函数名的函数 就是 call

     // 代入一下变量参数 args == ['title', t =>{ } ]

     // 而 metadata 就是 不同操作类型 的 配置对象
})
```

---

#### extendChain

代码 13-41

<details>

``` js
function extendChain(prev, name, flag) {
	if (!flag) {
		flag = name;
	}

	const fn = function () {
		callWithFlag(prev, flag, Array.from(arguments));
	};
	const fullName = `${chainRegistry.get(prev).fullName}.${name}`;
	Object.defineProperty(fn, 'name', {value: fullName});
	prev[name] = fn;

	chainRegistry.set(fn, {flag, fullName, prev});
	return fn;
}

function callWithFlag(prev, flag, args) {
    // 正如上面 startChain 输入的 参数都给了 args
	const combinedFlags = {[flag]: true};
	do {
		const step = chainRegistry.get(prev);
		if (step.call) { // 也只有 用 startChain 的链条 是有 call 值
			step.call(Object.assign({}, step.defaults, combinedFlags), args); // 改配置
			prev = null;
		} else {
			combinedFlags[step.flag] = true;
			prev = step.prev;
		}
	} while (prev);
}

```

总得来说

- 1. 添加-函数到 `root.name` 且 保存在 `chainRegistry: WeakMap类型`

- 2. 当用户 在测试文件`使用`-·定义相关函数·-, 其实是改变`test函数运行的配置` -> `step.call()`


</details>

#### createHookChain

代码 43-59

<details>

``` js
root.after = createHookChain(startChain('test.after', fn, Object.assign({}, defaults, {type: 'after'})), true);
```

``` js
function createHookChain(hook, isAfterHook) {
	// Hook chaining rules:
	// * `always` comes immediately after "after hooks"
	// * `skip` must come at the end
	// * no `only`
    // * no repeating
//挂钩链接规则：
// *`always`紧接在“after hooks” 之后
// *`skip`必须结束
// * 不是`only`
// * 不重复

	extendChain(hook, 'cb', 'callback');
	extendChain(hook, 'skip', 'skipped');
    extendChain(hook.cb, 'skip', 'skipped');
// hook 是 经过 startChain 生产出来的    
	if (isAfterHook) {
		extendChain(hook, 'always');
		extendChain(hook.always, 'cb', 'callback');
		extendChain(hook.always, 'skip', 'skipped');
		extendChain(hook.always.cb, 'skip', 'skipped');
	}
    return hook;

// 最后获得🉐️ , 也就是有点像函数塔似的
hook : function(){}
hook.skip : function(){}
hook.cb : function(){}
hook.cb.skip : function(){}
hook.always : function(){}
hook.always.cb : function(){}
hook.always.skip : function(){}
hook.always.cb.skip : function(){}

// 看起来对用户友好的接口, 但其实都只是运行 从 startChain 生产出来的 的第一个函数

// 不同的只是配置  combinedFlags
step.call(Object.assign({}, step.defaults, combinedFlags), args)
}
```


</details>

### 运行函数



代码 54-164

<details>



``` js
(metadata, args) => {
			// 用户输出的 test("title", t =>{})
			// 去到 args 中 ["title", t =>{}]
			if (hasStarted) {
				throw new Error('All tests and hooks must be declared synchronously in your test file, and cannot be nested within other tests or hooks.');
			}
			if (!scheduledStart) {
				scheduledStart = true;
				process.nextTick(() => {
					hasStarted = true;
					this.start(); // <==== 在从测试文件中拿到所有测试定义后, 下一个事件循环 运行开始
				});
			}

			// title
			const specifiedTitle = typeof args[0] === 'string' ?
				args.shift() :
				'';
			// t => {}
			const implementations = Array.isArray(args[0]) ?
				args.shift() :
                args.splice(0, 1);
                
// 测试占位符 ("todo")
// 当你计划写一个测试的时候你可以使用 .todo 修饰符，像跳过测试一样这些占位符也会显示在输出结果中，它们只要求一个标题，你不能指定 callback 函数。
			if (metadata.todo) {
				if (implementations.length > 0) {
					throw new TypeError('`todo` tests are not allowed to have an implementation. Use `test.skip()` for tests with an implementation.');
				}

				if (specifiedTitle === '') {
					throw new TypeError('`todo` tests require a title');
				}

				if (uniqueTestTitles.has(specifiedTitle)) { // 重复了-测试标题
					throw new Error(`Duplicate test title: ${specifiedTitle}`);
				} else {
					uniqueTestTitles.add(specifiedTitle);
				}

				if (this.match.length > 0) {
                    // --match selects TODO tests. 选择TODO测试。
// matcher 简单的通配符匹配
// --match 标志允许你只运行包含匹配标题的测试
// https://github.com/avajs/ava#running-tests-with-matching-titles
// match 模式 优于 only 模式
					if (matcher([specifiedTitle], this.match).length === 1) {
						metadata.exclusive = true;
						this.stats.hasExclusive = true;
					}
				}

				this.tasks.todo.push({title: specifiedTitle, metadata});
			} else {
				if (implementations.length === 0) {
					//test("add ", 没有函数) 抛出错误
					throw new TypeError('expected an implementation. Use `test.todo()` for tests without an implementation.');
				}

				for (const implementation of implementations) {
					let title = implementation.title ?
						implementation.title.apply(implementation, [specifiedTitle].concat(args)) :
						specifiedTitle;

					if (typeof title !== 'string') {
						throw new TypeError('Test & hook titles must be strings');
					}

					if (title === '') {
						if (metadata.type === 'test') {
							throw new TypeError('Tests must have a title');
						} else if (metadata.always) {
							title = `${metadata.type}.always hook`;
						} else {
							title = `${metadata.type} hook`;
						}
                    } 
                    //  type === test , 抛出错误

					if (metadata.type === 'test') {
						if (uniqueTestTitles.has(title)) {
							throw new Error(`Duplicate test title: ${title}`);
						} else {
							uniqueTestTitles.add(title);
						}
					}

					const task = {
						title, // 标题
						implementation, // 函数
						args, // 剩下的args
						metadata: Object.assign({}, metadata)
					};

					if (metadata.type === 'test') {
						if (this.match.length > 0) {
                            // --match overrides .only()
                            // 覆盖 .only（）
							task.metadata.exclusive = matcher([title], this.match).length === 1;
						}
						if (task.metadata.exclusive) {
							this.stats.hasExclusive = true;
                        }
// 当 exclusive-特定 为真时, `test.only` 这个api 只运行但不会停止其他测试
                    // match 模式 优于 only 模式

						this.tasks[metadata.serial ? 'serial' : 'concurrent'].push(task);
					} else if (!metadata.skipped) {
						this.tasks[metadata.type + (metadata.always ? 'Always' : '')].push(task);
					}
                }
                // 不管怎么样, 主要都是放入 this.tasks 
			}
		}, {
			serial: false,
			exclusive: false,
			skipped: false,
			todo: false,
			failing: false,
			callback: false,
			always: false
		})
```

- [`matcher`](https://github.com/sindresorhus/matcher)

> 简单的通配符匹配

- `this.tasks`

> 真正做得就是, 集合一个测试文件, 所有定义测试 给到 `this.tasks`

``` js
// 声明默认- 可以看到也就是对应 ava 给出的 测试api
		this.tasks = {
			after: [],
			afterAlways: [],
			afterEach: [],
			afterEachAlways: [],
			before: [],
			beforeEach: [],
			concurrent: [],
			serial: [],
			todo: []
		};
```

- `defaults`

> 这些也就是 [2. createChain](#2-createChain) 的 默认配置 `createChain(fn, defaults) {`

``` js
{
			serial: false,
			exclusive: false,
			skipped: false,
			todo: false,
			failing: false,
			callback: false,
			always: false
		}
```
</details>