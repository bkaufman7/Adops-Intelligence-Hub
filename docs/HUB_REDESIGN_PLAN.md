# AdOps Intelligence Hub Redesign Plan

## Product Direction

The Hub should become a presentation-ready reporting dashboard for Ben and leadership. The workbook does not need to support broad self-service use by many operators. Its job is to make agency health, rep workload, advertiser health, and campaign/account error rates easy to explain from a single source of truth.

Primary users:
- Ben as owner, operator, and presenter
- Leadership during guided reviews

Primary purpose:
- Agency pulse check
- Rep workload and error-rate visibility
- Advertiser/account scorecards
- Campaign-level risk visibility
- Source-aware reporting across all projects flowing into the Hub

Not a priority:
- Manual workflow tracking
- Shared action queues
- Rep/operator self-service
- Heavy operational task management

## Core Questions The Hub Should Answer

1. How healthy is the agency overall right now?
2. Which reps have the highest workload and/or highest error rate?
3. Which advertisers/accounts are currently highest risk?
4. Which campaigns are driving the most issues?
5. Which networks are repeatedly associated with issues?
6. Are issues improving or worsening daily, weekly, monthly, and all-time?
7. Are data sources, mapping, and baseline coverage healthy enough to trust the report?

## Target Workbook Views

### 1. Mission Control

Audience: Ben and leadership.

Purpose: First-stop agency pulse check.

Should show:
- Latest refresh timestamp
- Source freshness by project
- Total live placements
- Flagged live placements
- Agency flagged-live percentage
- Overall health grade
- Top 5 reps by risk
- Top 5 advertisers by risk
- Top 5 campaigns by risk
- Top issue types
- Mapping/data quality warnings
- Trend summary: daily, weekly, monthly, all-time

This should replace the scattered feeling of the current workbook. If leadership only sees one tab, this should be the tab.

### 2. Leadership View

Audience: leadership during presentation.

Purpose: Clean, summarized story view.

Should show:
- Agency grade and status
- Biggest changes since last period
- Top risk areas
- Best-performing / healthiest areas
- Current agency trend
- Short narrative-style highlights

This should be cleaner than the current `Leadership_Briefing_View` and less technical than Mission Control.

### 3. Rep Scorecard

Audience: Ben and leadership.

Purpose: Explain rep workload and error-rate performance.

Keep and improve current `Scorecard_Reps`.

Should show:
- Rep
- Grade
- Total live placements / workload
- Flagged live placements
- Flagged-live %
- Adjusted/dynamic score
- Confidence
- Advertiser count
- Campaign count if available
- Change versus prior day/week/month

Important: Sort in a way that helps presentation, not just highest issue count. Recommended sort:
1. High-risk reps
2. High workload with above-average error rate
3. Lower-risk reps
4. Unassigned / missing mapping

### 4. Advertiser Scorecard

Audience: Ben and leadership.

Purpose: Explain client/account health.

Keep and improve current `Scorecard_Advertisers`.

Should show:
- Advertiser
- Grade
- Rep / owner
- Total live placements
- Flagged live placements
- Flagged-live %
- Campaign count
- Top campaign by issues
- Change versus prior day/week/month
- Confidence

### 5. Campaign Scorecard

Audience: Ben and leadership.

Purpose: Surface campaign-level risk, since campaigns are one of the main entities to rank.

New tab recommended.

Should show:
- Campaign
- Advertiser
- Rep / owner
- Live placement count if available
- Flagged placements
- Issue count
- Flagged-live % if denominator exists
- Top issue type
- Source project(s)
- Trend movement

If a reliable campaign denominator is not available yet, use a diagnostic score first and label it clearly.

### 6. Network Scorecard

Audience: Ben and leadership, secondary.

Purpose: Network-level visibility, but not the main performance grade.

Keep only if cleaned up visually. Current network grading is diagnostic, not primary performance scoring.

Should show:
- Network
- Advertiser count
- Campaign count
- Flagged placements
- Issue count
- Top issue type
- Source project(s)
- Trend movement

### 7. Thresholds / Scoring Model

Audience: Ben/admin.

Purpose: Make scoring transparent and adjustable.

New tab recommended.

Because starting thresholds are unknown, use the incoming data to create dynamic bands. Recommended first model:
- Use rolling current data distribution.
- Compute percentile bands for reps, advertisers, and campaigns.
- Show both raw rate and adjusted score.
- Keep minimum-volume rules so tiny samples do not overreact.

Initial dynamic scale idea:
- A: at or better than strong-performance percentile
- B: better than agency average
- C: near agency average
- D: worse than agency average
- F: worst-risk tier

The exact percentile cutoffs should live in the Thresholds tab so they can be tuned after seeing real output.

### 8. Trends

Audience: Ben and leadership.

Purpose: Show daily, weekly, monthly, and all-time movement.

Current weekly/monthly trends are useful but too thin by themselves.

Recommended trend outputs:
- Daily agency flagged-live %
- Weekly agency flagged-live %
- Monthly agency flagged-live %
- All-time cumulative view
- Rep trend movement
- Advertiser trend movement
- Campaign trend movement

### 9. Data Quality

Audience: Ben/admin, visible but not front-and-center.

