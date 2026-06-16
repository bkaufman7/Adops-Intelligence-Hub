function buildDashboardSupportArtifacts_(rows, liveCoverage) {
  return withRunLogging_('buildDashboardSupportArtifacts_', function () {
    const safeRows = rows || readTable_(SHEETS.NORMALIZED_LEDGER);
    const safeLiveCoverage = liveCoverage || buildLatestLivePlacementSet_();

    const result = {};
    result.thresholds = buildThresholds_(safeRows, safeLiveCoverage);
    result.campaignScorecard = buildCampaignScorecard_(safeRows, safeLiveCoverage);
    result.dataQuality = buildDataQuality_(safeRows, safeLiveCoverage);
    return result;
  });
}

function buildCampaignScorecard_(rows, liveCoverage) {
  const safeRows = rows || readTable_(SHEETS.NORMALIZED_LEDGER);
  const campaignLiveCoverage = buildLatestCampaignLiveCoverage_();
  const metrics = buildCampaignRateMetrics_(safeRows, campaignLiveCoverage);
  const bands = buildDynamicBands_(metrics);

  const headers = [
    'Rank',
    'Campaign',
    'Grade',
    'Dynamic Flagged %',
    'Flagged Live Placements',
    'Total Live Placements',
    'Flagged/Live Ratio',
    'Advertiser',
    'Rep / Owner',
    'Issue Events',
    'Top Issue Type',
    'Source Projects',
    'Last Event Date',
    'Confidence'
  ];

  const tableRows = metrics
    .sort(function (a, b) {
      const gradeDelta = gradeSeverityRank_(b.grade) - gradeSeverityRank_(a.grade);
      if (gradeDelta !== 0) return gradeDelta;
      const pctDelta = Number(b.flaggedPct || -1) - Number(a.flaggedPct || -1);
      if (pctDelta !== 0) return pctDelta;
      return b.flaggedPlacements - a.flaggedPlacements;
    })
    .map(function (item, idx) {
      return [
        idx + 1,
        item.name,
        item.grade,
        formatPercentValue_(item.flaggedPct),
        item.flaggedPlacements,
        item.totalLivePlacements,
        formatPlacementRatio_(item.flaggedPlacements, item.totalLivePlacements),
        topObjectKey_(item.advertisers) || 'Unknown',
        topObjectKey_(item.reps) || 'Unassigned',
        item.issueEvents,
        topObjectKey_(item.issueTypes) || 'Unknown',
        Object.keys(item.sourceProjects || {}).sort().join(', '),
        item.lastEventDate || '',
        item.confidence
      ];
    });

  clearAndWriteTable_(SHEETS.CAMPAIGN_GRADING, headers, tableRows);
  formatCampaignScorecard_(tableRows.length, tableRows);

  return {
    campaignsGraded: tableRows.length,
    liveSnapshotDate: campaignLiveCoverage.snapshotDate || '',
    dynamicBands: bands
  };
}

