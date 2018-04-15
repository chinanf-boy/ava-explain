const Logger = require('./logger');
const TapReporter = require('./reporters/tap')


if(true){
    reporter = new TapReporter();
}
// } else if (conf.verbose || isCi) {
//     reporter = new VerboseReporter({color: conf.color, watching: conf.watch});
// } else {
//     reporter = new MiniReporter({color: conf.color, watching: conf.watch});
// }

const logger = new Logger(reporter);

logger.start();

setTimeout(x =>logger.finish(), 1000)