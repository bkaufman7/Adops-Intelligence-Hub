function buildTrends_() {
  return withRunLogging_('buildTrends_', function () {
    const rows = readTable_(SHEETS.NORMALIZED_LEDGER);
    buildDailyTrend_(rows);
    buildWeeklyTrend_(rows);
    buildMonthlyTrend_(rows);
    buildAllTimeTrend_(rows);
    return { normalizedRows: rows.length };
  });
}

function buildDailyTrend_(rows) {
  const grouped = {};
  rows.forEach(function (row) {
    const day = formatTrendDay_(row['Event Date']);
    const sourceProject = row['Source Project'] || 'Unknown';
    const key = [day, sourceProject].join('||');
    const placementId = String(row['Placement ID'] || '').trim();

    if (!grouped[key]) {
      grouped[key] = {
        issueCount: 0,
        placements: {}
      };
    }

    grouped[key].issueCount += 1;
    if (placementId) {
      grouped[key].placements[placementId] = true;
    }
  });

  const out = Object.keys(grouped).sort().map(function (key) {
    const parts = key.split('||');
    return [parts[0], parts[1], grouped[key].issueCount, countKeys_(grouped[key].placements)];
  });

  clearAndWriteTable_(SHEETS.TREND_DAILY, ['Event Date', 'Source Project', 'Issue Count', 'Unique Flagged Placements'], out);
}

function buildWeeklyTrend_(rows) {
  const grouped = {};
  rows.forEach(function (row) {
    const week = formatTrendWeek_(row['Event Date']);
    const key = [week, row['Source Project'] || 'Unknown'].join('||');
    grouped[key] = (grouped[key] || 0) + 1;
  });

  const out = Object.keys(grouped).sort().map(function (key) {
    const parts = key.split('||');
    return [parts[0], parts[1], grouped[key]];
  });

  clearAndWriteTable_(SHEETS.TREND_WEEKLY, ['Event Week', 'Source Project', 'Issue Count'], out);
}

function buildMonthlyTrend_(rows) {
  const grouped = {};
  rows.forEach(function (row) {
    const month = formatTrendMonth_(row['Event Date']);
    const key = [month, row['Source Project'] || 'Unknown'].join('||');
    grouped[key] = (grouped[key] || 0) + 1;
  });

  const out = Object.keys(grouped).sort().map(function (key) {
    const parts = key.split('||');
    return [parts[0], parts[1], grouped[key]];
  });

  clearAndWriteTable_(SHEETS.TREND_MONTHLY, ['Event Month', 'Source Project', 'Issue Count'], out);
}

function buildAllTimeTrend_(rows) {
  const grouped = {};
  rows.forEach(function (row) {
    const sourceProject = row['Source Project'] || 'Unknown';
    if (!grouped[sourceProject]) {
      grouped[sourceProject] = {
        issueCount: 0,
        placements: {},
        advertisers: {},
        campaigns: {},
        reps: {}
      };
    }

    grouped[sourceProject].issueCount += 1;

    const placementId = String(row['Placement ID'] || '').trim();
    if (placementId) grouped[sourceProject].placements[placementId] = true;

    const advertiser = String(row['Advertiser'] || '').trim();
    if (advertiser) grouped[sourceProject].advertisers[advertiser] = true;

    const campaign = String(row['Campaign'] || '').trim();
    if (campaign) grouped[sourceProject].campaigns[campaign] = true;

    const rep = String(row['Account REP OPS'] || '').trim();
    if (rep) grouped[sourceProject].reps[rep] = true;
  });

  const total = {
    issueCount: 0,
    placements: {},
    advertisers: {},
    campaigns: {},
    reps: {}
  };

  const out = Object.keys(grouped).sort().map(function (sourceProject) {
    const item = grouped[sourceProject];
    total.issueCount += item.issueCount;
    mergeKeyMap_(total.placements, item.placements);
    mergeKeyMap_(total.advertisers, item.advertisers);
    mergeKeyMap_(total.campaigns, item.campaigns);
    mergeKeyMap_(total.reps, item.reps);

    return [
      'Source',
      sourceProject,
      item.issueCount,
      countKeys_(item.placements),
      countKeys_(item.advertisers),
      countKeys_(item.campaigns),
      countKeys_(item.reps)
    ];
  });

  out.unshift([
    'Agency Total',
    'All Sources',
    total.issueCount,
    countKeys_(total.placements),
    countKeys_(total.advertisers),
    countKeys_(total.campaigns),
    countKeys_(total.reps)
  ]);

  clearAndWriteTable_(SHEETS.TREND_ALL_TIME, ['Scope', 'Source Project', 'Issue Count', 'Unique Flagged Placements', 'Unique Advertisers', 'Unique Campaigns', 'Unique Reps'], out);
}

function formatTrendDay_(value) {
  const dateObj = new Date(value);
  if (isNaN(dateObj.getTime())) {
    return '';
  }
  return Utilities.formatDate(dateObj, Session.getScriptTimeZone(), 'yyyy-MM-dd');
}

function formatTrendWeek_(value) {
  const dateObj = new Date(value);
  if (isNaN(dateObj.getTime())) {
    return '';
  }
  const tmp = new Date(Date.UTC(dateObj.getFullYear(), dateObj.getMonth(), dateObj.getDate()));
  const dayNum = tmp.getUTCDay() || 7;
  tmp.setUTCDate(tmp.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(tmp.getUTCFullYear(), 0, 1));
  const weekNo = Math.ceil((((tmp - yearStart) / 86400000) + 1) / 7);
  return tmp.getUTCFullYear() + '-W' + ('0' + weekNo).slice(-2);
}

function formatTrendMonth_(value) {
  const dateObj = new Date(value);
  if (isNaN(dateObj.getTime())) {
    return '';
  }
  return Utilities.formatDate(dateObj, Session.getScriptTimeZone(), 'yyyy-MM');
}

function mergeKeyMap_(target, source) {
  Object.keys(source || {}).forEach(function (key) {
    target[key] = true;
  });
}
