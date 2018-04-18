## cli-logger

作为, 测试框架, 让用户知道测试情况相当重要

---

### 1. 日志形式

> [ava 具有三种 输出日志方式](https://github.com/avajs/ava-docs/blob/master/zh_CN/readme.md#%E6%8A%A5%E5%91%8A%E5%99%A8), 也就是表现形式的不同

- `MiniReporter` - 默认

- `TapReporter` - `-t`

- `VerboseReporter` - `-v`

---

`ava/lib/cli.js `

代码 158-164

``` js
	if (conf.tap && !conf.watch) {
		reporter = new TapReporter();
	} else if (conf.verbose || isCi) {
		reporter = new VerboseReporter({color: conf.color, watching: conf.watch});
	} else {
		reporter = new MiniReporter({color: conf.color, watching: conf.watch});
	}
```

- [isCi](https://github.com/watson/is-ci)

> 知道是否运行在自动化测试比如 travis.yml 之类的服务器中

---

### 2. 日志架子

`ava/lib/cli.js `

代码 167-169

``` js
	const logger = new Logger(reporter);
	 // 载入日志形式
	logger.start();
```

### 3. Logger

> `Logger` 定义了, 比如开始, 重置, 完成等, 日志输出行为

> 但归根结底, 最后运行的是 `reporter`中的 函数

`ava/lib/logger.js`

<details>

``` js
'use strict';
const autoBind = require('auto-bind'); 
// 让 Logger 内置函数 单独行动

//	const logger = new Logger(reporter);
// let s = logger.start
// 有 auto-bind
// s() == logger.start()
// 如果没有 auto-bind
// s() ==> error : no write prop

 
class Logger {
	constructor(reporter) {
		this.reporter = reporter; // 日志形式
		autoBind(this);
	}

	start(runStatus) {
		if (!this.reporter.start) {
			return;
		}

		this.write(this.reporter.start(runStatus), runStatus);
	}

	reset(runStatus) {
		if (!this.reporter.reset) {
			return;
		}

		this.write(this.reporter.reset(runStatus), runStatus);
	}

	test(test, runStatus) {
		this.write(this.reporter.test(test), runStatus);
	}

	unhandledError(err, runStatus) {
		if (!this.reporter.unhandledError) {
			return;
		}

		this.write(this.reporter.unhandledError(err, runStatus), runStatus);
	}

	finish(runStatus) {
		if (!this.reporter.finish) {
			return;
		}

		this.write(this.reporter.finish(runStatus), runStatus);
	}

	section() {
		if (!this.reporter.section) {
			return;
		}

		this.write(this.reporter.section());
	}

	clear() {
		if (!this.reporter.clear) {
			return false;
		}

		this.write(this.reporter.clear());
		return true;
	}

	write(str, runStatus) { // 写
		if (typeof str === 'undefined') {
			return;
		}

		this.reporter.write(str, runStatus);
	}

	stdout(data, runStatus) { // 输出
		if (!this.reporter.stdout) {
			return;
		}

		this.reporter.stdout(data, runStatus);
	}

	stderr(data, runStatus) { // 错误
		if (!this.reporter.stderr) {
			return;
		}

		this.reporter.stderr(data, runStatus);
	}

	exit(code) {
		process.exit(code); // eslint-disable-line unicorn/no-process-exit
	}
}

module.exports = Logger;

```

</details>

---

至于 三种报告的解释, 就放着吧

### MiniReporter

> 默认

https://github.com/avajs/ava/blob/master/lib/reporters/mini.js

<details>

``` js

```


</details>

### TapReporter

https://github.com/avajs/ava/blob/master/lib/reporters/tap.js

<details>

``` js

```


</details>

### VerboseReporter

https://github.com/avajs/ava/blob/master/lib/reporters/verbose.js

<details>

``` js

```


</details>