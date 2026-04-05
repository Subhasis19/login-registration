const { dbQuery } = require("../db");
const { getMonthDateRange } = require("../utils/date-range");

const REGIONS = ["A", "B", "C"];
const UNKNOWN_REGION = "Unknown";

function buildScope(month, year, office = "", group = "") {
  const { start, end } = getMonthDateRange(year, month);

  const inwardWhere = ["date_of_receipt >= ?", "date_of_receipt < ?"];
  const outwardWhere = ["date_of_despatch >= ?", "date_of_despatch < ?"];
  const inwardParams = [start, end];
  const outwardParams = [start, end];

  if (office) {
    inwardWhere.push("received_in = ?");
    outwardWhere.push("reply_from = ?");
    inwardParams.push(office);
    outwardParams.push(office);
  }

  if (group) {
    inwardWhere.push("group_name = ?");
    outwardWhere.push("group_name = ?");
    inwardParams.push(group);
    outwardParams.push(group);
  }

  return {
    month,
    year,
    group,
    inwardWhereSql: inwardWhere.join(" AND "),
    outwardWhereSql: outwardWhere.join(" AND "),
    inwardParams,
    outwardParams,
  };
}

function normalizeNumber(value) {
  return Number(value) || 0;
}

function readCount(rows) {
  return normalizeNumber(rows[0]?.cnt);
}

function createRegionMap(createValue, includeUnknown = false) {
  const regions = includeUnknown ? [...REGIONS, UNKNOWN_REGION] : REGIONS;
  return Object.fromEntries(regions.map((region) => [region, createValue()]));
}

function createSection2Region() {
  return {
    receivedEnglish: 0,
    notExpected: 0,
    repliedHindi: 0,
    repliedEnglish: 0,
  };
}

function createSection3Region() {
  return {
    hindi: 0,
    english: 0,
    total: 0,
    percent: 0,
  };
}

function createEmailReceivedRegion() {
  return {
    eng: 0,
    hin: 0,
  };
}

function isKnownRegion(region) {
  return REGIONS.includes(region);
}

function buildMonthlyGroupFilter(scope) {
  return {
    groupClause: scope.group ? "AND group_name = ?" : "",
    params: scope.group
      ? [scope.month, scope.year, scope.group]
      : [scope.month, scope.year],
  };
}

function buildSection2ByRegion(rows) {
  const inwardByRegion = createRegionMap(createSection2Region, true);

  rows.forEach((row) => {
    const region = row.region || UNKNOWN_REGION;
    inwardByRegion[region] = {
      receivedEnglish: normalizeNumber(row.receivedEnglish),
      notExpected: normalizeNumber(row.notExpected),
      repliedHindi: normalizeNumber(row.repliedHindi),
      repliedEnglish: normalizeNumber(row.repliedEnglish),
    };
  });

  return inwardByRegion;
}

function buildSection3ByRegion(rows) {
  const section3ByRegion = createRegionMap(createSection3Region, true);

  rows.forEach((row) => {
    const region = row.region || UNKNOWN_REGION;
    const hindi = normalizeNumber(row.hindiPlusBilingual);
    const english = normalizeNumber(row.english);
    const total = hindi + english;

    section3ByRegion[region] = {
      hindi,
      english,
      total,
      percent: total ? Math.round((hindi / total) * 100) : 0,
    };
  });

  return section3ByRegion;
}

function buildEmailReceived(rows) {
  const emailReceived = createRegionMap(createEmailReceivedRegion);

  rows.forEach((row) => {
    if (!isKnownRegion(row.region)) {
      return;
    }

    emailReceived[row.region] = {
      eng: normalizeNumber(row.eng),
      hin: normalizeNumber(row.hin),
    };
  });

  return emailReceived;
}

function buildEmailReplied(rows) {
  const emailReplied = Object.fromEntries(REGIONS.map((region) => [region, 0]));

  rows.forEach((row) => {
    if (!isKnownRegion(row.region)) {
      return;
    }

    emailReplied[row.region] = normalizeNumber(row.total);
  });

  return emailReplied;
}

function queryScopedCount(tableName, whereSql, params, predicateSql) {
  return dbQuery(
    `SELECT COUNT(*) AS cnt FROM ${tableName} WHERE ${whereSql} AND ${predicateSql}`,
    params
  );
}

function queryTotalCount(tableName, whereSql, params) {
  return dbQuery(`SELECT COUNT(*) AS cnt FROM ${tableName} WHERE ${whereSql}`, params);
}

async function fetchSection1Metrics(scope) {
  const [rowsHindi, rowsNotExpected, rowsReplyHindi, rowsReplyEnglish] =
    await Promise.all([
      queryScopedCount(
        "inward_records",
        scope.inwardWhereSql,
        scope.inwardParams,
        "language_of_document = 'Hindi'"
      ),
      queryScopedCount(
        "inward_records",
        scope.inwardWhereSql,
        scope.inwardParams,
        "reply_required = 'No'"
      ),
      queryScopedCount(
        "inward_records",
        scope.inwardWhereSql,
        scope.inwardParams,
        "reply_sent_in = 'Hindi'"
      ),
      queryScopedCount(
        "inward_records",
        scope.inwardWhereSql,
        scope.inwardParams,
        "reply_sent_in = 'English'"
      ),
    ]);

  return {
    lettersReceivedHindi: readCount(rowsHindi),
    notExpectedTotal: readCount(rowsNotExpected),
    repliesSentHindi: readCount(rowsReplyHindi),
    repliesSentEnglish: readCount(rowsReplyEnglish),
  };
}

