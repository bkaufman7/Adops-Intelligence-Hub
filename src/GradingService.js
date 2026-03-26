/**
 * GradingService.js
 * 
 * Calculates network performance grades based on:
 * - Total violation count
 * - Issue-per-placement ratio
 * - Trends over time (7-day, 30-day)
 * 
 * Generates color-coded grading sheet with performance rankings.
 */

function buildNetworkGrading_() {
  logRun_('buildNetworkGrading_', RUN_STATUS.RUNNING, 'Started', null);

  const ledger = readTable_(SHEETS.NORMALIZED_LEDGER);
  if (!ledger || ledger.length === 0) {
    logRun_('buildNetworkGrading_', RUN_STATUS.WARNING, 'No normalized data found', null);
    return { gradesCalculated: 0 };
  }

  const now = new Date();
  const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

  // Aggregate by network
  const networkStats = {};
  
  ledger.forEach(function(row) {
    const networkName = String(row['Network Name'] || 'Unknown').trim();
    const placementId = String(row['Placement ID'] || '').trim();
    const eventDate = parseDate_(row['Event Date']);
    
    if (!networkStats[networkName]) {
      networkStats[networkName] = {
        totalIssues: 0,
        uniquePlacements: {},
        last7DaysIssues: 0,
        last30DaysIssues: 0
      };
    }
    
    networkStats[networkName].totalIssues++;
    
    if (placementId) {
      networkStats[networkName].uniquePlacements[placementId] = true;
    }
    
    if (eventDate >= sevenDaysAgo) {
      networkStats[networkName].last7DaysIssues++;
    }
    if (eventDate >= thirtyDaysAgo) {
      networkStats[networkName].last30DaysIssues++;
    }
  });

  // Calculate grades
  const gradeData = [];
  
  Object.keys(networkStats).forEach(function(networkName) {
    const stats = networkStats[networkName];
    const placementCount = Object.keys(stats.uniquePlacements).length;
    const issueRate = placementCount > 0 ? (stats.totalIssues / placementCount) : stats.totalIssues;
    
    const grade = calculateGrade_(issueRate);
    const trend = calculateTrend_(stats.last7DaysIssues, stats.last30DaysIssues);
    
    gradeData.push({
      'Grade': grade,
      'Network Name': networkName,
      'Total Issues': stats.totalIssues,
      'Placements': placementCount,
      'Issue Rate': placementCount > 0 ? issueRate.toFixed(2) : 'N/A',
      'Trend': trend,
      '7-Day': stats.last7DaysIssues,
      '30-Day': stats.last30DaysIssues
    });
  });

  // Sort by total issues descending (show worst performers first)
  gradeData.sort(function(a, b) {
    return b['Total Issues'] - a['Total Issues'];
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

function calculateTrend_(last7Days, last30Days) {
  // Calculate if issues are increasing, stable, or decreasing
  const weeklyAvg = last7Days / 7;
  const monthlyAvg = last30Days / 30;
  
  if (monthlyAvg === 0) return '—';
  
  const changePercent = ((weeklyAvg - monthlyAvg) / monthlyAvg) * 100;
  
  if (changePercent > 20) return '📈 Rising';
  if (changePercent < -20) return '📉 Improving';
  return '➡️ Stable';
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
  const gradeColIndex = headers.indexOf('Grade') + 1;
  const networkColIndex = headers.indexOf('Network Name') + 1;
  const totalIssuesColIndex = headers.indexOf('Total Issues') + 1;
  const trendColIndex = headers.indexOf('Trend') + 1;
  
  // Set specific column widths for cleaner vertical layout
  sheet.setColumnWidth(gradeColIndex, 60);      // Grade: compact
  sheet.setColumnWidth(networkColIndex, 250);   // Network Name: wider for readability
  sheet.setColumnWidth(totalIssuesColIndex, 100); // Total Issues
  sheet.setColumnWidth(headers.indexOf('Placements') + 1, 90); // Placements
  sheet.setColumnWidth(headers.indexOf('Issue Rate') + 1, 90);  // Issue Rate
  sheet.setColumnWidth(trendColIndex, 110);     // Trend
  sheet.setColumnWidth(headers.indexOf('7-Day') + 1, 70);   // 7-Day
  sheet.setColumnWidth(headers.indexOf('30-Day') + 1, 70);  // 30-Day
  
  // Apply color coding to Grade column
  if (gradeColIndex > 0) {
    for (let i = 2; i <= values.length; i++) {
      const grade = values[i - 1][gradeColIndex - 1];
      const cell = sheet.getRange(i, gradeColIndex);
      
      cell.setFontWeight('bold');
      cell.setHorizontalAlignment('center');
      cell.setFontSize(12);
      
      switch (grade) {
        case 'A':
          cell.setBackground('#34a853'); // Green
          cell.setFontColor('#ffffff');
          break;
        case 'B':
          cell.setBackground('#93c47d'); // Light green
          cell.setFontColor('#000000');
          break;
        case 'C':
          cell.setBackground('#ffd966'); // Yellow
          cell.setFontColor('#000000');
          break;
        case 'D':
          cell.setBackground('#ff9900'); // Orange
          cell.setFontColor('#ffffff');
          break;
        case 'F':
          cell.setBackground('#cc0000'); // Red
          cell.setFontColor('#ffffff');
          break;
      }
    }
  }
  
  // Apply color scale to Total Issues column (heat map)
  if (totalIssuesColIndex > 0) {
    const issuesRange = sheet.getRange(2, totalIssuesColIndex, values.length - 1, 1);
    const rule = SpreadsheetApp.newConditionalFormatRule()
      .setGradientMaxpointWithValue('#ffe6e6', SpreadsheetApp.InterpolationType.NUMBER, '1000')
      .setGradientMidpointWithValue('#fff3e6', SpreadsheetApp.InterpolationType.PERCENTILE, '50')
      .setGradientMinpointWithValue('#ffffff', SpreadsheetApp.InterpolationType.NUMBER, '0')
      .setRanges([issuesRange])
      .build();
    
    const rules = sheet.getConditionalFormatRules();
    rules.push(rule);
    sheet.setConditionalFormatRules(rules);
  }
  
  // Format header row
  const headerRange = sheet.getRange(1, 1, 1, headers.length);
  headerRange.setBackground('#1a73e8');
  headerRange.setFontColor('#ffffff');
  headerRange.setFontWeight('bold');
  headerRange.setFontSize(11);
  headerRange.setHorizontalAlignment('center');
  headerRange.setVerticalAlignment('middle');
  
  // Center-align numeric columns
  if (totalIssuesColIndex > 0) {
    sheet.getRange(2, totalIssuesColIndex, values.length - 1, 1).setHorizontalAlignment('center');
  }
  const placementsColIndex = headers.indexOf('Placements') + 1;
  if (placementsColIndex > 0) {
    sheet.getRange(2, placementsColIndex, values.length - 1, 1).setHorizontalAlignment('center');
  }
  const issueRateColIndex = headers.indexOf('Issue Rate') + 1;
  if (issueRateColIndex > 0) {
    sheet.getRange(2, issueRateColIndex, values.length - 1, 1).setHorizontalAlignment('center');
  }
  if (trendColIndex > 0) {
    sheet.getRange(2, trendColIndex, values.length - 1, 1).setHorizontalAlignment('center');
  }
  const sevenDayColIndex = headers.indexOf('7-Day') + 1;
  if (sevenDayColIndex > 0) {
    sheet.getRange(2, sevenDayColIndex, values.length - 1, 1).setHorizontalAlignment('center');
  }
  const thirtyDayColIndex = headers.indexOf('30-Day') + 1;
  if (thirtyDayColIndex > 0) {
    sheet.getRange(2, thirtyDayColIndex, values.length - 1, 1).setHorizontalAlignment('center');
  }
  
  // Add borders for better visual separation
  dataRange.setBorder(true, true, true, true, true, true, '#e0e0e0', SpreadsheetApp.BorderStyle.SOLID);
  
  // Make network names bold for easier scanning
  if (networkColIndex > 0) {
    sheet.getRange(2, networkColIndex, values.length - 1, 1).setFontWeight('bold');
  }
  
  // Freeze header row and Grade + Network columns for scrolling
  sheet.setFrozenRows(1);
  sheet.setFrozenColumns(2);
}

function parseDate_(value) {
  if (value instanceof Date) return value;
  if (typeof value === 'number') return new Date((value - 25569) * 86400 * 1000);
  if (typeof value === 'string') {
    const parsed = new Date(value);
    if (!isNaN(parsed.getTime())) return parsed;
  }
  return new Date();
}