function buildThresholds_(rows, liveCoverage) {
  const safeRows = rows || readTable_(SHEETS.NORMALIZED_LEDGER);
  const repMetrics = buildRepRateMetrics_(safeRows);
  const advertiserMetrics = buildAdvertiserRateMetrics_(safeRows);
  const campaignMetrics = buildCampaignRateMetrics_(safeRows, buildLatestCampaignLiveCoverage_());
  const model = getGradingModel_();

  const headers = ['Entity Type', 'Band', 'Min Flagged %', 'Max Flagged %', 'Source', 'Notes'];
  const tableRows = [];

  appendDynamicThresholdRows_(tableRows, 'Rep', repMetrics);
  appendDynamicThresholdRows_(tableRows, 'Advertiser', advertiserMetrics);
  appendDynamicThresholdRows_(tableRows, 'Campaign', campaignMetrics);

  tableRows.push(['Model', 'Minimum Full Grade Volume', '', model.minFullGradeLivePlacements, 'Current grading model', 'Entities below this live-placement count are Monitor unless the override applies.']);
  tableRows.push(['Model', 'Monitor Override', model.monitorOverrideThreshold, '', 'Current grading model', 'Low-volume entities above this adjusted flagged percentage are forced to F.']);
  tableRows.push(['Model', 'Rep Smoothing k', '', model.repSmoothingK, 'Current grading model', 'Higher k pulls low-volume reps closer to agency baseline.']);
  tableRows.push(['Model', 'Advertiser Smoothing k', '', model.advertiserSmoothingK, 'Current grading model', 'Higher k pulls low-volume advertisers closer to agency baseline.']);
  tableRows.push(['Model', 'Dynamic Bands', '', '', 'Incoming data distribution', 'A/B/C/D/F bands use current percentile cut points. Lower flagged percentage is better.']);

  clearAndWriteTable_(SHEETS.THRESHOLDS, headers, tableRows);
  formatThresholdsSheet_(tableRows.length);

  return {
    repEntities: repMetrics.length,
    advertiserEntities: advertiserMetrics.length,
    campaignEntities: campaignMetrics.length
  };
}

