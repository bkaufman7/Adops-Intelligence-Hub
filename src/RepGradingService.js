/**
 * RepGradingService.js
 *
 * Primary performance grading (authoritative):
 * - One placement counts once, even with multiple flags
 * - Grade based on flagged placements vs total live placements
 *
 * Diagnostic grading (secondary):
 * - Issue density among flagged placements (legacy-style signal)
 */

function buildRepGrading_() {
  logRun_('buildRepGrading_', RUN_STATUS.RUNNING, 'Started', null);

  const ledger = readTable_(SHEETS.NORMALIZED_LEDGER);
  if (!ledger || ledger.length === 0) {
    logRun_('buildRepGrading_', RUN_STATUS.WARNING, 'No normalized data found', null);
    clearAndWriteTable_(SHEETS.REP_GRADING, repPerformanceHeaders_(), []);
    clearAndWriteTable_(SHEETS.REP_GRADING_DIAGNOSTIC, repDiagnosticHeaders_(), []);
    return { repsGraded: 0 };
  }

  const model = getGradingModel_();
  const networkMap = buildNetworkMap_();
  const liveCoverage = buildLatestLivePlacementCoverageByRepFast_(networkMap);
  const lookbackDate = getLookbackDate_(30);

  const repStats = {};
  const allFlaggedPlacements = {};
  let excludedRows = 0;

  ledger.forEach(function (row) {
    const advertiser = String(row['Advertiser'] || 'Unknown').trim() || 'Unknown';
    if (isExcludedForGrading_(advertiser)) {
      excludedRows += 1;
      return;
    }

    const repName = String(row['Account REP OPS'] || 'Unassigned').trim() || 'Unassigned';
    const placementId = String(row['Placement ID'] || '').trim();
    const issueType = String(row['Issue Type'] || '').trim();
    const issueFlags = String(row['Issue Flags'] || '').trim();
    const issueDetail = String(row['Issue Detail'] || '').trim();
    const eventDate = parseRepDate_(row['Event Date']);

    if (!repStats[repName]) {
      repStats[repName] = {
        flaggedPlacements: {},
        uniqueIssueKeys: {},
        last30DaysEvents: 0
      };
    }

    if (placementId) {
      // Primary metric: one placement counts once regardless of flag count.
      repStats[repName].flaggedPlacements[placementId] = true;
      allFlaggedPlacements[placementId] = true;
      const issueFingerprint = issueType || issueFlags || issueDetail || 'Unknown Issue';
      repStats[repName].uniqueIssueKeys[placementId + '|' + issueFingerprint] = true;
    }

    if (eventDate >= lookbackDate) {
      repStats[repName].last30DaysEvents += 1;
    }
  });

  const repPerformance = [];
  const repDiagnostic = [];
  const overallFlaggedLivePlacements = intersectCountMaps_(allFlaggedPlacements, liveCoverage.allLivePlacements || {});
  const overallLivePlacements = countKeys_(liveCoverage.allLivePlacements || {});
  const baselinePct = overallLivePlacements > 0
    ? (overallFlaggedLivePlacements / overallLivePlacements) * 100
    : model.defaultBaselinePct;

  // Include all reps from current live baseline snapshot and from Network_Mapping
  // so leadership can see full rep roster even when a rep has zero current issues.
  const allRepNames = {};
  Object.keys(repStats).forEach(function (repName) { allRepNames[repName] = true; });
  Object.keys(liveCoverage.byRep || {}).forEach(function (repName) { allRepNames[repName] = true; });
  const networkMapRows = readTable_(SHEETS.NETWORK_MAPPING);
  const networkMappingRepNames = {};
  networkMapRows.forEach(function (row) {
    const repName = String(row['Account REP OPS'] || '').trim();
    if (repName && repName !== 'Unassigned') {
      allRepNames[repName] = true;
      networkMappingRepNames[repName] = true;
    }
  });

  const repsFromLedger = countKeys_(repStats);
  const repsFromLiveCoverage = countKeys_(liveCoverage.byRep || {});
  const repsFromNetworkMapping = countKeys_(networkMappingRepNames);
  const repsWithoutLiveCoverage = [];
  const repsWithNoFlaggedPlacements = [];

  Object.keys(allRepNames).forEach(function (repName) {
    const stats = repStats[repName] || {
      flaggedPlacements: {},
      uniqueIssueKeys: {},
      last30DaysEvents: 0
    };
    const liveInfo = liveCoverage.byRep[repName] || { livePlacements: {} };

    const flaggedPlacements = countKeys_(stats.flaggedPlacements);
    const totalLivePlacements = countKeys_(liveInfo.livePlacements);

    if (!totalLivePlacements) {
      repsWithoutLiveCoverage.push(repName);
    }
    if (!flaggedPlacements) {
      repsWithNoFlaggedPlacements.push(repName);
    }

    const totalTraffickedPlacements = totalLivePlacements;
    const flaggedLivePlacements = intersectCountMaps_(stats.flaggedPlacements, liveInfo.livePlacements);
    const rawFlaggedPct = totalLivePlacements > 0 ? (flaggedLivePlacements / totalLivePlacements) * 100 : null;
    const adjustedFlaggedPct = calculateSmoothedPct_(flaggedLivePlacements, totalLivePlacements, baselinePct, model.repSmoothingK);
    const eligibility = getEligibilityLabel_(totalLivePlacements, model.minFullGradeLivePlacements);
    const performanceGrade = calculatePerformanceGradeByEntity_(adjustedFlaggedPct, totalLivePlacements, 'rep');
    const confidence = calculateConfidenceLabel_(flaggedPlacements, totalLivePlacements, flaggedLivePlacements);

    const uniqueIssues = countKeys_(stats.uniqueIssueKeys);
    const issueDensity = flaggedPlacements > 0 ? (uniqueIssues / flaggedPlacements) : 0;
    const diagnosticGrade = calculateDiagnosticGrade_(issueDensity);

    repPerformance.push({
      repName: repName,
      flaggedPlacements: flaggedPlacements,
      totalLivePlacements: totalLivePlacements,
      flaggedLivePlacements: flaggedLivePlacements,
      rawFlaggedPct: rawFlaggedPct,
      adjustedFlaggedPct: adjustedFlaggedPct,
      eligibility: eligibility,
      grade: performanceGrade,
      confidence: confidence,
      totalTraffickedPlacements: totalTraffickedPlacements,
      issueDensity: issueDensity
    });

    repDiagnostic.push({
      repName: repName,
      diagnosticGrade: diagnosticGrade,
      uniqueIssues: uniqueIssues,
      flaggedPlacements: flaggedPlacements,
      issueDensity: issueDensity
    });
  });

  repPerformance.sort(function (a, b) {
    const aScore = a.adjustedFlaggedPct === null ? -1 : a.adjustedFlaggedPct;
    const bScore = b.adjustedFlaggedPct === null ? -1 : b.adjustedFlaggedPct;
    if (bScore !== aScore) return bScore - aScore;
    return b.flaggedPlacements - a.flaggedPlacements;
  });

  repDiagnostic.sort(function (a, b) {
    if (b.issueDensity !== a.issueDensity) return b.issueDensity - a.issueDensity;
    return b.uniqueIssues - a.uniqueIssues;
  });

  writeRepPerformanceTable_(repPerformance);
  writeRepDiagnosticTable_(repDiagnostic);
  try {
    writeGradingMethodologySheet_({
      baselinePct: baselinePct,
      overallLivePlacements: overallLivePlacements,
      overallFlaggedLivePlacements: overallFlaggedLivePlacements,
      excludedRows: excludedRows
    });
  } catch (methodologyErr) {
    // Non-blocking: grading outputs are higher-priority than methodology refresh.
    logRun_('buildRepGrading_', RUN_STATUS.WARNING, 'Grading methodology sheet refresh skipped due transient spreadsheet timeout', {
      error: String(methodologyErr)
    });
  }

  logRun_('buildRepGrading_', RUN_STATUS.SUCCESS, 'Completed', {
    repsGraded: repPerformance.length,
    repsFromLedger: repsFromLedger,
    repsFromLiveCoverage: repsFromLiveCoverage,
    repsFromNetworkMapping: repsFromNetworkMapping,
    repsWithoutLiveCoverageCount: repsWithoutLiveCoverage.length,
    repsWithNoFlaggedPlacementsCount: repsWithNoFlaggedPlacements.length,
    repsWithoutLiveCoverageSample: repsWithoutLiveCoverage.slice(0, 15),
    repsWithNoFlaggedPlacementsSample: repsWithNoFlaggedPlacements.slice(0, 15),
    unassignedFlaggedPlacements: repStats.Unassigned ? countKeys_(repStats.Unassigned.flaggedPlacements) : 0,
    topRep: repPerformance.length ? repPerformance[0].repName : null,
    topRepFlaggedPct: repPerformance.length ? formatPercentValue_(repPerformance[0].adjustedFlaggedPct) : 'N/A',
    liveSnapshotDate: liveCoverage.snapshotDate || '',
    baselineRowsScanned: liveCoverage.baselineRowsScanned || 0,
    snapshotRowsScanned: liveCoverage.snapshotRowsScanned || 0,
    overallBaselinePct: formatPercentValue_(baselinePct),
    excludedRows: excludedRows
  });

  return { repsGraded: repPerformance.length };
}

