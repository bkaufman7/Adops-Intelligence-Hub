/**
 * RepGradingService.js
 * 
 * Grades AdOps reps based on:
 * - Total unique issues across their managed networks
 * - Issue-to-placement ratio (normalized to per 100 placements)
 * - 30-day performance tracking
 * 
 * Single-column vertical layout with network breakdown per rep.
 */

function buildRepGrading_() {
  logRun_('buildRepGrading_', RUN_STATUS.RUNNING, 'Started', null);

  const ledger = readTable_(SHEETS.NORMALIZED_LEDGER);
  if (!ledger || ledger.length === 0) {
    logRun_('buildRepGrading_', RUN_STATUS.WARNING, 'No normalized data found', null);
    return { repsGraded: 0 };
  }

  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

  // Aggregate by rep → network
  const repStats = {};
  
  ledger.forEach(function(row) {
    const repName = String(row['Account REP OPS'] || 'Unassigned').trim();
    const networkName = String(row['Network Name'] || 'Unknown').trim();
    const placementId = String(row['Placement ID'] || '').trim();
    const eventDate = parseRepDate_(row['Event Date']);
    const issueType = String(row['Issue Type'] || '').trim();
    const issueFlags = String(row['Issue Flags'] || '').trim();
    const issueDetail = String(row['Issue Detail'] || '').trim();
    
    if (!repStats[repName]) {
      repStats[repName] = {
        networks: {},
        totalUniqueIssues: {},
        totalPlacements: {},
        last30DaysEvents: 0
      };
    }
    
    // Initialize network if needed
    if (!repStats[repName].networks[networkName]) {
      repStats[repName].networks[networkName] = {
        uniqueIssues: {},
        placements: {},
        eventCount: 0
      };
    }
    
    // Create issue fingerprint
    const issueFingerprint = issueType || issueFlags || issueDetail || 'Unknown Issue';
    
    // Track at network level
    if (placementId) {
      const issueKey = placementId + '|' + issueFingerprint;
      repStats[repName].networks[networkName].uniqueIssues[issueKey] = true;
      repStats[repName].networks[networkName].placements[placementId] = true;
      repStats[repName].totalUniqueIssues[issueKey] = true;
      repStats[repName].totalPlacements[placementId] = true;
    }
    
    repStats[repName].networks[networkName].eventCount++;
    
    // Track 30-day activity
    if (eventDate >= thirtyDaysAgo) {
      repStats[repName].last30DaysEvents++;
    }
  });

  // Calculate rep grades
  const repGradeData = [];
  
  Object.keys(repStats).forEach(function(repName) {
    const stats = repStats[repName];
    const totalUniqueIssues = Object.keys(stats.totalUniqueIssues).length;
    const totalPlacements = Object.keys(stats.totalPlacements).length;
    const issueRate = totalPlacements > 0 ? (totalUniqueIssues / totalPlacements) : totalUniqueIssues;
    const ratio = calculateRatioPer100_(totalUniqueIssues, totalPlacements);
    const grade = calculateRepGrade_(issueRate);
    
    // Build network breakdown
    const networkBreakdown = [];
    Object.keys(stats.networks).forEach(function(networkName) {
      const networkStats = stats.networks[networkName];
      const networkUniqueIssues = Object.keys(networkStats.uniqueIssues).length;
      const networkPlacements = Object.keys(networkStats.placements).length;
      const networkRatio = calculateRatioPer100_(networkUniqueIssues, networkPlacements);
      
      networkBreakdown.push({
        name: networkName,
        uniqueIssues: networkUniqueIssues,
        placements: networkPlacements,
        events: networkStats.eventCount,
        ratio: networkRatio
      });
    });
    
    // Sort networks by unique issues descending
    networkBreakdown.sort(function(a, b) {
      return b.uniqueIssues - a.uniqueIssues;
    });
    
    repGradeData.push({
      repName: repName,
      grade: grade,
      totalUniqueIssues: totalUniqueIssues,
      totalPlacements: totalPlacements,
      networkCount: Object.keys(stats.networks).length,
      ratio: ratio,
      last30DaysEvents: stats.last30DaysEvents,
      networks: networkBreakdown
    });
  });

  // Sort by total unique issues descending
  repGradeData.sort(function(a, b) {
    return b.totalUniqueIssues - a.totalUniqueIssues;
  });

  // Write to sheet
  writeSingleColumnRepGrading_(repGradeData);

  logRun_('buildRepGrading_', RUN_STATUS.SUCCESS, 'Completed', {
    repsGraded: repGradeData.length,
    topRep: repGradeData.length > 0 ? repGradeData[0].repName : null,
    topRepIssues: repGradeData.length > 0 ? repGradeData[0].totalUniqueIssues : 0
  });

  return { repsGraded: repGradeData.length };
}