async function fetchSection2AndSummaryMetrics(scope) {
  const [rowsByRegion, totalInwardRows, totalOutwardRows] = await Promise.all([
    dbQuery(
      `
        SELECT
          COALESCE(sender_region, '${UNKNOWN_REGION}') AS region,
          SUM(language_of_document = 'English') AS receivedEnglish,
          SUM(language_of_document = 'English' AND reply_required = 'No') AS notExpected,
          SUM(language_of_document = 'English' AND reply_sent_in = 'Hindi') AS repliedHindi,
          SUM(language_of_document = 'English' AND reply_sent_in = 'English') AS repliedEnglish
        FROM inward_records
        WHERE ${scope.inwardWhereSql}
        GROUP BY region
      `,
      scope.inwardParams
    ),
    queryTotalCount("inward_records", scope.inwardWhereSql, scope.inwardParams),
    queryTotalCount("outward_records", scope.outwardWhereSql, scope.outwardParams),
  ]);

  return {
    inwardByRegion: buildSection2ByRegion(rowsByRegion),
    totalInwards: readCount(totalInwardRows),
    totalOutwards: readCount(totalOutwardRows),
  };
}

async function fetchSection3Metrics(scope) {
  const rowsSection3 = await dbQuery(
    `
      SELECT
        COALESCE(sender_region, '${UNKNOWN_REGION}') AS region,
        SUM(language_of_document IN ('Hindi','Bilingual')) AS hindiPlusBilingual,
        SUM(language_of_document = 'English') AS english
      FROM inward_records
      WHERE ${scope.inwardWhereSql}
      GROUP BY region
    `,
    scope.inwardParams
  );

  return {
    section3ByRegion: buildSection3ByRegion(rowsSection3),
  };
}

async function fetchEmailMetrics(scope) {
  const monthlyGroupFilter = buildMonthlyGroupFilter(scope);

  const [emailReceivedRows, emailRepliedRows] = await Promise.all([
    dbQuery(
      `
        SELECT region, SUM(total_english) AS eng, SUM(total_hindi) AS hin
        FROM email_records
        WHERE month = ? AND year = ? ${monthlyGroupFilter.groupClause} AND entry_type = 'Received'
        GROUP BY region
      `,
      monthlyGroupFilter.params
    ),
    dbQuery(
      `
        SELECT region, SUM(total_hindi) AS total
        FROM email_records
        WHERE month = ? AND year = ? ${monthlyGroupFilter.groupClause} AND entry_type = 'Replied'
        GROUP BY region
      `,
      monthlyGroupFilter.params
    ),
  ]);

  return {
    emailReceived: buildEmailReceived(emailReceivedRows),
    emailReplied: buildEmailReplied(emailRepliedRows),
  };
}

async function fetchNotingsMetrics(scope) {
  const monthlyGroupFilter = buildMonthlyGroupFilter(scope);

  const rows = await dbQuery(
    `
      SELECT
        COALESCE(SUM(notings_hindi_pages), 0) AS totalHindi,
        COALESCE(SUM(notings_english_pages), 0) AS totalEnglish,
        COALESCE(SUM(eoffice_comments), 0) AS totalComments
      FROM notings_records
      WHERE month = ? AND year = ? ${monthlyGroupFilter.groupClause}
    `,
    monthlyGroupFilter.params
  );

  return {
    notingsHindi: normalizeNumber(rows[0]?.totalHindi),
    notingsEnglish: normalizeNumber(rows[0]?.totalEnglish),
    notingsEoffice: normalizeNumber(rows[0]?.totalComments),
  };
}

async function fetchReportSignatory(group) {
  if (group) {
    const rows = await dbQuery(
      "SELECT name, group_name FROM users WHERE group_name = ? LIMIT 1",
      [group]
    );

    return {
      groupName: rows[0]?.group_name || "",
      groupHeadName: rows[0]?.name || "",
    };
  }

  const rows = await dbQuery(
    "SELECT name, group_name FROM users WHERE role = 'admin' LIMIT 1"
  );

  return {
    groupName: rows[0]?.group_name || "",
    groupHeadName: rows[0]?.name || "",
  };
}

async function calculateReportData(month, year, office = "", group = "") {
  const scope = buildScope(month, year, office, group);

  const [
    section1Metrics,
    section2AndSummaryMetrics,
    section3Metrics,
    emailMetrics,
    notingsMetrics,
    signatory,
  ] = await Promise.all([
    fetchSection1Metrics(scope),
    fetchSection2AndSummaryMetrics(scope),
    fetchSection3Metrics(scope),
    fetchEmailMetrics(scope),
    fetchNotingsMetrics(scope),
    fetchReportSignatory(group),
  ]);

  return {
    ...section1Metrics,
    ...section2AndSummaryMetrics,
    ...section3Metrics,
    ...emailMetrics,
    ...notingsMetrics,
    ...signatory,
  };
}

module.exports = {
  calculateReportData,
};
