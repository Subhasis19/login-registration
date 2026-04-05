const express = require("express");
const router = express.Router();
const { pool: db } = require("../db");
const { requireLogin, requireAdmin } = require("../middlewares/authMiddleware");

function dbQuery(sql, params = []) {
    return new Promise((resolve, reject) => {
        db.query(sql, params, (err, rows) => {
            if (err) {
                reject(err);
                return;
            }
            resolve(rows);
        });
    });
}

function getNotingsPayload(body) {
    return {
        month: Number(body.month),
        year: Number(body.year),
        entryType: body.entry_type,
        hindi: Number(body.hindi) || 0,
        english: Number(body.english) || 0,
        eoffice: Number(body.eoffice) || 0,
    };
}

function hasRequiredFields({ month, year, entryType }) {
    return Boolean(month && year && entryType);
}

function isCommentEntry(entryType) {
    return entryType === "Comment";
}

// =========================
// NOTINGS: SAVE MONTHLY DATA
// =========================
router.post("/notings/save", requireLogin, async (req, res) => {
    const groupName = req.session.user.group;
    const userRole = req.session.user.role;
    const payload = getNotingsPayload(req.body);
    const isComment = isCommentEntry(payload.entryType);

    if (!hasRequiredFields(payload)) {
        return res.status(400).json({
            success: false,
            message: "Month, Year and Entry Type are required",
        });
    }

    try {
        const existingRows = await dbQuery(
            `
                SELECT id, status
                FROM notings_records
                WHERE group_name = ? AND month = ? AND year = ? AND entry_type = ?
            `,
            [groupName, payload.month, payload.year, payload.entryType]
        );

        if (existingRows.length > 0) {
            if (existingRows[0].status === "confirmed") {
                return res.status(400).json({
                    success: false,
                    message: "Already confirmed. Cannot modify.",
                });
            }

            if (userRole !== "admin" && !isComment) {
                return res.status(400).json({
                    success: false,
                    message: "Already submitted. Waiting for admin approval.",
                });
            }
        }

        const sql = isComment
            ? `
                INSERT INTO notings_records
                (group_name, month, year, entry_type, notings_hindi_pages, notings_english_pages, eoffice_comments, status)
                VALUES (?, ?, ?, ?, 0, 0, ?, 'pending')
                ON DUPLICATE KEY UPDATE
                    eoffice_comments = VALUES(eoffice_comments)
            `
            : `
                INSERT INTO notings_records
                (group_name, month, year, entry_type, notings_hindi_pages, notings_english_pages, eoffice_comments, status)
                VALUES (?, ?, ?, ?, ?, ?, 0, 'pending')
                ON DUPLICATE KEY UPDATE
                    notings_hindi_pages = VALUES(notings_hindi_pages),
                    notings_english_pages = VALUES(notings_english_pages)
            `;

        const params = isComment
            ? [
                groupName,
                payload.month,
                payload.year,
                payload.entryType,
                payload.eoffice,
            ]
            : [
                groupName,
                payload.month,
                payload.year,
                payload.entryType,
                payload.hindi,
                payload.english,
            ];

        await dbQuery(
            sql,
            params
        );

        let message = "Submitted successfully";

        if (existingRows.length > 0) {
            message = isComment ? "Comment updated successfully" : "Updated successfully";
        } else if (isComment) {
            message = "Comment saved successfully";
        }

        res.json({
            success: true,
            message: userRole === "admin" && existingRows.length > 0
                ? "Updated successfully"
                : message,
        });
    } catch (err) {
        console.error("Notings save error:", err);
        res.status(500).json({
            success: false,
            message: "Database error",
        });
    }
});

// =========================
// CHECK NOTINGS STATUS
// =========================
router.get("/notings/check", requireLogin, async (req, res) => {
    const groupName = req.session.user.group;
    const payload = getNotingsPayload(req.query);
    const isComment = isCommentEntry(payload.entryType);

    if (!hasRequiredFields(payload)) {
        return res.json({ exists: false });
    }

    try {
        const rows = await dbQuery(
            `
                SELECT id, status
                FROM notings_records
                WHERE group_name = ? AND month = ? AND year = ? AND entry_type = ?
            `,
            [groupName, payload.month, payload.year, payload.entryType]
        );

        if (rows.length === 0) {
            return res.json({ exists: false });
        }

        if (isComment && rows[0].status !== "confirmed") {
            return res.json({
                exists: true,
                status: rows[0].status,
                allowResubmit: true,
                message: "A comment entry already exists for this month. Saving again will update its value.",
            });
        }

        res.json({
            exists: true,
            status: rows[0].status,
        });
    } catch (err) {
        console.error("Check status error:", err);
        res.json({ exists: false });
    }
});

// =========================
// ADMIN: CHECK SINGLE EDIT TARGET
// =========================
router.get("/admin/notings/check", requireAdmin, async (req, res) => {
    const editId = Number(req.query.id);
    const payload = getNotingsPayload(req.query);

    if (!editId || !hasRequiredFields(payload)) {
        return res.json({ exists: false });
    }

    try {
        const currentRows = await dbQuery(
            `
                SELECT id, group_name, status
                FROM notings_records
                WHERE id = ?
            `,
            [editId]
        );

        if (currentRows.length === 0) {
            return res.status(404).json({
                exists: true,
                message: "Noting record not found.",
            });
        }

        const current = currentRows[0];

        if (current.status === "confirmed") {
            return res.json({
                exists: true,
                status: current.status,
                message: "This record is already confirmed and cannot be modified.",
            });
        }

        const duplicateRows = await dbQuery(
            `
                SELECT id, status
                FROM notings_records
                WHERE group_name = ? AND month = ? AND year = ? AND entry_type = ? AND id <> ?
            `,
            [current.group_name, payload.month, payload.year, payload.entryType, editId]
        );

        if (duplicateRows.length > 0) {
            return res.json({
                exists: true,
                status: duplicateRows[0].status,
                message: "Another submission already exists for this group, month, year and entry type.",
            });
        }

        res.json({ exists: false });
    } catch (err) {
        console.error("Admin notings check error:", err);
        res.status(500).json({
            exists: true,
            message: "Failed to check noting status.",
        });
    }
});

