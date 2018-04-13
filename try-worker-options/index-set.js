'use script'

var opts = {
    "name": 'yobrave',
    "version": '1.0.0-beta3'
}

require('./worker-options.js').set(opts)

console.log('\nindex-set.js set \n global store in worker-options\n')