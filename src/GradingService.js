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

  // Aggregate by network
  const networkStats = {};
  
  ledger.forEach(function(row) {
    const networkName = String(row['Network Name'] || 'Unknown').trim();
    const placementId = String(row['Placement ID'] || '').trim();
    
    if (!networkStats[networkName]) {
      networkStats[networkName] = {
        totalIssues: 0,
        uniquePlacements: {}
      };
    }
    
    networkStats[networkName].totalIssues++;
    
    if (placementId) {
      networkStats[networkName].uniquePlacements[placementId] = true;
    }
  });

  // Calculate grades
  const gradeData = [];
  
  Object.keys(networkStats).forEach(function(networkName) {
    const stats = networkStats[networkName];
    const placementCount = Object.keys(stats.uniquePlacements).length;
    const issueRate = placementCount > 0 ? (stats.totalIssues / placementCount) : stats.totalIssues;
    
    const grade = calculateGrade_(issueRate);
    
    gradeData.push({
      'Network Name': networkName,
      'Grade': grade,
      'Total Issues': stats.totalIssues,
      'Total Placements': placementCount,
      'Issues per Placement': placementCount > 0 ? issueRate.toFixed(2) : 'N/A'
    });
  });

  // Sort by total issues descending (show worst performers first)
  gradeData.sort(function(a, b) {
    return b['Total Issues'] - a['Total Issues'];
  });
  
  // Add rank numbers
  gradeData.forEach(function(row, index) {
    row['#'] = index + 1;
  });

  // Write to sheet with formatting
  clearAndWriteTable_(SHEETS.NETWORK_GRADING, gradeData);
  applyGradingFormatting_();

  logRun_('buildNetworkGrading_', RUN_STATUS.SUCCESS, 'Completed', {
    networksGraded: gradeData.length,
    topViolator: gradeData.length > 0 ? gradeData[0]['Network Name'] : null,
    topViolatorCount: gradeData.length > 0 ? gradeData[0]['Total Issues'] : 0
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

function applyGradingFormatting_() {
  const ss = SpreadsheetApp.getActive();
  const sheet = ss.getSheetByName(SHEETS.NETWORK_GRADING);
  if (!sheet) return;
  
  const dataRange = sheet.getDataRange();
  const values = dataRange.getValues();
  
  if (values.length <= 1) return; // Only header
  
  // Find column indices
  const headers = values[0];
  const rankColIndex = headers.indexOf('#') + 1;
  const networkColIndex = headers.indexOf('Network Name') + 1;
  const gradeColIndex = headers.indexOf('Grade') + 1;
  const totalIssuesColIndex = headers.indexOf('Total Issues') + 1;
  const placementsColIndex = headers.indexOf('Total Placements') + 1;
  const issueRateColIndex = headers.indexOf('Issues per Placement') + 1;
  
  // Set column widths for clean vertical scanning
  sheet.setColumnWidth(rankColIndex, 50);           // # - compact
  sheet.setColumnWidth(networkColIndex, 300);       // Network Name - wide for readability
  sheet.setColumnWidth(gradeColIndex, 70);          // Grade - compact
  sheet.setColumnWidth(totalIssuesColIndex, 110);   // Total Issues
  sheet.setColumnWidth(placementsColIndex, 130);    // Total Placements
  sheet.setColumnWidth(issueRateColIndex, 150);     // Issues per Placement
  
  // Format header row
  const headerRange = sheet.getRange(1, 1, 1, headers.length);
  headerRange.setFontWeight('bold');
  headerRange.setBackground('#4a86e8');
  headerRange.setFontColor('#ffffff');
  headerRange.setHorizontalAlignment('center');
  
  // Apply grade color-coding
  for (let i = 2; i <= values.length; i++) {
    const grade = values[i-1][gradeColIndex-1];
    const gradeCell = sheet.getRange(i, gradeColIndex);
    
    let bgColor = '#ffffff';
    let fontColor = '#000000';
    
    switch(grade) {
      case 'A':
        bgColor = '#34a853'; // Google green
        fontColor = '#ffffff';
        break;
      case 'B':
        bgColor = '#93c47d'; // Light green
        fontColor = '#000000';
        break;
      case 'C':
        bgColor = '#ffd966'; // Yellow
        fontColor = '#000000';
        break;
      case 'D':
        bgColor = '#ff9900'; // Orange
        fontColor = '#ffffff';
        break;
      case 'F':
        bgColor = '#cc0000'; // Red
        fontColor = '#ffffff';
        break;
    }
    
    gradeCell.setBackground(bgColor);
    gradeCell.setFontColor(fontColor);
    gradeCell.setFontWeight('bold');
    gradeCell.setHorizontalAlignment('center');
    gradeCell.setFontSize(12);
  }
  
  // Make network names bold for easy scanning
  if (networkColIndex > 0) {
    sheet.getRange(2, networkColIndex, values.length - 1, 1).setFontWeight('bold');
  }
  
  // Right-align numeric columns
  if (rankColIndex > 0) {
    sheet.getRange(2, rankColIndex, values.length - 1, 1).setHorizontalAlignment('center');
  }
  if (totalIssuesColIndex > 0) {
    sheet.getRange(2, totalIssuesColIndex, values.length - 1, 1).setHorizontalAlignment('right');
  }
  if (placementsColIndex > 0) {
    sheet.getRange(2, placementsColIndex, values.length - 1, 1).setHorizontalAlignment('right');
  }
  if (issueRateColIndex > 0) {
    sheet.getRange(2, issueRateColIndex, values.length - 1, 1).setHorizontalAlignment('right');
  }
  
  // Add borders for visual separation
  dataRange.setBorder(true, true, true, true, true, true, '#e0e0e0', SpreadsheetApp.BorderStyle.SOLID);
  
  // Freeze header row and rank column for scrolling
  sheet.setFrozenRows(1);
  sheet.setFrozenColumns(1);
}