// =========================
// ADMIN: GET ALL NOTINGS
// =========================
router.get("/admin/notings", requireAdmin, async (req, res) => {
    const { month, year, group } = req.query;

    if (!month || !year) {
        return res.json([]);
    }

    try {
        let sql = `
            SELECT *
            FROM notings_records
            WHERE month = ? AND year = ?
        `;

        const params = [month, year];

        if (group) {
            sql += " AND group_name = ?";
            params.push(group);
        }

        sql += " ORDER BY id DESC";

        const rows = await dbQuery(sql, params);
        res.json(rows);
    } catch (err) {
        console.error("Fetch notings error:", err);
        res.status(500).json({ message: "DB error" });
    }
});

// =========================
// ADMIN: CONFIRM NOTINGS
// =========================
router.post("/admin/notings/confirm", requireAdmin, async (req, res) => {
    const id = Number(req.body.id);

    if (!id) {
        return res.status(400).json({ success: false, message: "Record id is required" });
    }

    try {
        const result = await dbQuery(
            `
                UPDATE notings_records
                SET status = 'confirmed'
                WHERE id = ?
            `,
            [id]
        );

        if (!result.affectedRows) {
            return res.status(404).json({ success: false, message: "Noting not found" });
        }

        res.json({ success: true });
    } catch (err) {
        console.error("Confirm error:", err);
        res.status(500).json({ success: false, message: "Database error" });
    }
});

// =========================
// ADMIN: GET SINGLE NOTING
// =========================
router.get("/admin/notings/:id", requireAdmin, async (req, res) => {
    const id = Number(req.params.id);

    if (!id) {
        return res.status(400).json({ message: "Invalid noting id" });
    }

    try {
        const rows = await dbQuery(
            `
                SELECT
                    id,
                    group_name,
                    month,
                    year,
                    entry_type,
                    notings_hindi_pages,
                    notings_english_pages,
                    eoffice_comments,
                    status
                FROM notings_records
                WHERE id = ?
            `,
            [id]
        );

        if (!rows.length) {
            return res.status(404).json({ message: "Not found" });
        }

        res.json(rows[0]);
    } catch (err) {
        console.error("Fetch single noting error:", err);
        res.status(500).json({ message: "Database error" });
    }
});

// =========================
// ADMIN: UPDATE SINGLE NOTING
// =========================
router.patch("/admin/notings/:id", requireAdmin, async (req, res) => {
    const id = Number(req.params.id);
    const payload = getNotingsPayload(req.body);

    if (!id) {
        return res.status(400).json({
            success: false,
            message: "Invalid noting id",
        });
    }

    if (!hasRequiredFields(payload)) {
        return res.status(400).json({
            success: false,
            message: "Month, Year and Entry Type are required",
        });
    }

    try {
        const currentRows = await dbQuery(
            `
                SELECT id, group_name, status, notings_hindi_pages, notings_english_pages, eoffice_comments
                FROM notings_records
                WHERE id = ?
            `,
            [id]
        );

        if (currentRows.length === 0) {
            return res.status(404).json({
                success: false,
                message: "Noting record not found",
            });
        }

        const current = currentRows[0];
        const nextHindi = isCommentEntry(payload.entryType)
            ? current.notings_hindi_pages
            : payload.hindi;
        const nextEnglish = isCommentEntry(payload.entryType)
            ? current.notings_english_pages
            : payload.english;
        const nextEoffice = isCommentEntry(payload.entryType)
            ? payload.eoffice
            : current.eoffice_comments;

        if (current.status === "confirmed") {
            return res.status(400).json({
                success: false,
                message: "Already confirmed. Cannot modify.",
            });
        }

        const duplicateRows = await dbQuery(
            `
                SELECT id
                FROM notings_records
                WHERE group_name = ? AND month = ? AND year = ? AND entry_type = ? AND id <> ?
            `,
            [current.group_name, payload.month, payload.year, payload.entryType, id]
        );

        if (duplicateRows.length > 0) {
            return res.status(400).json({
                success: false,
                message: "Another submission already exists for this group, month, year and entry type.",
            });
        }

        const result = await dbQuery(
            `
                UPDATE notings_records
                SET month = ?,
                    year = ?,
                    entry_type = ?,
                    notings_hindi_pages = ?,
                    notings_english_pages = ?,
                    eoffice_comments = ?
                WHERE id = ?
            `,
            [
                payload.month,
                payload.year,
                payload.entryType,
                nextHindi,
                nextEnglish,
                nextEoffice,
                id,
            ]
        );

        if (!result.affectedRows) {
            return res.status(404).json({
                success: false,
                message: "Noting record not found",
            });
        }

        res.json({
            success: true,
            message: "Updated successfully",
        });
    } catch (err) {
        console.error("Admin noting update error:", err);
        res.status(500).json({
            success: false,
            message: "Database error",
        });
    }
});

module.exports = router;