function buildAdvertiserGrading_() {
  logRun_('buildAdvertiserGrading_', RUN_STATUS.RUNNING, 'Started', null);

  const ledger = readTable_(SHEETS.NORMALIZED_LEDGER);
  if (!ledger || ledger.length === 0) {
    logRun_('buildAdvertiserGrading_', RUN_STATUS.WARNING, 'No normalized data found', null);
    clearAndWriteTable_(SHEETS.ADVERTISER_GRADING, advertiserPerformanceHeaders_(), []);
    return { advertisersGraded: 0 };
  }

  const model = getGradingModel_();
  const targetAdvertisers = {};
  const allFlaggedPlacements = {};
  let excludedRows = 0;
  ledger.forEach(function (row) {
    const advertiser = String(row['Advertiser'] || 'Unknown').trim() || 'Unknown';
    if (isExcludedForGrading_(advertiser)) {
      excludedRows += 1;
      return;
    }

    const placementId = String(row['Placement ID'] || '').trim();
    if (placementId) {
      allFlaggedPlacements[placementId] = true;
    }
    targetAdvertisers[advertiser.toLowerCase()] = true;
  });

  const liveCoverage = buildLatestLivePlacementCoverageByAdvertiserFast_(targetAdvertisers);
  const advStats = {};
  const overallFlaggedLivePlacements = intersectCountMaps_(allFlaggedPlacements, liveCoverage.allLivePlacements || {});
  const overallLivePlacements = countKeys_(liveCoverage.allLivePlacements || {});
  const baselinePct = overallLivePlacements > 0
    ? (overallFlaggedLivePlacements / overallLivePlacements) * 100
    : model.defaultBaselinePct;

  ledger.forEach(function (row) {
    const advertiser = String(row['Advertiser'] || 'Unknown').trim() || 'Unknown';
    if (isExcludedForGrading_(advertiser)) {
      return;
    }

    const placementId = String(row['Placement ID'] || '').trim();
    if (!placementId) return;

    if (!advStats[advertiser]) {
      advStats[advertiser] = {
        flaggedPlacements: {}
      };
    }

    advStats[advertiser].flaggedPlacements[placementId] = true;
  });

  const rows = [];
  Object.keys(advStats).forEach(function (advertiser) {
    const flaggedPlacementsMap = advStats[advertiser].flaggedPlacements;
    const livePlacementsMap = (liveCoverage.byAdvertiser[advertiser] && liveCoverage.byAdvertiser[advertiser].livePlacements) || {};

    const flaggedPlacements = countKeys_(flaggedPlacementsMap);
    const totalLivePlacements = countKeys_(livePlacementsMap);
    const flaggedLivePlacements = intersectCountMaps_(flaggedPlacementsMap, livePlacementsMap);
    const rawFlaggedPct = totalLivePlacements > 0 ? (flaggedLivePlacements / totalLivePlacements) * 100 : null;
    const adjustedFlaggedPct = calculateSmoothedPct_(flaggedLivePlacements, totalLivePlacements, baselinePct, model.advertiserSmoothingK);
    const eligibility = getEligibilityLabel_(totalLivePlacements, model.minFullGradeLivePlacements);
    const grade = calculatePerformanceGradeByEntity_(adjustedFlaggedPct, totalLivePlacements, 'advertiser');
    const confidence = calculateConfidenceLabel_(flaggedPlacements, totalLivePlacements, flaggedLivePlacements);

    rows.push({
      advertiser: advertiser,
      flaggedPlacements: flaggedPlacements,
      totalLivePlacements: totalLivePlacements,
      flaggedLivePlacements: flaggedLivePlacements,
      rawFlaggedPct: rawFlaggedPct,
      adjustedFlaggedPct: adjustedFlaggedPct,
      eligibility: eligibility,
      grade: grade,
      confidence: confidence
    });
  });

  rows.sort(function (a, b) {
    const aScore = a.adjustedFlaggedPct === null ? -1 : a.adjustedFlaggedPct;
    const bScore = b.adjustedFlaggedPct === null ? -1 : b.adjustedFlaggedPct;
    if (bScore !== aScore) return bScore - aScore;
    return b.flaggedPlacements - a.flaggedPlacements;
  });

  writeAdvertiserPerformanceTable_(rows);

  logRun_('buildAdvertiserGrading_', RUN_STATUS.SUCCESS, 'Completed', {
    advertisersGraded: rows.length,
    topAdvertiser: rows.length ? rows[0].advertiser : null,
    topAdvertiserFlaggedPct: rows.length ? formatPercentValue_(rows[0].adjustedFlaggedPct) : 'N/A',
    liveSnapshotDate: liveCoverage.snapshotDate || '',
    baselineRowsScanned: liveCoverage.baselineRowsScanned || 0,
    snapshotRowsScanned: liveCoverage.snapshotRowsScanned || 0,
    targetAdvertisers: countKeys_(targetAdvertisers),
    overallBaselinePct: formatPercentValue_(baselinePct),
    excludedRows: excludedRows
  });

  return { advertisersGraded: rows.length };
}

