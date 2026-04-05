const express = require("express");
const router = express.Router();
const { dbQuery } = require("../db");
const { requireLogin, requireAdmin } = require("../middlewares/authMiddleware");

const EMAIL_ENTRY_TYPES = new Set(["Received", "Replied"]);
const EMAIL_REGIONS = new Set(["A", "B", "C"]);

function normalizeEmailEntryType(value) {
    return EMAIL_ENTRY_TYPES.has(value) ? value : "";
}

function normalizeEmailRegion(value) {
    return EMAIL_REGIONS.has(value) ? value : "";
}

function getEmailPayload(source) {
    return {
        month: Number(source.month),
        year: Number(source.year),
        entryType: normalizeEmailEntryType(source.entry_type),
        region: normalizeEmailRegion(source.region),
        totalEnglish: Math.max(0, Number(source.total_english) || 0),
        totalHindi: Math.max(0, Number(source.total_hindi) || 0),
    };
}

function hasRequiredEmailFields({ month, year, entryType, region }) {
    return Boolean(month && year && entryType && region);
}

async function getEmailRow(groupName, month, year, entryType, region) {
    const rows = await dbQuery(
        `
            SELECT
                id,
                group_name,
                month,
                year,
                status,
                entry_type,
                region,
                total_english,
                total_hindi
            FROM email_records
            WHERE group_name = ? AND month = ? AND year = ? AND entry_type = ? AND region = ?
            LIMIT 1
        `,
        [groupName, month, year, entryType, region]
    );

    return rows[0] || null;
}

async function getEmailRowById(id) {
    const rows = await dbQuery(
        `
            SELECT
                id,
                group_name,
                month,
                year,
                status,
                entry_type,
                region,
                total_english,
                total_hindi
            FROM email_records
            WHERE id = ?
            LIMIT 1
        `,
        [id]
    );

    return rows[0] || null;
}

async function getConflictingEmailRow(groupName, month, year, entryType, region, excludedId) {
    const rows = await dbQuery(
        `
            SELECT id
            FROM email_records
            WHERE group_name = ?
              AND month = ?
              AND year = ?
              AND entry_type = ?
              AND region = ?
              AND id <> ?
            LIMIT 1
        `,
        [groupName, month, year, entryType, region, excludedId]
    );

    return rows[0] || null;
}

async function insertEmailRow(groupName, payload) {
    const result = await dbQuery(
        `
            INSERT INTO email_records
            (group_name, month, year, entry_type, region, total_english, total_hindi, status)
            VALUES (?, ?, ?, ?, ?, ?, ?, 'pending')
        `,
        [
            groupName,
            payload.month,
            payload.year,
            payload.entryType,
            payload.region,
            payload.totalEnglish,
            payload.totalHindi,
        ]
    );

    return result.insertId;
}

async function updateEmailRow(id, payload) {
    return dbQuery(
        `
            UPDATE email_records
            SET month = ?,
                year = ?,
                entry_type = ?,
                region = ?,
                total_english = ?,
                total_hindi = ?
            WHERE id = ?
        `,
        [
            payload.month,
            payload.year,
            payload.entryType,
            payload.region,
            payload.totalEnglish,
            payload.totalHindi,
            id,
        ]
    );
}

function buildEmailCheckResponse(row) {
    if (!row) {
        return { exists: false };
    }

    if (row.status === "confirmed") {
        return {
            exists: true,
            status: row.status,
            message: "This email record is already confirmed and cannot be modified.",
        };
    }

    return {
        exists: true,
        status: row.status,
        allowUpdate: true,
        message: "A submission already exists for this month, type and region. Saving again will update it.",
    };
}

function isDuplicateEmailKeyError(error) {
    return error?.code === "ER_DUP_ENTRY";
}

// =========================
// EMAILS: SAVE MONTHLY DATA
// =========================
router.post("/emails/save", requireLogin, async (req, res) => {
    const groupName = req.session.user.group;
    const payload = getEmailPayload(req.body);

    if (!hasRequiredEmailFields(payload)) {
        return res.status(400).json({
            success: false,
            message: "Month, Year, Entry Type and Region are required",
        });
    }

    try {
        const existingRow = await getEmailRow(
            groupName,
            payload.month,
            payload.year,
            payload.entryType,
            payload.region
        );

        if (existingRow) {
            if (existingRow.status === "confirmed") {
                return res.status(400).json({
                    success: false,
                    message: "Already confirmed. Cannot modify.",
                });
            }

            await updateEmailRow(existingRow.id, payload);

            return res.json({
                success: true,
                message: "Updated successfully",
            });
        }

        await insertEmailRow(groupName, payload);

        res.json({
            success: true,
            message: "Saved successfully",
        });
    } catch (err) {
        if (isDuplicateEmailKeyError(err)) {
            try {
                const existingRow = await getEmailRow(
                    groupName,
                    payload.month,
                    payload.year,
                    payload.entryType,
                    payload.region
                );

                if (existingRow) {
                    if (existingRow.status === "confirmed") {
                        return res.status(400).json({
                            success: false,
                            message: "Already confirmed. Cannot modify.",
                        });
                    }

                    await updateEmailRow(existingRow.id, payload);

                    return res.json({
                        success: true,
                        message: "Updated successfully",
                    });
                }
            } catch (retryErr) {
                console.error("Email save retry error:", retryErr);
            }
        }

        console.error("Email save error:", err);
        res.status(500).json({
            success: false,
            message: "Database error",
        });
    }
});

