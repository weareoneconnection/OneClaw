// Validates the initial_analysis workflow input.
function validateAnalysisInput(input) {
  const errors = [];
  if (!input.projectName) errors.push('projectName is required');
  if (!input.language) errors.push('language is required');
  if (input.modules !== undefined && !Array.isArray(input.modules)) {
    errors.push('modules must be an array');
  }
  return { valid: errors.length === 0, errors, value: input };
}

module.exports = { validateAnalysisInput };
