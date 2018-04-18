## api.run

> 测试总开关

``` js
        // 运行在 ava/lib/cli.js
		api.run(files)
			.then(runStatus => {
				logger.finish(runStatus);
				logger.exit(runStatus.failCount > 0 || runStatus.rejectionCount > 0 || runStatus.exceptionCount > 0 ? 1 : 0);
			})
			.catch(err => {
				// Don't swallow exceptions. Note that any expected error should already
				// have been logged.
				// 不要错过例外。 请注意，任何预期的错误应该已经已记录。
				setImmediate(() => {
					throw err;
				});
			});
```

---

在 [`readme.md 3. Api`](./readme.md#3-api) 中 我们已经解释了 `class api 的 constructor(options)`

获得了一个组建好的`options`对象, 那么开始我们的总测试运行吧@！@

---

### 1. api.js

`ava/api.js`

代码 45-218

<details>

``` js
run(files, runtimeOptions) {
		const apiOptions = this.options;
		runtimeOptions = runtimeOptions || {};

		// Each run will have its own status. It can only be created when test files
        // have been found.
        // 每次运行都会有自己的状态。 它只能在测试文件时创建
        // 已找到。
		let runStatus;

        // Irrespectively, perform some setup now, before finding test files.
        // 无论如何，在查找测试文件之前，现在执行一些设置。比如统一错误❌
		const handleError = exception => {
			runStatus.handleExceptions({
				exception,
				file: exception.file ? path.relative(process.cwd(), exception.file) : undefined
			});
		};

        // Track active forks and manage timeouts.
        // 跟踪活动分叉并管理超时。
		const failFast = apiOptions.failFast === true;
		let bailed = false;
		const pendingForks = new Set();
// new Set() 特性 	
		let restartTimer;
		if (apiOptions.timeout) { // 超时设置
            const timeout = ms(apiOptions.timeout); // 变为毫秒
//   ms('2 days')  // 172800000
//   ms('1d')      // 86400000
//   ms('10h')     // 36000000

            // debounce 测试过程一到时间timeout就运行, 也就是会让 测试过程退出
			restartTimer = debounce(() => {
				// If failFast is active, prevent new test files from running after
                // the current ones are exited.
                // 如果failFast处于活动状态，请阻止在之后运行新的测试文件
                //当前的退出。
				if (failFast) {
					bailed = true;
				}

				for (const fork of pendingForks) {
					fork.exit(); // 测试-子进程退出 > 如果不太明白为什么这里是子进程, 会在  test-worker.js 说到
				}

				handleError(new AvaError(`Exited because no new tests completed within the last ${timeout}ms of inactivity`)); // 统一管理测试过程错误
			}, timeout);
		} else {
			restartTimer = Object.assign(() => {}, {cancel() {}});
		}

```

- `const pendingForks = new Set();`

> `node set-try.js` 试试 Set 特性 能加能减

- 1.0 [AvaFiles ](./avafiles.md) 奇怪👀上面👆没有这个吖, 往下看⬇️

> 在 api.run 运行中, 是使用 `Promise` 和 `多层 return` , 还有`on/emit模式`的跳脱模块的写法, 要跟上噢 

> 所以我们要知道 每层return的返回 是什么东东, _以至于逐个return代码-explain_

- 1.1 `fork.notifyOfPeerFailure()`

> 打断子进程运行

#### RunStatus

> 真正运行时候,下面 [-> explain-runStatus](./runstatus.md)

``` js
        // 还在 run() 函数内
		// Find all test files. 找到所有测试文件s.
		return new AvaFiles({cwd: apiOptions.resolveTestsFrom, files}).findTestFiles()
			.then(files => {
				runStatus = new RunStatus({ // 新建测试状态
					runOnlyExclusive: runtimeOptions.runOnlyExclusive,
					prefixTitles: apiOptions.explicitTitles || files.length > 1,
					base: path.relative(process.cwd(), commonPathPrefix(files)) + path.sep,
					failFast,
					fileCount: files.length,
					updateSnapshots: runtimeOptions.updateSnapshots
				});

                runStatus.on('test', restartTimer); // 在这一步最主要是 timeout 这个特性
                
				if (failFast) {
                    // 一旦测试失败，防止运行新的测试文件。
                    // Prevent new test files from running once a test has failed.
					runStatus.on('test', test => {
						if (test.error) {
							bailed = true;

							for (const fork of pendingForks) {
								fork.notifyOfPeerFailure(); // bluebird 提供 Promise 我找不到这个API????
							}
						}
					});
                }
                
                // 触发 test-run 记得我们在 ava/lib/cli.js 定义的 on('test-run') 
                
// 同时要记得 on 定义的函数会加入 数组
// emit触发的 是整个函数数组-> 也就是多个函数运行
				this.emit('test-run', runStatus, files);

                // Bail out early if no files were found.
                // 如果没有找到文件，请提前退出
				if (files.length === 0) {
					handleError(new AvaError('Couldn\'t find any files to test'));
					return runStatus;
				}

```

- 1.2 `this.emit`-触发-> [this.on('test-run')](./readme.md#5-runstatus)

---

- 1.3 [_setupPrecompiler](#_setupprecompiler) ⬇️

> 为每个测试运行设置一个新的预编译器。

``` js
                // Set up a fresh precompiler for each test run.
                // 为每次测试运行设置一个新的预编译器。
                // 看清楚是每次, 命令行运行
                // 不是每个测试文件
				return this._setupPrecompiler()
					.then(precompilation => {
						if (!precompilation) {
							return null;
						}

// 如果没有`projectDir`参数，编译所有测试和帮助程序文件。 
// 假设测试只加载从“resolveTestsFrom”目录中的helper。
// 否则它是`process.cwd（）`
// 可能嵌套太深。
						return new AvaFiles({cwd: this.options.resolveTestsFrom}).findTestHelpers().then(helpers => {
							return {
                                cacheDir: precompilation.cacheDir,
// 注意⚠️ 这多个return和Promise 是嵌套的 这意味着
// 上面👆 then 获得来的 变量像 files 可以用来使用
								map: files.concat(helpers).reduce((acc, file) => {
									try {
										const realpath = fs.realpathSync(file);
                                        const hash = precompilation.precompiler.precompileFile(realpath);
// precompileFile ⬇️下面说明
										acc[realpath] = hash;
									} catch (err) {
										throw Object.assign(err, {file});
									}
									return acc;
                                }, {})
                                // 编译所有测试和帮助程序文件打上 预编译
                                // 预编译完成后
							};
						});
					})
					.then(precompilation => {
                        // Resolve the correct concurrency value.

                        // 解决正确的并发值
						let concurrency = Math.min(os.cpus().length, isCi ? 2 : Infinity);
						if (apiOptions.concurrency > 0) {
							concurrency = apiOptions.concurrency;
						}
						if (apiOptions.serial) {
							concurrency = 1;
						}

                        // Try and run each file, limited by `concurrency`.

                        // 尝试和运行每个文件, 并发限制🚫为concurrency
						return Bluebird.map(files, file => {

```

- 1.4 `precompilation.precompiler.precompileFile(realpath);`

> 用 babel 预编译测试文件可以说是一波三折 涉及多个文件从那么多个点就知道啦😢

> 所有的操作都放入了 [_setupprecompiler 里面了](#_setupprecompiler)

- 1.5 `Bluebird.map`

> 这也是为什么-ava 快的原因, Bluebird.map具有模拟并发测试文件

> ⏰ 且 `Bluebird 是一个Promise 超集库`, 理所当然 ` Bluebird.map` 返回的也是一个`Promise`

> 所以最后可以安心的等待 `then(result =>{ //...` 结果的到来

``` js
							// No new files should be run once a test has timed out or failed,
                            // and failFast is enabled.
                            // 测试超时或失败后，不应运行新文件，
							if (bailed) {
								return null;
							}

							let forked;
// 😊到了这个, 即将要进入测试运行的重要转折点
							return Bluebird.resolve( // Promise.resolve 只是想把这段变为Promise
								this._computeForkExecArgv().then(execArgv => {
									const options = Object.assign({}, apiOptions, {
										// If we're looking for matches, run every single test process in exclusive-only mode
										// 如果我们正在寻找匹配项，请以独占模式运行每个测试流程
										runOnlyExclusive: apiOptions.match.length > 0 || runtimeOptions.runOnlyExclusive === true
									});
									if (precompilation) {
										options.cacheDir = precompilation.cacheDir;
										options.precompiled = precompilation.map;
									} else {
										options.precompiled = {};
									}
									if (runtimeOptions.updateSnapshots) {
										// Don't use in Object.assign() since it'll override options.updateSnapshots even when false.

										// 不要在Object.assign（）中使用，因为即使错误，它也会覆盖options.updateSnapshots。
										options.updateSnapshots = true;
									}
									forked = fork(file, options, execArgv);
// 🌟子进程的起点
									pendingForks.add(forked); // 运行中的子进程列表, 最后会del
						
									runStatus.observeFork(forked); // 注入-测试状态函数
									// 也就是 forked.on('***', runStatus.***)
									// 这些定义函数, 会转到 子进程的on
									// --> ps.on('***', runStatus.***)
						
									restartTimer(); // 计时开始, 如果设置超时
									return forked;
								}).catch(err => {
									// Prevent new test files from running.
									// 停止🤚新测试文件运行
									if (failFast) {
										bailed = true;
									}
									handleError(Object.assign(err, {file}));
									return null;
								})
							).finally(() => {
								pendingForks.delete(forked);
								//  运行中的子进程列表, 最后会del
							});
						}, {concurrency});
					})
					.catch(err => {
						handleError(err);
						return [];
					})
					.then(results => {
//可以安心的等待 `then(result =>{ //...` 结果的到来
						restartTimer.cancel();

						// Filter out undefined results (e.g. for files that were skipped after a timeout)

						// 滤除未定义的结果（例如，对于超时后跳过的文件）
						results = results.filter(Boolean);
						if (apiOptions.match.length > 0 && !runStatus.hasExclusive) {
							handleError(new AvaError('Couldn\'t find any matching tests'));
						}

						runStatus.processResults(results);
						// 测试总结果-赋予
						return runStatus; // 测试总结果-返回统一操作
					});
			});
	}
```

- 1.6 [this._computeForkExecArgv](#_computeforkexecargv)

> 管理好子进程`child_process.fork(modulePath[, args][, options])`, 要传给执行路径的字符串参数列表 `options.execArgv`

> 如果是调试, 加上可用的port值

- 1.7 `forked = fork(file, options, execArgv);`

> [fork : 1. 用所有信息和测试文件 构建子进程 2. 并与父进程也就是api-总测试开关 建立联系](./fork.md)

</details>

---

到这里我们, 已经过了一遍 ava 的 过程, 惊险刺激是吧, 也学到了许多。

---

## api-tools

`ava/api.js`

220-294

### _setupPrecompiler

> 

在 [`ava/lib/cli.js`](./readme.md#2.1-new-api)的时候, 提供了全部的默认/用户定义的选项来, `new Api(optioins)`

``` js
	_setupPrecompiler() {
		// 是否缓存编译
		const cacheDir = this.options.cacheEnabled === false ?
			uniqueTempDir() :
			path.join(this.options.projectDir, 'node_modules', '.cache', 'ava');

		return this._buildBabelConfig(cacheDir).then(result => {
			return result ? {
				cacheDir,
				precompiler: new CachingPrecompiler({
					path: cacheDir,
					getBabelOptions: result.getOptions,
					babelCacheKeys: result.cacheKeys
				})
			} : null;
		});
    }
    
```

- [`this._buildBabelConfig`](#_buildbabelconfig)

> 验证和管理好babel配置, 返回缓存结果

- [CachingPrecompiler](#cachingprecompiler)

> 缓存好预编译且提供接口

### _buildBabelConfig

``` js
	_buildBabelConfig(cacheDir) {
		// 哦, 已经有了返回
		if (this._babelConfigPromise) {
			return this._babelConfigPromise;
		}

		// 是否禁用-输出更多错误信息
		const compileEnhancements = this.options.compileEnhancements !== false;
		const promise = babelConfigHelper.build(this.options.projectDir, cacheDir, this.options.babelConfig, compileEnhancements);// 构建

		this._babelConfigPromise = promise; // 保存下
		return promise;
	}

```

- [babelConfigHelper.build](./babel-config.md#2-build)

> 带着 `babelConfigHelper.build(项目目录, 缓存目录, 用户定义babel, 错误信息不输出) - 返回一个 `Promise类型`

``` js
`ava/lib/babel-config.js 定义babelConfigHelper.build`
			return {
				getOptions() {
					return getOptions(envName, cache);
				},
				// Include the seed in the cache keys used to store compilation results.
				//将种子包含在用于存储编译结果的缓存键中。
				cacheKeys: Object.assign({seed}, cacheKeys)
			}; 
`ava/api.js 返回 promise`
			const promise = babelConfigHelper.build(this.options.projectDir, cacheDir, this.options.babelConfig, compileEnhancements);// 构建
			// --> promise.then(
				{
				getOptions() {
					return getOptions(envName, cache);
				},
				cacheKeys: Object.assign({seed}, cacheKeys)
				
			} => {}
			)

```

### CachingPrecompiler

> 正在缓存预编译 [-> caching-precompiler.js](./caching-precompiler.md)

### _computeForkExecArgv

> 如果是调试子进程, 
把 node 调试参数 像 `--debug` 加上 一个可用的port

``` js
	_computeForkExecArgv() {
		const execArgv = this.options.testOnlyExecArgv || process.execArgv;
		if (execArgv.length === 0) {
			return Promise.resolve(execArgv);
		}

		let debugArgIndex = -1;

		// --inspect-brk is used in addition to --inspect to break on first line and wait
		// --inspect-brk 用于 除了用于检查第一行并等待
		execArgv.some((arg, index) => {
			const isDebugArg = /^--inspect(-brk)?($|=)/.test(arg);
			if (isDebugArg) {
				debugArgIndex = index;
			}

			return isDebugArg;
		});

		const isInspect = debugArgIndex >= 0;
		if (!isInspect) { 
			// 找不到 --inspect|--inspect-brk 停在第一行
			// 找 --debug|--debug-brk 
			
			execArgv.some((arg, index) => {
				const isDebugArg = /^--debug(-brk)?($|=)/.test(arg);
				if (isDebugArg) {
					debugArgIndex = index;
				}

				return isDebugArg;
			});
		}

		if (debugArgIndex === -1) { // 还是没有
		// 	直接返回
			return Promise.resolve(execArgv);
		}
		// 到这里, 就是有需要调试的 execArgs
		return getPort().then(port => {
			const forkExecArgv = execArgv.slice();
			let flagName = isInspect ? '--inspect' : '--debug';
			const oldValue = forkExecArgv[debugArgIndex];
			if (oldValue.indexOf('brk') > 0) {
				flagName += '-brk';
			}

			forkExecArgv[debugArgIndex] = `${flagName}=${port}`;
			// 把 调试值加上 =port
			return forkExecArgv;
		});
	}
}

```

- `getPort`

> 获取可用端口