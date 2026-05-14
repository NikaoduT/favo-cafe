/**
 * Simple request logger middleware.
 * Replaces console.log in route handlers — keeps production logs clean.
 */
const requestLogger = (req, res, next) => {
  const start = Date.now();
  res.on('finish', () => {
    const duration = Date.now() - start;
    const log = `[${new Date().toISOString()}] ${req.method} ${req.originalUrl} ${res.statusCode} ${duration}ms`;
    if (res.statusCode >= 500) {
      console.error(log);
    } else if (process.env.NODE_ENV !== 'production') {
      console.log(log);
    }
  });
  next();
};

module.exports = { requestLogger };
