const assert = require('node:assert');
const path = require('path');
const { resolveInside } = require('./src/paths.js');

assert.strictEqual(resolveInside('/tmp/data', 'a/b.txt'), path.resolve('/tmp/data/a/b.txt'));
assert.strictEqual(resolveInside('/tmp/data', '.'), path.resolve('/tmp/data'));
assert.throws(() => resolveInside('/tmp/data', '../secrets.txt'), /escapes/);
assert.throws(() => resolveInside('/tmp/data', '../data-evil/x.txt'), /escapes/);
console.log('all tests passed');