Purpose: Tell whether the dashboard can be trusted.

Should show:
- Source import status
- Source row counts
- Last successful refresh by source
- Mapping completeness
- Unassigned reps
- Unknown advertisers
- Missing placement IDs
- Baseline availability
- Run errors/warnings

This is more useful than a broad action queue because the workbook is mainly for reporting and presentation.

## Tab Keep / Improve / Remove Proposal

Keep and improve:
- `Mission_Control`
- `Leadership_Briefing_View`
- `Scorecard_Reps`
- `Scorecard_Advertisers`
- `Scorecard_Networks`, only if reframed as diagnostic/network view
- `Trend_Weekly_Monitor`
- `Trend_Monthly_Monitor`
- `Ops_Unmapped_Entities`, likely folded into Data Quality
- `Run_Log`
- `Config`
- `Network_Mapping`
- `Data_Raw_Issue_Events`
- `Data_Normalized_Ledger`
- `Data_Baseline_Live_Placements`

Add:
- `Scorecard_Campaigns`
- `Thresholds`
- `Data_Quality`
- `Trend_Daily_Monitor`
- Optional `Trend_All_Time`

Remove or stop creating unless a clear use is found:
- `Risk_Billing_Meter`
- `Risk_Top_Movers`
- `Workload_Rep_Leaderboard`
- `Distribution_Advertiser_Grades`
- `Heatmap_Network_Health`
- `Pipeline_Health_Status`, replace with cleaner `Data_Quality`
- `Ops_Owner_Action_Queue`
- `Weekly_Recipients`, unless weekly email stays
- `Project_Accounts`, unless useful as reference
- `Backfill_Control`, unless historical backfill remains actively used
- `UI_Control`, unless a specific control use is added
- `Tab_Legend`, unless still useful after cleanup
- Old archived/legacy tab names

## Menu Cleanup Proposal

The menu should assume Ben is the primary user. It should be short, practical, and organized around real workflows.

Recommended menu:

1. Refresh / Rebuild
   - Refresh Baseline + Full Refresh
   - Refresh Source Data Only
   - Refresh Network Mapping
   - Rebuild Dashboards / Scorecards

2. Open Views
   - Open Mission Control
   - Open Leadership View
   - Open Rep Scorecard
   - Open Advertiser Scorecard
   - Open Campaign Scorecard
   - Open Thresholds
   - Open Data Quality

3. Admin
   - Configure Daily Refresh
   - Remove Daily Refresh
   - Export Full Data Snapshot
   - Export Audit Detail
   - Initialize / Repair Workbook
   - Organize Tabs

Remove from main menu:
- Separate manual continuation functions
- Historical backfill actions unless still needed
- Old presentation/open actions for tabs being removed
- Issue type mode toggle unless still actively used
- Workspace migration/archive actions after cleanup is complete

## Code Cleanup Targets

Likely cleanup areas after the plan is approved:

1. `SetupSheets.js`
   - Stop seeding placeholder tabs that are not part of the new product.
   - Add new target tabs.
   - Update tab ordering and colors.

2. `Menu.js`
   - Replace long menu with the simplified grouped menu.
   - Add open functions for new core views.
   - Remove visible menu items for old or internal-only continuation steps.

3. `Constants.js`
   - Remove unused sheet constants after confirmed removal.
   - Add constants for Campaign Scorecard, Thresholds, Data Quality, Daily Trend.

4. `SummaryBuilders.js`
   - Redesign Mission Control and Leadership View.
   - Add cleaner data quality summary inputs.

5. `RepGradingService.js`
   - Preserve current useful grading logic.
   - Make threshold/model settings visible in the Thresholds tab.
   - Add trend/change columns.

6. New or existing scorecard builder
   - Add Campaign Scorecard.
   - Consider separating scorecard building into clearer modules if the current files get too large.

7. `WeeklyEmail.js`
   - Decide whether to keep. If presentation is manual and email is not used, remove from menu and later remove code.

8. `BackfillService.js`
   - Decide whether historical backfill is still active. If not, remove from menu first, then code later.

## Build Phases

### Phase 1: Product Cleanup Plan

Create this plan, confirm final tab list, confirm final menu list, and decide which old features are truly retired.

### Phase 2: Workbook Surface Cleanup

Update constants, setup, tab ordering, and menu so the workbook reflects the new product shape.

### Phase 3: Better Dashboards

Redesign:
- Mission Control
- Leadership View
- Rep Scorecard
- Advertiser Scorecard
- Data Quality

### Phase 4: New Analytics

Add:
- Campaign Scorecard
- Thresholds / dynamic scoring tab
- Daily trend
- Period-over-period movement

### Phase 5: Code Removal

After the new surfaces are stable, remove old unused functions and tabs. Do this last so useful old logic is not accidentally lost before replacement outputs exist.

## Open Decisions

1. Should weekly email remain?
2. Should historical backfill remain?
3. Should issue type clean/raw mode remain?
4. Should network grading stay as a separate visible scorecard or be folded into Mission Control/Data Quality?
5. Should raw data tabs stay visible at the far right, or visible but grouped after all dashboard tabs?
6. What exact dynamic threshold percentile bands should be used after the first data review?
