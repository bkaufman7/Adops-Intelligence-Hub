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

  // Mirror logs into Apps Script execution logs first for faster debugging.
  const serialized = JSON.stringify(logPayload);
  if (status === RUN_STATUS.ERROR || status === RUN_STATUS.WARNING) {
    console.error(serialized);
  } else {
    console.log(serialized);
  }
  Logger.log(serialized);

  // Best-effort write to Run_Log sheet. Do not throw if Sheets is temporarily busy.
  appendRunLogRowWithRetry_(row);
}

function withRunLogging_(action, fn) {
  try {
    logRun_(action, RUN_STATUS.RUNNING, 'Started', null);
    const result = fn();
    logRun_(action, RUN_STATUS.SUCCESS, 'Completed', result || null);
    return result;
  } catch (err) {
    // Never let logging failures mask the original pipeline error.
    try {
      logRun_(action, RUN_STATUS.ERROR, String(err), { stack: err && err.stack ? err.stack : '' });
    } catch (loggingErr) {
      console.error('Failed to write run log: ' + String(loggingErr));
    }
    throw err;
  }
}

function appendRunLogRowWithRetry_(row) {
  const maxAttempts = 3;
  for (var attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      appendRows_(SHEETS.RUN_LOG, [['Timestamp', 'Action', 'Status', 'Message', 'Context']], [row]);
      return;
    } catch (err) {
      if (attempt === maxAttempts) {
        console.error('Run_Log append failed after retries: ' + String(err));
        return;
      }
      Utilities.sleep(attempt * 250);
    }
  }
}
