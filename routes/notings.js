const express = require("express");
const router = express.Router();
const { dbQuery } = require("../db");
const { requireLogin, requireAdmin } = require("../middlewares/authMiddleware");

const ENTRY_TYPES = {
    NOTING: "Noting",
    COMMENT: "Comment",
};

function normalizeEntryType(value) {
    return value === ENTRY_TYPES.NOTING || value === ENTRY_TYPES.COMMENT
        ? value
        : "";
}

function getNotingsPayload(body) {
    return {
        month: Number(body.month),
        year: Number(body.year),
        entryType: normalizeEntryType(body.entry_type),
        hindi: Number(body.hindi) || 0,
        english: Number(body.english) || 0,
        eoffice: Number(body.eoffice) || 0,
    };
}

function hasRequiredFields({ month, year, entryType }) {
    return Boolean(month && year && entryType);
}

function isCommentEntry(entryType) {
    return entryType === ENTRY_TYPES.COMMENT;
}

function hasNotingValues(row) {
    return (Number(row?.notings_hindi_pages) || 0) > 0
        || (Number(row?.notings_english_pages) || 0) > 0;
}

function buildStoredValues(payload, currentRow = null) {
    const nextValues = {
        hindi: Number(currentRow?.notings_hindi_pages) || 0,
        english: Number(currentRow?.notings_english_pages) || 0,
        eoffice: Number(currentRow?.eoffice_comments) || 0,
    };

    if (isCommentEntry(payload.entryType)) {
        nextValues.eoffice = payload.eoffice;
    } else {
        nextValues.hindi = payload.hindi;
        nextValues.english = payload.english;
    }

    return nextValues;
}

async function getMonthlyNotingRow(groupName, month, year) {
    const rows = await dbQuery(
        `
            SELECT
                id,
                group_name,
                month,
                year,
                status,
                notings_hindi_pages,
                notings_english_pages,
                eoffice_comments
            FROM notings_records
            WHERE group_name = ? AND month = ? AND year = ?
            LIMIT 1
        `,
        [groupName, month, year]
    );

    return rows[0] || null;
}

async function getNotingRowById(id) {
    const rows = await dbQuery(
        `
            SELECT
                id,
                group_name,
                month,
                year,
                status,
                notings_hindi_pages,
                notings_english_pages,
                eoffice_comments
            FROM notings_records
            WHERE id = ?
            LIMIT 1
        `,
        [id]
    );

    return rows[0] || null;
}

async function getConflictingMonthlyRow(groupName, month, year, excludedId) {
    const rows = await dbQuery(
        `
            SELECT id, status
            FROM notings_records
            WHERE group_name = ? AND month = ? AND year = ? AND id <> ?
            LIMIT 1
        `,
        [groupName, month, year, excludedId]
    );

    return rows[0] || null;
}

async function insertMonthlyRow(groupName, payload) {
    const values = buildStoredValues(payload);

    const result = await dbQuery(
        `
            INSERT INTO notings_records
            (group_name, month, year, entry_type, notings_hindi_pages, notings_english_pages, eoffice_comments, status)
            VALUES (?, ?, ?, ?, ?, ?, ?, 'pending')
        `,
        [
            groupName,
            payload.month,
            payload.year,
            payload.entryType || ENTRY_TYPES.NOTING,
            values.hindi,
            values.english,
            values.eoffice,
        ]
    );

    return result.insertId;
}

async function updateMonthlyRow(id, payload, currentRow) {
    const values = buildStoredValues(payload, currentRow);

    return dbQuery(
        `
            UPDATE notings_records
            SET month = ?,
                year = ?,
                notings_hindi_pages = ?,
                notings_english_pages = ?,
                eoffice_comments = ?
            WHERE id = ?
        `,
        [
            payload.month,
            payload.year,
            values.hindi,
            values.english,
            values.eoffice,
            id,
        ]
    );
}

function buildUserCheckResponse(row, payload) {
    if (!row) {
        return { exists: false };
    }

    if (row.status === "confirmed") {
        return {
            exists: true,
            status: row.status,
            message: "This monthly record is already confirmed and cannot be modified.",
        };
    }

    if (isCommentEntry(payload.entryType)) {
        return {
            exists: true,
            status: row.status,
            allowUpdate: true,
            message: "A monthly record already exists for this month. Saving again will update the comment value.",
        };
    }

    if (!hasNotingValues(row)) {
        return {
            exists: true,
            status: row.status,
            allowUpdate: true,
            message: "A monthly record already exists for this month. Saving will add the noting values.",
        };
    }

    return {
        exists: true,
        status: row.status,
        message: "Noting values already submitted for this month. Waiting for admin approval.",
    };
}

