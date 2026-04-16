function buildSummaries_() {
  return withRunLogging_('buildSummaries_', function () {
    const coreResult = buildSummariesCore_();
    buildExecutiveArtifacts_();

    return coreResult;
  });
}

function buildSummariesCore_() {
  return withRunLogging_('buildSummariesCore_', function () {
    const rows = readTable_(SHEETS.NORMALIZED_LEDGER);

    buildSummaryBySystem_(rows);
    buildSummaryByNetwork_(rows);
    buildSummaryByIssueType_(rows);
    return { normalizedRows: rows.length };
  });
}

function buildExecutiveArtifacts_() {
  return withRunLogging_('buildExecutiveArtifacts_', function () {
    const rows = readTable_(SHEETS.NORMALIZED_LEDGER);
    const liveCoverage = buildLatestLivePlacementSet_();

    buildExecutiveSnapshot_(rows, liveCoverage);
    try {
      // Presentation view is non-critical for pipeline completeness.
      // If Sheets is temporarily busy, keep core summaries/grading successful.
      buildPresentationView_(rows, liveCoverage);
    } catch (err) {
      logRun_('buildSummaries_', RUN_STATUS.WARNING, 'Presentation view skipped due transient spreadsheet timeout', {
        error: String(err)
      });
    }

    return { normalizedRows: rows.length };
  });
}

function buildExecutiveSnapshotOnly_() {
  return withRunLogging_('buildExecutiveSnapshotOnly_', function () {
    const rows = readTable_(SHEETS.NORMALIZED_LEDGER);
    const liveCoverage = buildLatestLivePlacementSet_();

    buildExecutiveSnapshot_(rows, liveCoverage);

    return {
      normalizedRows: rows.length,
      liveSnapshotDate: liveCoverage.snapshotDate,
      livePlacements: countKeys_(liveCoverage.allLivePlacements || {}),
      baselineRowsScanned: liveCoverage.baselineRowsScanned || 0,
      snapshotRowsScanned: liveCoverage.snapshotRowsScanned || 0
    };
  });
}

function buildPresentationViewOnly_() {
  return withRunLogging_('buildPresentationViewOnly_', function () {
    const rows = readTable_(SHEETS.NORMALIZED_LEDGER);
    const liveCoverage = buildLatestLivePlacementSet_();

    buildPresentationView_(rows, liveCoverage);

    return {
      normalizedRows: rows.length,
      liveSnapshotDate: liveCoverage.snapshotDate,
      livePlacements: countKeys_(liveCoverage.allLivePlacements || {}),
      baselineRowsScanned: liveCoverage.baselineRowsScanned || 0,
      snapshotRowsScanned: liveCoverage.snapshotRowsScanned || 0
    };
  });
}

function buildLatestLivePlacementSet_() {
  const sheet = getOrCreateSheet_(SHEETS.CVI_DAILY_BASELINE);
  const values = sheet.getDataRange().getValues();

  if (!values || values.length < 2) {
    return {
      snapshotDate: '',
      allLivePlacements: {},
      baselineRowsScanned: 0,
      snapshotRowsScanned: 0
    };
  }

  const headers = values[0] || [];
  const dateIdx = headers.indexOf('Snapshot Date');
  const placementIdx = headers.indexOf('Placement ID');
  const networkIdx = headers.indexOf('Network Name');

  if (dateIdx < 0 || placementIdx < 0) {
    return {
      snapshotDate: '',
      allLivePlacements: {},
      allLiveNetworks: {},
      baselineRowsScanned: Math.max(0, values.length - 1),
      snapshotRowsScanned: 0
    };
  }

  const normalizedDateCache = {};
  let latestSnapshotDate = '';

  for (var i = 1; i < values.length; i++) {
    const snapshotDate = normalizeSnapshotDateCached_(values[i][dateIdx], normalizedDateCache);
    if (snapshotDate && snapshotDate > latestSnapshotDate) {
      latestSnapshotDate = snapshotDate;
    }
  }

  if (!latestSnapshotDate) {
    return {
      snapshotDate: '',
      allLivePlacements: {},
      allLiveNetworks: {},
      baselineRowsScanned: Math.max(0, values.length - 1),
      snapshotRowsScanned: 0
    };
  }

  const allLivePlacements = {};
  const allLiveNetworks = {};
  let snapshotRowsScanned = 0;

  for (var j = 1; j < values.length; j++) {
    if (normalizeSnapshotDateCached_(values[j][dateIdx], normalizedDateCache) !== latestSnapshotDate) {
      continue;
    }

    snapshotRowsScanned += 1;
    const placementId = String(values[j][placementIdx] || '').trim();
    if (placementId) {
      allLivePlacements[placementId] = true;
    }

    if (networkIdx >= 0) {
      const networkName = String(values[j][networkIdx] || '').trim() || 'Unknown';
      allLiveNetworks[networkName] = true;
    }
  }

  return {
    snapshotDate: latestSnapshotDate,
    allLivePlacements: allLivePlacements,
    allLiveNetworks: allLiveNetworks,
    baselineRowsScanned: Math.max(0, values.length - 1),
    snapshotRowsScanned: snapshotRowsScanned
  };
}

