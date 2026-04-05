const express = require("express");
const router = express.Router();
const bcrypt = require("bcryptjs");
const puppeteer = require("puppeteer");
const fs = require("fs");
const path = require("path");
const { pool: db, dbQuery } = require("../db");
const { requireAdmin } = require("../middlewares/authMiddleware");
const { getMonthDateRange } = require("../utils/date-range");


async function calculateReportData(month, year, office = "", group = "") {
    const { start, end } = getMonthDateRange(year, month);
    const inOfficeCond = office ? "AND received_in = ?" : "";
    const outOfficeCond = office ? "AND reply_from = ?" : "";
    const groupCond = group ? "AND group_name = ?" : "";

    const paramsIn = [start, end];
    if (office) paramsIn.push(office);
    if (group) paramsIn.push(group);

    const paramsOut = [start, end];
    if (office) paramsOut.push(office);
    if (group) paramsOut.push(group);

    const sqlHindi = `SELECT COUNT(*) AS cnt FROM inward_records WHERE date_of_receipt >= ? AND date_of_receipt < ? ${inOfficeCond} ${groupCond} AND language_of_document IN ('Hindi')`;
    const sqlReplyHindi = `SELECT COUNT(*) AS cnt FROM outward_records WHERE date_of_despatch >= ? AND date_of_despatch < ? ${outOfficeCond} ${groupCond} AND reply_sent_in = 'Hindi'`;
    const sqlReplyEnglish = `SELECT COUNT(*) AS cnt FROM outward_records WHERE date_of_despatch >= ? AND date_of_despatch < ? ${outOfficeCond} ${groupCond} AND reply_sent_in = 'English'`;
    const sqlNotExpected = `SELECT COUNT(*) AS cnt FROM inward_records WHERE date_of_receipt >= ? AND date_of_receipt < ? ${inOfficeCond} ${groupCond} AND reply_required = 'No'`;
    const sqlInwardRegion = `SELECT COALESCE(sender_region, 'Unknown') AS region, SUM(language_of_document = 'English') AS receivedEnglish, SUM(language_of_document='English' AND reply_required = 'No') AS notExpected FROM inward_records WHERE date_of_receipt >= ? AND date_of_receipt < ? ${inOfficeCond} ${groupCond} GROUP BY region`;
    const sqlOutwardReplyRegion = `SELECT COALESCE(receiver_region, 'Unknown') AS region, SUM(language_of_document = 'English' AND reply_sent_in = 'Hindi') AS repliedHindi, SUM(language_of_document = 'English' AND reply_sent_in = 'English') AS repliedEnglish FROM outward_records WHERE date_of_despatch >= ? AND date_of_despatch < ? ${outOfficeCond} ${groupCond} GROUP BY region`;
    const sqlSection3 = `SELECT COALESCE(sender_region, 'Unknown') AS region, SUM(language_of_document IN ('Hindi','Bilingual')) AS hindiPlusBilingual, SUM(language_of_document = 'English') AS english FROM inward_records WHERE date_of_receipt >= ? AND date_of_receipt < ? ${inOfficeCond} ${groupCond} GROUP BY region`;
    const sqlTotalInward = `SELECT COUNT(*) AS cnt FROM inward_records WHERE date_of_receipt >= ? AND date_of_receipt < ? ${inOfficeCond} ${groupCond}`;
    const sqlTotalOutward = `SELECT COUNT(*) AS cnt FROM outward_records WHERE date_of_despatch >= ? AND date_of_despatch < ? ${outOfficeCond} ${groupCond}`;

    const [
        rowsHindi, rowsReplyHindi, rowsReplyEnglish, rowsNotExpected,
        rowsInwardRegion, rowsOutwardReplyRegion, rowsSection3,
        totalInward, totalOutward
    ] = await Promise.all([
        dbQuery(sqlHindi, paramsIn), dbQuery(sqlReplyHindi, paramsOut),
        dbQuery(sqlReplyEnglish, paramsOut), dbQuery(sqlNotExpected, paramsIn),
        dbQuery(sqlInwardRegion, paramsIn), dbQuery(sqlOutwardReplyRegion, paramsOut),
        dbQuery(sqlSection3, paramsIn), dbQuery(sqlTotalInward, paramsIn),
        dbQuery(sqlTotalOutward, paramsOut)
    ]);

    const inwardByRegion = { A: {}, B: {}, C: {}, Unknown: {} };
    rowsInwardRegion.forEach((r) => {
        inwardByRegion[r.region] = { receivedEnglish: r.receivedEnglish || 0, notExpected: r.notExpected || 0, repliedHindi: 0, repliedEnglish: 0 };
    });

    rowsOutwardReplyRegion.forEach((r) => {
        inwardByRegion[r.region] ||= { receivedEnglish: 0, notExpected: 0, repliedHindi: 0, repliedEnglish: 0 };
        inwardByRegion[r.region].repliedHindi = r.repliedHindi || 0;
        inwardByRegion[r.region].repliedEnglish = r.repliedEnglish || 0;
    });

    ["A", "B", "C", "Unknown"].forEach((r) => {
        inwardByRegion[r] ||= { receivedEnglish: 0, repliedHindi: 0, repliedEnglish: 0, notExpected: 0 };
    });

    const section3ByRegion = {
        A: { hindi: 0, english: 0, total: 0, percent: 0 },
        B: { hindi: 0, english: 0, total: 0, percent: 0 },
        C: { hindi: 0, english: 0, total: 0, percent: 0 },
        Unknown: { hindi: 0, english: 0, total: 0, percent: 0 }
    };

    rowsSection3.forEach(r => {
        const hb = Number(r.hindiPlusBilingual) || 0;
        const e = Number(r.english) || 0;
        const total = hb + e;
        section3ByRegion[r.region] = { hindi: hb, english: e, total, percent: total ? Math.round((hb / total) * 100) : 0 };
    });

    const emailReceivedRows = await dbQuery(`SELECT region, SUM(total_english) AS eng, SUM(total_hindi) AS hin FROM email_records WHERE month = ? AND year = ? ${group ? "AND group_name = ?" : ""} AND entry_type = 'Received' GROUP BY region`, group ? [month, year, group] : [month, year]);
    const emailReceived = { A: { eng: 0, hin: 0 }, B: { eng: 0, hin: 0 }, C: { eng: 0, hin: 0 } };
    emailReceivedRows.forEach(r => { emailReceived[r.region] = { eng: r.eng || 0, hin: r.hin || 0 }; });

    const emailRepliedRows = await dbQuery(`SELECT region, SUM(total_hindi) AS total FROM email_records WHERE month = ? AND year = ? ${group ? "AND group_name = ?" : ""} AND entry_type = 'Replied' GROUP BY region`, group ? [month, year, group] : [month, year]);
    const emailReplied = { A: 0, B: 0, C: 0 };
    emailRepliedRows.forEach(r => { emailReplied[r.region] = r.total || 0; });

    const notingsRows = await dbQuery(
        `
            SELECT
                COALESCE(SUM(notings_hindi_pages), 0) AS totalHindi,
                COALESCE(SUM(notings_english_pages), 0) AS totalEnglish,
                COALESCE(SUM(eoffice_comments), 0) AS totalComments
            FROM notings_records
            WHERE month = ? AND year = ? ${group ? "AND group_name = ?" : ""}
        `,
        group ? [month, year, group] : [month, year]
    );
    const notingsHindi = Number(notingsRows[0]?.totalHindi) || 0;
    const notingsEnglish = Number(notingsRows[0]?.totalEnglish) || 0;
    const notingsEoffice = Number(notingsRows[0]?.totalComments) || 0;

    let groupName = "", groupHeadName = "";
    if (group) {
        const row = await dbQuery("SELECT name, group_name FROM users WHERE group_name = ? LIMIT 1", [group]);
        groupName = row[0]?.group_name || ""; groupHeadName = row[0]?.name || "";
    }
    if (!group) {
        const adminRow = await dbQuery("SELECT name, group_name FROM users WHERE role='admin' LIMIT 1");
        groupName = adminRow[0]?.group_name || ""; groupHeadName = adminRow[0]?.name || "";
    }

    return {
        lettersReceivedHindi: rowsHindi[0]?.cnt || 0,
        repliesSentHindi: rowsReplyHindi[0]?.cnt || 0,
        repliesSentEnglish: rowsReplyEnglish[0]?.cnt || 0,
        notExpectedTotal: rowsNotExpected[0]?.cnt || 0,
        inwardByRegion, section3ByRegion,
        totalInwards: totalInward[0]?.cnt || 0,
        totalOutwards: totalOutward[0]?.cnt || 0,
        emailReceived, emailReplied, notingsHindi, notingsEnglish, notingsEoffice, groupName, groupHeadName
    };
}

