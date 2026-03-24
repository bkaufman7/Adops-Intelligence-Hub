function logRun_(action, status, message, context) {
  const logPayload = {
    timestamp: new Date().toISOString(),
    action: action || '',
    status: status || '',
    message: message || '',
    context: context || null
  };

  const row = [
    new Date(),
    action || '',
    status || '',
    message || '',
    context ? JSON.stringify(context) : ''
  ];

  appendRows_(SHEETS.RUN_LOG, [['Timestamp', 'Action', 'Status', 'Message', 'Context']], [row]);

  // Mirror sheet logs into Apps Script execution logs for faster debugging.
  const serialized = JSON.stringify(logPayload);
  if (status === RUN_STATUS.ERROR || status === RUN_STATUS.WARNING) {
    console.error(serialized);
  } else {
    console.log(serialized);
  }
  Logger.log(serialized);
}

function withRunLogging_(action, fn) {
  try {
    logRun_(action, RUN_STATUS.RUNNING, 'Started', null);
    const result = fn();
    logRun_(action, RUN_STATUS.SUCCESS, 'Completed', result || null);
    return result;
  } catch (err) {
    logRun_(action, RUN_STATUS.ERROR, String(err), { stack: err && err.stack ? err.stack : '' });
    throw err;
  }
}
