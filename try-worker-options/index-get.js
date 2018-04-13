'use script'

require('./index-set.js')

const opts = require('./worker-options.js').get()


if(opts.name == 'yobrave')
console.log('index-get.js get \n global store in worker-options',opts)
else
throw new Error(" can't get any options")