function buildSubmitSuccessMessage({ entryType, rowExisted, userRole }) {
    if (userRole === "admin" && rowExisted) {
        return "Updated successfully";
    }

    if (isCommentEntry(entryType)) {
        return rowExisted ? "Comment updated successfully" : "Comment saved successfully";
    }

    return rowExisted ? "Updated successfully" : "Submitted successfully";
}

// =========================
// NOTINGS: SAVE MONTHLY DATA
// =========================
router.post("/notings/save", requireLogin, async (req, res) => {
    const groupName = req.session.user.group;
    const userRole = req.session.user.role;
    const payload = getNotingsPayload(req.body);

    if (!hasRequiredFields(payload)) {
        return res.status(400).json({
            success: false,
            message: "Month, Year and Entry Type are required",
        });
    }

    try {
        const currentRow = await getMonthlyNotingRow(groupName, payload.month, payload.year);

        if (!currentRow) {
            await insertMonthlyRow(groupName, payload);

            return res.json({
                success: true,
                message: buildSubmitSuccessMessage({
                    entryType: payload.entryType,
                    rowExisted: false,
                    userRole,
                }),
            });
        }

        if (currentRow.status === "confirmed") {
            return res.status(400).json({
                success: false,
                message: "Already confirmed. Cannot modify.",
            });
        }

        if (!isCommentEntry(payload.entryType) && userRole !== "admin" && hasNotingValues(currentRow)) {
            return res.status(400).json({
                success: false,
                message: "Already submitted. Waiting for admin approval.",
            });
        }

        await updateMonthlyRow(currentRow.id, payload, currentRow);

        res.json({
            success: true,
            message: buildSubmitSuccessMessage({
                entryType: payload.entryType,
                rowExisted: true,
                userRole,
            }),
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

    if (!hasRequiredFields(payload)) {
        return res.json({ exists: false });
    }

    try {
        const row = await getMonthlyNotingRow(groupName, payload.month, payload.year);
        res.json(buildUserCheckResponse(row, payload));
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
        const currentRow = await getNotingRowById(editId);

        if (!currentRow) {
            return res.status(404).json({
                exists: true,
                message: "Noting record not found.",
            });
        }

        if (currentRow.status === "confirmed") {
            return res.json({
                exists: true,
                status: currentRow.status,
                message: "This record is already confirmed and cannot be modified.",
            });
        }

        const conflictingRow = await getConflictingMonthlyRow(
            currentRow.group_name,
            payload.month,
            payload.year,
            editId
        );

        if (conflictingRow) {
            return res.json({
                exists: true,
                status: conflictingRow.status,
                message: "Another monthly record already exists for this group, month and year.",
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
            SELECT
                id,
                group_name,
                month,
                year,
                notings_hindi_pages,
                notings_english_pages,
                eoffice_comments,
                status
            FROM notings_records
            WHERE month = ? AND year = ?
        `;

        const params = [month, year];

        if (group) {
            sql += " AND group_name = ?";
            params.push(group);
        }

        sql += " ORDER BY group_name ASC, id DESC";

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
        const row = await getNotingRowById(id);

        if (!row) {
            return res.status(404).json({ message: "Not found" });
        }

        res.json(row);
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
        const currentRow = await getNotingRowById(id);

        if (!currentRow) {
            return res.status(404).json({
                success: false,
                message: "Noting record not found",
            });
        }

        if (currentRow.status === "confirmed") {
            return res.status(400).json({
                success: false,
                message: "Already confirmed. Cannot modify.",
            });
        }

        const conflictingRow = await getConflictingMonthlyRow(
            currentRow.group_name,
            payload.month,
            payload.year,
            id
        );

        if (conflictingRow) {
            return res.status(400).json({
                success: false,
                message: "Another monthly record already exists for this group, month and year.",
            });
        }

        const result = await updateMonthlyRow(id, payload, currentRow);

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
