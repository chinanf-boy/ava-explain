## worker-options

> 单次测试-子进程的全局存储

---

为了理解,我们有个简化例子🌰

1. `cd try-worker-options` 目录中

    - try-worker-options
        - worker-options [对应 ava-worker-options](#1-worker-options)
        - index-set.js   [对应 ava-set](#2-set)
        - index-get.js   [对应 ava-get](#3-get)

2. `node index-get.js` 查看运行情况

当然, 例子是简化的, 配合下面 **ava 项目摘选源码**理解

---

### 1. worker-options

`ava/lib/worker-options.js`

``` js
'use strict';
let options = null;
exports.get = () => { // 获取
	if (!options) {
		throw new Error('Options have not yet been set');
	}
	return options;
};
exports.set = newOptions => { // 设置, 只能设一次
	if (options) {
		throw new Error('Options have already been set');
	}
	options = newOptions;
};

```

---

### 2. set

`ava/lib/process-adapter.js`

``` js
require('./worker-options').set(opts);  // 设置
```

> 模块在第一次加载后会被缓存。 

这也意味着（类似其他缓存机制）如果每次调用 `require('worker-options')` 都解析到同一文件，则返回相同的对象。

---

### 3. get

`ava/lib/test-worker.js`

``` js
const adapter = require('./process-adapter'); // 要触发 set, 才能 get
//...
const opts = require('./worker-options').get();
```

这样, 就完成了, 子进程的全局存储布局

---
