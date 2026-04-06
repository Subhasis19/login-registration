const express = require("express");
const router = express.Router();
const bcrypt = require("bcryptjs");
const crypto = require("crypto");
const nodemailer = require("nodemailer");
const { pool: db, dbQuery } = require("../db");
const { requireLogin } = require("../middlewares/authMiddleware");
require("dotenv").config();

const OTP_PURPOSES = {
  REGISTRATION: "registration",
  PASSWORD_RESET: "password_reset",
};
const OTP_TTL_MS = 5 * 60 * 1000;
const PASSWORD_POLICY_MESSAGE = "Password must be at least 8 characters and include uppercase, lowercase, number, and special character.";
const PASSWORD_POLICY_REGEX = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^A-Za-z0-9]).{8,}$/;

// =========================
// EMAIL TRANSPORTER
// =========================
const transporter = nodemailer.createTransport({
  host: process.env.EMAIL_HOST || "smtp.gmail.com",
  port: Number(process.env.EMAIL_PORT) || 587,
  secure: process.env.EMAIL_SECURE === "true",
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS
  }
});

transporter.verify((err) => {
  console.log(err ? "Email config error" : "Email transporter ready");
});

function createOtp() {
  return crypto.randomInt(100000, 999999).toString();
}

function storeOtpChallenge(req, purpose, email, otp) {
  req.session.emailOtp = {
    purpose,
    email,
    otp,
    expiresAt: Date.now() + OTP_TTL_MS,
    verified: false,
  };
}

function clearOtpChallenge(req) {
  delete req.session.emailOtp;
}

function isOtpVerified(req, purpose, email) {
  const state = req.session.emailOtp;
  return Boolean(
    state
    && state.purpose === purpose
    && state.email === email
    && state.verified === true
  );
}

function verifyOtpChallenge(req, purpose, email, otp) {
  const state = req.session.emailOtp;

  if (!state || state.purpose !== purpose || state.email !== email) {
    return { verified: false, message: "OTP not requested" };
  }

  if (Date.now() > state.expiresAt) {
    clearOtpChallenge(req);
    return { verified: false, message: "OTP expired" };
  }

  if (state.otp !== otp) {
    return { verified: false, message: "Invalid OTP" };
  }

  req.session.emailOtp = {
    purpose,
    email,
    verified: true,
  };

  return { verified: true };
}

function sendOtpEmail(email, otp, subject = "Your OTP") {
  return transporter.sendMail({
    from: process.env.EMAIL_USER,
    to: email,
    subject,
    text: `Your OTP is ${otp}. Valid for 5 minutes.`,
  });
}

async function sendOtpResponse(req, res, { email, purpose, subject }) {
  if (!email) {
    return res.status(400).json({ success: false, message: "Email is required." });
  }

  const otp = createOtp();
  storeOtpChallenge(req, purpose, email, otp);

  try {
    await sendOtpEmail(email, otp, subject);
    res.json({ success: true });
  } catch (err) {
    console.error("OTP mail error:", err);
    res.status(500).json({ success: false, message: "Failed to send OTP email." });
  }
}

async function findUserByEmail(email) {
  const rows = await dbQuery("SELECT id, email FROM users WHERE email = ? LIMIT 1", [email]);
  return rows[0] || null;
}

function getPasswordValidationMessage(password) {
  if (!PASSWORD_POLICY_REGEX.test(password || "")) {
    return PASSWORD_POLICY_MESSAGE;
  }

  return "";
}

// =========================
// OTP SYSTEM
// =========================
router.post("/send-otp", async (req, res) => {
  const { email } = req.body;
  await sendOtpResponse(req, res, {
    email,
    purpose: OTP_PURPOSES.REGISTRATION,
    subject: "Your OTP",
  });
});

router.post("/verify-otp", (req, res) => {
  const { email, otp } = req.body;
  const result = verifyOtpChallenge(req, OTP_PURPOSES.REGISTRATION, email, otp);

  if (!result.verified) {
    return res.status(400).json(result);
  }

  req.session.otpVerified = true;
  req.session.verifiedEmail = email;

  res.send({ verified: true });
});