function getActiveNetworkCoverage_(rows, liveCoverage) {
  const liveNetworks = (liveCoverage && liveCoverage.allLiveNetworks) || {};
  const liveCount = countKeys_(liveNetworks);

  if (liveCount > 0) {
    return {
      count: liveCount,
      sourceLabel: 'Latest Live Snapshot'
    };
  }

  const now = new Date();
  const currentYear = now.getFullYear();
  const currentMonth = now.getMonth();
  const monthToDateNetworks = {};

  (rows || []).forEach(function (row) {
    const eventDate = parseEventDateForCoverage_(row['Event Date']);
    if (!eventDate) {
      return;
    }

    if (eventDate.getFullYear() === currentYear && eventDate.getMonth() === currentMonth) {
      const networkName = String(row['Network Name'] || '').trim() || 'Unknown';
      monthToDateNetworks[networkName] = true;
    }
  });

  return {
    count: countKeys_(monthToDateNetworks),
    sourceLabel: 'Month-to-Date Event Ledger'
  };
}

function parseEventDateForCoverage_(value) {
  if (!value) {
    return null;
  }

  if (Object.prototype.toString.call(value) === '[object Date]') {
    return isNaN(value.getTime()) ? null : value;
  }

  const text = String(value).trim();
  if (!text) {
    return null;
  }

  if (/^\d{4}-\d{2}-\d{2}$/.test(text)) {
    const parts = text.split('-');
    const parsedIso = new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]));
    return isNaN(parsedIso.getTime()) ? null : parsedIso;
  }

  const parsed = new Date(text);
  return isNaN(parsed.getTime()) ? null : parsed;
}

function normalizeSnapshotDateCached_(value, cache) {
  const cacheKey = Object.prototype.toString.call(value) + '|' + String(value);
  if (cache && cache[cacheKey] !== undefined) {
    return cache[cacheKey];
  }

  let normalized = '';

  if (value) {
    if (Object.prototype.toString.call(value) === '[object Date]') {
      const d = value;
      if (!isNaN(d.getTime())) {
        normalized = Utilities.formatDate(d, Session.getScriptTimeZone(), 'yyyy-MM-dd');
      }
    } else {
      const str = String(value).trim();
      if (str) {
        if (/^\d{4}-\d{2}-\d{2}$/.test(str)) {
          normalized = str;
        } else {
          const parsed = new Date(str);
          if (!isNaN(parsed.getTime())) {
            normalized = Utilities.formatDate(parsed, Session.getScriptTimeZone(), 'yyyy-MM-dd');
          }
        }
      }
    }
  }

  if (cache) {
    cache[cacheKey] = normalized;
  }
  return normalized;
}

