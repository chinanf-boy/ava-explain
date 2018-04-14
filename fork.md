## fork

在这里

1. 集合配置, 开子进程-`ps`

2. 定义 on 模式 「因为`父-api`与`子进程-fork`也是要通信才能知道状态」

3. 返回 `new Promise(ok, err)`{

    - ok 与 `ps的正确退出` 相连

    - err 与 `ps的error` 相连 等等, 以达到作为`.then( 子进程状态获知的效果 =>{} )`

}

---

`ava/lib/fork.js`

代码 23-154

``` js
// In case the test file imports a different AVA install,
// the presence of this variable allows it to require this one instead
//如果测试文件导入不同的AVA安装，
//这个变量的存在允许它需要这个变量
env.AVA_PATH = path.resolve(__dirname, '..');

module.exports = (file, opts, execArgv) => {
	opts = Object.assign({
		file,
		baseDir: process.cwd(),
		tty: process.stdout.isTTY ? {
			columns: process.stdout.columns,
			rows: process.stdout.rows
		} : false
	}, opts);
	const args = [JSON.stringify(opts), opts.color ? '--color' : '--no-color'].concat(opts.workerArgv);
	const ps = childProcess.fork(path.join(__dirname, 'test-worker.js'), args, {
		cwd: opts.projectDir,
		silent: true,
		env,
		execArgv: execArgv || process.execArgv
	});

	const relFile = path.relative('.', file);


	let exiting = false;
	const send = (name, data) => {
		if (!exiting) {
			// This seems to trigger a Node bug which kills the AVA master process, at
			// least while running AVA's tests. See
			// <https://github.com/novemberborn/_ava-tap-crash> for more details.
			ps.send({
				name: `ava-${name}`,
				data,
				ava: true
			});
		}
	};

	let loadedFile = false;
	const testResults = [];
	let results;

	const promise = new Promise((resolve, reject) => {
		ps.on('error', reject);

		// Emit `test` and `stats` events
		ps.on('message', event => {
			if (!event.ava) {
				return;
			}

			event.name = event.name.replace(/^ava-/, '');
			event.data.file = relFile;

			debug('ipc %s:\n%o', event.name, event.data);

			ps.emit(event.name, event.data);
		});

		ps.on('test', props => {
			testResults.push(props);
		});

		ps.on('results', data => {
			results = data;
			data.tests = testResults;
			send('teardown');
		});

		ps.on('exit', (code, signal) => {
			if (code > 0) {
				return reject(new AvaError(`${relFile} exited with a non-zero exit code: ${code}`));
			}

			if (code === null && signal) {
				return reject(new AvaError(`${relFile} exited due to ${signal}`));
			}

			if (results) {
				resolve(results);
			} else if (loadedFile) {
				reject(new AvaError(`No tests found in ${relFile}`));
			} else {
				reject(new AvaError(`Test results were not received from ${relFile}`));
			}
		});

		ps.on('loaded-file', data => {
			loadedFile = true;

			if (!data.avaRequired) {
				send('teardown');
				reject(new AvaError(`No tests found in ${relFile}, make sure to import "ava" at the top of your test file`));
			}
		});
    });
        
	// Teardown finished, now exit
	ps.on('teardown', () => {
		send('exit');
		exiting = true;
	});

	// Uncaught exception in fork, need to exit
	ps.on('uncaughtException', () => {
		send('teardown');
	});

	ps.stdout.on('data', data => {
		ps.emit('stdout', data);
	});

	ps.stderr.on('data', data => {
		ps.emit('stderr', data);
	});

	promise.on = function () {
		ps.on.apply(ps, arguments);
		return promise;
	};

	promise.exit = () => {
		send('init-exit');
		return promise;
	};

	promise.notifyOfPeerFailure = () => {
		send('peer-failed');
    };
    

	return promise;
};
```


- `promise.notifyOfPeerFailure`

> 打断子进程运行