function buildDataQuality_(rows, liveCoverage) {
  const safeRows = rows || readTable_(SHEETS.NORMALIZED_LEDGER);
  const safeLiveCoverage = liveCoverage || buildLatestLivePlacementSet_();
  const rawRows = readTable_(SHEETS.RAW_IMPORTED_EVENTS);
  const mappingRows = readTable_(SHEETS.NETWORK_MAPPING);
  const runLogRows = readTable_(SHEETS.RUN_LOG);
  const configStatus = summarizeSourceConfiguration_();

  const uniquePlacementIds = {};
  let blankPlacementIds = 0;
  let unassignedReps = 0;
  let unknownAdvertisers = 0;
  const rowsBySource = {};

  safeRows.forEach(function (row) {
    const sourceProject = String(row['Source Project'] || 'Unknown').trim() || 'Unknown';
    rowsBySource[sourceProject] = (rowsBySource[sourceProject] || 0) + 1;

    const placementId = String(row['Placement ID'] || '').trim();
    if (placementId) {
      uniquePlacementIds[placementId] = true;
    } else {
      blankPlacementIds += 1;
    }

    if (isUnassignedValue_(row['Account REP OPS'])) {
      unassignedReps += 1;
    }

    if (isUnassignedValue_(row['Advertiser'])) {
      unknownAdvertisers += 1;
    }
  });

  const mappedRepRows = mappingRows.filter(function (row) {
    return !isUnassignedValue_(row['Account REP OPS']);
  }).length;
  const mappedAdvertiserRows = mappingRows.filter(function (row) {
    return !isUnassignedValue_(row['Advertiser']);
  }).length;
  const recentWarnings = runLogRows.filter(function (row) {
    return /WARNING|ERROR/i.test(String(row.Status || ''));
  }).slice(-50);

  const tableRows = [];
  addQualityRow_(tableRows, 'Run', 'Generated At', new Date(), 'Info', 'Dashboard trust snapshot generated during the latest rebuild.');
  addQualityRow_(tableRows, 'Sources', 'Configured Sources Ready', configStatus.readySources.length + ' / ' + configStatus.expectedSources.length, configStatus.needsConfiguration.length ? 'Watch' : 'Good', 'Enabled source config rows with spreadsheet ID and export tab.');
  addQualityRow_(tableRows, 'Sources', 'Invalid Source Config Rows', configStatus.invalidConfigKeys.length, configStatus.invalidConfigKeys.length ? 'Critical' : 'Good', configStatus.invalidConfigKeys.join(', '));

  configStatus.expectedSources.forEach(function (sourceName) {
    const configured = configStatus.readySources.indexOf(sourceName) >= 0;
    addQualityRow_(tableRows, 'Sources', sourceName + ' Ledger Rows', Number(rowsBySource[sourceName] || 0), configured && rowsBySource[sourceName] ? 'Good' : 'Watch', configured ? 'Configured source contribution in normalized ledger.' : 'Source is not fully configured.');
  });

  addQualityRow_(tableRows, 'Data Volume', 'Raw Imported Rows', rawRows.length, rawRows.length ? 'Good' : 'Watch', 'Rows currently in Data_Raw_Issue_Events.');
  addQualityRow_(tableRows, 'Data Volume', 'Normalized Ledger Rows', safeRows.length, safeRows.length ? 'Good' : 'Watch', 'Rows available to dashboards and scorecards.');
  addQualityRow_(tableRows, 'Data Volume', 'Unique Flagged Placements', countKeys_(uniquePlacementIds), countKeys_(uniquePlacementIds) ? 'Good' : 'Watch', 'One placement can have multiple issue events, but this counts placement IDs once.');

  addQualityRow_(tableRows, 'Baseline', 'Latest Live Snapshot Date', safeLiveCoverage.snapshotDate || 'N/A', safeLiveCoverage.snapshotDate ? 'Good' : 'Critical', 'Used as the live-placement denominator.');
  addQualityRow_(tableRows, 'Baseline', 'Total Live Placements', countKeys_(safeLiveCoverage.allLivePlacements || {}), countKeys_(safeLiveCoverage.allLivePlacements || {}) ? 'Good' : 'Critical', 'Live placement denominator from the latest baseline snapshot.');
  addQualityRow_(tableRows, 'Baseline', 'Baseline Rows Scanned', safeLiveCoverage.baselineRowsScanned || 0, safeLiveCoverage.baselineRowsScanned ? 'Good' : 'Watch', 'Rows scanned from Data_Baseline_Live_Placements.');

  addQualityRow_(tableRows, 'Mapping', 'Network Mapping Rows', mappingRows.length, mappingRows.length ? 'Good' : 'Critical', 'Rows available in Network_Mapping.');
  addQualityRow_(tableRows, 'Mapping', 'Rows With Rep Mapping', mappedRepRows + ' / ' + mappingRows.length, mappedRepRows === mappingRows.length ? 'Good' : 'Watch', 'Rows where Account REP OPS is not blank/unknown/unassigned.');
  addQualityRow_(tableRows, 'Mapping', 'Rows With Advertiser Mapping', mappedAdvertiserRows + ' / ' + mappingRows.length, mappedAdvertiserRows === mappingRows.length ? 'Good' : 'Watch', 'Rows where Advertiser is not blank/unknown/unassigned.');
  addQualityRow_(tableRows, 'Mapping', 'Ledger Rows With Unassigned Rep', unassignedReps, unassignedReps ? 'Watch' : 'Good', 'Normalized rows where Account REP OPS is blank/unknown/unassigned.');
  addQualityRow_(tableRows, 'Mapping', 'Ledger Rows With Unknown Advertiser', unknownAdvertisers, unknownAdvertisers ? 'Watch' : 'Good', 'Normalized rows where Advertiser is blank/unknown/unassigned.');

  addQualityRow_(tableRows, 'Ledger Completeness', 'Rows Missing Placement ID', blankPlacementIds, blankPlacementIds ? 'Watch' : 'Good', 'Placement ID is required for flagged-live scoring.');
  addQualityRow_(tableRows, 'Run Log', 'Recent Warnings / Errors', recentWarnings.length, recentWarnings.length ? 'Watch' : 'Good', 'Count of latest WARNING/ERROR rows retained in this quality snapshot.');

  clearAndWriteTable_(SHEETS.DATA_QUALITY, ['Category', 'Metric', 'Value', 'Status', 'Notes'], tableRows);
  formatDataQualitySheet_(tableRows.length);

  return {
    rows: tableRows.length,
    warnings: recentWarnings.length,
    unassignedReps: unassignedReps,
    unknownAdvertisers: unknownAdvertisers,
    blankPlacementIds: blankPlacementIds
  };
}

