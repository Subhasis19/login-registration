const express = require("express");
const router = express.Router();
const path = require("path");
const { dbQuery } = require("../db");
const { requireLogin } = require("../middlewares/authMiddleware");
const { getMonthDateRange } = require("../utils/date-range");

router.get("/dashboard.html", requireLogin, (req, res) => {
  res.sendFile(path.join(__dirname, "../frontend/dashboard.html"));
});

router.get("/dashboard/summary", requireLogin, async (req, res) => {
  try {
    const { month, year } = req.query;

    let start = null;
    let end = null;

    if (month && year) {
      const range = getMonthDateRange(Number(year), Number(month));
      start = range.start;
      end = range.end;
    }

    let inwardRows = [];
    let outwardRows = [];
    let totalInwards = 0;
    let totalOutwards = 0;
    let repliesPending = 0;

    if (start && end) {
  
      let inwardSql = `
        SELECT
          i.*,
          o.s_no AS has_outward
        FROM inward_records i
        LEFT JOIN outward_records o
          ON i.s_no = o.inward_s_no
        WHERE i.date_of_receipt >= ? AND i.date_of_receipt < ?
        ORDER BY i.s_no DESC
      `;
      let outwardSql = `
        SELECT *
        FROM outward_records
        WHERE date_of_despatch >= ? AND date_of_despatch < ?
        ORDER BY s_no DESC
      `;

      [inwardRows, outwardRows] = await Promise.all([
        dbQuery(inwardSql, [start, end]),
        dbQuery(outwardSql, [start, end]),
      ]);

      totalInwards = inwardRows.length;
      totalOutwards = outwardRows.length;
      repliesPending = inwardRows.filter(r => r.reply_required === "Yes" && !r.has_outward).length;
    } else {
      // Default dashboard view only needs the latest 5 rows for each table.
      const [
        inwardRowsResult,
        outwardRowsResult,
        totalInwardsResult,
        totalOutwardsResult,
        repliesPendingResult,
      ] = await Promise.all([
        dbQuery(
          `
            SELECT
              i.*,
              o.s_no AS has_outward
            FROM inward_records i
            LEFT JOIN outward_records o
              ON i.s_no = o.inward_s_no
            ORDER BY i.s_no DESC
            LIMIT 5
          `
        ),
        dbQuery(
          `
            SELECT *
            FROM outward_records
            ORDER BY s_no DESC
            LIMIT 5
          `
        ),
        dbQuery(
          `
            SELECT COUNT(*) AS total
            FROM inward_records i
            LEFT JOIN outward_records o
              ON i.s_no = o.inward_s_no
          `
        ),
        dbQuery(`SELECT COUNT(*) AS total FROM outward_records`),
        dbQuery(
          `
            SELECT COUNT(*) AS total
            FROM inward_records i
            LEFT JOIN outward_records o
              ON i.s_no = o.inward_s_no
            WHERE i.reply_required = 'Yes' AND o.s_no IS NULL
          `
        ),
      ]);

      inwardRows = inwardRowsResult;
      outwardRows = outwardRowsResult;
      totalInwards = Number(totalInwardsResult[0]?.total) || 0;
      totalOutwards = Number(totalOutwardsResult[0]?.total) || 0;
      repliesPending = Number(repliesPendingResult[0]?.total) || 0;
    }

    res.json({
      totalInwards,
      totalOutwards,
      repliesPending,
      inwards: inwardRows,
      outwards: outwardRows
    });

  } catch (err) {
    console.error("Dashboard summary error:", err);
    res.status(500).json({ message: "Server error" });
  }
});

module.exports = router;
