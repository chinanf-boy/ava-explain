## test

我们拿到了 用户定义测试

那么我们开始测试了

---

``` js
// runner.js
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
```

---

### Test-constructor

代码 110-148

``` js
class Test {
	constructor(options) {
		this.contextRef = options.contextRef;
		this.failWithoutAssertions = options.failWithoutAssertions;
		this.fn = isGeneratorFn(options.fn) ? co.wrap(options.fn) : options.fn;
		this.metadata = options.metadata;
		this.title = options.title;
		this.logs = [];

		this.snapshotInvocationCount = 0;
		this.compareWithSnapshot = assertionOptions => {
			const belongsTo = assertionOptions.id || this.title;
			const expected = assertionOptions.expected;
			const index = assertionOptions.id ? 0 : this.snapshotInvocationCount++;
			const label = assertionOptions.id ? '' : assertionOptions.message || `Snapshot ${this.snapshotInvocationCount}`;
			return options.compareTestSnapshot({belongsTo, expected, index, label});
		};
		this.skipSnapshot = () => {
			if (options.updateSnapshots) {
				this.addFailedAssertion(new Error('Snapshot assertions cannot be skipped when updating snapshots'));
			} else {
				this.snapshotInvocationCount++;
				this.countPassedAssertion();
			}
		};

		this.assertCount = 0;
		this.assertError = undefined;
		this.calledEnd = false;
		this.duration = null;
		this.endCallbackFinisher = null;
		this.finishDueToAttributedError = null;
		this.finishDueToInactivity = null;
		this.finishing = false;
		this.pendingAssertionCount = 0;
		this.pendingThrowsAssertion = null;
		this.planCount = null;
		this.startedAt = 0;
	}
```

### run

代码 325-407

``` js
	run() {
		this.startedAt = nowAndTimers.now(); // 时间

		const result = this.callFn(); // 运行测试

```

<details>