function repPerformanceHeaders_() {
  return [
    'Rank',
    'Rep',
    'Grade',
    'Eligibility',
    'Adjusted Flagged %',
    'Raw Flagged %',
    'Flagged Live Placements',
    'Total Trafficked Placements (Snapshot)',
    'Unflagged Live Placements',
    'Flagged/Live Ratio',
    'Confidence'
  ];
}

function repDiagnosticHeaders_() {
  return [
    'Rank',
    'Rep',
    'Issue Density Grade (Diagnostic)',
    'Unique Issues',
    'Flagged Placements',
    'Issues per Flagged Placement',
    'Notes'
  ];
}

function advertiserPerformanceHeaders_() {
  return [
    'Rank',
    'Advertiser',
    'Grade',
    'Eligibility',
    'Adjusted Flagged %',
    'Raw Flagged %',
    'Flagged Live Placements',
    'Total Live Placements',
    'Flagged/Live Ratio',
    'Confidence'
  ];
}

function writeRepPerformanceTable_(rows) {
  const headers = repPerformanceHeaders_();
  const tableRows = rows.map(function (item, index) {
    const unflaggedLivePlacements = Math.max(0, Number(item.totalTraffickedPlacements || 0) - Number(item.flaggedLivePlacements || 0));
    return [
      index + 1,
      item.repName,
      item.grade,
      item.eligibility,
      formatPercentValue_(item.adjustedFlaggedPct),
      formatPercentValue_(item.rawFlaggedPct),
      item.flaggedLivePlacements,
      item.totalTraffickedPlacements,
      unflaggedLivePlacements,
      formatPlacementRatio_(item.flaggedLivePlacements, item.totalTraffickedPlacements),
      item.confidence
    ];
  });

  clearAndWriteTable_(SHEETS.REP_GRADING, headers, tableRows);
  formatPerformanceSheet_(SHEETS.REP_GRADING, tableRows.length, 11, 5, 11, tableRows);
}

function writeRepDiagnosticTable_(rows) {
  const headers = repDiagnosticHeaders_();
  const tableRows = rows.map(function (item, index) {
    return [
      index + 1,
      item.repName,
      item.diagnosticGrade,
      item.uniqueIssues,
      item.flaggedPlacements,
      item.issueDensity.toFixed(2),
      'Secondary diagnostic only'
    ];
  });

  clearAndWriteTable_(SHEETS.REP_GRADING_DIAGNOSTIC, headers, tableRows);
  formatPerformanceSheet_(SHEETS.REP_GRADING_DIAGNOSTIC, tableRows.length, 7, 0, 0, tableRows);
}

function writeAdvertiserPerformanceTable_(rows) {
  const headers = advertiserPerformanceHeaders_();
  const tableRows = rows.map(function (item, index) {
    return [
      index + 1,
      item.advertiser,
      item.grade,
      item.eligibility,
      formatPercentValue_(item.adjustedFlaggedPct),
      formatPercentValue_(item.rawFlaggedPct),
      item.flaggedLivePlacements,
      item.totalLivePlacements,
      formatPlacementRatio_(item.flaggedLivePlacements, item.totalLivePlacements),
      item.confidence
    ];
  });

  clearAndWriteTable_(SHEETS.ADVERTISER_GRADING, headers, tableRows);
  formatPerformanceSheet_(SHEETS.ADVERTISER_GRADING, tableRows.length, 10, 5, 10, tableRows);
}

