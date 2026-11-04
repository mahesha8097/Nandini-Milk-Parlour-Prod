const express = require('express');
const router = express.Router();
const indentService = require('../services/indentService');
const { requireAdmin } = require('../middleware/auth');

// Get indent by date (Admin only)
router.get('/', requireAdmin, async (req, res) => {
  try {
    const { date } = req.query;
    const agentId = req.agentId || 1;
    const result = await indentService.getIndentByDate(date, agentId);
    res.json(result);
  } catch (err) {
    console.error('Fetch indent error:', err);
    res.status(500).json({ error: err.message || 'Failed to fetch indent' });
  }
});

// Get profit & sales summary (Daily, Weekly, Monthly)
router.get('/summary', requireAdmin, async (req, res) => {
  try {
    const { date } = req.query;
    const agentId = req.agentId || 1;
    const summary = await indentService.getProfitSummary(date, agentId);
    res.json(summary);
  } catch (err) {
    console.error('Fetch profit summary error:', err);
    res.status(500).json({ error: err.message || 'Failed to fetch profit summary' });
  }
});

// Get default Nandini product indent template
router.get('/template', requireAdmin, (req, res) => {
  try {
    const template = indentService.getDefaultTemplate();
    res.json(template);
  } catch (err) {
    res.status(500).json({ error: err.message || 'Failed to get template' });
  }
});

// Save or update daily indent with calculations
router.post('/', requireAdmin, async (req, res) => {
  try {
    const agentId = req.agentId || 1;
    const saved = await indentService.saveOrUpdateIndent(req.body, agentId);
    res.status(200).json(saved);
  } catch (err) {
    console.error('Save indent error:', err);
    res.status(400).json({ error: err.message || 'Failed to save indent' });
  }
});

// Push closing leftovers to next day's opening stock
router.post('/push-leftover', requireAdmin, async (req, res) => {
  try {
    const { date } = req.body;
    if (!date) {
      return res.status(400).json({ error: 'Date is required' });
    }
    const agentId = req.agentId || 1;
    const result = await indentService.pushLeftoversToNextDay(date, agentId);
    res.json(result);
  } catch (err) {
    console.error('Push leftovers error:', err);
    res.status(400).json({ error: err.message || 'Failed to push leftovers to next day' });
  }
});

// Delete an indent
router.delete('/:id', requireAdmin, async (req, res) => {
  try {
    const agentId = req.agentId || 1;
    const result = await indentService.deleteIndent(req.params.id, agentId);
    res.json(result);
  } catch (err) {
    console.error('Delete indent error:', err);
    res.status(500).json({ error: err.message || 'Failed to delete indent' });
  }
});

module.exports = router;
