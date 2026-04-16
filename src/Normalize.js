function normalizeRawEvents_() {
  return withRunLogging_('normalizeRawEvents_', function () {
    const mapping = buildNetworkMap_();
    const rawRows = readTable_(SHEETS.RAW_IMPORTED_EVENTS);
    const deduped = dedupeExactFullRow_(rawRows);
    const missingMappingCounts = {};

    // Build row arrays directly to avoid double-pass conversion
    const normalizedRowArrays = deduped.map(function (row) {
      return normalizeEventRowToArray_(row, mapping, missingMappingCounts);
    });

    logMissingMappingsSummary_(missingMappingCounts);

    clearAndWriteTable_(
      SHEETS.NORMALIZED_LEDGER,
      NORMALIZED_LEDGER_COLUMNS,
      normalizedRowArrays
    );

    return {
      rawRows: rawRows.length,
      dedupedRows: deduped.length,
      normalizedRows: normalizedRowArrays.length,
      missingMappingGroups: Object.keys(missingMappingCounts).length,
      missingMappingCounts: missingMappingCounts
    };
  });
}

// Optimized version that builds row array directly without intermediate object
function normalizeEventRowToArray_(row, mapping, missingMappingCounts) {
  const eventDate = parseDateSafe_(row['Event Date']);
  const networkId = String(row['Network ID'] || '').trim();
  const networkNameRaw = String(row['Network Name'] || '').trim();
  const networkNameLower = networkNameRaw.toLowerCase();
  
  const mapHit = mapping['id:' + networkId] || 
                 mapping['name:' + networkNameLower] || 
                 mapping['advertiser:' + networkNameLower] || 
                 {};

  if (!mapHit['Network ID'] && !mapHit['Network Name']) {
    trackMissingMapping_(missingMappingCounts, networkId, networkNameRaw);
  }

  // Return array matching NORMALIZED_LEDGER_COLUMNS order
  return [
    eventDate || row['Event Date'],                      // Event Date
    row['Source Project'],                               // Source Project
    networkId || String(mapHit['Network ID'] || '').trim(),
    row['Network Name'] || mapHit['Network Name'] || '',
    row['Advertiser'] || mapHit['Advertiser'] || '',
    row['Campaign'] || '',                               // Campaign
    row['Placement ID'] || '',                           // Placement ID
    row['Placement Name'] || '',                         // Placement Name
    row['Issue Type'] || row['Issue Flags'] || '',       // Issue Type
    row['Issue Flags'] || row['Issue Type'] || '',       // Issue Flags
    row['Issue Detail'] || '',                           // Issue Detail
    getValueOrZero_(row['Impressions']),                 // Impressions
    getValueOrZero_(row['Clicks']),                      // Clicks
    getValueOrZero_(row['Difference %']),                // Difference %
    row['Account REP OPS'] || mapHit['Account REP OPS'] || ''
  ];
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
    'Source Project': row['Source Project'],
    'Network ID': networkId || String(mapHit['Network ID'] || '').trim(),
    'Network Name': row['Network Name'] || mapHit['Network Name'] || '',
    'Advertiser': row['Advertiser'] || mapHit['Advertiser'] || '',
    'Campaign': row['Campaign'] || '',
    'Placement ID': row['Placement ID'] || '',
    'Placement Name': row['Placement Name'] || '',
    'Issue Type': row['Issue Type'] || row['Issue Flags'] || '',
    'Issue Flags': row['Issue Flags'] || row['Issue Type'] || '',
    'Issue Detail': row['Issue Detail'] || '',
    'Impressions': getValueOrZero_(row['Impressions']),
    'Clicks': getValueOrZero_(row['Clicks']),
    'Difference %': getValueOrZero_(row['Difference %']),
    'Account REP OPS': row['Account REP OPS'] || mapHit['Account REP OPS'] || ''
  };
}

function getValueOrZero_(value) {
  if (value === '' || value === null || value === undefined) {
    return 0;
  }
  return value;
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

  // Build simple table matching Network_Mapping format for easy copy-paste
  const headers = ['Network ID', 'Network Name', 'Advertiser', 'Account REP OPS', 'Event Count'];
  const rows = items.map(function(item) {
    return [
      item.networkId || '',
      item.networkName || '',
      '',  // Advertiser - user will fill
      '',  // Account REP OPS - user will fill
      item.count
    ];
  });
  
  clearAndWriteTable_(SHEETS.UNMAPPED_NETWORKS, headers, rows);
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
