// Aggregates token usage across workflow steps.
function aggregateUsage(steps) {
  return steps.reduce((total, step) => ({
    promptTokens: total.promptTokens + step.usage.promptTokens,
    completionTokens: total.completionTokens + step.usage.completionTokens,
  }), { promptTokens: 0, completionTokens: 0 });
}

module.exports = { aggregateUsage };