function formatPerformanceSheet_(sheetName, rowCount, colCount, flaggedPctCol, confidenceCol, tableRows) {
  const sheet = getOrCreateSheet_(sheetName);
  sheet.setFrozenRows(1);

  for (var c = 1; c <= colCount; c++) {
    sheet.setColumnWidth(c, c === 2 ? 280 : 150);
  }

  const headerRange = sheet.getRange(1, 1, 1, colCount);
  headerRange.setFontWeight('bold').setBackground('#1f4e78').setFontColor('#ffffff');
  applyHeaderNotes_(sheetName, sheet, colCount);
  writeLegendTableForSheet_(sheetName, sheet, colCount);

  if (rowCount <= 0) return;

  const gradeCol = 3;
  const rowsRange = sheet.getRange(2, 1, rowCount, colCount);
  rowsRange.setFontSize(9);

  const rowsData = tableRows || sheet.getRange(2, 1, rowCount, colCount).getValues();

  const gradeBackgrounds = [];
  const gradeFontColors = [];
  for (var i = 0; i < rowsData.length; i++) {
    const grade = String(rowsData[i][gradeCol - 1] || '').trim();
    let bg = '#ffffff';
    let fg = '#000000';
    if (grade === 'A') { bg = '#d9ead3'; fg = '#274e13'; }
    else if (grade === 'B') { bg = '#eaf3ff'; fg = '#1f4e78'; }
    else if (grade === 'C') { bg = '#fff2cc'; fg = '#7f6000'; }
    else if (grade === 'D') { bg = '#fce5cd'; fg = '#783f04'; }
    else if (grade === 'F') { bg = '#f4cccc'; fg = '#990000'; }
    else if (grade === 'Monitor') { bg = '#e8f0fe'; fg = '#1a73e8'; }
    else if (grade === 'N/A') { bg = '#f3f3f3'; fg = '#666666'; }
    gradeBackgrounds.push([bg]);
    gradeFontColors.push([fg]);
  }
  sheet.getRange(2, gradeCol, rowCount, 1).setBackgrounds(gradeBackgrounds).setFontColors(gradeFontColors);

  if (flaggedPctCol > 0) {
    const pctBackgrounds = [];
    const pctFontColors = [];
    for (var j = 0; j < rowsData.length; j++) {
      const pctNum = parsePercentValue_(rowsData[j][flaggedPctCol - 1]);
      let bgPct = '#ffffff';
      let fgPct = '#000000';
      if (pctNum !== null) {
        if (pctNum > 10) { bgPct = '#f4cccc'; fgPct = '#990000'; }
        else if (pctNum > 7) { bgPct = '#fce5cd'; fgPct = '#783f04'; }
        else if (pctNum > 4) { bgPct = '#fff2cc'; fgPct = '#7f6000'; }
        else if (pctNum > 2) { bgPct = '#eaf3ff'; fgPct = '#1f4e78'; }
        else { bgPct = '#d9ead3'; fgPct = '#274e13'; }
      }
      pctBackgrounds.push([bgPct]);
      pctFontColors.push([fgPct]);
    }
    sheet.getRange(2, flaggedPctCol, rowCount, 1).setBackgrounds(pctBackgrounds).setFontColors(pctFontColors);
  }

  if (confidenceCol > 0) {
    const confBackgrounds = [];
    const confFontColors = [];
    for (var k = 0; k < rowsData.length; k++) {
      const conf = String(rowsData[k][confidenceCol - 1] || '').trim();
      let bgConf = '#ffffff';
      let fgConf = '#000000';
      if (conf === 'High') { bgConf = '#d9ead3'; fgConf = '#274e13'; }
      else if (conf === 'Medium') { bgConf = '#fff2cc'; fgConf = '#7f6000'; }
      else if (conf === 'Low') { bgConf = '#f4cccc'; fgConf = '#990000'; }
      confBackgrounds.push([bgConf]);
      confFontColors.push([fgConf]);
    }
    sheet.getRange(2, confidenceCol, rowCount, 1).setBackgrounds(confBackgrounds).setFontColors(confFontColors);
  }
}

function applyHeaderNotes_(sheetName, sheet, colCount) {
  const headers = sheet.getRange(1, 1, 1, colCount).getValues()[0];
  const notesByHeader = getHeaderNotesBySheet_(sheetName);
  const notesRow = headers.map(function (header) {
    return notesByHeader[String(header || '').trim()] || '';
  });
  sheet.getRange(1, 1, 1, colCount).setNotes([notesRow]);
}

function writeLegendTableForSheet_(sheetName, sheet, dataLastCol) {
  const legendStartCol = dataLastCol + 3;
  const legendRows = getLegendRowsBySheet_(sheetName);
  if (!legendRows || !legendRows.length) {
    return;
  }

  // Keep legend area clean between reruns.
  sheet.getRange(1, legendStartCol, 80, 2).clearContent().clearFormat();

  sheet.getRange(1, legendStartCol).setValue('Legend').setFontWeight('bold').setFontSize(11);
  sheet.getRange(2, legendStartCol, 1, 2)
    .setValues([['Column / Metric', 'Meaning']])
    .setFontWeight('bold')
    .setBackground('#d9e1f2');

  sheet.getRange(3, legendStartCol, legendRows.length, 2).setValues(legendRows).setWrap(true);
  sheet.setColumnWidth(legendStartCol, 220);
  sheet.setColumnWidth(legendStartCol + 1, 420);
}

