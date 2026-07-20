const DEFAULT_TIMEOUT_MS = 30000;

// Builds request options for the upstream AI service.
function buildRequestOptions(config = {}) {
  return {
    url: config.url,
    method: config.method || 'GET',
    timeoutMs: DEFAULT_TIMEOUT_MS,
  };
}

module.exports = { buildRequestOptions, DEFAULT_TIMEOUT_MS };
