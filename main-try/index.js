console.log('head');

function add(a, b){
    return a + b
}

console.log("middle");

exports.add = add;

console.log('Tail');