function buildLatestCampaignLiveCoverage_() {
  const rows = readTable_(SHEETS.CVI_DAILY_BASELINE);
  const byCampaign = {};

  if (!rows || !rows.length) {
    return { snapshotDate: '', byCampaign: byCampaign, baselineRowsScanned: 0, snapshotRowsScanned: 0 };
  }

  let latestSnapshotDate = '';
  rows.forEach(function (row) {
    const snapshotDate = normalizeSnapshotDate_(row['Snapshot Date']);
    if (snapshotDate && snapshotDate > latestSnapshotDate) {
      latestSnapshotDate = snapshotDate;
    }
  });

  if (!latestSnapshotDate) {
    return { snapshotDate: '', byCampaign: byCampaign, baselineRowsScanned: rows.length, snapshotRowsScanned: 0 };
  }

  let snapshotRowsScanned = 0;
  rows.forEach(function (row) {
    if (normalizeSnapshotDate_(row['Snapshot Date']) !== latestSnapshotDate) {
      return;
    }

    snapshotRowsScanned += 1;
    const campaign = String(row['Campaign'] || 'Unknown').trim() || 'Unknown';
    const key = campaign.toLowerCase();
    const placementId = String(row['Placement ID'] || '').trim();
    const advertiser = String(row['Advertiser'] || '').trim();

    if (!byCampaign[key]) {
      byCampaign[key] = {
        name: campaign,
        placements: {},
        advertisers: {}
      };
    }

    if (placementId) {
      byCampaign[key].placements[placementId] = true;
    }
    if (advertiser) {
      byCampaign[key].advertisers[advertiser] = true;
    }
  });

  Object.keys(byCampaign).forEach(function (key) {
    byCampaign[key].livePlacementCount = countKeys_(byCampaign[key].placements);
  });

  return {
    snapshotDate: latestSnapshotDate,
    byCampaign: byCampaign,
    baselineRowsScanned: rows.length,
    snapshotRowsScanned: snapshotRowsScanned
  };
}

function buildCampaignRateMetrics_(rows, campaignLiveCoverage) {
  const metricsByCampaign = {};
  const liveByCampaign = (campaignLiveCoverage && campaignLiveCoverage.byCampaign) || {};
  const model = getGradingModel_();

  (rows || []).forEach(function (row) {
    const advertiser = String(row['Advertiser'] || 'Unknown').trim() || 'Unknown';
    if (isExcludedForGrading_(advertiser)) {
      return;
    }

    const campaign = String(row['Campaign'] || 'Unknown').trim() || 'Unknown';
    const key = campaign.toLowerCase();
    const placementId = String(row['Placement ID'] || '').trim();
    const issueType = String(row['Issue Type'] || row['Issue Flags'] || 'Unknown').trim() || 'Unknown';
    const rep = String(row['Account REP OPS'] || 'Unassigned').trim() || 'Unassigned';
    const sourceProject = String(row['Source Project'] || 'Unknown').trim() || 'Unknown';
    const eventDate = formatIsoDateText_(row['Event Date']);

    if (!metricsByCampaign[key]) {
      metricsByCampaign[key] = {
        name: campaign,
        flaggedPlacementIds: {},
        issueEvents: 0,
        advertisers: {},
        reps: {},
        issueTypes: {},
        sourceProjects: {},
        lastEventDate: ''
      };
    }

    if (placementId) {
      metricsByCampaign[key].flaggedPlacementIds[placementId] = true;
    }
    metricsByCampaign[key].issueEvents += 1;
    metricsByCampaign[key].advertisers[advertiser] = (metricsByCampaign[key].advertisers[advertiser] || 0) + 1;
    metricsByCampaign[key].reps[rep] = (metricsByCampaign[key].reps[rep] || 0) + 1;
    metricsByCampaign[key].issueTypes[issueType] = (metricsByCampaign[key].issueTypes[issueType] || 0) + 1;
    metricsByCampaign[key].sourceProjects[sourceProject] = true;
    if (eventDate && eventDate > metricsByCampaign[key].lastEventDate) {
      metricsByCampaign[key].lastEventDate = eventDate;
    }
  });

  Object.keys(liveByCampaign).forEach(function (key) {
    if (!metricsByCampaign[key]) {
      metricsByCampaign[key] = {
        name: liveByCampaign[key].name,
        flaggedPlacementIds: {},
        issueEvents: 0,
        advertisers: liveByCampaign[key].advertisers || {},
        reps: {},
        issueTypes: {},
        sourceProjects: {},
        lastEventDate: ''
      };
    }
  });

  const rawMetrics = Object.keys(metricsByCampaign).map(function (key) {
    const item = metricsByCampaign[key];
    const liveInfo = liveByCampaign[key] || {};
    const totalLivePlacements = Number(liveInfo.livePlacementCount || 0);
    const flaggedPlacements = countKeys_(item.flaggedPlacementIds);
    const flaggedPct = totalLivePlacements > 0 ? (flaggedPlacements / totalLivePlacements) * 100 : null;

    item.totalLivePlacements = totalLivePlacements;
    item.flaggedPlacements = flaggedPlacements;
    item.flaggedPct = flaggedPct;
    item.confidence = calculateConfidenceLabel_(flaggedPlacements, totalLivePlacements, flaggedPlacements);
    return item;
  });

  const bands = buildDynamicBands_(rawMetrics);
  rawMetrics.forEach(function (item) {
    if (!item.totalLivePlacements) {
      item.grade = 'N/A';
    } else if (item.totalLivePlacements < model.minFullGradeLivePlacements) {
      item.grade = item.flaggedPct !== null && item.flaggedPct > model.monitorOverrideThreshold ? 'F' : 'Monitor';
    } else {
      item.grade = calculateDynamicGrade_(item.flaggedPct, bands);
    }
  });

  return rawMetrics;
}

