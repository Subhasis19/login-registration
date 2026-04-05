const express = require("express");
const router = express.Router();
const path = require("path");
const { pool: db, dbQuery } = require("../db");
const { requireLogin } = require("../middlewares/authMiddleware");


// Helper: Generate Outward Number
function generateOutwardNumber() {
  const year = new Date().getFullYear();
  const rand = Math.floor(Math.random() * 1_000_000).toString().padStart(6, "0");
  return `OUTW/${year}/${rand}`;
}

// =========================
// HTML VIEW ROUTE
// =========================
router.get("/outward", requireLogin, (req, res) => {
  res.sendFile(path.join(__dirname, "../views/forms/outward.html"));
});

// =============================================
// OUTWARD DETAILS (FOR MODAL)
// =============================================
router.get("/outward/details/:id", requireLogin, async (req, res) => {
  try {
    const { id } = req.params;
    const rows = await dbQuery("SELECT * FROM outward_records WHERE s_no = ? LIMIT 1", [id]);

    if (!rows.length) {
      return res.status(404).json({ message: "Outward record not found" });
    }
    res.json(rows[0]);
  } catch (err) {
    console.error("Outward details error:", err);
    res.status(500).json({ message: "Server error" });
  }
});

// =========================
// OUTWARD ENTRY (ADD)
// =========================
router.post("/outward/add", requireLogin, async (req, res) => {
  try {
    const data = req.body;
    const groupName = req.session.user.group;

    // Normalize reply fields safely
    if (data.reply_required === "No") {
      data.reply_sent_date = null;
      data.reply_ref_no = null;
      data.reply_sent_by = null;
      data.reply_sent_in = null;
      data.reply_count = 0;
    } else {
      data.reply_sent_date = data.reply_sent_date || null;
      data.reply_ref_no = data.reply_ref_no || null;
      data.reply_sent_by = data.reply_sent_by || null;
      data.reply_sent_in = data.reply_sent_in || null;
    }

    // NORMALIZE TYPE OF DOCUMENT
    let finalDocumentType = data.type_of_document;
    if (finalDocumentType === "Other Document") {
      finalDocumentType = data.other_document?.trim();
      if (!finalDocumentType) {
        return res.status(400).send("Please specify Other Document type");
      }
    }

    if (!/^\d{6}$/.test(data.receiver_pin)) return res.status(400).send("Invalid PIN");
    if (!/^[A-Za-z0-9 .,'&()-]+$/.test(data.name_of_receiver)) return res.status(400).send("Invalid receiver name");

    const safeCount = Math.max(0, Number(data.count) || 0);
    const safeReplyCount = Math.max(0, Number(data.reply_count) || 0);

    let inward_s_no = null;

    if (data.inward_no) {
      const result = await new Promise((resolve) =>
        db.query(
          "SELECT s_no FROM inward_records WHERE inward_no = ? LIMIT 1",
          [data.inward_no],
          (err, rows) => resolve(rows)
        )
      );
      if (result.length > 0) inward_s_no = result[0].s_no;
    }

    // Block multiple outward for same inward
    if (inward_s_no) {
      const existing = await new Promise((resolve) =>
        db.query(
          "SELECT s_no FROM outward_records WHERE inward_s_no = ? LIMIT 1",
          [inward_s_no],
          (err, rows) => resolve(rows)
        )
      );

      if (existing.length > 0) {
        return res.status(409).send("Outward reply already exists for this Inward entry.");
      }
    }

    let outward_no;
    let success = false;

    for (let i = 0; i < 5; i++) {
      outward_no = generateOutwardNumber();

      try {
        await new Promise((resolve, reject) =>
          db.query(
            `INSERT INTO outward_records (
              date_of_despatch, month, year, reply_from,
              name_of_receiver, address_of_receiver, receiver_city,
              receiver_state, receiver_pin, receiver_region, receiver_org_type,
              outward_no, type_of_document, language_of_document, count,
              inward_no, inward_s_no, reply_issued_by, reply_sent_date,
              reply_ref_no, reply_sent_by, reply_sent_in, reply_count, group_name
            ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
            [
              data.date_of_despatch, data.month, data.year, data.reply_from,
              data.name_of_receiver, data.address_of_receiver, data.receiver_city,
              data.receiver_state, data.receiver_pin, data.receiver_region, data.receiver_org_type,
              outward_no, finalDocumentType, data.language_of_document, safeCount,
              data.inward_no || null, inward_s_no, data.reply_issued_by,
              data.reply_sent_date || null, data.reply_ref_no, data.reply_sent_by,
              data.reply_sent_in, safeReplyCount, groupName
            ],
            (err) => (err ? reject(err) : resolve())
          )
        );

        // AUTO-UPDATE INWARD FROM OUTWARD
        if (inward_s_no) {
          await new Promise((resolve, reject) =>
            db.query(
              `UPDATE inward_records SET reply_sent_date = ?, reply_ref_no = ?, reply_sent_by = ?, reply_sent_in = ?, reply_count = ?, reply_required = 'Yes' WHERE s_no = ?`,
              [
                data.reply_sent_date || null,
                data.reply_ref_no || null,
                data.reply_sent_by || null,
                data.reply_sent_in || null,
                safeReplyCount,
                inward_s_no
              ],
              (err) => (err ? reject(err) : resolve())
            )
          );
        }
        
        success = true;
        break;
      } catch (err) {
        if (err.code !== "ER_DUP_ENTRY") throw err;
      }
    }

    if (!success) return res.status(500).send("Failed to generate outward number.");

    res.status(201).send(`
      <h3 style="text-align:center;">Outward Entry Saved</h3>
      <p style="text-align:center;">Outward No: <strong>${outward_no}</strong></p>
      <p style="text-align:center;"><a href="/outward" target="_self">Add another</a></p>
    `);
  } catch (err) {
    console.error("DB ERROR:", err.sqlMessage || err);
    res.status(500).send("Failed to save outward entry.");
  }
});

// =========================
// OUTWARD LIST (ALL)
// =========================
router.get("/outward/all", requireLogin, (req, res) => {
  db.query("SELECT * FROM outward_records ORDER BY s_no DESC", (err, rows) => {
    if (err) return res.status(500).send("Failed to load outward records.");
    res.json(rows);
  });
});

module.exports = router;