function getHeaderNotesBySheet_(sheetName) {
  if (sheetName === SHEETS.REP_GRADING) {
    return {
      'Rank': 'Position after sorting by Adjusted Flagged % (descending), then flagged placements.',
      'Rep': 'Account REP OPS owner from mapping / normalized ledger.',
      'Grade': 'Primary performance grade using Adjusted Flagged % and live-placement eligibility rules.',
      'Eligibility': 'Full Grade when total live placements >= threshold; otherwise Monitor.',
      'Adjusted Flagged %': 'Smoothed flagged-live rate used for grading to reduce small-sample volatility.',
      'Raw Flagged %': 'Exact flagged-live rate before smoothing: flagged live placements / total live placements.',
      'Flagged Live Placements': 'Count of unique flagged placements that are also present in latest live snapshot.',
      'Total Trafficked Placements (Snapshot)': 'Distinct placement IDs trafficked for the rep in the latest CVI baseline snapshot (mapped via Network ID or Advertiser).',
      'Unflagged Live Placements': 'Distinct trafficked placement IDs in the latest snapshot that are not flagged for the rep (Total Trafficked - Flagged Live).',
      'Flagged/Live Ratio': 'Readable ratio form of flagged live placements versus total trafficked placements.',
      'Confidence': 'Signal quality label derived from denominator size and observed flagged volume.'
    };
  }

  if (sheetName === SHEETS.ADVERTISER_GRADING) {
    return {
      'Rank': 'Position after sorting by Adjusted Flagged % (descending), then flagged placements.',
      'Advertiser': 'Advertiser name from normalized ledger.',
      'Grade': 'Primary performance grade using Adjusted Flagged % and live-placement eligibility rules.',
      'Eligibility': 'Full Grade when total live placements >= threshold; otherwise Monitor.',
      'Adjusted Flagged %': 'Smoothed flagged-live rate used for grading to reduce small-sample volatility.',
      'Raw Flagged %': 'Exact flagged-live rate before smoothing: flagged live placements / total live placements.',
      'Flagged Live Placements': 'Count of unique flagged placements that are also present in latest live snapshot.',
      'Total Live Placements': 'Count of unique live placements for the advertiser in the latest snapshot.',
      'Flagged/Live Ratio': 'Readable ratio form of flagged live placements versus total live placements.',
      'Confidence': 'Signal quality label derived from denominator size and observed flagged volume.'
    };
  }

  if (sheetName === SHEETS.REP_GRADING_DIAGNOSTIC) {
    return {
      'Rank': 'Position after sorting by diagnostic issue-density severity (descending).',
      'Rep': 'Account REP OPS owner from mapping / normalized ledger.',
      'Issue Density Grade (Diagnostic)': 'Secondary grade based on issue density among flagged placements only.',
      'Unique Issues': 'Distinct placement+issue fingerprint combinations attributed to the rep.',
      'Flagged Placements': 'Unique placements with at least one issue event for the rep.',
      'Issues per Flagged Placement': 'Diagnostic density = unique issues / flagged placements.',
      'Notes': 'Context marker that this tab is secondary diagnostic support, not primary grading.'
    };
  }

  if (sheetName === SHEETS.GRADING_METHODOLOGY) {
    return {
      'Section': 'Logical grouping of the methodology row (overview, inputs, thresholds, smoothing, run context).',
      'Metric': 'Specific method component or parameter being defined.',
      'Value': 'Current formula, threshold, or run-time value used by the model.',
      'Notes': 'Plain-language explanation of why this metric exists and how to interpret it.'
    };
  }

  return {};
}

function getLegendRowsBySheet_(sheetName) {
  if (sheetName === SHEETS.REP_GRADING) {
    return [
      ['Grade', 'Primary performance grade from adjusted flagged-live rate and eligibility.'],
      ['Eligibility', 'Full Grade at/above live-placement threshold; Monitor below threshold.'],
      ['Adjusted Flagged %', 'Smoothed flagged-live percent used for grading decisions.'],
      ['Raw Flagged %', 'Unsmoothed flagged-live percent for transparency.'],
      ['Flagged Live Placements', 'Flagged placements that are also in the latest live baseline snapshot.'],
      ['Total Trafficked Placements (Snapshot)', 'All distinct placement IDs for the rep in the current CVI baseline snapshot, including those with zero issues.'],
      ['Unflagged Live Placements', 'Live placements currently trafficked for the rep that have no flagged issue in the current grading window.'],
      ['Flagged/Live Ratio', 'Flagged live placements divided by total trafficked placements.'],
      ['Confidence', 'High/Medium/Low confidence based on sample size and signal strength.']
    ];
  }

  if (sheetName === SHEETS.ADVERTISER_GRADING) {
    return [
      ['Grade', 'Primary performance grade from adjusted flagged-live rate and eligibility.'],
      ['Eligibility', 'Full Grade at/above live-placement threshold; Monitor below threshold.'],
      ['Adjusted Flagged %', 'Smoothed flagged-live percent used for grading decisions.'],
      ['Raw Flagged %', 'Unsmoothed flagged-live percent for transparency.'],
      ['Flagged Live Placements', 'Flagged placements that are also in the latest live baseline snapshot.'],
      ['Total Live Placements', 'Latest baseline denominator for the advertiser.'],
      ['Flagged/Live Ratio', 'Same signal as percentages, shown as count ratio.'],
      ['Confidence', 'High/Medium/Low confidence based on sample size and signal strength.']
    ];
  }

  if (sheetName === SHEETS.REP_GRADING_DIAGNOSTIC) {
    return [
      ['Diagnostic Scope', 'This tab is secondary analysis, not the primary leadership grading output.'],
      ['Issue Density Grade (Diagnostic)', 'Grade derived from unique issues per flagged placement.'],
      ['Unique Issues', 'Distinct placement+issue fingerprints for each rep.'],
      ['Flagged Placements', 'Placements with at least one issue event for the rep.'],
      ['Issues per Flagged Placement', 'Unique Issues divided by Flagged Placements.']
    ];
  }

  if (sheetName === SHEETS.GRADING_METHODOLOGY) {
    return [
      ['Primary Metric', 'Core KPI is flagged live placements divided by total live placements.'],
      ['Smoothing Formula', 'Adjusted rate uses Bayesian-style smoothing to reduce low-volume volatility.'],
      ['Dynamic Baseline Rate', 'Baseline is recalculated each run from current flagged/live intersection.'],
      ['Eligibility Threshold', 'Entities below minimum live-placement threshold are labeled Monitor.'],
      ['Grade Thresholds', 'Rep and advertiser cutoffs map adjusted rates to A/B/C/D/F.'],
      ['Smoothing k', 'k controls shrinkage strength: higher k means stronger pull to baseline.'],
      ['Run Context', 'Operational inputs (excluded rows and baseline denominators) used in this refresh.']
    ];
  }

  return [];
}

