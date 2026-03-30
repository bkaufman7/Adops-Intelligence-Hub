function normalizeRawEvents_() {
  return withRunLogging_('normalizeRawEvents_', function () {
    const mapping = buildNetworkMap_();
    const rawRows = readTable_(SHEETS.RAW_IMPORTED_EVENTS);
    const deduped = dedupeExactFullRow_(rawRows);
    const missingMappingCounts = {};

    const normalizedRows = deduped.map(function (row) {
      return normalizeEventRow_(row, mapping, missingMappingCounts);
    });

    logMissingMappingsSummary_(missingMappingCounts);

    clearAndWriteTable_(
      SHEETS.NORMALIZED_LEDGER,
      NORMALIZED_LEDGER_COLUMNS,
      normalizedRows.map(function (r) {
        return toRow_(NORMALIZED_LEDGER_COLUMNS, r);
      })
    );

    // Track unmapped networks for monitoring
    writeUnmappedNetworksSummary_(missingMappingCounts);

    return {
      rawRows: rawRows.length,
      dedupedRows: deduped.length,
      normalizedRows: normalizedRows.length,
      missingMappingGroups: Object.keys(missingMappingCounts).length
    };
  });
}

function normalizeEventRow_(row, mapping, missingMappingCounts) {
  const eventDate = parseDateSafe_(row['Event Date']);
  const networkId = String(row['Network ID'] || '').trim();
  const networkNameRaw = String(row['Network Name'] || '').trim();
  const mapHit = mapping['id:' + networkId] || 
                 mapping['name:' + networkNameRaw.toLowerCase()] || 
                 mapping['advertiser:' + networkNameRaw.toLowerCase()] || 
                 {};

  if (!mapHit['Network ID'] && !mapHit['Network Name']) {
    trackMissingMapping_(missingMappingCounts, networkId, networkNameRaw);
  }

  return {
    'Event Date': eventDate || row['Event Date'],
    'Event Week': eventDate ? formatWeek_(eventDate) : '',
    'Event Month': eventDate ? Utilities.formatDate(eventDate, Session.getScriptTimeZone(), 'yyyy-MM') : '',
    'Source System': row['Source System'],
    'Source Project': row['Source Project'],
    'Network ID': networkId,
    'Network Name': row['Network Name'] || mapHit['Network Name'] || '',
    'Advertiser': row['Advertiser'] || mapHit['Advertiser'] || '',
    'Campaign': row['Campaign'] || '',
    'Placement ID': row['Placement ID'] || '',
    'Placement Name': row['Placement Name'] || '',
    'Issue Type': row['Issue Type Raw'] || '',
    'Issue Flags': row['Issue Flags'] || row['Issue Type Raw'] || '',
    'Issue Detail': row['Issue Detail'] || '',
    'Impressions': row['Impressions'] || '',
    'Clicks': row['Clicks'] || '',
    'Difference %': row['Difference %'] || '',
    'Account REP OPS': mapHit['Account REP OPS'] || '',
    'Source Email Link': row['Source Email Link'] || '',
    'Source File Link': row['Source File Link'] || '',
    'Full Row Hash': row['Full Row Hash'] || '',
    'Imported At': row['Import Timestamp'] || new Date()
  };
}

function trackMissingMapping_(missingMappingCounts, networkId, networkName) {
  if (!missingMappingCounts) {
    return;
  }

  // Ignore fully blank identifiers; these create log noise and are not actionable mapping keys.
  if (!networkId && !networkName) {
    return;
  }

  const key = [networkId || '', networkName || ''].join('||');
  if (!missingMappingCounts[key]) {
    missingMappingCounts[key] = {
      networkId: networkId,
      networkName: networkName,
      count: 0
    };
  }

  missingMappingCounts[key].count += 1;
}

function logMissingMappingsSummary_(missingMappingCounts) {
  const items = Object.keys(missingMappingCounts || {}).map(function (key) {
    return missingMappingCounts[key];
  });

  if (!items.length) {
    return;
  }

  items.sort(function (a, b) {
    return b.count - a.count;
  });

  logRun_('normalizeRawEvents_', RUN_STATUS.WARNING, 'Missing mappings summary', {
    distinctGroups: items.length,
    topMissingMappings: items.slice(0, 25)
  });
}

function writeUnmappedNetworksSummary_(missingMappingCounts) {
  const items = Object.keys(missingMappingCounts || {}).map(function (key) {
    return missingMappingCounts[key];
  });

  if (!items.length) {
    clearAndWriteTable_(SHEETS.UNMAPPED_NETWORKS, ['Status'], [['✅ All networks are mapped!']]);
    return;
  }

  items.sort(function (a, b) {
    return b.count - a.count;
  });

  const ss = SpreadsheetApp.getActive();
  let sheet = ss.getSheetByName(SHEETS.UNMAPPED_NETWORKS);
  
  if (!sheet) {
    sheet = ss.insertSheet(SHEETS.UNMAPPED_NETWORKS);
  } else {
    sheet.clear();
  }

  const outputData = [];
  
  // Header
  outputData.push(['🔍 UNMAPPED NETWORKS']);
  outputData.push(['Networks that need mapping entries in Network_Mapping sheet']);
  outputData.push(['Add these to keep Advertiser and Account REP OPS data complete']);
  outputData.push(['']); // Blank row
  outputData.push(['📊 Total Unmapped: ' + items.length + ' network(s)']);
  outputData.push(['']); // Blank row
  
  // Each unmapped network
  items.forEach(function(item, index) {
    const rank = index + 1;
    outputData.push(['#' + rank + ' - ' + (item.networkName || 'ID: ' + item.networkId)]);
    
    const details = [];
    if (item.networkId) details.push('Network ID: ' + item.networkId);
    if (item.networkName) details.push('Network Name: ' + item.networkName);
    details.push('Event Count: ' + item.count);
    
    outputData.push(['       ' + details.join(' | ')]);
    outputData.push(['']); // Blank separator
  });
  
  // Write to column A
  if (outputData.length > 0) {
    sheet.getRange(1, 1, outputData.length, 1).setValues(outputData);
  }
  
  // Format
  sheet.setColumnWidth(1, 900);
  sheet.getRange(1, 1).setFontSize(14).setFontWeight('bold').setBackground('#ea4335').setFontColor('#ffffff');
  sheet.getRange(2, 1, 2, 1).setFontSize(10).setFontStyle('italic').setBackground('#fce8e6');
  sheet.getRange(1, 1, sheet.getMaxRows(), 1).setWrapStrategy(SpreadsheetApp.WrapStrategy.WRAP);
}

function parseDateSafe_(value) {
  if (!value) {
    return null;
  }
  const d = new Date(value);
  return isNaN(d.getTime()) ? null : d;
}

function formatWeek_(dateObj) {
  const tmp = new Date(Date.UTC(dateObj.getFullYear(), dateObj.getMonth(), dateObj.getDate()));
  const dayNum = tmp.getUTCDay() || 7;
  tmp.setUTCDate(tmp.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(tmp.getUTCFullYear(), 0, 1));
  const weekNo = Math.ceil((((tmp - yearStart) / 86400000) + 1) / 7);
  return tmp.getUTCFullYear() + '-W' + ('0' + weekNo).slice(-2);
}
