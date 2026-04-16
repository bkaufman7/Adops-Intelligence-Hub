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
  const sourceProject = String(row['Source Project'] || '').trim();
  const networkId = String(row['Network ID'] || '').trim();
  const networkNameRaw = String(row['Network Name'] || '').trim();
  const networkNameLower = networkNameRaw.toLowerCase();
  const advertiserRaw = String(row['Advertiser'] || '').trim();
  const accountRepOpsRaw = String(row['Account REP OPS'] || '').trim();
  
  const mapHit = mapping['id:' + networkId] || 
                 mapping['name:' + networkNameLower] || 
                 mapping['advertiser:' + networkNameLower] || 
                 {};

  const resolvedNetworkId = networkId || String(mapHit['Network ID'] || '').trim();
  const resolvedNetworkName = row['Network Name'] || mapHit['Network Name'] || '';
  const resolvedAdvertiser = row['Advertiser'] || mapHit['Advertiser'] || '';
  const resolvedRep = row['Account REP OPS'] || mapHit['Account REP OPS'] || '';

  if (!mapHit['Network ID'] && !mapHit['Network Name']) {
    trackMappingIssue_(missingMappingCounts, {
      issueType: 'NETWORK_MAPPING_MISSING',
      sourceProject: sourceProject,
      networkId: networkId,
      networkName: networkNameRaw,
      advertiser: resolvedAdvertiser || advertiserRaw,
      accountRepOps: resolvedRep,
      reason: 'No mapping hit by Network ID/Network Name/Advertiser'
    });
  }

  if (isUnassignedValue_(resolvedAdvertiser)) {
    trackMappingIssue_(missingMappingCounts, {
      issueType: 'ADVERTISER_UNASSIGNED',
      sourceProject: sourceProject,
      networkId: resolvedNetworkId,
      networkName: resolvedNetworkName,
      advertiser: resolvedAdvertiser || advertiserRaw,
      accountRepOps: resolvedRep,
      reason: 'Advertiser value is blank/unknown/unassigned after normalization'
    });
  }

  if (isUnassignedValue_(resolvedRep)) {
    trackMappingIssue_(missingMappingCounts, {
      issueType: 'REP_UNASSIGNED',
      sourceProject: sourceProject,
      networkId: resolvedNetworkId,
      networkName: resolvedNetworkName,
      advertiser: resolvedAdvertiser || advertiserRaw,
      accountRepOps: resolvedRep || accountRepOpsRaw,
      reason: 'Account REP OPS is blank/unknown/unassigned after normalization'
    });
  }

  // Return array matching NORMALIZED_LEDGER_COLUMNS order
  return [
    eventDate || row['Event Date'],                      // Event Date
    row['Source Project'],                               // Source Project
    resolvedNetworkId,
    resolvedNetworkName,
    resolvedAdvertiser,
    row['Campaign'] || '',                               // Campaign
    row['Placement ID'] || '',                           // Placement ID
    row['Placement Name'] || '',                         // Placement Name
    row['Issue Type'] || row['Issue Flags'] || '',       // Issue Type
    row['Issue Flags'] || row['Issue Type'] || '',       // Issue Flags
    row['Issue Detail'] || '',                           // Issue Detail
    getValueOrZero_(row['Impressions']),                 // Impressions
    getValueOrZero_(row['Clicks']),                      // Clicks
    getValueOrZero_(row['Difference %']),                // Difference %
    resolvedRep
  ];
}

