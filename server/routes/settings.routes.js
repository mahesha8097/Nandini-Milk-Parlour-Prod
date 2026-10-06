const express = require('express');
const router = express.Router();
const db = require('../config/db');
const { requireAdmin } = require('../middleware/auth');

// Get all system settings
router.get('/', requireAdmin, async (req, res) => {
  try {
    const rows = await db.prepare('SELECT * FROM app_settings').all();
    const settings = {};
    for (const r of rows || []) {
      settings[r.key] = r.value;
    }
    res.json(settings);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch settings' });
  }
});

// Update settings
router.post('/', requireAdmin, async (req, res) => {
  try {
    const settings = req.body;
    const upsertStmt = db.prepare(`
      INSERT INTO app_settings (key, value, updated_at)
      VALUES (?, ?, datetime('now', 'localtime'))
      ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at
    `);

    for (const [key, value] of Object.entries(settings || {})) {
      await upsertStmt.run(key, typeof value === 'string' ? value : JSON.stringify(value));
    }

    res.json({ message: 'Settings saved successfully' });
  } catch (err) {
    res.status(500).json({ error: 'Failed to save settings' });
  }
});

module.exports = router;
