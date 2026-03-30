/**
 * GradingService.js
 * 
 * Calculates network performance grades based on:
 * - Total violation count
 * - Issue-per-placement ratio
 * 
 * Vertical layout optimized for easy scanning down the list.
 */

function buildNetworkGrading_() {
  logRun_('buildNetworkGrading_', RUN_STATUS.RUNNING, 'Started', null);

  const ledger = readTable_(SHEETS.NORMALIZED_LEDGER);
  if (!ledger || ledger.length === 0) {
    logRun_('buildNetworkGrading_', RUN_STATUS.WARNING, 'No normalized data found', null);
    return { gradesCalculated: 0 };
  }

  // Aggregate by network - count UNIQUE issues (placement + issue type combos)
  const networkStats = {};
  
  ledger.forEach(function(row) {
    const networkName = String(row['Network Name'] || 'Unknown').trim();
    const placementId = String(row['Placement ID'] || '').trim();
    const issueType = String(row['Issue Type'] || '').trim();
    
    if (!networkStats[networkName]) {
      networkStats[networkName] = {
        totalEventCount: 0,
        uniqueIssues: {},  // Track unique placement + issue type combos
        uniquePlacements: {}
      };
    }
    
    networkStats[networkName].totalEventCount++;
    
    // Track unique issues (placement + issue type combination)
    if (placementId && issueType) {
      const issueKey = placementId + '|' + issueType;
      networkStats[networkName].uniqueIssues[issueKey] = true;
    }
    
    if (placementId) {
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

  // Write to sheet in single-column format
  writeSingleColumnGrading_(gradeData);

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

function writeSingleColumnGrading_(gradeData) {
  const ss = SpreadsheetApp.getActive();
  let sheet = ss.getSheetByName(SHEETS.NETWORK_GRADING);
  
  // Clear or create sheet
  if (sheet) {
    sheet.clear();
  } else {
    sheet = ss.insertSheet(SHEETS.NETWORK_GRADING);
  }
  
  // Build single-column format
  const outputData = [];
  
  // Header
  outputData.push(['📊 NETWORK PERFORMANCE GRADING']);
  outputData.push(['Ranked by Unique Issues (Highest to Lowest)']);
  outputData.push(['']); // Blank row
  
  // Each network gets multiple rows
  gradeData.forEach(function(network, index) {
    const rank = index + 1;
    const rankEmoji = rank === 1 ? '🥇' : rank === 2 ? '🥈' : rank === 3 ? '🥉' : '  ';
    
    // Main row: Rank + Network Name + Grade
    const gradeEmoji = getGradeEmoji_(network.grade);
    outputData.push([rankEmoji + ' #' + rank + ' - ' + network.networkName + ' [Grade: ' + network.grade + ' ' + gradeEmoji + ']']);
    
    // Details row - show unique issues (not total events)
    const issueRateText = network.placementCount > 0 ? 
      network.issueRate.toFixed(2) + ' unique issues per placement' : 
      'No placements tracked';
    outputData.push(['       🚨 ' + network.uniqueIssues + ' unique issues (' + network.totalEvents + ' total events)  |  📍 ' + network.placementCount + ' placements  |  ' + issueRateText]);
    
    // Blank separator
    outputData.push(['']);
  });
  
  // Write all data to column A
  if (outputData.length > 0) {
    sheet.getRange(1, 1, outputData.length, 1).setValues(outputData);
  }
  
  // Apply formatting
  formatSingleColumnGrading_(sheet, gradeData.length);
}

function getGradeEmoji_(grade) {
  switch(grade) {
    case 'A': return '✅';
    case 'B': return '👍';
    case 'C': return '⚠️';
    case 'D': return '⚠️';
    case 'F': return '🚨';
    default: return '';
  }
}

function formatSingleColumnGrading_(sheet, networkCount) {
  // Set column A width
  sheet.setColumnWidth(1, 800);
  
  // Format header (rows 1-2)
  sheet.getRange(1, 1).setFontSize(14).setFontWeight('bold').setBackground('#4a86e8').setFontColor('#ffffff');
  sheet.getRange(2, 1).setFontSize(10).setFontStyle('italic').setBackground('#e8f0fe');
  
  // Format each network entry
  let currentRow = 4; // Start after header + blank row
  for (let i = 0; i < networkCount; i++) {
    // Main network row (bold)
    sheet.getRange(currentRow, 1).setFontWeight('bold').setFontSize(11);
    
    // Details row (smaller, grey)
    sheet.getRange(currentRow + 1, 1).setFontSize(9).setFontColor('#666666');
    
    currentRow += 3; // Jump to next network (name + details + blank)
  }
  
  // Wrap text for all cells
  sheet.getRange(1, 1, sheet.getMaxRows(), 1).setWrapStrategy(SpreadsheetApp.WrapStrategy.WRAP);
  
  // Freeze header rows
  sheet.setFrozenRows(3);
}
