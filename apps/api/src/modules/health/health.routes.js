const express = require("express");

const healthRouter = express.Router();

healthRouter.get("/", (_request, response) => {
  response.json({
    status: "ok",
    service: "securepay-api",
  });
});

module.exports = {
  healthRouter,
};
