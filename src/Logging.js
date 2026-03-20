function logRun_(action, status, message, context) {
  const row = [
    new Date(),
    action || '',
    status || '',
    message || '',
    context ? JSON.stringify(context) : ''
  ];

  appendRows_(SHEETS.RUN_LOG, [['Timestamp', 'Action', 'Status', 'Message', 'Context']], [row]);
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
