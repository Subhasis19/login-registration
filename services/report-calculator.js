const { dbQuery } = require("../db");
const { getMonthDateRange } = require("../utils/date-range");

const REGIONS = ["A", "B", "C"];
const UNKNOWN_REGION = "Unknown";

function buildScope(month, year, office = "", group = "") {
  const { start, end } = getMonthDateRange(year, month);

  const inwardWhere = [
    "date_of_receipt >= ?",
    "date_of_receipt < ?",
  ];
  const outwardWhere = [
    "date_of_despatch >= ?",
    "date_of_despatch < ?",
  ];
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
    inwardParams,
    outwardParams,
    inwardWhereSql: inwardWhere.join(" AND "),
    outwardWhereSql: outwardWhere.join(" AND "),
  };
}

function getEmptyInwardByRegion() {
  return {
    receivedEnglish: 0,
    notExpected: 0,
    repliedHindi: 0,
    repliedEnglish: 0,
  };
}

function getEmptySection3Region() {
  return {
    hindi: 0,
    english: 0,
    total: 0,
    percent: 0,
  };
}

function normalizeNumber(value) {
  return Number(value) || 0;
}

function buildInwardByRegion(rowsInwardRegion, rowsOutwardReplyRegion) {
  const inwardByRegion = {
    A: getEmptyInwardByRegion(),
    B: getEmptyInwardByRegion(),
    C: getEmptyInwardByRegion(),
    [UNKNOWN_REGION]: getEmptyInwardByRegion(),
  };

  rowsInwardRegion.forEach((row) => {
    const region = row.region || UNKNOWN_REGION;
    inwardByRegion[region] = {
      ...getEmptyInwardByRegion(),
      receivedEnglish: normalizeNumber(row.receivedEnglish),
      notExpected: normalizeNumber(row.notExpected),
    };
  });

  rowsOutwardReplyRegion.forEach((row) => {
    const region = row.region || UNKNOWN_REGION;
    inwardByRegion[region] ||= getEmptyInwardByRegion();
    inwardByRegion[region].repliedHindi = normalizeNumber(row.repliedHindi);
    inwardByRegion[region].repliedEnglish = normalizeNumber(row.repliedEnglish);
  });

  return inwardByRegion;
}