// =========================
// CHECK EMAIL STATUS
// =========================
router.get("/emails/check", requireLogin, async (req, res) => {
    const groupName = req.session.user.group;
    const payload = getEmailPayload(req.query);

    if (!hasRequiredEmailFields(payload)) {
        return res.json({ exists: false });
    }

    try {
        const row = await getEmailRow(
            groupName,
            payload.month,
            payload.year,
            payload.entryType,
            payload.region
        );

        res.json(buildEmailCheckResponse(row));
    } catch (err) {
        console.error("Email check error:", err);
        res.json({ exists: false });
    }
});

// =========================
// ADMIN: GET ALL EMAILS
// =========================
router.get("/admin/emails", requireAdmin, async (req, res) => {
    const { month, year, group } = req.query;

    if (!month || !year) {
        return res.json([]);
    }

    try {
        let sql = `
            SELECT
                id,
                group_name,
                month,
                year,
                status,
                entry_type,
                region,
                total_english,
                total_hindi
            FROM email_records
            WHERE month = ? AND year = ?
        `;

        const params = [month, year];

        if (group) {
            sql += " AND group_name = ?";
            params.push(group);
        }

        sql += " ORDER BY group_name ASC, entry_type ASC, region ASC, id DESC";

        const rows = await dbQuery(sql, params);
        res.json(rows);
    } catch (err) {
        console.error("Fetch emails error:", err);
        res.status(500).json({ message: "Database error" });
    }
});

// =========================
// ADMIN: CHECK SINGLE EDIT TARGET
// =========================
router.get("/admin/emails/check", requireAdmin, async (req, res) => {
    const editId = Number(req.query.id);
    const payload = getEmailPayload(req.query);

    if (!editId || !hasRequiredEmailFields(payload)) {
        return res.json({ exists: false });
    }

    try {
        const currentRow = await getEmailRowById(editId);

        if (!currentRow) {
            return res.status(404).json({
                exists: true,
                message: "Email record not found.",
            });
        }

        if (currentRow.status === "confirmed") {
            return res.json({
                exists: true,
                status: currentRow.status,
                message: "This record is already confirmed and cannot be modified.",
            });
        }

        const conflictingRow = await getConflictingEmailRow(
            currentRow.group_name,
            payload.month,
            payload.year,
            payload.entryType,
            payload.region,
            editId
        );

        if (conflictingRow) {
            return res.json({
                exists: true,
                message: "Another email record already exists for this group, month, type and region.",
            });
        }

        res.json({ exists: false });
    } catch (err) {
        console.error("Admin emails check error:", err);
        res.status(500).json({
            exists: true,
            message: "Failed to check email status.",
        });
    }
});

// =========================
// ADMIN: CONFIRM EMAIL
// =========================
router.post("/admin/emails/confirm", requireAdmin, async (req, res) => {
    const id = Number(req.body.id);

    if (!id) {
        return res.status(400).json({ success: false, message: "Record id is required" });
    }

    try {
        const result = await dbQuery(
            `
                UPDATE email_records
                SET status = 'confirmed'
                WHERE id = ?
            `,
            [id]
        );

        if (!result.affectedRows) {
            return res.status(404).json({ success: false, message: "Email record not found" });
        }

        res.json({ success: true });
    } catch (err) {
        console.error("Confirm email error:", err);
        res.status(500).json({ success: false, message: "Database error" });
    }
});

// =========================
// ADMIN: GET SINGLE EMAIL
// =========================
router.get("/admin/emails/:id", requireAdmin, async (req, res) => {
    const id = Number(req.params.id);

    if (!id) {
        return res.status(400).json({ message: "Invalid email id" });
    }

    try {
        const row = await getEmailRowById(id);

        if (!row) {
            return res.status(404).json({ message: "Not found" });
        }

        res.json(row);
    } catch (err) {
        console.error("Fetch single email error:", err);
        res.status(500).json({ message: "Database error" });
    }
});

// =========================
// ADMIN: UPDATE SINGLE EMAIL
// =========================
router.patch("/admin/emails/:id", requireAdmin, async (req, res) => {
    const id = Number(req.params.id);
    const payload = getEmailPayload(req.body);

    if (!id) {
        return res.status(400).json({
            success: false,
            message: "Invalid email id",
        });
    }

    if (!hasRequiredEmailFields(payload)) {
        return res.status(400).json({
            success: false,
            message: "Month, Year, Entry Type and Region are required",
        });
    }

    try {
        const currentRow = await getEmailRowById(id);

        if (!currentRow) {
            return res.status(404).json({
                success: false,
                message: "Email record not found",
            });
        }

        if (currentRow.status === "confirmed") {
            return res.status(400).json({
                success: false,
                message: "Already confirmed. Cannot modify.",
            });
        }

        const conflictingRow = await getConflictingEmailRow(
            currentRow.group_name,
            payload.month,
            payload.year,
            payload.entryType,
            payload.region,
            id
        );

        if (conflictingRow) {
            return res.status(400).json({
                success: false,
                message: "Another email record already exists for this group, month, type and region.",
            });
        }

        const result = await updateEmailRow(id, payload);

        if (!result.affectedRows) {
            return res.status(404).json({
                success: false,
                message: "Email record not found",
            });
        }

        res.json({
            success: true,
            message: "Updated successfully",
        });
    } catch (err) {
        if (isDuplicateEmailKeyError(err)) {
            return res.status(400).json({
                success: false,
                message: "Another email record already exists for this group, month, type and region.",
            });
        }

        console.error("Admin email update error:", err);
        res.status(500).json({
            success: false,
            message: "Database error",
        });
    }
});

module.exports = router;
