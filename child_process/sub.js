process.on('message', (m) => {
    console.log('子进程收到消息：', m);
    process.exit()
  });

console.log('\n', '子进程 - ipc unref 接受不到 ')

console.log(process.channel.unref()) // 断

console.log(process.channel.ref()) // 接


  // Causes the parent to print: PARENT got message: { foo: 'bar', baz: null }
process.send({ foo: 'bar', baz: NaN });

