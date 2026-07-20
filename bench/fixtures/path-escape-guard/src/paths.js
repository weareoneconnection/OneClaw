const path = require('path');

// Resolves a candidate path and ensures it stays inside root.
function resolveInside(root, candidate) {
  const resolved = path.resolve(root, candidate);
  if (!resolved.startsWith(root)) throw new Error('path escapes root');
  return resolved;
}

module.exports = { resolveInside };