function buildRepRateMetrics_(rows) {
  const flaggedByRep = {};
  const liveByRep = {};

  (rows || []).forEach(function (row) {
    const advertiser = String(row['Advertiser'] || 'Unknown').trim() || 'Unknown';
    if (isExcludedForGrading_(advertiser)) {
      return;
    }
    const placementId = String(row['Placement ID'] || '').trim();
    if (!placementId) return;

    getOwnerCoverageKeys_(row['Account REP OPS'] || 'Unassigned').forEach(function (repName) {
      if (!flaggedByRep[repName]) flaggedByRep[repName] = {};
      flaggedByRep[repName][placementId] = true;
    });
  });

  try {
    readLivePlacementPivotRows_().rows.forEach(function (row) {
      const advertiser = String(row.advertiser || '').trim();
      if (isExcludedForGrading_(advertiser)) {
        return;
      }
      const liveCount = Math.max(0, toNumberOrZero_(row.livePlacementCount));
      getOwnerCoverageKeys_(row.ownerOps || 'Unassigned').forEach(function (repName) {
        liveByRep[repName] = (liveByRep[repName] || 0) + liveCount;
      });
    });
  } catch (err) {
    logRun_('buildThresholds_', RUN_STATUS.WARNING, 'Rep live coverage unavailable for dynamic threshold preview', { error: String(err) });
  }

  return buildRateMetricsFromMaps_(flaggedByRep, liveByRep);
}

function buildAdvertiserRateMetrics_(rows) {
  const flaggedByAdvertiser = {};
  const liveByAdvertiser = {};

  (rows || []).forEach(function (row) {
    const advertiser = String(row['Advertiser'] || 'Unknown').trim() || 'Unknown';
    if (isExcludedForGrading_(advertiser)) {
      return;
    }
    const placementId = String(row['Placement ID'] || '').trim();
    if (!placementId) return;
    if (!flaggedByAdvertiser[advertiser]) flaggedByAdvertiser[advertiser] = {};
    flaggedByAdvertiser[advertiser][placementId] = true;
  });

  try {
    readLivePlacementPivotRows_().rows.forEach(function (row) {
      const advertiser = String(row.advertiser || 'Unknown').trim() || 'Unknown';
      if (isExcludedForGrading_(advertiser)) {
        return;
      }
      liveByAdvertiser[advertiser] = (liveByAdvertiser[advertiser] || 0) + Math.max(0, toNumberOrZero_(row.livePlacementCount));
    });
  } catch (err) {
    logRun_('buildThresholds_', RUN_STATUS.WARNING, 'Advertiser live coverage unavailable for dynamic threshold preview', { error: String(err) });
  }

  return buildRateMetricsFromMaps_(flaggedByAdvertiser, liveByAdvertiser);
}

