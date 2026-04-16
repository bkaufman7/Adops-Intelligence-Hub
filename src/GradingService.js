/**
 * GradingService.js
 * 
 * Calculates network diagnostic grades based on:
 * - Total violation count
 * - Issue-per-placement ratio
 * 
 * This is a secondary diagnostic view (issue-density lens), not primary performance grading.
 */

function buildNetworkGrading_() {
  logRun_('buildNetworkGrading_', RUN_STATUS.RUNNING, 'Started', null);

  const ledger = readTable_(SHEETS.NORMALIZED_LEDGER);
  if (!ledger || ledger.length === 0) {
    logRun_('buildNetworkGrading_', RUN_STATUS.WARNING, 'No normalized data found', null);
    return { gradesCalculated: 0 };
  }

  // Aggregate by network - count UNIQUE issues (placement + issue fingerprint)
  const networkStats = {};
  
  ledger.forEach(function(row) {
    const networkName = String(row['Network Name'] || 'Unknown').trim();
    const placementId = String(row['Placement ID'] || '').trim();
    const issueType = String(row['Issue Type'] || '').trim();
    const issueFlags = String(row['Issue Flags'] || '').trim();
    const issueDetail = String(row['Issue Detail'] || '').trim();
    
    if (!networkStats[networkName]) {
      networkStats[networkName] = {
        totalEventCount: 0,
        uniqueIssues: {},  // Track unique placement + issue fingerprint combos
        uniquePlacements: {}
      };
    }
    
    networkStats[networkName].totalEventCount++;
    
    // Create issue fingerprint: use Issue Type, or fall back to Issue Flags + Detail
    let issueFingerprint = issueType || issueFlags || issueDetail || 'Unknown Issue';
    
    // Track unique issues (placement + issue fingerprint combination)
    if (placementId) {
      const issueKey = placementId + '|' + issueFingerprint;
      networkStats[networkName].uniqueIssues[issueKey] = true;
      networkStats[networkName].uniquePlacements[placementId] = true;
    }
  });

  // Calculate grades
  const gradeData = [];
  
  Object.keys(networkStats).forEach(function(networkName) {
    const stats = networkStats[networkName];
    const placementCount = Object.keys(stats.uniquePlacements).length;
    const uniqueIssueCount = Object.keys(stats.uniqueIssues).length;
    const issueRate = placementCount > 0 ? (uniqueIssueCount / placementCount) : uniqueIssueCount;
    
    const grade = calculateGrade_(issueRate);
    
    gradeData.push({
      networkName: networkName,
      grade: grade,
      uniqueIssues: uniqueIssueCount,
      totalEvents: stats.totalEventCount,
      placementCount: placementCount,
      issueRate: issueRate
    });
  });

  // Sort by unique issues descending (show worst performers first)
  gradeData.sort(function(a, b) {
    return b.uniqueIssues - a.uniqueIssues;
  });

  // Write to sheet in tabular format
  writeNetworkGradingTable_(gradeData);

  logRun_('buildNetworkGrading_', RUN_STATUS.SUCCESS, 'Completed', {
    networksGraded: gradeData.length,
    topViolator: gradeData.length > 0 ? gradeData[0].networkName : null,
    topViolatorUniqueIssues: gradeData.length > 0 ? gradeData[0].uniqueIssues : 0
  });

  return { networksGraded: gradeData.length };
}

function calculateGrade_(issueRate) {
  // Grade based on issues per placement ratio
  // A: Excellent (0-1 issues per placement)
  // B: Good (1-2)
  // C: Acceptable (2-3)
  // D: Needs Improvement (3-5)
  // F: Critical (5+)
  
  if (issueRate <= 1) return 'A';
  if (issueRate <= 2) return 'B';
  if (issueRate <= 3) return 'C';
  if (issueRate <= 5) return 'D';
  return 'F';
}