function buildSection3ByRegion(rowsSection3) {
  const section3ByRegion = {
    A: getEmptySection3Region(),
    B: getEmptySection3Region(),
    C: getEmptySection3Region(),
    [UNKNOWN_REGION]: getEmptySection3Region(),
  };

  rowsSection3.forEach((row) => {
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
  const emailReceived = {
    A: { eng: 0, hin: 0 },
    B: { eng: 0, hin: 0 },
    C: { eng: 0, hin: 0 },
  };

  rows.forEach((row) => {
    if (!REGIONS.includes(row.region)) {
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
  const emailReplied = { A: 0, B: 0, C: 0 };

  rows.forEach((row) => {
    if (!REGIONS.includes(row.region)) {
      return;
    }

    emailReplied[row.region] = normalizeNumber(row.total);
  });

  return emailReplied;
}

async function fetchLetterMetrics(scope) {
  const queries = [
    dbQuery(
      `SELECT COUNT(*) AS cnt FROM inward_records WHERE ${scope.inwardWhereSql} AND language_of_document IN ('Hindi')`,
      scope.inwardParams
    ),
    dbQuery(
      `SELECT COUNT(*) AS cnt FROM outward_records WHERE ${scope.outwardWhereSql} AND reply_sent_in = 'Hindi'`,
      scope.outwardParams
    ),
    dbQuery(
      `SELECT COUNT(*) AS cnt FROM outward_records WHERE ${scope.outwardWhereSql} AND reply_sent_in = 'English'`,
      scope.outwardParams
    ),
    dbQuery(
      `SELECT COUNT(*) AS cnt FROM inward_records WHERE ${scope.inwardWhereSql} AND reply_required = 'No'`,
      scope.inwardParams
    ),
    dbQuery(
      `
        SELECT
          COALESCE(sender_region, '${UNKNOWN_REGION}') AS region,
          SUM(language_of_document = 'English') AS receivedEnglish,
          SUM(language_of_document = 'English' AND reply_required = 'No') AS notExpected
        FROM inward_records
        WHERE ${scope.inwardWhereSql}
        GROUP BY region
      `,
      scope.inwardParams
    ),
    dbQuery(
      `
        SELECT
          COALESCE(receiver_region, '${UNKNOWN_REGION}') AS region,
          SUM(language_of_document = 'English' AND reply_sent_in = 'Hindi') AS repliedHindi,
          SUM(language_of_document = 'English' AND reply_sent_in = 'English') AS repliedEnglish
        FROM outward_records
        WHERE ${scope.outwardWhereSql}
        GROUP BY region
      `,
      scope.outwardParams
    ),
    dbQuery(
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
    ),
    dbQuery(
      `SELECT COUNT(*) AS cnt FROM inward_records WHERE ${scope.inwardWhereSql}`,
      scope.inwardParams
    ),
    dbQuery(
      `SELECT COUNT(*) AS cnt FROM outward_records WHERE ${scope.outwardWhereSql}`,
      scope.outwardParams
    ),
  ];

  const [
    rowsHindi,
    rowsReplyHindi,
    rowsReplyEnglish,
    rowsNotExpected,
    rowsInwardRegion,
    rowsOutwardReplyRegion,
    rowsSection3,
    totalInward,
    totalOutward,
  ] = await Promise.all(queries);

  return {
    lettersReceivedHindi: normalizeNumber(rowsHindi[0]?.cnt),
    repliesSentHindi: normalizeNumber(rowsReplyHindi[0]?.cnt),
    repliesSentEnglish: normalizeNumber(rowsReplyEnglish[0]?.cnt),
    notExpectedTotal: normalizeNumber(rowsNotExpected[0]?.cnt),
    inwardByRegion: buildInwardByRegion(rowsInwardRegion, rowsOutwardReplyRegion),
    section3ByRegion: buildSection3ByRegion(rowsSection3),
    totalInwards: normalizeNumber(totalInward[0]?.cnt),
    totalOutwards: normalizeNumber(totalOutward[0]?.cnt),
  };
}

async function fetchEmailMetrics(scope) {
  const groupClause = scope.group ? "AND group_name = ?" : "";
  const groupParams = scope.group ? [scope.group] : [];

  const [emailReceivedRows, emailRepliedRows] = await Promise.all([
    dbQuery(
      `
        SELECT region, SUM(total_english) AS eng, SUM(total_hindi) AS hin
        FROM email_records
        WHERE month = ? AND year = ? ${groupClause} AND entry_type = 'Received'
        GROUP BY region
      `,
      [scope.month, scope.year, ...groupParams]
    ),
    dbQuery(
      `
        SELECT region, SUM(total_hindi) AS total
        FROM email_records
        WHERE month = ? AND year = ? ${groupClause} AND entry_type = 'Replied'
        GROUP BY region
      `,
      [scope.month, scope.year, ...groupParams]
    ),
  ]);

  return {
    emailReceived: buildEmailReceived(emailReceivedRows),
    emailReplied: buildEmailReplied(emailRepliedRows),
  };
}

async function fetchNotingsMetrics(scope) {
  const groupClause = scope.group ? "AND group_name = ?" : "";
  const params = scope.group
    ? [scope.month, scope.year, scope.group]
    : [scope.month, scope.year];

  const rows = await dbQuery(
    `
      SELECT
        COALESCE(SUM(notings_hindi_pages), 0) AS totalHindi,
        COALESCE(SUM(notings_english_pages), 0) AS totalEnglish,
        COALESCE(SUM(eoffice_comments), 0) AS totalComments
      FROM notings_records
      WHERE month = ? AND year = ? ${groupClause}
    `,
    params
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

  const [letterMetrics, emailMetrics, notingsMetrics, signatory] = await Promise.all([
    fetchLetterMetrics(scope),
    fetchEmailMetrics(scope),
    fetchNotingsMetrics(scope),
    fetchReportSignatory(group),
  ]);

  return {
    ...letterMetrics,
    ...emailMetrics,
    ...notingsMetrics,
    ...signatory,
  };
}

module.exports = {
  calculateReportData,
};