// =============================================
// ADMIN: REPORTS
// =============================================
router.post("/admin/report/data", requireAdmin, async (req, res) => {
    try {
        const { month, year, office, group } = req.body;
        if (!month || !year) return res.status(400).json({ message: "Month and Year required" });
        const data = await calculateReportData(month, year, office || "", group || "");
        res.json(data);
    } catch (err) {
        console.error("Report Data Error:", err);
        res.status(500).json({ message: "Failed to calculate report" });
    }
});

router.post("/admin/report/pdf", requireAdmin, async (req, res) => {
    let browser;
    try {
        const { html, filename } = req.body;
        if (!html || !filename) return res.status(400).json({ message: "Missing report HTML or filename" });

        const cssPath = path.join(__dirname, "../frontend/css/report.css");
        const reportCss = fs.readFileSync(cssPath, "utf8");

        const fullHtml = `<!DOCTYPE html><html><head><meta charset="UTF-8" /><style>${reportCss}</style></head><body>${html}</body></html>`;

        browser = await puppeteer.launch({ headless: "new", args: ["--no-sandbox", "--disable-setuid-sandbox"] });
        const page = await browser.newPage();
        await page.setContent(fullHtml, { waitUntil: "networkidle0" });
        const pdfBuffer = await page.pdf({ format: "A4", printBackground: true, margin: { top: "20mm", bottom: "20mm", left: "15mm", right: "15mm" } });

        res.setHeader("Content-Type", "application/pdf");
        res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
        res.send(pdfBuffer);
    } catch (err) {
        console.error("PDF generation error:", err);
        res.status(500).json({ message: "Failed to generate PDF" });
    } finally {
        // THIS ENSURES IT ALWAYS CLOSES, EVEN ON ERROR
        if (browser) {
            await browser.close();
        }
    }
});

