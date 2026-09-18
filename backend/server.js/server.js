const express = require("express");
const cors = require("cors");
const crypto = require("crypto");
require("dotenv").config();

const app = express();
const PORT = Number(process.env.PORT) || 5000;
const sessions = new Map();
const allowedOrigins = (process.env.CORS_ORIGINS || "http://localhost:4173")
    .split(",")
    .map(origin => origin.trim())
    .filter(Boolean);

app.use(cors({
    origin(origin, callback) {
        if (!origin || allowedOrigins.includes("*") || allowedOrigins.includes(origin)) {
            callback(null, true);
            return;
        }
        callback(new Error("Origin is not allowed by CORS"));
    }
}));
app.use(express.json());

app.get("/", (req, res) => {
    res.json({
        message: "WEATHERGUARD AI Backend is running!",
        endpoints: ["POST /api/auth/login", "GET /api/health"]
    });
});

app.get("/api/health", (req, res) => {
    res.json({ status: "ok", service: "weatherguard-api" });
});

function clean(value) {
    return typeof value === "string" ? value.trim() : "";
}

function issueSession(user) {
    const token = crypto.randomBytes(32).toString("hex");
    sessions.set(token, { ...user, expiresAt: Date.now() + 8 * 60 * 60 * 1000 });
    return token;
}

app.post("/api/auth/login", (req, res) => {
    const role = clean(req.body?.role);
    const name = clean(req.body?.name);
    const id = clean(req.body?.id);
    const password = clean(req.body?.password);
    const phone = clean(req.body?.phone);

    if (!["citizen", "reviewer", "administrator"].includes(role)) {
        return res.status(400).json({ message: "Choose a valid position." });
    }

    if (role === "citizen") {
        const normalizedPhone = phone.replace(/[\s()-]/g, "");
        if (!/^\+?[0-9]{7,15}$/.test(normalizedPhone)) {
            return res.status(400).json({ message: "Enter a valid mobile number." });
        }
        const token = issueSession({ role, name: "Citizen", id: normalizedPhone });
        return res.json({ token, role, name: "Citizen" });
    }

    const prefix = role === "administrator" ? "ADMIN" : "REVIEWER";
    const expectedName = clean(process.env[`${prefix}_NAME`]);
    const expectedId = clean(process.env[`${prefix}_ID`]);
    const expectedPassword = clean(process.env[`${prefix}_PASSWORD`]);

    if (!expectedName || !expectedId || !expectedPassword) {
        return res.status(503).json({ message: `${role} login is not configured on the server.` });
    }

    if (name !== expectedName || id !== expectedId || password !== expectedPassword) {
        return res.status(401).json({ message: "The supplied staff details are incorrect." });
    }

    const token = issueSession({ role, name, id });
    return res.json({ token, role, name });
});

app.use((error, req, res, next) => {
    if (error.message === "Origin is not allowed by CORS") {
        return res.status(403).json({ message: error.message });
    }
    return next(error);
});

app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});
