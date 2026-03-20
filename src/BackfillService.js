function startHistoricalBackfill() {
  return withRunLogging_('startHistoricalBackfill', function () {
    updateBackfillStatus_(RUN_STATUS.QUEUED);
    return { status: RUN_STATUS.QUEUED };
  });
}

function continueHistoricalBackfill() {
  return withRunLogging_('continueHistoricalBackfill', function () {
    updateBackfillStatus_(RUN_STATUS.RUNNING);

    const control = getBackfillControl_();
    const startDate = parseDateSafe_(control.startDate);
    const endDate = parseDateSafe_(control.endDate);
    const lastProcessed = parseDateSafe_(control.lastProcessedDate);

    if (!startDate || !endDate) {
      throw new Error('Backfill_Control requires valid Start Date and End Date');
    }

    const current = lastProcessed ? new Date(lastProcessed) : new Date(startDate);
    if (current > endDate) {
      updateBackfillStatus_(RUN_STATUS.COMPLETED);
      return { status: RUN_STATUS.COMPLETED };
    }

    // v1 pattern: run one chunk per invocation for resumable processing.
    refreshSourceExports();
    runAllSummaries();

    const next = new Date(current);
    next.setDate(next.getDate() + 1);
    setBackfillLastProcessed_(next);

    if (next > endDate) {
      updateBackfillStatus_(RUN_STATUS.COMPLETED);
      return { status: RUN_STATUS.COMPLETED };
    }

    return { status: RUN_STATUS.RUNNING, nextDate: next };
  });
}

function getBackfillControl_() {
  const rows = readTable_(SHEETS.BACKFILL_CONTROL);
  const first = rows[0] || {};
  return {
    startDate: first['Start Date'] || '',
    endDate: first['End Date'] || '',
    sourceSystem: first['Source System'] || '',
    mode: first['Mode'] || '',
    status: first['Status'] || '',
    lastProcessedDate: first['Last Processed Date'] || ''
  };
}

function updateBackfillStatus_(status) {
  const rows = readTable_(SHEETS.BACKFILL_CONTROL);
  const first = rows[0] || {};
  first['Status'] = status;
  writeBackfillControl_(first);
}

function setBackfillLastProcessed_(dateObj) {
  const rows = readTable_(SHEETS.BACKFILL_CONTROL);
  const first = rows[0] || {};
  first['Last Processed Date'] = dateObj;
  writeBackfillControl_(first);
}

function writeBackfillControl_(row) {
  const headers = ['Start Date', 'End Date', 'Source System', 'Mode', 'Status', 'Last Processed Date', 'Operator Notes'];
  clearAndWriteTable_(SHEETS.BACKFILL_CONTROL, headers, [toRow_(headers, row)]);
}