function buildRateMetricsFromMaps_(flaggedMap, liveMap) {
  const names = {};
  Object.keys(flaggedMap || {}).forEach(function (name) { names[name] = true; });
  Object.keys(liveMap || {}).forEach(function (name) { names[name] = true; });

  return Object.keys(names).map(function (name) {
    const flaggedPlacements = countKeys_((flaggedMap || {})[name] || {});
    const totalLivePlacements = Number((liveMap || {})[name] || 0);
    return {
      name: name,
      flaggedPlacements: flaggedPlacements,
      totalLivePlacements: totalLivePlacements,
      flaggedPct: totalLivePlacements > 0 ? (flaggedPlacements / totalLivePlacements) * 100 : null
    };
  });
}

function appendDynamicThresholdRows_(tableRows, entityType, metrics) {
  const bands = buildDynamicBands_(metrics);
  const source = 'Current ' + entityType.toLowerCase() + ' distribution';
  const eligibleCount = (metrics || []).filter(function (item) {
    return item.flaggedPct !== null && item.flaggedPct !== undefined && !isNaN(item.flaggedPct) && item.totalLivePlacements > 0;
  }).length;

  tableRows.push([entityType, 'A', '0.00%', formatPercentValue_(bands.aMax), source, 'Best current band. Based on ' + eligibleCount + ' entities with live-placement coverage.']);
  tableRows.push([entityType, 'B', formatPercentValue_(bands.aMax), formatPercentValue_(bands.bMax), source, 'Better than current middle of pack.']);
  tableRows.push([entityType, 'C', formatPercentValue_(bands.bMax), formatPercentValue_(bands.cMax), source, 'Near current middle of pack.']);
  tableRows.push([entityType, 'D', formatPercentValue_(bands.cMax), formatPercentValue_(bands.dMax), source, 'Worse than current middle of pack.']);
  tableRows.push([entityType, 'F', formatPercentValue_(bands.dMax), '', source, 'Worst current risk band.']);
}

function buildDynamicBands_(metrics) {
  const values = (metrics || [])
    .map(function (item) { return item.flaggedPct; })
    .filter(function (value) {
      return value !== null && value !== undefined && !isNaN(value);
    })
    .sort(function (a, b) { return a - b; });

  if (!values.length) {
    return { aMax: 2, bMax: 4, cMax: 7, dMax: 10 };
  }

  return {
    aMax: percentileValue_(values, 20),
    bMax: percentileValue_(values, 40),
    cMax: percentileValue_(values, 60),
    dMax: percentileValue_(values, 80)
  };
}

function percentileValue_(sortedValues, percentile) {
  if (!sortedValues || !sortedValues.length) {
    return 0;
  }
  const idx = Math.min(sortedValues.length - 1, Math.max(0, Math.ceil((percentile / 100) * sortedValues.length) - 1));
  return Number(sortedValues[idx] || 0);
}

function calculateDynamicGrade_(flaggedPct, bands) {
  if (flaggedPct === null || flaggedPct === undefined || isNaN(flaggedPct)) return 'N/A';
  const safeBands = bands || { aMax: 2, bMax: 4, cMax: 7, dMax: 10 };
  if (flaggedPct <= safeBands.aMax) return 'A';
  if (flaggedPct <= safeBands.bMax) return 'B';
  if (flaggedPct <= safeBands.cMax) return 'C';
  if (flaggedPct <= safeBands.dMax) return 'D';
  return 'F';
}