- [this.callFn](#callfn)

> 运行测试函数 

### callFn

``` js
	callFn() {
		try {
			return {
				ok: true,
				retval: this.fn(this.createExecutionContext())
			};
		} catch (err) {
			return {
				ok: false,
				error: err
			};
		}
	}
```

- [this.fn](#fn)

### fn

``` js
// Test constructor 从用户那里拿到的
		this.fn = isGeneratorFn(options.fn) ? co.wrap(options.fn) : options.fn;
```

- [this.createExecutionContext()](#createexecutioncontext)

> 记得 那个 `t` 了吗 

``` js
test("title", t =>{
	t.***
})
```

### createexecutioncontext

> 这就是 `t`

``` js
	createExecutionContext() {
		return new ExecutionContext(this);
	}
```

### ExecutionContext

> 定义 `t.***` 直接过了, 心累了

``` js
class ExecutionContext {
	constructor(test) {
		testMap.set(this, test);

		const skip = () => {
			test.countPassedAssertion();
		};
		const boundPlan = plan.bind(test);
		boundPlan.skip = () => {};

		Object.defineProperties(this, assertionNames.reduce((props, name) => {
			props[name] = {value: assertions[name].bind(test)};
			props[name].value.skip = skip;
			return props;
		}, {
			log: {value: log.bind(test)},
			plan: {value: boundPlan}
		})); // 赋值 assertionNames怎么来的 啊 天啊天啊 就停在这一步吧

		this.snapshot.skip = () => {
			test.skipSnapshot();
		};
	}

	get end() {
		const end = testMap.get(this).bindEndCallback();
		const endFn = err => end(err, captureStack(endFn));
		return endFn;
	}

	get title() {
		return testMap.get(this).title;
	}

	get context() {
		return testMap.get(this).contextRef.get();
	}

	set context(context) {
		testMap.get(this).contextRef.set(context);
	}

	_throwsArgStart(assertion, file, line) {
		testMap.get(this).trackThrows({assertion, file, line});
	}

	_throwsArgEnd() {
		testMap.get(this).trackThrows(null);
	}
}
```

</details>

``` js
		if (!result.ok) {
			if (!this.detectImproperThrows(result.error)) { // ❌
				this.saveFirstError(new assert.AssertionError({
					message: 'Error thrown in test',
					stack: result.error instanceof Error && result.error.stack,
					values: [formatErrorValue('Error thrown in test:', result.error)]
				}));
			}
			return this.finishPromised(); // 结束
		}

		// 如果正确 ✅

		// 返回是什么类型
		const returnedObservable = isObservable(result.retval);  // 观察
		const returnedPromise = isPromise(result.retval);

		let promise;
		if (returnedObservable) {
			promise = observableToPromise(result.retval); // 处理变 Promise
		} else if (returnedPromise) {
			// `retval` can be any thenable, so convert to a proper promise.
			promise = Promise.resolve(result.retval);
		}

```

- [isObservable](https://github.com/sindresorhus/is-observable)

> 检查一个值是否是一个[Observable](https://github.com/tc39/proposal-observable)

- [observableToPromise](https://github.com/sindresorhus/observable-to-promise)

> `observable` -> `Promise`

- [isPromise](https://github.com/then/is-promise)

> 检查一个值是否是一个`Promise`

``` js
		if (this.metadata.callback) { // .cb 回调
// 回调怎么能与 Promise 混同呢
			if (returnedObservable || returnedPromise) { 
				const asyncType = returnedObservable ? 'observables' : 'promises';
				this.saveFirstError(new Error(`Do not return ${asyncType} from tests declared via \`test.cb(...)\`, if you want to return a promise simply declare the test via \`test(...)\``));
				return this.finishPromised();
			}

			if (this.calledEnd) {
				return this.finishPromised();
			}

			return new Promise(resolve => {
				this.endCallbackFinisher = () => {
					resolve(this.finishPromised());
				};

				this.finishDueToAttributedError = () => {
					resolve(this.finishPromised());
				};

				this.finishDueToInactivity = () => {
					this.saveFirstError(new Error('`t.end()` was never called'));
					resolve(this.finishPromised());
				};
			});
		}

		if (promise) { // 是 Promise
			return new Promise(resolve => {
				this.finishDueToAttributedError = () => {
					resolve(this.finishPromised());
				};

				this.finishDueToInactivity = () => {
					const err = returnedObservable ?
						new Error('Observable returned by test never completed') :
						new Error('Promise returned by test never resolved');
					this.saveFirstError(err);
					resolve(this.finishPromised());
				};

				promise
					.catch(err => {
						if (!this.detectImproperThrows(err)) {
							this.saveFirstError(new assert.AssertionError({
								message: 'Rejected promise returned by test',
								stack: err instanceof Error && err.stack,
								values: [formatErrorValue('Rejected promise returned by test. Reason:', err)]
							}));
						}
					})
					.then(() => resolve(this.finishPromised()));
			});
		}

		// 普通测试
		return this.finishPromised(); // 如果前面都没有 return 一定要做得
	}

```

- `finishPromised`

代码 444-448

``` js
	finishPromised() {
		return new Promise(resolve => {
			resolve(this.finish());
		});
	}
```

- `finish`

代码 409-442

``` js
	finish() {
		this.finishing = true;

		if (!this.assertError && this.pendingThrowsAssertion) {
			return this.waitForPendingThrowsAssertion();
		}

		this.verifyPlan();
		this.verifyAssertions();

		this.duration = nowAndTimers.now() - this.startedAt;

		let error = this.assertError;
		let passed = !error;

		if (this.metadata.failing) {
			passed = !passed;

			if (passed) {
				error = null;
			} else {
				error = new Error('Test was expected to fail, but succeeded, you should stop marking the test as failing');
			}
		}

		return {
			duration: this.duration,
			error,
			logs: this.logs,
			metadata: this.metadata,
			passed,
			title: this.title
		};
	}
```