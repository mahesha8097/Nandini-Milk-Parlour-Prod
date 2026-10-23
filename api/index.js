// Vercel Serverless Function Entry Point
let app;
let initError = null;

try {
  app = require('../server/index');
} catch (err) {
  console.error('Fatal initialization error in server:', err);
  initError = err;
}

module.exports = (req, res) => {
  if (initError || !app) {
    return res.status(500).json({
      error: 'Backend initialization failed',
      details: initError ? initError.message : 'Unknown startup error'
    });
  }
  return app(req, res);
};
