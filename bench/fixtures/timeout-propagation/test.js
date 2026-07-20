const assert = require('node:assert');
const { buildRequestOptions } = require('./src/client.js');

assert.strictEqual(buildRequestOptions({ timeoutMs: 180000 }).timeoutMs, 180000);
assert.strictEqual(buildRequestOptions({}).timeoutMs, 30000);
assert.strictEqual(buildRequestOptions({ timeoutMs: 0 }).timeoutMs, 30000);
console.log('all tests passed');
