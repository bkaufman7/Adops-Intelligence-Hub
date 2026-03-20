function buildTrends_() {
  return withRunLogging_('buildTrends_', function () {
    const rows = readTable_(SHEETS.NORMALIZED_LEDGER);
    buildWeeklyTrend_(rows);
    buildMonthlyTrend_(rows);
    return { normalizedRows: rows.length };
  });
}

function buildWeeklyTrend_(rows) {
  const grouped = {};
  rows.forEach(function (row) {
    const key = [row['Event Week'] || '', row['Source System'] || 'Unknown'].join('||');
    grouped[key] = (grouped[key] || 0) + 1;
  });

  const out = Object.keys(grouped).sort().map(function (key) {
    const parts = key.split('||');
    return [parts[0], parts[1], grouped[key]];
  });

  clearAndWriteTable_(SHEETS.TREND_WEEKLY, ['Event Week', 'Source System', 'Issue Count'], out);
}

function buildMonthlyTrend_(rows) {
  const grouped = {};
  rows.forEach(function (row) {
    const key = [row['Event Month'] || '', row['Source System'] || 'Unknown'].join('||');
    grouped[key] = (grouped[key] || 0) + 1;
  });

  const out = Object.keys(grouped).sort().map(function (key) {
    const parts = key.split('||');
    return [parts[0], parts[1], grouped[key]];
  });

  clearAndWriteTable_(SHEETS.TREND_MONTHLY, ['Event Month', 'Source System', 'Issue Count'], out);
}
