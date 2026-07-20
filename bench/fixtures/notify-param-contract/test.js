const assert = require('node:assert');
const { buildNotifyStep } = require('./src/dispatch.js');

const withReason = buildNotifyStep({ channel: 'telegram', reason: 'quota exhausted' });
assert.strictEqual(withReason.input.reason, 'quota exhausted');
assert.ok(!('text' in withReason.input) || withReason.input.text !== undefined);

const withNote = buildNotifyStep({ note: 'manual review needed' });
assert.strictEqual(withNote.input.note, 'manual review needed');

const withText = buildNotifyStep({ text: 'hi' });
assert.strictEqual(withText.input.text, 'hi');
assert.ok(!('reason' in withText.input));
assert.ok(!('note' in withText.input));

console.log('all tests passed');
