const express = require("express");
const router = express.Router();
const path = require("path");
const { pool: db, dbQuery } = require("../db");
const { requireLogin } = require("../middlewares/authMiddleware");


// Helper: Generate Inward Number
function generateInwardNumber() {
    const year = new Date().getFullYear();
    const rand = Math.floor(Math.random() * 1_000_000).toString().padStart(6, "0");
    return `INW/${year}/${rand}`;
}

// =========================
// HTML VIEW ROUTE
// =========================
router.get("/inward", requireLogin, (req, res) => {
    res.sendFile(path.join(__dirname, "../views/forms/inward.html"));
});

// =========================
// INWARD ENTRY (ADD)
// =========================
router.post("/inward/add", requireLogin, async (req, res) => {
    try {
        const data = req.body;
        const groupName = req.session.user.group;

        // REQUIRED FIELD VALIDATION 
        const requiredFields = [
            { key: "date_of_receipt", label: "Inward Date" },
            { key: "received_in", label: "Office" },
            { key: "name_of_sender", label: "Sender Name" },
            { key: "type_of_document", label: "Document Type" },
            { key: "reply_required", label: "Reply Required" }
        ];

        for (const field of requiredFields) {
            if (!data[field.key] || String(data[field.key]).trim() === "") {
                return res.status(400).send(`${field.label} is required`);
            }
        }

        // NORMALIZE TYPE OF DOCUMENT
        let finalDocumentType = data.type_of_document;
        if (finalDocumentType === "Other Document") {
            finalDocumentType = data.other_document?.trim();
            if (!finalDocumentType) {
                return res.status(400).send("Please specify Other Document type");
            }
        }

        if (!/^\d{6}$/.test(data.sender_pin)) return res.status(400).send("Invalid PIN");
        if (!/^[A-Za-z0-9 .,'&()-]+$/.test(data.name_of_sender)) return res.status(400).send("Invalid sender name");

        // Normalize reply fields if reply not required
        if (data.reply_required === "No") {
            data.reply_sent_date = null;
            data.reply_ref_no = null;
            data.reply_sent_by = null;
            data.reply_sent_in = null;
            data.reply_count = 0;
        }

        const safeCount = Math.max(0, Number(data.count) || 0);
        const safeReplyCount = Math.max(0, Number(data.reply_count) || 0);

        let inward_no;
        let success = false;

        for (let i = 0; i < 5; i++) {
            inward_no = generateInwardNumber();

            try {
                await new Promise((resolve, reject) =>
                    db.query(
                        `INSERT INTO inward_records (
              date_of_receipt, month, year, received_in,
              name_of_sender, address_of_sender, sender_city,
              sender_state, sender_pin, sender_region, sender_org_type,
              inward_no, type_of_document, language_of_document, count,
              remarks, issued_to, reply_required, reply_sent_date,
              reply_ref_no, reply_sent_by, reply_sent_in, reply_count, group_name
            ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
                        [
                            data.date_of_receipt, data.month, data.year, data.received_in,
                            data.name_of_sender, data.address_of_sender, data.sender_city,
                            data.sender_state, data.sender_pin, data.sender_region, data.sender_org_type,
                            inward_no, finalDocumentType, data.language_of_document, safeCount,
                            data.remarks, data.issued_to, data.reply_required, data.reply_sent_date || null,
                            data.reply_ref_no, data.reply_sent_by, data.reply_sent_in, safeReplyCount, groupName
                        ],
                        (err) => (err ? reject(err) : resolve())
                    )
                );
                success = true;
                break;
            } catch (err) {
                if (err.code !== "ER_DUP_ENTRY") throw err;
            }
        }

        if (!success) return res.status(500).send("Failed to generate inward number.");

        res.status(201).send(`
      <h3 style="text-align:center;">Inward Entry Saved</h3>
      <p style="text-align:center;">Inward No: <strong>${inward_no}</strong></p>
      <p style="text-align:center;"><a href="/inward" target="_self">Add another</a></p>
    `);
    } catch (err) {
        console.error("DB ERROR:", err.sqlMessage || err);
        res.status(500).send("Failed to save inward entry.");
    }
});

// =========================
// INWARD LIST (ALL)
// =========================
router.get("/inward/all", requireLogin, (req, res) => {
    db.query("SELECT * FROM inward_records ORDER BY s_no DESC", (err, rows) => {
        if (err) return res.status(500).send("Failed to load inward records.");
        res.json(rows);
    });
});

// =========================
// INWARD DETAILS (MODAL)
// =========================
router.get("/inward/details/:id", requireLogin, async (req, res) => {
    try {
        const id = req.params.id;
        const rows = await dbQuery("SELECT * FROM inward_records WHERE s_no = ? LIMIT 1", [id]);

        if (!rows.length) {
            return res.status(404).json({ message: "Inward record not found." });
        }
        res.json(rows[0]);
    } catch (err) {
        console.error("Inward details error:", err);
        res.status(500).json({ message: "Failed to load inward details." });
    }
});

// =========================
// INWARD API (LIVE SEARCH)
// =========================
router.get("/api/inward/search", requireLogin, (req, res) => {
    const q = (req.query.q || "").trim();
    if (!q) return res.json([]);

    const sql = `
    SELECT 
      s_no, inward_no,
      name_of_sender, address_of_sender, sender_city,
      sender_state, sender_pin, sender_region, sender_org_type,
      date_of_receipt, received_in,
      type_of_document, language_of_document, count,
      DATE_FORMAT(reply_sent_date, '%Y-%m-%d') AS reply_sent_date,  
      issued_to AS reply_issued_by
    FROM inward_records
    WHERE inward_no LIKE ?
    ORDER BY s_no DESC
    LIMIT 10
  `;

    db.query(sql, [`%${q}%`], (err, results) => {
        if (err) {
            console.error("Search error:", err);
            return res.status(500).json([]);
        }
        res.json(results);
    });
});

module.exports = router;