router.get("/admin/report/groups", requireAdmin, (req, res) => {
    const sql = `SELECT DISTINCT group_name FROM users WHERE group_name IS NOT NULL AND group_name <> '' ORDER BY group_name`;
    db.query(sql, (err, rows) => {
        if (err) return res.status(500).json({ message: "Failed to load groups" });
        res.json(rows.map(r => r.group_name));
    });
});

// =============================================
// ADMIN: USER MANAGEMENT
// =============================================
router.get("/admin/users", requireAdmin, (req, res) => {
    db.query("SELECT id, name, email, mobile, role, group_name FROM users ORDER BY id DESC", (err, rows) => {
        if (err) return res.status(500).json({ success: false, message: "DB Error" });
        res.json(rows);
    });
});

router.post("/admin/users/add", requireAdmin, (req, res) => {
    const { name, email, mobile, password, group_name } = req.body;
    if (!name || !email || !password) return res.status(400).json({ success: false, message: "Missing required fields" });

    bcrypt.hash(password, 10, (err, hash) => {
        if (err) {
            console.error("Bcrypt Error:", err);
            return res.status(500).json({ success: false, message: "Hash error" });
        }
        db.query(`INSERT INTO users (name, email, mobile, password, role, group_name) VALUES (?, ?, ?, ?, "user", ?)`, [name, email, mobile, hash, group_name], (err) => {
            if (err) return res.status(err.code === "ER_DUP_ENTRY" ? 400 : 500).json({ success: false, message: err.code === "ER_DUP_ENTRY" ? "Email already exists" : "DB Error" });
            res.json({ success: true });
        });
    });
});

router.patch("/admin/users/update/:id", requireAdmin, (req, res) => {
    const { name, email, mobile, group_name } = req.body;
    db.query(`UPDATE users SET name=?, email=?, mobile=?, group_name=? WHERE id=?`, [name, email, mobile, group_name, req.params.id], (err) => {
        if (err) return res.status(500).json({ success: false, message: "DB Error" });
        res.json({ success: true });
    });
});

router.delete("/admin/users/delete/:id", requireAdmin, (req, res) => {
    if (req.session.user.id === Number(req.params.id)) return res.status(400).json({ success: false, message: "You cannot delete your own account" });
    db.query("DELETE FROM users WHERE id=?", [req.params.id], (err) => {
        if (err) return res.status(500).json({ success: false, message: "DB Error" });
        res.json({ success: true });
    });
});

