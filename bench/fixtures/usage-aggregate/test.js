const assert = require('node:assert');
const { aggregateUsage } = require('./src/usage.js');

const total = aggregateUsage([
  { usage: { promptTokens: 10, completionTokens: 5 } },
  {},
  { usage: { promptTokens: 7 } },
  { usage: null },
]);
assert.strictEqual(total.promptTokens, 17);
assert.strictEqual(total.completionTokens, 5);
assert.deepStrictEqual(aggregateUsage([]), { promptTokens: 0, completionTokens: 0 });
console.log('all tests passed');
