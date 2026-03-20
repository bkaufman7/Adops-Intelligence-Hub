function buildSummaries_() {
  return withRunLogging_('buildSummaries_', function () {
    const rows = readTable_(SHEETS.NORMALIZED_LEDGER);

    buildSummaryBySystem_(rows);
    buildSummaryByNetwork_(rows);
    buildSummaryByIssueType_(rows);

    return { normalizedRows: rows.length };
  });
}

function buildSummaryBySystem_(rows) {
  const grouped = groupCount_(rows, 'Source System');
  writeGroupedCountTable_(SHEETS.SUMMARY_BY_SYSTEM, 'Source System', grouped);
}

function buildSummaryByNetwork_(rows) {
  const grouped = groupCount_(rows, 'Network Name');
  writeGroupedCountTable_(SHEETS.SUMMARY_BY_NETWORK, 'Network Name', grouped);
}

function buildSummaryByIssueType_(rows) {
  const grouped = groupCount_(rows, 'Issue Flags');
  writeGroupedCountTable_(SHEETS.SUMMARY_BY_ISSUE_TYPE, 'Issue Flags', grouped);
}

function groupCount_(rows, field) {
  const counts = {};
  rows.forEach(function (row) {
    const key = String(row[field] || 'Unknown').trim() || 'Unknown';
    counts[key] = (counts[key] || 0) + 1;
  });
  return counts;
}

function writeGroupedCountTable_(sheetName, keyHeader, countsObj) {
  const headers = [keyHeader, 'Issue Count'];
  const rows = Object.keys(countsObj)
    .sort(function (a, b) {
      return countsObj[b] - countsObj[a];
    })
    .map(function (key) {
      return [key, countsObj[key]];
    });

  clearAndWriteTable_(sheetName, headers, rows);
}
