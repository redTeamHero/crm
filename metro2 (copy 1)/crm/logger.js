export function logInfo(code, message, meta = {}) {
  const entry = { level: 'info', time: new Date().toISOString(), code, message, ...meta };
  console.log(JSON.stringify(entry));
}

export function logError(code, message, err, meta = {}) {
  const entry = { level: 'error', time: new Date().toISOString(), code, message, ...meta };
  if (err) {
    entry.error = err.message;
    if (err.stack) entry.stack = err.stack;
  }
  console.error(JSON.stringify(entry));
}