function buildLatestLivePlacementCoverageByRepFast_(mapping) {
  const sheet = getOrCreateSheet_(SHEETS.CVI_DAILY_BASELINE);
  const values = sheet.getDataRange().getValues();

  if (!values || values.length < 2) {
    return {
      snapshotDate: '',
      byRep: {},
      allLivePlacements: {},
      baselineRowsScanned: 0,
      snapshotRowsScanned: 0
    };
  }

  const headers = values[0] || [];
  const snapshotDateIdx = headers.indexOf('Snapshot Date');
  const placementIdIdx = headers.indexOf('Placement ID');
  const networkIdIdx = headers.indexOf('Network ID');
  const advertiserIdx = headers.indexOf('Advertiser');

  if (snapshotDateIdx < 0 || placementIdIdx < 0) {
    return {
      snapshotDate: '',
      byRep: {},
      allLivePlacements: {},
      baselineRowsScanned: Math.max(0, values.length - 1),
      snapshotRowsScanned: 0
    };
  }

  const dateCache = {};
  let latestSnapshotDate = '';

  for (var i = 1; i < values.length; i++) {
    const snapshotDate = normalizeSnapshotDateWithCache_(values[i][snapshotDateIdx], dateCache);
    if (snapshotDate && snapshotDate > latestSnapshotDate) {
      latestSnapshotDate = snapshotDate;
    }
  }

  if (!latestSnapshotDate) {
    return {
      snapshotDate: '',
      byRep: {},
      allLivePlacements: {},
      baselineRowsScanned: Math.max(0, values.length - 1),
      snapshotRowsScanned: 0
    };
  }

  const byRep = {};
  const allLivePlacements = {};
  let snapshotRowsScanned = 0;

  for (var j = 1; j < values.length; j++) {
    if (normalizeSnapshotDateWithCache_(values[j][snapshotDateIdx], dateCache) !== latestSnapshotDate) {
      continue;
    }

    snapshotRowsScanned += 1;

    const placementId = String(values[j][placementIdIdx] || '').trim();
    if (!placementId) {
      continue;
    }

    const networkId = networkIdIdx >= 0 ? String(values[j][networkIdIdx] || '').trim() : '';
    const advertiserRaw = advertiserIdx >= 0 ? String(values[j][advertiserIdx] || '').trim() : '';
    if (isExcludedForGrading_(advertiserRaw)) {
      continue;
    }
    const advertiser = advertiserRaw.toLowerCase();
    const mapHit = (mapping && (mapping['id:' + networkId] || mapping['advertiser:' + advertiser])) || {};
    const repName = String(mapHit['Account REP OPS'] || '').trim() || 'Unassigned';

    if (!byRep[repName]) {
      byRep[repName] = { livePlacements: {} };
    }

    byRep[repName].livePlacements[placementId] = true;
    allLivePlacements[placementId] = true;
  }

  return {
    snapshotDate: latestSnapshotDate,
    byRep: byRep,
    allLivePlacements: allLivePlacements,
    baselineRowsScanned: Math.max(0, values.length - 1),
    snapshotRowsScanned: snapshotRowsScanned
  };
}

function normalizeSnapshotDateWithCache_(value, cache) {
  const key = Object.prototype.toString.call(value) + '|' + String(value);
  if (cache[key] !== undefined) {
    return cache[key];
  }
  const normalized = normalizeSnapshotDate_(value);
  cache[key] = normalized;
  return normalized;
}

function getGradingModel_() {
  return {
    minFullGradeLivePlacements: 50,
    repSmoothingK: 25,
    advertiserSmoothingK: 40,
    defaultBaselinePct: 5,
    repThresholds: { a: 4, b: 6, c: 9, d: 13 },
    advertiserThresholds: { a: 5, b: 8, c: 12, d: 18 }
  };
}

function isExcludedForGrading_(advertiser) {
  const value = String(advertiser || '').trim();
  if (!value) {
    return false;
  }
  return /^(xarchive_|archive_|test_|qa_|sandbox_|dummy_|sample_)/i.test(value);
}

function getEligibilityLabel_(totalLivePlacements, minFullGradeLivePlacements) {
  if (!totalLivePlacements) {
    return 'No Live Coverage';
  }
  return totalLivePlacements >= minFullGradeLivePlacements ? 'Full Grade' : 'Monitor';
}

function calculateSmoothedPct_(flaggedLivePlacements, totalLivePlacements, baselinePct, smoothingK) {
  if (!totalLivePlacements) {
    return null;
  }

  const safeBaseline = Number(baselinePct || 0) / 100;
  const k = Number(smoothingK || 0);
  const adjusted = (Number(flaggedLivePlacements || 0) + (k * safeBaseline)) / (Number(totalLivePlacements) + k);
  return adjusted * 100;
}

function calculatePerformanceGradeByEntity_(adjustedFlaggedPct, totalLivePlacements, entityType) {
  const model = getGradingModel_();

  if (!totalLivePlacements) {
    return 'N/A';
  }
  if (totalLivePlacements < model.minFullGradeLivePlacements) {
    return 'Monitor';
  }
  if (adjustedFlaggedPct === null || adjustedFlaggedPct === undefined || isNaN(adjustedFlaggedPct)) {
    return 'N/A';
  }

  const thresholds = entityType === 'advertiser' ? model.advertiserThresholds : model.repThresholds;
  if (adjustedFlaggedPct <= thresholds.a) return 'A';
  if (adjustedFlaggedPct <= thresholds.b) return 'B';
  if (adjustedFlaggedPct <= thresholds.c) return 'C';
  if (adjustedFlaggedPct <= thresholds.d) return 'D';
  return 'F';
}

