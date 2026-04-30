class AppError extends Error {
  constructor(statusCode, message, details = null) {
    super(message);
    this.name = "AppError";
    this.statusCode = statusCode;
    this.details = details;
  }
}

function isAppError(error) {
  return error instanceof AppError;
}

function asyncHandler(handler) {
  return async function wrappedHandler(req, res, next) {
    try {
      await handler(req, res, next);
    } catch (error) {
      next(error);
    }
  };
}

function errorHandler(error, _req, res, _next) {
  if (isAppError(error)) {
    return res.status(error.statusCode).json({
      error: error.message,
      details: error.details,
    });
  }

  return res.status(500).json({
    error: "An unexpected error occurred.",
    details:
      process.env.NODE_ENV === "production" ? null : { message: error.message },
  });
}

module.exports = {
  AppError,
  HttpError: AppError,
  isAppError,
  isHttpError: isAppError,
  asyncHandler,
  errorHandler,
};
