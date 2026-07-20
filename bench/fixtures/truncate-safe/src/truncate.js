// Truncates text to at most max UTF-16 code units, appending an ellipsis.
function truncate(text, max) {
  if (text.length <= max) return text;
  return text.slice(0, max - 1) + '…';
}

module.exports = { truncate };