function writeGradingMethodologySheet_(context) {
  const model = getGradingModel_();
  const ctx = context || {};
  const rows = [
    ['Model Overview', 'Primary Metric', 'Flagged live placements / total live placements', 'One placement counts once.'],
    ['Model Overview', 'Smoothing Formula', 'adjusted = (flaggedLive + k * baselineRate) / (live + k)', 'Reduces low-volume volatility.'],
    ['Model Inputs', 'Dynamic Baseline Rate', formatPercentValue_(ctx.baselinePct), 'Calculated from current export: flagged live / total live.'],
    ['Model Inputs', 'Live Placements In Baseline', Number(ctx.overallLivePlacements || 0), 'Latest CVI snapshot live denominator.'],
    ['Model Inputs', 'Flagged Live Placements', Number(ctx.overallFlaggedLivePlacements || 0), 'Intersection of flagged and latest live placements.'],
    ['Eligibility', 'Full Grade Threshold', model.minFullGradeLivePlacements, 'Entities below threshold are marked Monitor.'],
    ['Eligibility', 'Excluded From Grading', 'xARCHIVE_, archive_, test_, qa_, sandbox_, dummy_, sample_', 'Excluded from all grading tabs by prefix rule.'],
    ['Rep Thresholds', 'A/B/C/D/F (Adjusted %)', '<=4 / <=6 / <=9 / <=13 / >13', 'Applied only when live placements >= threshold.'],
    ['Advertiser Thresholds', 'A/B/C/D/F (Adjusted %)', '<=5 / <=8 / <=12 / <=18 / >18', 'Applied only when live placements >= threshold.'],
    ['Smoothing', 'Rep k', model.repSmoothingK, 'Lower k = more sensitive.'],
    ['Smoothing', 'Advertiser k', model.advertiserSmoothingK, 'Higher k for higher low-volume noise.'],
    ['Run Context', 'Rows Excluded This Run', Number(ctx.excludedRows || 0), 'Excluded before grading computations.']
  ];

  clearAndWriteTable_(SHEETS.GRADING_METHODOLOGY, ['Section', 'Metric', 'Value', 'Notes'], rows);
  formatMethodologySheet_();
}

function formatMethodologySheet_() {
  const sheet = getOrCreateSheet_(SHEETS.GRADING_METHODOLOGY);
  const colCount = 4;

  sheet.setFrozenRows(1);
  sheet.getRange(1, 1, 1, colCount)
    .setFontWeight('bold')
    .setBackground('#1f4e78')
    .setFontColor('#ffffff');

  sheet.setColumnWidth(1, 180);
  sheet.setColumnWidth(2, 230);
  sheet.setColumnWidth(3, 320);
  sheet.setColumnWidth(4, 360);

  applyHeaderNotes_(SHEETS.GRADING_METHODOLOGY, sheet, colCount);
  writeLegendTableForSheet_(SHEETS.GRADING_METHODOLOGY, sheet, colCount);
}

function calculatePerformanceGrade_(flaggedPct) {
  if (flaggedPct === null || flaggedPct === undefined) return 'N/A';
  if (flaggedPct <= 2) return 'A';
  if (flaggedPct <= 4) return 'B';
  if (flaggedPct <= 7) return 'C';
  if (flaggedPct <= 10) return 'D';
  return 'F';
}

function calculateDiagnosticGrade_(issueDensity) {
  if (issueDensity <= 1) return 'A';
  if (issueDensity <= 2) return 'B';
  if (issueDensity <= 3) return 'C';
  if (issueDensity <= 5) return 'D';
  return 'F';
}

function calculateConfidenceLabel_(flaggedPlacements, totalLivePlacements, flaggedLivePlacements) {
  if (totalLivePlacements >= 100) return 'High';
  if (totalLivePlacements >= 25) return 'Medium';
  return 'Low';
}

function parseRepDate_(value) {
  if (value instanceof Date) return value;
  if (typeof value === 'number') return new Date((value - 25569) * 86400 * 1000);
  if (typeof value === 'string') {
    const parsed = new Date(value);
    if (!isNaN(parsed.getTime())) return parsed;
  }
  return new Date(0);
}

function getLookbackDate_(days) {
  const d = new Date();
  d.setDate(d.getDate() - (days || 0));
  return d;
}

function buildLatestLivePlacementCoverageByRep_(mapping) {
  const rows = readTable_(SHEETS.CVI_DAILY_BASELINE);
  if (!rows || !rows.length) {
    return {
      snapshotDate: '',
      byRep: {},
      allLivePlacements: {}
    };
  }

  let latestSnapshotDate = '';
  rows.forEach(function (row) {
    const snapshotDate = normalizeSnapshotDate_(row['Snapshot Date']);
    if (snapshotDate && snapshotDate > latestSnapshotDate) {
      latestSnapshotDate = snapshotDate;
    }
  });

  if (!latestSnapshotDate) {
    return {
      snapshotDate: '',
      byRep: {},
      allLivePlacements: {}
    };
  }

  const byRep = {};
  const allLivePlacements = {};

  rows.forEach(function (row) {
    if (normalizeSnapshotDate_(row['Snapshot Date']) !== latestSnapshotDate) {
      return;
    }

    const placementId = String(row['Placement ID'] || '').trim();
    if (!placementId) {
      return;
    }

    const resolved = resolveBaselineRepAndNetwork_(row, mapping);
    const repName = resolved.repName;
    const networkName = resolved.networkName;

    if (!byRep[repName]) {
      byRep[repName] = {
        livePlacements: {},
        networks: {}
      };
    }

    if (!byRep[repName].networks[networkName]) {
      byRep[repName].networks[networkName] = {
        livePlacements: {}
      };
    }

    byRep[repName].livePlacements[placementId] = true;
    byRep[repName].networks[networkName].livePlacements[placementId] = true;
    allLivePlacements[placementId] = true;
  });

  return {
    snapshotDate: latestSnapshotDate,
    byRep: byRep,
    allLivePlacements: allLivePlacements
  };
}

