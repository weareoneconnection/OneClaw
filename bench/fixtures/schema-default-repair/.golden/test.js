const assert = require('node:assert');
const { validateAnalysisInput } = require('./src/validate.js');

const minimal = validateAnalysisInput({ projectName: 'X' });
assert.strictEqual(minimal.valid, true);
assert.strictEqual(minimal.value.language, 'zh');
assert.deepStrictEqual(minimal.value.modules, []);

const explicit = validateAnalysisInput({ projectName: 'X', language: 'en', modules: ['a'] });
assert.strictEqual(explicit.valid, true);
assert.strictEqual(explicit.value.language, 'en');

const missing = validateAnalysisInput({});
assert.strictEqual(missing.valid, false);

const bad = validateAnalysisInput({ projectName: 'X', modules: 'nope' });
assert.strictEqual(bad.valid, false);
console.log('all tests passed');