function gradeSeverityRank_(grade) {
  const value = String(grade || '').trim();
  if (value === 'F') return 6;
  if (value === 'D') return 5;
  if (value === 'C') return 4;
  if (value === 'B') return 3;
  if (value === 'A') return 2;
  if (value === 'Monitor') return 1;
  return 0;
}

function topObjectKey_(obj) {
  let topKey = '';
  let topCount = -1;
  Object.keys(obj || {}).forEach(function (key) {
    const count = Number(obj[key] || 0);
    if (count > topCount) {
      topCount = count;
      topKey = key;
    }
  });
  return topKey;
}

function addQualityRow_(rows, category, metric, value, status, notes) {
  rows.push([category, metric, value, status || 'Info', notes || '']);
}

function formatIsoDateText_(value) {
  const dateObj = parseEventDateForCoverage_(value);
  if (!dateObj) return '';
  return Utilities.formatDate(dateObj, Session.getScriptTimeZone(), 'yyyy-MM-dd');
}

function formatCampaignScorecard_(rowCount, tableRows) {
  const sheet = getOrCreateSheet_(SHEETS.CAMPAIGN_GRADING);
  const colCount = 14;
  sheet.setFrozenRows(1);
  sheet.getRange(1, 1, 1, colCount)
    .setFontWeight('bold')
    .setBackground('#1f4e78')
    .setFontColor('#ffffff');

  for (var c = 1; c <= colCount; c++) {
    sheet.setColumnWidth(c, c === 2 ? 320 : c === 8 || c === 9 || c === 11 || c === 12 ? 220 : 145);
  }

  if (rowCount <= 0) return;
  const rowsData = tableRows || sheet.getRange(2, 1, rowCount, colCount).getValues();
  const gradeBackgrounds = [];
  const gradeFontColors = [];

  rowsData.forEach(function (row) {
    const grade = String(row[2] || '').trim();
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
  });

  sheet.getRange(2, 3, rowCount, 1).setBackgrounds(gradeBackgrounds).setFontColors(gradeFontColors);
  sheet.getRange(2, 1, rowCount, colCount).setFontSize(9);
}

function formatThresholdsSheet_(rowCount) {
  const sheet = getOrCreateSheet_(SHEETS.THRESHOLDS);
  const colCount = 6;
  sheet.setFrozenRows(1);
  sheet.getRange(1, 1, 1, colCount)
    .setFontWeight('bold')
    .setBackground('#1f4e78')
    .setFontColor('#ffffff');

  sheet.setColumnWidth(1, 160);
  sheet.setColumnWidth(2, 180);
  sheet.setColumnWidth(3, 150);
  sheet.setColumnWidth(4, 150);
  sheet.setColumnWidth(5, 220);
  sheet.setColumnWidth(6, 520);
  if (rowCount > 0) {
    sheet.getRange(2, 1, rowCount, colCount).setWrap(true).setFontSize(9);
  }
}

function formatDataQualitySheet_(rowCount) {
  const sheet = getOrCreateSheet_(SHEETS.DATA_QUALITY);
  const colCount = 5;
  sheet.setFrozenRows(1);
  sheet.getRange(1, 1, 1, colCount)
    .setFontWeight('bold')
    .setBackground('#1f4e78')
    .setFontColor('#ffffff');

  sheet.setColumnWidth(1, 150);
  sheet.setColumnWidth(2, 280);
  sheet.setColumnWidth(3, 180);
  sheet.setColumnWidth(4, 110);
  sheet.setColumnWidth(5, 520);

  if (rowCount <= 0) return;

  const values = sheet.getRange(2, 1, rowCount, colCount).getValues();
  values.forEach(function (row, idx) {
    const status = String(row[3] || '').trim();
    const rowNum = idx + 2;
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

  sheet.getRange(2, 1, rowCount, colCount).setWrap(true).setFontSize(9);
}