function buildSummaryBySystem_(rows) {
  const grouped = groupCount_(rows, 'Source Project');
  writeGroupedCountTable_(SHEETS.SUMMARY_BY_SYSTEM, 'Source Project', grouped);
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

function buildExecutiveSnapshot_(rows, liveCoverage) {
  const now = new Date();

  const uniqueNetworks = {};
  const uniqueAdvertisers = {};
  const uniqueReps = {};
  const uniqueIssues = {};
  const flaggedPlacementsAll = {};
  const issueByType = {};

  rows.forEach(function (row) {
    const networkName = String(row['Network Name'] || '').trim() || 'Unknown';
    const advertiser = String(row['Advertiser'] || '').trim() || 'Unknown';
    const repName = String(row['Account REP OPS'] || '').trim() || 'Unassigned';
    const placementId = String(row['Placement ID'] || '').trim();
    const issueType = String(row['Issue Type'] || row['Issue Flags'] || 'Unknown').trim() || 'Unknown';
    uniqueNetworks[networkName] = true;
    uniqueAdvertisers[advertiser] = true;
    uniqueReps[repName] = true;
    uniqueIssues[issueType] = true;
    issueByType[issueType] = (issueByType[issueType] || 0) + 1;

    if (placementId) {
      flaggedPlacementsAll[placementId] = true;
    }
  });

  const resolvedLiveCoverage = liveCoverage || { snapshotDate: '', byRep: {}, allLivePlacements: {} };

  const totalLivePlacements = countKeys_(resolvedLiveCoverage.allLivePlacements || {});
  const flaggedLivePlacements = intersectCountMaps_(flaggedPlacementsAll, resolvedLiveCoverage.allLivePlacements || {});
  const flaggedVsLiveRatio = formatPlacementRatio_(flaggedLivePlacements, totalLivePlacements);
  const flaggedVsLivePct = totalLivePlacements > 0 ? (flaggedLivePlacements / totalLivePlacements) : 0;
  const gradingStatus = getPrimaryGradingStatus_(flaggedVsLivePct * 100);
  const activeNetworkCoverage = getActiveNetworkCoverage_(rows, resolvedLiveCoverage);

  const topIssueType = getTopCountKey_(issueByType);

  const rowsOut = [];
  rowsOut.push(['Overview', '', '', '']);
  rowsOut.push(['', 'Generated At', now, 'Info']);
  rowsOut.push(['', 'Normalized Issue Events', rows.length, 'Info']);
  rowsOut.push(['', 'Active Networks (' + activeNetworkCoverage.sourceLabel + ')', activeNetworkCoverage.count, 'Info']);
  rowsOut.push(['', 'Unique Accounts (Advertisers)', countKeys_(uniqueAdvertisers), 'Info']);
  rowsOut.push(['', 'Team Members Graded (Reps)', countKeys_(uniqueReps), 'Info']);
  rowsOut.push(['', 'Unique Issue Types', countKeys_(uniqueIssues), 'Info']);
  rowsOut.push(['', 'Top Issue Type', topIssueType ? (topIssueType + ' (' + issueByType[topIssueType] + ')') : 'N/A', 'Info']);

  rowsOut.push(['Placement Health Snapshot', '', '', '']);
  rowsOut.push(['', 'Latest Daily Live Snapshot Date', resolvedLiveCoverage.snapshotDate || 'N/A', resolvedLiveCoverage.snapshotDate ? 'Info' : 'Watch']);
  rowsOut.push(['', 'Total Live Placements', totalLivePlacements, totalLivePlacements > 0 ? 'Info' : 'Watch']);
  rowsOut.push(['', 'Flagged Live Placements (Cumulative)', flaggedLivePlacements, flaggedLivePlacements > 0 ? 'Watch' : 'Good']);
  rowsOut.push(['', 'Primary Grading KPI: Flagged % of Live Placements', (flaggedVsLivePct * 100).toFixed(2) + '%', gradingStatus]);
  rowsOut.push(['', 'Flagged vs Live Ratio (Cumulative vs Latest Live)', flaggedVsLiveRatio, gradingStatus]);
  rowsOut.push(['', 'Total Flagged Placements (All Time)', countKeys_(flaggedPlacementsAll), 'Info']);

  rowsOut.push(['Summary Tab Rollups', '', '', '']);
  rowsOut.push(['', 'Summary_By_System Buckets', countKeys_(groupCount_(rows, 'Source Project')), 'Info']);
  rowsOut.push(['', 'Summary_By_Network Buckets', countKeys_(groupCount_(rows, 'Network Name')), 'Info']);
  rowsOut.push(['', 'Summary_By_Issue_Type Buckets', countKeys_(groupCount_(rows, 'Issue Flags')), 'Info']);

  clearAndWriteTable_(SHEETS.EXECUTIVE_SNAPSHOT, ['Section', 'Metric', 'Value', 'Status'], rowsOut);
  formatExecutiveSnapshot_();
}

function buildPresentationView_(rows, liveCoverage) {
  const resolvedLiveCoverage = liveCoverage || { snapshotDate: '', byRep: {}, allLivePlacements: {} };

  const flaggedPlacementsAll = {};
  const uniqueNetworks = {};
  const uniqueAdvertisers = {};
  const uniqueReps = {};

  rows.forEach(function (row) {
    const placementId = String(row['Placement ID'] || '').trim();
    if (placementId) {
      flaggedPlacementsAll[placementId] = true;
    }

    uniqueNetworks[String(row['Network Name'] || '').trim() || 'Unknown'] = true;
    uniqueAdvertisers[String(row['Advertiser'] || '').trim() || 'Unknown'] = true;
    uniqueReps[String(row['Account REP OPS'] || '').trim() || 'Unassigned'] = true;
  });

  const totalLivePlacements = countKeys_(resolvedLiveCoverage.allLivePlacements || {});
  const flaggedLivePlacements = intersectCountMaps_(flaggedPlacementsAll, resolvedLiveCoverage.allLivePlacements || {});
  const flaggedPct = totalLivePlacements > 0 ? ((flaggedLivePlacements / totalLivePlacements) * 100) : 0;
  const activeNetworkCoverage = getActiveNetworkCoverage_(rows, resolvedLiveCoverage);

  const sheet = getOrCreateSheet_(SHEETS.PRESENTATION_VIEW);
  sheet.clear();

  const titleRows = [
    ['ADOPS INTELLIGENCE HUB | LEADERSHIP SNAPSHOT'],
    ['Latest Live Snapshot: ' + (resolvedLiveCoverage.snapshotDate || 'N/A')],
    ['']
  ];
  sheet.getRange(1, 1, titleRows.length, 1).setValues(titleRows);

  const cards = [
    ['Live Placements', totalLivePlacements],
    ['Flagged Live Placements', flaggedLivePlacements],
    ['Primary Grading KPI (Flagged %)', flaggedPct.toFixed(2) + '%'],
    ['Accounts (Advertisers)', countKeys_(uniqueAdvertisers)],
    ['Active Networks', activeNetworkCoverage.count],
    ['Team Members (Reps)', countKeys_(uniqueReps)]
  ];
  sheet.getRange(4, 1, cards.length, 2).setValues(cards);

  const highlights = [
    ['Narrative Highlights'],
    ['1) Core grading KPI = ' + formatPlacementRatio_(flaggedLivePlacements, totalLivePlacements)],
    ['2) Data coverage = ' + countKeys_(uniqueAdvertisers) + ' advertisers across ' + activeNetworkCoverage.count + ' active networks (' + activeNetworkCoverage.sourceLabel + ')'],
    ['3) Accountability coverage = ' + countKeys_(uniqueReps) + ' graded team members'],
    ['4) View Rep_Grading for rep-level and network-level breakdown'],
    ['5) View Executive_Snapshot for complete rollup and status markers']
  ];
  sheet.getRange(4, 4, highlights.length, 1).setValues(highlights);

  formatPresentationView_(sheet, flaggedPct);
}

function getTopCountKey_(counts) {
  let topKey = '';
  let topCount = -1;
  Object.keys(counts || {}).forEach(function (key) {
    const n = Number(counts[key] || 0);
    if (n > topCount) {
      topCount = n;
      topKey = key;
    }
  });
  return topKey;
}

function formatExecutiveSnapshot_() {
  const sheet = getOrCreateSheet_(SHEETS.EXECUTIVE_SNAPSHOT);
  const lastRow = sheet.getLastRow();
  if (lastRow < 1) {
    return;
  }

  sheet.setColumnWidth(1, 230);
  sheet.setColumnWidth(2, 330);
  sheet.setColumnWidth(3, 220);
  sheet.setColumnWidth(4, 120);
  sheet.setFrozenRows(1);

  const headerRange = sheet.getRange(1, 1, 1, 4);
  headerRange.setFontWeight('bold').setBackground('#1f4e78').setFontColor('#ffffff');

  sheet.getRange(1, 4).setNote('Info = neutral/informational data. Watch = needs attention (warning). Good = healthy/positive signal. Critical = urgent.');

  const values = sheet.getRange(2, 1, Math.max(0, lastRow - 1), 4).getValues();
  values.forEach(function (row, idx) {
    const rowNum = idx + 2;
    const section = String(row[0] || '').trim();
    const status = String(row[3] || '').trim();

    if (section && !row[1] && !row[2]) {
      sheet.getRange(rowNum, 1, 1, 4)
        .setFontWeight('bold')
        .setBackground('#d9e1f2')
        .setFontColor('#1f4e78');
      return;
    }

    if (status === 'Good') {
      sheet.getRange(rowNum, 4).setBackground('#d9ead3').setFontColor('#274e13');
    } else if (status === 'Watch') {
      sheet.getRange(rowNum, 4).setBackground('#fff2cc').setFontColor('#7f6000');
    } else if (status === 'Critical') {
      sheet.getRange(rowNum, 4).setBackground('#f4cccc').setFontColor('#990000');
    } else {
      sheet.getRange(rowNum, 4).setBackground('#eaf3ff').setFontColor('#1f4e78');
    }
  });

  // Add status legend below the data
  const legendStartRow = lastRow + 2;
  sheet.getRange(legendStartRow, 1, 1, 4)
    .setValue('Status Legend')
    .setFontWeight('bold')
    .setFontSize(10)
    .setBackground('#f3f3f3');

  const legendRows = [
    ['Info', 'Neutral informational data (no alert)'],
    ['Watch', 'Needs attention / warning signal'],
    ['Good', 'Healthy / positive signal'],
    ['Critical', 'Urgent attention required']
  ];

  sheet.getRange(legendStartRow + 1, 1, legendRows.length, 2).setValues(legendRows).setFontSize(9);
  sheet.getRange(legendStartRow + 1, 1, legendRows.length, 1).setFontWeight('bold');
}

function formatPresentationView_(sheet, flaggedPct) {
  sheet.setColumnWidth(1, 340);
  sheet.setColumnWidth(2, 180);
  sheet.setColumnWidth(3, 40);
  sheet.setColumnWidth(4, 620);
  sheet.setFrozenRows(3);

  sheet.getRange(1, 1).setFontSize(16).setFontWeight('bold').setBackground('#1f4e78').setFontColor('#ffffff');
  sheet.getRange(2, 1).setFontSize(11).setFontColor('#1f4e78').setBackground('#d9e1f2');

  sheet.getRange(4, 1, 1, 2).setFontWeight('bold').setBackground('#cfe2f3').setFontColor('#073763');
  sheet.getRange(4, 4).setFontWeight('bold').setBackground('#cfe2f3').setFontColor('#073763');

  for (var i = 5; i <= 9; i++) {
    sheet.getRange(i, 1, 1, 2).setBackground('#f3f7fc');
  }

  sheet.getRange(6, 2).setFontWeight('bold');
  if (flaggedPct > 10) {
    sheet.getRange(6, 2).setBackground('#f4cccc').setFontColor('#990000');
  } else if (flaggedPct > 7) {
    sheet.getRange(6, 2).setBackground('#fce5cd').setFontColor('#783f04');
  } else if (flaggedPct > 4) {
    sheet.getRange(6, 2).setBackground('#fff2cc').setFontColor('#7f6000');
  } else if (flaggedPct > 2) {
    sheet.getRange(6, 2).setBackground('#eaf3ff').setFontColor('#1f4e78');
  } else {
    sheet.getRange(6, 2).setBackground('#d9ead3').setFontColor('#274e13');
  }

  sheet.getRange(5, 4, 5, 1).setWrap(true).setFontSize(10);
}

function getPrimaryGradingStatus_(flaggedPct) {
  if (flaggedPct <= 2) return 'Good';
  if (flaggedPct <= 7) return 'Watch';
  return 'Critical';
}
