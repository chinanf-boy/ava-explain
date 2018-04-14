const pendingForks = new Set();

var a = () =>{}

pendingForks.add(a)

console.log('Added',pendingForks)

pendingForks.delete(a)

console.log('deleted',pendingForks)
