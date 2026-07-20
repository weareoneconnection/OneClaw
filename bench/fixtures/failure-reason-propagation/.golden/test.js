const assert = require('node:assert');
const { runStep } = require('./src/runner.js');

(async () => {
  const failed = await runStep({ execute: async () => { throw new Error('boom'); } });
  assert.strictEqual(failed.success, false);
  assert.strictEqual(failed.reason, 'boom');

  const ok = await runStep({ execute: async () => 42 });
  assert.strictEqual(ok.success, true);
  assert.strictEqual(ok.output, 42);
  assert.ok(!('reason' in ok));
  console.log('all tests passed');
})();
