process.on('message', (m) => {
    console.log('子进程收到消息：', m);
    process.exit()
  });
  
  // Causes the parent to print: PARENT got message: { foo: 'bar', baz: null }
  process.send({ foo: 'bar', baz: NaN });

