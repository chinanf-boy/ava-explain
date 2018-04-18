var runnerChain = function(){
    console.log('use test')
}

const makeCjsExport = () => {
	function test() {
		return runnerChain.apply(null, arguments);
	}
	return Object.assign(test, runnerChain);
};

console.log(makeCjsExport())

module.exports = Object.assign(makeCjsExport(), {
	__esModule: true,
	default: runnerChain,
	test: runnerChain
});