function networkGradingHeaders_() {
  return [
    'Rank',
    'Network',
    'Grade (Diagnostic)',
    'Unique Issues',
    'Total Issue Events',
    'Unique Flagged Placements',
    'Issues per Placement'
  ];
}

function writeNetworkGradingTable_(gradeData) {
  const headers = networkGradingHeaders_();
  const tableRows = gradeData.map(function (item, index) {
    return [
      index + 1,
      item.networkName,
      item.grade,
      item.uniqueIssues,
      item.totalEvents,
      item.placementCount,
      item.placementCount > 0 ? item.issueRate.toFixed(2) : 'N/A'
    ];
  });

  clearAndWriteTable_(SHEETS.NETWORK_GRADING, headers, tableRows);
  formatNetworkGradingTable_(tableRows.length, tableRows);
}

function formatNetworkGradingTable_(rowCount, tableRows) {
  const sheet = getOrCreateSheet_(SHEETS.NETWORK_GRADING);
  const colCount = 7;
  const gradeCol = 3;

  sheet.setFrozenRows(1);
  for (var c = 1; c <= colCount; c++) {
    sheet.setColumnWidth(c, c === 2 ? 280 : 160);
  }

  sheet.getRange(1, 1, 1, colCount)
    .setFontWeight('bold')
    .setBackground('#1f4e78')
    .setFontColor('#ffffff');

  applyNetworkHeaderNotes_(sheet, colCount);
  writeNetworkGradingLegend_(sheet, colCount);

  if (rowCount <= 0) {
    return;
  }

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
    gradeBackgrounds.push([bg]);
    gradeFontColors.push([fg]);
  }

  sheet.getRange(2, gradeCol, rowCount, 1).setBackgrounds(gradeBackgrounds).setFontColors(gradeFontColors);
}

function applyNetworkHeaderNotes_(sheet, colCount) {
  const notesByHeader = {
    'Rank': 'Position after sorting by Unique Issues (descending).',
    'Network': 'Normalized network name from the event ledger.',
    'Grade (Diagnostic)': 'Secondary diagnostic grade based on issue density (not the primary performance KPI).',
    'Unique Issues': 'Distinct placement+issue fingerprint combinations for the network.',
    'Total Issue Events': 'Total event rows associated with the network.',
    'Unique Flagged Placements': 'Unique placements with at least one flagged event for the network.',
    'Issues per Placement': 'Diagnostic density metric = Unique Issues / Unique Flagged Placements.'
  };

  const headers = sheet.getRange(1, 1, 1, colCount).getValues()[0];
  const notes = headers.map(function (h) {
    return notesByHeader[String(h || '').trim()] || '';
  });
  sheet.getRange(1, 1, 1, colCount).setNotes([notes]);
}

function writeNetworkGradingLegend_(sheet, dataLastCol) {
  const legendStartCol = dataLastCol + 3;
  const rows = [
    ['Grade (Diagnostic)', 'Issue-density diagnostic grade for network-level troubleshooting.'],
    ['Unique Issues', 'Distinct placement+issue fingerprint combinations.'],
    ['Total Issue Events', 'Total number of issue events observed for the network.'],
    ['Unique Flagged Placements', 'Unique placements with at least one issue event.'],
    ['Issues per Placement', 'Unique Issues divided by Unique Flagged Placements.'],
    ['Important', 'Network_Grading is a secondary diagnostic lens, not the primary leadership grading KPI.']
  ];

  sheet.getRange(1, legendStartCol, 80, 2).clearContent().clearFormat();
  sheet.getRange(1, legendStartCol).setValue('Legend').setFontWeight('bold').setFontSize(11);
  sheet.getRange(2, legendStartCol, 1, 2)
    .setValues([['Column / Metric', 'Meaning']])
    .setFontWeight('bold')
    .setBackground('#d9e1f2');
  sheet.getRange(3, legendStartCol, rows.length, 2).setValues(rows).setWrap(true);

  sheet.setColumnWidth(legendStartCol, 220);
  sheet.setColumnWidth(legendStartCol + 1, 420);
}
