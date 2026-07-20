const assert = require('node:assert');
const { withRetry } = require('./src/retry.js');

(async () => {
  let calls = 0;
  const nonRetryable = Object.assign(new Error('invalid api key'), { retryable: false, status: 401 });
  await assert.rejects(withRetry(async () => { calls += 1; throw nonRetryable; }, 3));
  assert.strictEqual(calls, 1, 'non-retryable errors must not be retried');

  calls = 0;
  const rateLimited = Object.assign(new Error('rate limited'), { retryable: true, status: 429 });
  await assert.rejects(withRetry(async () => { calls += 1; throw rateLimited; }, 3));
  assert.strictEqual(calls, 3, 'retryable errors should use all attempts');

  calls = 0;
  const flaky = async () => { calls += 1; if (calls < 2) throw Object.assign(new Error('502'), { status: 502 }); return 'ok'; };
  assert.strictEqual(await withRetry(flaky, 3), 'ok');
  console.log('all tests passed');
})();