// =============================================
// ADMIN: RECORD SEARCH AND EDITS
// =============================================
router.get("/admin/inward/search", requireAdmin, async (req, res) => {
    try {
        const q = (req.query.q || "").trim();
        if (!q) return res.json([]);
        const rows = await dbQuery(`SELECT * FROM inward_records WHERE inward_no LIKE ? ORDER BY s_no DESC LIMIT 50`, [`%${q}%`]);
        res.json(rows);
    } catch (err) { res.status(500).json({ message: "Server error" }); }
});

router.get("/admin/outward/search", requireAdmin, async (req, res) => {
    try {
        const q = (req.query.q || "").trim();
        if (!q) return res.json([]);
        const rows = await dbQuery(`SELECT * FROM outward_records WHERE outward_no LIKE ? ORDER BY s_no DESC LIMIT 50`, [`%${q}%`]);
        res.json(rows);
    } catch (err) { res.status(500).json({ message: "Server error" }); }
});

// Update routes
router.post("/inward/update/:id", requireAdmin, async (req, res) => {
    try {
        const id = req.params.id; 
        const data = req.body;
        let finalDocumentType = data.type_of_document === "Other Document" ? data.other_document?.trim() : data.type_of_document;
        const safeCount = Math.max(0, Number(data.count) || 0);

        await dbQuery(`UPDATE inward_records SET date_of_receipt=?, month=?, year=?, received_in=?, name_of_sender=?, address_of_sender=?, sender_city=?, sender_state=?, sender_pin=?, sender_region=?, sender_org_type=?, type_of_document=?, language_of_document=?, count=?, remarks=?, issued_to=?, reply_required=? WHERE s_no=?`,
            [data.date_of_receipt, data.month, data.year, data.received_in, data.name_of_sender, data.address_of_sender, data.sender_city, data.sender_state, data.sender_pin, data.sender_region, data.sender_org_type, finalDocumentType, data.language_of_document, safeCount, data.remarks, data.issued_to, data.reply_required, id]
        );
        res.send(`<h3 style="text-align:center;">Inward Entry Updated</h3><p style="text-align:center;"><a href="/dashboard.html">Back to Dashboard</a></p>`);
    } catch (err) { res.status(500).send("Server error"); }
});

router.post("/outward/update/:id", requireAdmin, async (req, res) => {
    try {
        const id = req.params.id; const data = req.body;
        const existingRows = await dbQuery("SELECT inward_s_no FROM outward_records WHERE s_no = ? LIMIT 1", [id]);
        const inward_s_no = existingRows.length ? existingRows[0].inward_s_no : null;
        let finalDocumentType = data.type_of_document === "Other Document" ? data.other_document?.trim() : data.type_of_document;
        const safeCount = Math.max(0, Number(data.count) || 0);
        const safeReplyCount = Math.max(0, Number(data.reply_count) || 0);

        await dbQuery(`UPDATE outward_records SET date_of_despatch=?, month=?, year=?, reply_from=?, name_of_receiver=?, address_of_receiver=?, receiver_city=?, receiver_state=?, receiver_pin=?, receiver_region=?, receiver_org_type=?, type_of_document=?, language_of_document=?, count=?, reply_issued_by=?, reply_sent_date=?, reply_ref_no=?, reply_sent_by=?, reply_sent_in=?, reply_count=? WHERE s_no=?`,
            [data.date_of_despatch, data.month, data.year, data.reply_from, data.name_of_receiver, data.address_of_receiver, data.receiver_city, data.receiver_state, data.receiver_pin, data.receiver_region, data.receiver_org_type, finalDocumentType, data.language_of_document, safeCount, data.reply_issued_by, data.reply_sent_date || null, data.reply_ref_no, data.reply_sent_by, data.reply_sent_in, safeReplyCount, id]
        );
        //AUTO-UPDATE LINKED INWARD
        if (inward_s_no) {
            await dbQuery(`UPDATE inward_records SET reply_sent_date=?, reply_ref_no=?, reply_sent_by=?, reply_sent_in=?, reply_count=? WHERE s_no=?`,
                [data.reply_sent_date || null, data.reply_ref_no || null, data.reply_sent_by || null, data.reply_sent_in || null, safeReplyCount, inward_s_no]
            );
        }
        res.send(`<h3 style="text-align:center;">Outward Entry Updated</h3><p style="text-align:center;"><a href="/dashboard.html">Back to Dashboard</a></p>`);
    } catch (err) { res.status(500).send("Server error"); }
});

module.exports = router;
