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
    const week = formatTrendWeek_(row['Event Date']);
    const key = [week, row['Source Project'] || 'Unknown'].join('||');
    grouped[key] = (grouped[key] || 0) + 1;
  });

  const out = Object.keys(grouped).sort().map(function (key) {
    const parts = key.split('||');
    return [parts[0], parts[1], grouped[key]];
  });

  clearAndWriteTable_(SHEETS.TREND_WEEKLY, ['Event Week', 'Source Project', 'Issue Count'], out);
}

function buildMonthlyTrend_(rows) {
  const grouped = {};
  rows.forEach(function (row) {
    const month = formatTrendMonth_(row['Event Date']);
    const key = [month, row['Source Project'] || 'Unknown'].join('||');
    grouped[key] = (grouped[key] || 0) + 1;
  });

  const out = Object.keys(grouped).sort().map(function (key) {
    const parts = key.split('||');
    return [parts[0], parts[1], grouped[key]];
  });

  clearAndWriteTable_(SHEETS.TREND_MONTHLY, ['Event Month', 'Source Project', 'Issue Count'], out);
}

function formatTrendWeek_(value) {
  const dateObj = new Date(value);
  if (isNaN(dateObj.getTime())) {
    return '';
  }
  const tmp = new Date(Date.UTC(dateObj.getFullYear(), dateObj.getMonth(), dateObj.getDate()));
  const dayNum = tmp.getUTCDay() || 7;
  tmp.setUTCDate(tmp.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(tmp.getUTCFullYear(), 0, 1));
  const weekNo = Math.ceil((((tmp - yearStart) / 86400000) + 1) / 7);
  return tmp.getUTCFullYear() + '-W' + ('0' + weekNo).slice(-2);
}

function formatTrendMonth_(value) {
  const dateObj = new Date(value);
  if (isNaN(dateObj.getTime())) {
    return '';
  }
  return Utilities.formatDate(dateObj, Session.getScriptTimeZone(), 'yyyy-MM');
}