function normalizeEventRow_(row, mapping, missingMappingCounts) {
  const eventDate = parseDateSafe_(row['Event Date']);
  const sourceProject = String(row['Source Project'] || '').trim();
  const networkId = String(row['Network ID'] || '').trim();
  const networkNameRaw = String(row['Network Name'] || '').trim();
  const mapHit = mapping['id:' + networkId] || 
                 mapping['name:' + networkNameRaw.toLowerCase()] || 
                 mapping['advertiser:' + networkNameRaw.toLowerCase()] || 
                 {};

  if (!mapHit['Network ID'] && !mapHit['Network Name']) {
    trackMappingIssue_(missingMappingCounts, {
      issueType: 'NETWORK_MAPPING_MISSING',
      sourceProject: sourceProject,
      networkId: networkId,
      networkName: networkNameRaw,
      advertiser: String(row['Advertiser'] || '').trim(),
      accountRepOps: String(row['Account REP OPS'] || '').trim(),
      reason: 'No mapping hit by Network ID/Network Name/Advertiser'
    });
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

function trackMappingIssue_(missingMappingCounts, issue) {
  if (!missingMappingCounts) {
    return;
  }

  const issueType = String((issue && issue.issueType) || '').trim();
  const sourceProject = String((issue && issue.sourceProject) || '').trim() || 'Unknown Source';
  const networkId = String((issue && issue.networkId) || '').trim();
  const networkName = String((issue && issue.networkName) || '').trim();
  const advertiser = String((issue && issue.advertiser) || '').trim();
  const accountRepOps = String((issue && issue.accountRepOps) || '').trim();
  const reason = String((issue && issue.reason) || '').trim();

  if (!issueType) {
    return;
  }

  // Ignore fully blank issues to avoid non-actionable noise.
  if (!networkId && !networkName && !advertiser && !accountRepOps) {
    return;
  }

  const key = [issueType, sourceProject, networkId, networkName, advertiser, accountRepOps].join('||');
  if (!missingMappingCounts[key]) {
    missingMappingCounts[key] = {
      issueType: issueType,
      sourceProject: sourceProject,
      networkId: networkId,
      networkName: networkName,
      advertiser: advertiser,
      accountRepOps: accountRepOps,
      reason: reason,
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

  const byIssueType = {};
  items.forEach(function (item) {
    const issueType = String(item.issueType || 'UNKNOWN').trim() || 'UNKNOWN';
    byIssueType[issueType] = (byIssueType[issueType] || 0) + item.count;
  });

  logRun_('normalizeRawEvents_', RUN_STATUS.WARNING, 'Missing mappings summary', {
    distinctGroups: items.length,
    issueTypeTotals: byIssueType,
    topMissingMappings: items.slice(0, 25)
  });
}

function writeUnmappedNetworksSummary_(missingMappingCounts) {
  const eventItems = Object.keys(missingMappingCounts || {}).map(function (key) {
    return missingMappingCounts[key];
  });
  const baselineItems = collectLatestBaselineMappingIssues_();
  const items = mergeMappingIssueItems_(eventItems, baselineItems);

  if (!items.length) {
    clearAndWriteTable_(SHEETS.UNMAPPED_NETWORKS, ['Status'], [['✅ All networks are mapped!']]);
    return;
  }

  items.sort(function (a, b) {
    return b.count - a.count;
  });

  const headers = ['Issue Type', 'Source Project', 'Network ID', 'Network Name', 'Advertiser', 'Account REP OPS', 'Count', 'Reason'];
  const rows = items.map(function(item) {
    return [
      item.issueType || '',
      item.sourceProject || '',
      item.networkId || '',
      item.networkName || '',
      item.advertiser || '',
      item.accountRepOps || '',
      item.count,
      item.reason || ''
    ];
  });
  
  clearAndWriteTable_(SHEETS.UNMAPPED_NETWORKS, headers, rows);
}

function collectLatestBaselineMappingIssues_() {
  const rows = readTable_(SHEETS.CVI_DAILY_BASELINE);
  if (!rows || !rows.length) {
    return [];
  }

  const mapping = buildNetworkMap_();
  let latestSnapshotDate = '';
  rows.forEach(function (row) {
    const d = normalizeSnapshotDate_(row['Snapshot Date']);
    if (d && d > latestSnapshotDate) {
      latestSnapshotDate = d;
    }
  });

  if (!latestSnapshotDate) {
    return [];
  }

  const issueCounts = {};
  rows.forEach(function (row) {
    if (normalizeSnapshotDate_(row['Snapshot Date']) !== latestSnapshotDate) {
      return;
    }

    const networkId = String(row['Network ID'] || '').trim();
    const advertiser = String(row['Advertiser'] || '').trim();
    const mapHit = mapping['id:' + networkId] || mapping['advertiser:' + advertiser.toLowerCase()] || {};
    const resolvedRep = String(mapHit['Account REP OPS'] || '').trim();
    const resolvedAdvertiser = advertiser || String(mapHit['Advertiser'] || '').trim();
    const sourceProject = String(row['Source Project'] || SOURCE_SYSTEMS.PROJECT_2_CVI).trim();
    const networkName = '';

    if (isUnassignedValue_(resolvedAdvertiser)) {
      trackMappingIssue_(issueCounts, {
        issueType: 'BASELINE_ADVERTISER_UNASSIGNED',
        sourceProject: sourceProject,
        networkId: networkId,
        networkName: networkName,
        advertiser: resolvedAdvertiser,
        accountRepOps: resolvedRep,
        reason: 'Advertiser is blank/unknown/unassigned in latest baseline snapshot'
      });
    }

    if (isUnassignedValue_(resolvedRep)) {
      trackMappingIssue_(issueCounts, {
        issueType: 'BASELINE_REP_UNASSIGNED',
        sourceProject: sourceProject,
        networkId: networkId,
        networkName: networkName,
        advertiser: resolvedAdvertiser,
        accountRepOps: resolvedRep,
        reason: 'No REP OPS mapping for baseline placement in latest snapshot'
      });
    }
  });

  return Object.keys(issueCounts).map(function (key) {
    return issueCounts[key];
  });
}

function mergeMappingIssueItems_(itemsA, itemsB) {
  const merged = {};

  function addItems(items) {
    (items || []).forEach(function (item) {
      const key = [
        String(item.issueType || ''),
        String(item.sourceProject || ''),
        String(item.networkId || ''),
        String(item.networkName || ''),
        String(item.advertiser || ''),
        String(item.accountRepOps || ''),
        String(item.reason || '')
      ].join('||');

      if (!merged[key]) {
        merged[key] = {
          issueType: String(item.issueType || ''),
          sourceProject: String(item.sourceProject || ''),
          networkId: String(item.networkId || ''),
          networkName: String(item.networkName || ''),
          advertiser: String(item.advertiser || ''),
          accountRepOps: String(item.accountRepOps || ''),
          reason: String(item.reason || ''),
          count: 0
        };
      }

      merged[key].count += Number(item.count || 0);
    });
  }

  addItems(itemsA);
  addItems(itemsB);

  return Object.keys(merged).map(function (key) {
    return merged[key];
  });
}

function isUnassignedValue_(value) {
  const text = String(value || '').trim();
  if (!text) {
    return true;
  }

  return /^(unknown|unassigned|n\/a|na|null|none|tbd)$/i.test(text);
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