function calculateRatioPer100_(issues, placements) {
  if (placements === 0) return 'N/A';
  
  // Calculate issues per 100 placements
  const issuesPer100 = (issues / placements) * 100;
  
  // Format as ratio - e.g., "3:100" or "0.5:100"
  if (issuesPer100 >= 1) {
    return Math.round(issuesPer100) + ':100';
  } else {
    return issuesPer100.toFixed(1) + ':100';
  }
}

function calculateRepGrade_(issueRate) {
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

function writeSingleColumnRepGrading_(repGradeData) {
  const ss = SpreadsheetApp.getActive();
  let sheet = ss.getSheetByName(SHEETS.REP_GRADING);
  
  // Clear or create sheet
  if (sheet) {
    sheet.clear();
  } else {
    sheet = ss.insertSheet(SHEETS.REP_GRADING);
  }
  
  // Build single-column format
  const outputData = [];
  
  // Header
  outputData.push(['👤 ADOPS REP GRADING']);
  outputData.push(['Ranked by Unique Issues (Last 30 Days)']);
  outputData.push(['']); // Blank row
  
  // Each rep gets multiple rows with network breakdown
  repGradeData.forEach(function(rep, index) {
    const rank = index + 1;
    const rankEmoji = rank === 1 ? '🥇' : rank === 2 ? '🥈' : rank === 3 ? '🥉' : '  ';
    const gradeEmoji = getRepGradeEmoji_(rep.grade);
    
    // Main rep row: Rank + Name + Grade
    outputData.push([rankEmoji + ' #' + rank + ' - ' + rep.repName + ' [Grade: ' + rep.grade + ' ' + gradeEmoji + ']']);
    
    // Summary stats row
    outputData.push(['       📊 ' + rep.totalUniqueIssues + ' unique issues  |  📍 ' + rep.totalPlacements + ' placements  |  📈 Ratio: ' + rep.ratio + '  |  🌐 ' + rep.networkCount + ' networks']);
    
    // 30-day activity
    outputData.push(['       📅 Last 30 days: ' + rep.last30DaysEvents + ' issue events']);
    
    // Blank separator before networks
    outputData.push(['']);
    
    // Network breakdown (show all networks)
    rep.networks.forEach(function(network) {
      outputData.push(['           ↳ ' + network.name + ': ' + network.uniqueIssues + ' issues, ' + network.placements + ' placements, ratio ' + network.ratio]);
    });
    
    // Blank separator between reps
    outputData.push(['']);
    outputData.push(['']);
  });
  
  // Write all data to column A
  if (outputData.length > 0) {
    sheet.getRange(1, 1, outputData.length, 1).setValues(outputData);
  }
  
  // Apply formatting
  formatSingleColumnRepGrading_(sheet, repGradeData.length);
}

function getRepGradeEmoji_(grade) {
  switch(grade) {
    case 'A': return '✅';
    case 'B': return '👍';
    case 'C': return '⚠️';
    case 'D': return '⚠️';
    case 'F': return '🚨';
    default: return '';
  }
}

function formatSingleColumnRepGrading_(sheet, repCount) {
  // Set column A width
  sheet.setColumnWidth(1, 900);
  
  // Format header (rows 1-2)
  sheet.getRange(1, 1).setFontSize(14).setFontWeight('bold').setBackground('#4a86e8').setFontColor('#ffffff');
  sheet.getRange(2, 1).setFontSize(10).setFontStyle('italic').setBackground('#e8f0fe');
  
  // Wrap text for all cells
  sheet.getRange(1, 1, sheet.getMaxRows(), 1).setWrapStrategy(SpreadsheetApp.WrapStrategy.WRAP);
  
  // Make rep names bold (rows with emoji ranks or numbers)
  let currentRow = 4; // Start after header + blank row
  for (let i = 0; i < repCount; i++) {
    // Bold the main rep row
    sheet.getRange(currentRow, 1).setFontWeight('bold').setFontSize(11);
    
    // Grey out summary and activity rows
    sheet.getRange(currentRow + 1, 1).setFontSize(9).setFontColor('#666666');
    sheet.getRange(currentRow + 2, 1).setFontSize(9).setFontColor('#666666');
    
    // Network breakdown rows - smaller font, indented
    // Find how many network rows (skip to next rep)
    const values = sheet.getDataRange().getValues();
    let networkRows = 0;
    let checkRow = currentRow + 4; // Skip rep name, summary, activity, blank
    while (checkRow < values.length && values[checkRow - 1][0] && String(values[checkRow - 1][0]).indexOf('↳') > -1) {
      sheet.getRange(checkRow, 1).setFontSize(8).setFontColor('#888888');
      checkRow++;
      networkRows++;
    }
    
    // Jump to next rep (name + summary + activity + blank + networks + 2 blanks)
    currentRow = checkRow + 2;
  }
  
  // Freeze header rows
  sheet.setFrozenRows(3);
}

function parseRepDate_(value) {
  if (value instanceof Date) return value;
  if (typeof value === 'number') return new Date((value - 25569) * 86400 * 1000);
  if (typeof value === 'string') {
    const parsed = new Date(value);
    if (!isNaN(parsed.getTime())) return parsed;
  }
  return new Date();
}