router.post("/forgot-password", async (req, res) => {
  const { email } = req.body;

  if (!email) {
    return res.status(400).json({ success: false, message: "Email is required." });
  }

  try {
    const user = await findUserByEmail(email);

    if (!user) {
      return res.status(404).json({ success: false, message: "No account found for this email" });
    }

    await sendOtpResponse(req, res, {
      email,
      purpose: OTP_PURPOSES.PASSWORD_RESET,
      subject: "Password Reset OTP",
    });
  } catch (err) {
    console.error("Forgot password OTP error:", err);
    res.status(500).json({ success: false, message: "Failed to send password reset OTP." });
  }
});

router.post("/verify-reset-otp", (req, res) => {
  const { email, otp } = req.body;
  const result = verifyOtpChallenge(req, OTP_PURPOSES.PASSWORD_RESET, email, otp);

  if (!result.verified) {
    return res.status(400).json(result);
  }

  res.json({ verified: true });
});

router.post("/reset-password", async (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({ success: false, message: "Email and password are required" });
  }

  if (!isOtpVerified(req, OTP_PURPOSES.PASSWORD_RESET, email)) {
    return res.status(400).json({ success: false, message: "Verify OTP first" });
  }

  const passwordError = getPasswordValidationMessage(password);
  if (passwordError) {
    return res.status(400).json({ success: false, message: passwordError });
  }

  try {
    const hash = await bcrypt.hash(password, 10);
    const result = await dbQuery("UPDATE users SET password = ? WHERE email = ?", [hash, email]);

    if (!result.affectedRows) {
      return res.status(404).json({ success: false, message: "User not found" });
    }

    clearOtpChallenge(req);
    req.session.otpVerified = false;
    delete req.session.verifiedEmail;

    res.json({ success: true });
  } catch (err) {
    console.error("Reset password error:", err);
    res.status(500).json({ success: false, message: "Server error" });
  }
});

// =========================
// USER REGISTRATION & LOGIN
// =========================
router.post("/register", (req, res) => {
  const { name, email, mobile, password, confirmPassword, group_name } = req.body;

  if (!req.session.otpVerified || req.session.verifiedEmail !== email) {
    return res.status(400).send('Verify OTP first <a href="register.html">Try again</a>');
  }

  if (password !== confirmPassword) {
    return res.status(400).send('Passwords do not match <a href="register.html">Try again</a>');
  }

  const passwordError = getPasswordValidationMessage(password);
  if (passwordError) {
    return res.status(400).send(`${passwordError} <a href="register.html">Try again</a>`);
  }

  bcrypt.hash(password, 10, (err, hash) => {
    if (err) return res.status(500).send("Failed to secure the password.");

    db.query(
      "INSERT INTO users (name, email, mobile, password, role, group_name) VALUES (?, ?, ?, ?, ?, ?)",
      [name, email, mobile, hash, "user", group_name],
      (err) => {
        if (err) {
          if (err.code === "ER_DUP_ENTRY") {
            return res.status(409).send('An account with this email already exists <a href="register.html">Try again</a>');
          }

          return res.status(500).send("Failed to complete registration.");
        }

        req.session.otpVerified = false;
        delete req.session.verifiedEmail;
        clearOtpChallenge(req);

        res.status(201).send('Registration complete <a href="/">Login</a>');
      }
    );
  });
});

router.post("/login", (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).send("Email and password are required.");
  }

  db.query("SELECT * FROM users WHERE email = ?", [email], (err, rows) => {
    if (err) return res.status(500).send("Failed to query users.");
    if (rows.length === 0) return res.status(404).send("User not found");

    const user = rows[0];

    bcrypt.compare(password, user.password, (err, match) => {
      if (err) return res.status(500).send("Failed to verify password.");
      if (!match) return res.status(401).send("Invalid password");

      req.session.user = {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
        group: user.group_name
      };

      res.redirect("/dashboard.html");
    });
  });
});

// =========================
// SESSION INFO & LOGOUT
// =========================
router.get("/session-info", requireLogin, (req, res) => {
  res.json({ loggedIn: true, user: req.session.user });
});

router.get("/logout", (req, res) => {
  req.session.destroy(() => res.redirect("/"));
});

module.exports = router;
