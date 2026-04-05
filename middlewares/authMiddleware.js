// middlewares/authMiddleware.js

function requireLogin(req, res, next) {
    if (!req.session.user) {
        if (req.xhr || req.headers.accept?.includes("application/json")) {
            return res.status(401).json({ success: false, message: "Not logged in" });
        }
        // if normal browser request
        return res.redirect("/");
    }
    next();
}

function requireAdmin(req, res, next) {
    if (!req.session.user || req.session.user.role !== "admin") {
        return res.status(403).json({ success: false, message: "Admins only" });
    }
    next();
}

module.exports = {
    requireLogin,
    requireAdmin,
};
