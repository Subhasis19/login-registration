const express = require("express");
const router = express.Router();
const bcrypt = require("bcryptjs");
const puppeteer = require("puppeteer");
const fs = require("fs");
const path = require("path");
const { pool: db, dbQuery } = require("../db");
const { requireAdmin } = require("../middlewares/authMiddleware");
const { calculateReportData } = require("../services/report-calculator");

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
        if (err) return res.status(500).json({ success: false, message: "Failed to load users." });
        res.json(rows);
    });
});

router.post("/admin/users/add", requireAdmin, (req, res) => {
    const { name, email, mobile, password, group_name } = req.body;
    if (!name || !email || !password) return res.status(400).json({ success: false, message: "Missing required fields" });

    bcrypt.hash(password, 10, (err, hash) => {
        if (err) {
            console.error("Bcrypt Error:", err);
            return res.status(500).json({ success: false, message: "Failed to secure the password." });
        }
        db.query(`INSERT INTO users (name, email, mobile, password, role, group_name) VALUES (?, ?, ?, ?, "user", ?)`, [name, email, mobile, hash, group_name], (err) => {
            if (err) {
                return res.status(err.code === "ER_DUP_ENTRY" ? 409 : 500).json({
                    success: false,
                    message: err.code === "ER_DUP_ENTRY" ? "Email already exists." : "Failed to create user.",
                });
            }
            res.status(201).json({ success: true, message: "User created successfully." });
        });
    });
});

router.patch("/admin/users/update/:id", requireAdmin, (req, res) => {
    const { name, email, mobile, group_name } = req.body;
    db.query(`UPDATE users SET name=?, email=?, mobile=?, group_name=? WHERE id=?`, [name, email, mobile, group_name, req.params.id], (err, result) => {
        if (err) {
            return res.status(err.code === "ER_DUP_ENTRY" ? 409 : 500).json({
                success: false,
                message: err.code === "ER_DUP_ENTRY" ? "Email already exists." : "Failed to update user.",
            });
        }

        if (!result.affectedRows) {
            return res.status(404).json({ success: false, message: "User not found." });
        }

        res.json({ success: true, message: "User updated successfully." });
    });
});

router.delete("/admin/users/delete/:id", requireAdmin, (req, res) => {
    if (req.session.user.id === Number(req.params.id)) return res.status(400).json({ success: false, message: "You cannot delete your own account" });
    db.query("DELETE FROM users WHERE id=?", [req.params.id], (err, result) => {
        if (err) return res.status(500).json({ success: false, message: "Failed to delete user." });
        if (!result.affectedRows) {
            return res.status(404).json({ success: false, message: "User not found." });
        }
        res.json({ success: true, message: "User deleted successfully." });
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
    } catch (err) {
        console.error("Admin inward search error:", err);
        res.status(500).json({ message: "Failed to search inward records." });
    }
});

router.get("/admin/outward/search", requireAdmin, async (req, res) => {
    try {
        const q = (req.query.q || "").trim();
        if (!q) return res.json([]);
        const rows = await dbQuery(`SELECT * FROM outward_records WHERE outward_no LIKE ? ORDER BY s_no DESC LIMIT 50`, [`%${q}%`]);
        res.json(rows);
    } catch (err) {
        console.error("Admin outward search error:", err);
        res.status(500).json({ message: "Failed to search outward records." });
    }
});

// Update routes
router.post("/inward/update/:id", requireAdmin, async (req, res) => {
    try {
        const id = req.params.id; 
        const data = req.body;
        let finalDocumentType = data.type_of_document === "Other Document" ? data.other_document?.trim() : data.type_of_document;
        const safeCount = Math.max(0, Number(data.count) || 0);

        const result = await dbQuery(`UPDATE inward_records SET date_of_receipt=?, month=?, year=?, received_in=?, name_of_sender=?, address_of_sender=?, sender_city=?, sender_state=?, sender_pin=?, sender_region=?, sender_org_type=?, type_of_document=?, language_of_document=?, count=?, remarks=?, issued_to=?, reply_required=? WHERE s_no=?`,
            [data.date_of_receipt, data.month, data.year, data.received_in, data.name_of_sender, data.address_of_sender, data.sender_city, data.sender_state, data.sender_pin, data.sender_region, data.sender_org_type, finalDocumentType, data.language_of_document, safeCount, data.remarks, data.issued_to, data.reply_required, id]
        );
        if (!result.affectedRows) {
            return res.status(404).send("Inward record not found.");
        }
        res.send(`<h3 style="text-align:center;">Inward Entry Updated</h3><p style="text-align:center;"><a href="/dashboard.html">Back to Dashboard</a></p>`);
    } catch (err) {
        console.error("Admin inward update error:", err);
        res.status(500).send("Failed to update inward entry.");
    }
});

router.post("/outward/update/:id", requireAdmin, async (req, res) => {
    try {
        const id = req.params.id; const data = req.body;
        const existingRows = await dbQuery("SELECT inward_s_no FROM outward_records WHERE s_no = ? LIMIT 1", [id]);
        const inward_s_no = existingRows.length ? existingRows[0].inward_s_no : null;
        let finalDocumentType = data.type_of_document === "Other Document" ? data.other_document?.trim() : data.type_of_document;
        const safeCount = Math.max(0, Number(data.count) || 0);
        const safeReplyCount = Math.max(0, Number(data.reply_count) || 0);

        const result = await dbQuery(`UPDATE outward_records SET date_of_despatch=?, month=?, year=?, reply_from=?, name_of_receiver=?, address_of_receiver=?, receiver_city=?, receiver_state=?, receiver_pin=?, receiver_region=?, receiver_org_type=?, type_of_document=?, language_of_document=?, count=?, reply_issued_by=?, reply_sent_date=?, reply_ref_no=?, reply_sent_by=?, reply_sent_in=?, reply_count=? WHERE s_no=?`,
            [data.date_of_despatch, data.month, data.year, data.reply_from, data.name_of_receiver, data.address_of_receiver, data.receiver_city, data.receiver_state, data.receiver_pin, data.receiver_region, data.receiver_org_type, finalDocumentType, data.language_of_document, safeCount, data.reply_issued_by, data.reply_sent_date || null, data.reply_ref_no, data.reply_sent_by, data.reply_sent_in, safeReplyCount, id]
        );
        if (!result.affectedRows) {
            return res.status(404).send("Outward record not found.");
        }
        //AUTO-UPDATE LINKED INWARD
        if (inward_s_no) {
            await dbQuery(`UPDATE inward_records SET reply_sent_date=?, reply_ref_no=?, reply_sent_by=?, reply_sent_in=?, reply_count=? WHERE s_no=?`,
                [data.reply_sent_date || null, data.reply_ref_no || null, data.reply_sent_by || null, data.reply_sent_in || null, safeReplyCount, inward_s_no]
            );
        }
        res.send(`<h3 style="text-align:center;">Outward Entry Updated</h3><p style="text-align:center;"><a href="/dashboard.html">Back to Dashboard</a></p>`);
    } catch (err) {
        console.error("Admin outward update error:", err);
        res.status(500).send("Failed to update outward entry.");
    }
});

module.exports = router;
