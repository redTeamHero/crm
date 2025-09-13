const SENSITIVE_KEYS = new Set(["ssn", "email", "token"]);

function redactSensitive(data) {
  if (!data || typeof data !== "object") return data;
  if (Array.isArray(data)) return data.map(redactSensitive);

  const result = {};
  for (const [key, value] of Object.entries(data)) {
    if (SENSITIVE_KEYS.has(key.toLowerCase())) {
      result[key] = "[REDACTED]";
    } else {
      result[key] = redactSensitive(value);
    }
  }
  return result;
}

function logInfo(code, message, meta = {}) {
  const entry = {
    level: "info",
    time: new Date().toISOString(),
    code,
    message,
    ...meta,
  };
  console.log(JSON.stringify(redactSensitive(entry)));
}

function logError(code, message, err, meta = {}) {
  const entry = {
    level: "error",
    time: new Date().toISOString(),
    code,
    message,
    ...meta,
  };

  if (err) {
    entry.error = err.message;
    if (err.stack) entry.stack = err.stack;
  }
  console.error(JSON.stringify(redactSensitive(entry)));
}

function logWarn(code, message, meta = {}) {
  const entry = {
    level: "warn",
    time: new Date().toISOString(),
    code,
    message,
    ...meta,
  };
  console.warn(JSON.stringify(redactSensitive(entry)));
}

export { logInfo, logError, logWarn, redactSensitive };

