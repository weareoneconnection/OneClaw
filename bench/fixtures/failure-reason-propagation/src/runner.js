// Runs one workflow step and reports the outcome.
async function runStep(step) {
  try {
    const output = await step.execute();
    return { success: true, output };
  } catch (error) {
    return { success: false };
  }
}

module.exports = { runStep };