function buildLatestLivePlacementCoverageByAdvertiser_() {
  const rows = readTable_(SHEETS.CVI_DAILY_BASELINE);
  if (!rows || !rows.length) {
    return {
      snapshotDate: '',
      byAdvertiser: {}
    };
  }

  let latestSnapshotDate = '';
  rows.forEach(function (row) {
    const snapshotDate = normalizeSnapshotDate_(row['Snapshot Date']);
    if (snapshotDate && snapshotDate > latestSnapshotDate) {
      latestSnapshotDate = snapshotDate;
    }
  });

  const byAdvertiser = {};
  rows.forEach(function (row) {
    if (normalizeSnapshotDate_(row['Snapshot Date']) !== latestSnapshotDate) {
      return;
    }

    const placementId = String(row['Placement ID'] || '').trim();
    const advertiser = String(row['Advertiser'] || 'Unknown').trim() || 'Unknown';
    if (!placementId) return;

    if (!byAdvertiser[advertiser]) {
      byAdvertiser[advertiser] = { livePlacements: {} };
    }

    byAdvertiser[advertiser].livePlacements[placementId] = true;
  });

  return {
    snapshotDate: latestSnapshotDate,
    byAdvertiser: byAdvertiser
  };
}

function buildLatestLivePlacementCoverageByAdvertiserFast_(targetAdvertisers) {
  const sheet = getOrCreateSheet_(SHEETS.CVI_DAILY_BASELINE);
  const values = sheet.getDataRange().getValues();

  if (!values || values.length < 2) {
    return {
      snapshotDate: '',
      byAdvertiser: {},
      allLivePlacements: {},
      baselineRowsScanned: 0,
      snapshotRowsScanned: 0
    };
  }

  const headers = values[0] || [];
  const snapshotDateIdx = headers.indexOf('Snapshot Date');
  const placementIdIdx = headers.indexOf('Placement ID');
  const advertiserIdx = headers.indexOf('Advertiser');

  if (snapshotDateIdx < 0 || placementIdIdx < 0 || advertiserIdx < 0) {
    return {
      snapshotDate: '',
      byAdvertiser: {},
      allLivePlacements: {},
      baselineRowsScanned: Math.max(0, values.length - 1),
      snapshotRowsScanned: 0
    };
  }

  const dateCache = {};
  let latestSnapshotDate = '';

  for (var i = 1; i < values.length; i++) {
    const snapshotDate = normalizeSnapshotDateWithCache_(values[i][snapshotDateIdx], dateCache);
    if (snapshotDate && snapshotDate > latestSnapshotDate) {
      latestSnapshotDate = snapshotDate;
    }
  }

  if (!latestSnapshotDate) {
    return {
      snapshotDate: '',
      byAdvertiser: {},
      allLivePlacements: {},
      baselineRowsScanned: Math.max(0, values.length - 1),
      snapshotRowsScanned: 0
    };
  }

  const target = targetAdvertisers || {};
  const byAdvertiser = {};
  const allLivePlacements = {};
  let snapshotRowsScanned = 0;

  for (var j = 1; j < values.length; j++) {
    if (normalizeSnapshotDateWithCache_(values[j][snapshotDateIdx], dateCache) !== latestSnapshotDate) {
      continue;
    }

    snapshotRowsScanned += 1;

    const placementId = String(values[j][placementIdIdx] || '').trim();
    if (!placementId) {
      continue;
    }

    const advertiser = String(values[j][advertiserIdx] || 'Unknown').trim() || 'Unknown';
    if (isExcludedForGrading_(advertiser)) {
      continue;
    }
    const advertiserKey = advertiser.toLowerCase();

    if (!target[advertiserKey]) {
      continue;
    }

    if (!byAdvertiser[advertiser]) {
      byAdvertiser[advertiser] = { livePlacements: {} };
    }

    byAdvertiser[advertiser].livePlacements[placementId] = true;
    allLivePlacements[placementId] = true;
  }

  return {
    snapshotDate: latestSnapshotDate,
    byAdvertiser: byAdvertiser,
    allLivePlacements: allLivePlacements,
    baselineRowsScanned: Math.max(0, values.length - 1),
    snapshotRowsScanned: snapshotRowsScanned
  };
}

function resolveBaselineRepAndNetwork_(row, mapping) {
  const networkId = String(row['Network ID'] || '').trim();
  const advertiser = String(row['Advertiser'] || '').trim().toLowerCase();
  const mapHit = (mapping && (mapping['id:' + networkId] || mapping['advertiser:' + advertiser])) || {};

  const repName = String(mapHit['Account REP OPS'] || '').trim() || 'Unassigned';
  const networkName = String(mapHit['Network Name'] || '').trim() || String(row['Advertiser'] || '').trim() || 'Unknown';

  return {
    repName: repName,
    networkName: networkName
  };
}

function countKeys_(obj) {
  return Object.keys(obj || {}).length;
}

function intersectCountMaps_(a, b) {
  const left = a || {};
  const right = b || {};
  let count = 0;

  Object.keys(left).forEach(function (key) {
    if (right[key]) {
      count += 1;
    }
  });

  return count;
}

function formatPlacementRatio_(flagged, total) {
  if (!total) {
    return 'N/A';
  }

  const pct = (flagged / total) * 100;
  return flagged + ' / ' + total + ' (' + pct.toFixed(1) + '%)';
}

function formatPercentValue_(value) {
  if (value === null || value === undefined || isNaN(value)) {
    return 'N/A';
  }
  return Number(value).toFixed(2) + '%';
}

function parsePercentValue_(value) {
  if (value === null || value === undefined) return null;
  const str = String(value).replace('%', '').trim();
  if (!str) return null;
  const num = Number(str);
  return isNaN(num) ? null : num;
}
