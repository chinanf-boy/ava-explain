## failFast

## 1. notifyOfPeerFailure

我们来说说, `notifyOfPeerFailure` 这个的运作情况

---

`ava/lib/cli.js`

- 1.1 `--fail-fast             第一次测试失败后停止`

> 记得 这个选项吗, 默认为false, 现在说的是当 为true时

---

`ava/api.js`

- 1.2 那么 `notifyOfPeerFailure` 是在哪里被触发

``` js
					runStatus.on('test', test => {
						if (test.error) { // 错误
							bailed = true;

							for (const fork of pendingForks) {
								fork.notifyOfPeerFailure();
							}
						}
					});
```

---

`ava/lib/fork.js`

- 1.3 `notifyOfPeerFailure`做了什么

``` js
	promise.notifyOfPeerFailure = () => {
		send('peer-failed');
    };
```

``` js
	const send = (name, data) => {
		if (!exiting) {
			ps.send({ 
				name: `ava-${name}`, // ava-peer-failed
				data,
				ava: true
			});
		}
	};
	// 发送 ava-peer-failed 事件到子进程
```

---

`ava/lib/test-worker.js`

- 1.4 发送给子进程, 哪里收到呢

> 记得上面说的  开子进程-`ps` -> `test-worker.js`

``` js
process.on('ava-peer-failed', () => {
	if (runner) {
		runner.interrupt();
	}
});
```

`ava/lib/runner.js` 每开一个子进程, 拿到测试文件时就开一个`runner`

> 绕得也真是够可以的

``` js
	interrupt() {
		this.interrupted = true;
	}
```

就发送信息,打断了后面所有测试子进程。