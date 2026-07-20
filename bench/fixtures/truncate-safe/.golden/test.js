const assert = require('node:assert');
const { truncate } = require('./src/truncate.js');

assert.strictEqual(truncate('abc', 5), 'abc');
assert.ok(truncate('abcdefgh', 5).length <= 5);

const emoji = truncate('ab\u{1F600}cd', 4);
assert.ok(emoji.length <= 4);
const lone = /[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/;
assert.ok(!lone.test(emoji), `broken surrogate in: ${JSON.stringify(emoji)}`);
console.log('all tests passed');
