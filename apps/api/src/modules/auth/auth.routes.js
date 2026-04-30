const express = require("express");

const {
  loginUser,
  refreshUserSession,
  registerUser,
  getSessionForUser,
} = require("./auth.service");
const {
  requireAuthenticatedUser,
} = require("../../shared/middleware/authentication");

const authRouter = express.Router();

authRouter.post("/register", async (req, res, next) => {
  try {
    const result = await registerUser(req.body || {});
    res.status(201).json(result);
  } catch (error) {
    next(error);
  }
});

authRouter.post("/login", async (req, res, next) => {
  try {
    const result = await loginUser(req.body || {});
    res.json(result);
  } catch (error) {
    next(error);
  }
});

authRouter.post("/refresh", async (req, res, next) => {
  try {
    const result = await refreshUserSession(req.body || {});
    res.json(result);
  } catch (error) {
    next(error);
  }
});

authRouter.get("/me", requireAuthenticatedUser, async (req, res, next) => {
  try {
    const session = await getSessionForUser(req.auth.userId, req.context.tenantId);
    res.json(session);
  } catch (error) {
    next(error);
  }
});

module.exports = {
  authRouter,
};
