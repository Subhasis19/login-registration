const { dbQuery } = require("../db");

function mapSessionUser(row) {
    return {
        id: row.id,
        name: row.name,
        email: row.email,
        role: row.role,
        group: row.group_name,
    };
}

function isDocumentRequest(req) {
    const acceptHeader = req.headers.accept || "";
    const fetchDestination = req.headers["sec-fetch-dest"] || "";

    return req.method === "GET"
        && (
            fetchDestination === "document"
            || fetchDestination === "iframe"
            || acceptHeader.includes("text/html")
        );
}

function sendAuthFailure(req, res, status, message) {
    if (status >= 500) {
        return res.status(status).json({ success: false, message });
    }

    if (isDocumentRequest(req)) {
        return res.redirect("/");
    }

    return res.status(status).json({ success: false, message });
}

function destroySession(req) {
    return new Promise((resolve) => {
        req.session.destroy(() => resolve());
    });
}

async function getSessionUser(req) {
    const sessionUserId = Number(req.session?.user?.id);

    if (!sessionUserId) {
        return null;
    }

    const rows = await dbQuery(
        `
            SELECT id, name, email, role, group_name
            FROM users
            WHERE id = ?
            LIMIT 1
        `,
        [sessionUserId]
    );

    return rows[0] ? mapSessionUser(rows[0]) : null;
}

async function ensureActiveSessionUser(req) {
    if (!req.session?.user) {
        return {
            ok: false,
            status: 401,
            message: "Not logged in",
        };
    }

    try {
        const user = await getSessionUser(req);

        if (!user) {
            await destroySession(req);

            return {
                ok: false,
                status: 401,
                message: "Your session is no longer valid. Please log in again.",
            };
        }

        req.session.user = user;

        return {
            ok: true,
            user,
        };
    } catch (err) {
        console.error("Auth session validation error:", err);

        return {
            ok: false,
            status: 500,
            message: "Failed to validate session",
        };
    }
}

async function requireLogin(req, res, next) {
    const result = await ensureActiveSessionUser(req);

    if (!result.ok) {
        return sendAuthFailure(req, res, result.status, result.message);
    }

    next();
}

async function requireAdmin(req, res, next) {
    const result = await ensureActiveSessionUser(req);

    if (!result.ok) {
        return sendAuthFailure(req, res, result.status, result.message);
    }

    if (result.user.role !== "admin") {
        return sendAuthFailure(req, res, 403, "Admins only");
    }

    next();
}

module.exports = {
    ensureActiveSessionUser,
    requireLogin,
    requireAdmin,
};
