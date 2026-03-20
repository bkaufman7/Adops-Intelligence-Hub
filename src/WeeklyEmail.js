function runWeeklySummaryEmail() {
  return withRunLogging_('runWeeklySummaryEmail', function () {
    const recipients = getWeeklyRecipients_();
    if (!recipients) {
      throw new Error('No weekly recipients found. Add emails to Weekly_Recipients column A or set weekly_recipients in Config.');
    }

    const systemSummary = readTable_(SHEETS.SUMMARY_BY_SYSTEM).slice(0, 10);
    const networkSummary = readTable_(SHEETS.SUMMARY_BY_NETWORK).slice(0, 10);
    const issueSummary = readTable_(SHEETS.SUMMARY_BY_ISSUE_TYPE).slice(0, 10);

    const subject = 'AdOps Intelligence Hub - Weekly Summary - ' + Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM-dd');
    const htmlBody = buildWeeklyEmailHtml_(systemSummary, networkSummary, issueSummary);

    MailApp.sendEmail({
      to: recipients,
      subject: subject,
      htmlBody: htmlBody
    });

    return { recipients: recipients, subject: subject };
  });
}

function getWeeklyRecipients_() {
  const rows = readTable_(SHEETS.WEEKLY_RECIPIENTS);
  const fromSheet = rows
    .map(function (r) { return String(r['Recipient Email'] || '').trim(); })
    .filter(function (email) { return !!email; })
    .join(',');

  if (fromSheet) {
    return fromSheet;
  }

  return String(getConfigValue_(CONFIG_KEYS.WEEKLY_RECIPIENTS, '') || '').trim();
}

function buildWeeklyEmailHtml_(systemSummary, networkSummary, issueSummary) {
  return [
    '<h2>AdOps Intelligence Hub - Weekly Summary</h2>',
    '<p>This email is summary-focused. Event-level detail is available in sheets and optional Drive exports.</p>',
    '<h3>System Activity</h3>',
    tableHtml_(systemSummary, ['Source System', 'Issue Count']),
    '<h3>Top Networks / Clients</h3>',
    tableHtml_(networkSummary, ['Network Name', 'Issue Count']),
    '<h3>Issue Type Breakdown</h3>',
    tableHtml_(issueSummary, ['Issue Flags', 'Issue Count'])
  ].join('');
}

function tableHtml_(rows, columns) {
  const head = '<tr>' + columns.map(function (c) { return '<th style="text-align:left;padding:4px;">' + c + '</th>'; }).join('') + '</tr>';
  const body = (rows || []).map(function (row) {
    return '<tr>' + columns.map(function (c) { return '<td style="padding:4px;border-top:1px solid #ddd;">' + (row[c] || '') + '</td>'; }).join('') + '</tr>';
  }).join('');
  return '<table style="border-collapse:collapse;font-family:Arial,sans-serif;font-size:12px;">' + head + body + '</table>';
}
