const mongoose = require('mongoose');
const { createAutomationRun, listAutomationRuns, getAutomationRun } = require('../services/automationWorkflow');
const { subscribeToAutomationUpdates } = require('../services/automationEvents');

const isValidObjectId = (value) => mongoose.Types.ObjectId.isValid(value);

exports.startAutomation = async (req, res) => {
  try {
    const { bookId, name, age, gender, email, countryCode, phoneNumber } = req.body;

    if (!isValidObjectId(bookId)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid book ID',
      });
    }

    if (!name || !age || !gender || !email || !countryCode || !phoneNumber) {
      return res.status(400).json({
        success: false,
        message: 'Missing required user fields',
      });
    }

    const files = Array.isArray(req.files) ? req.files : Array.isArray(req.files?.images) ? req.files.images : [];
    if (!files.length) {
      return res.status(400).json({
        success: false,
        message: 'Upload at least one reference photo',
      });
    }

    let overrides = [];
    if (req.body.overrides) {
      try {
        const parsed = JSON.parse(req.body.overrides);
        if (Array.isArray(parsed)) {
          overrides = parsed;
        }
      } catch (error) {
        return res.status(400).json({
          success: false,
          message: 'Invalid overrides payload',
        });
      }
    }

    const run = await createAutomationRun({
      bookId,
      userInput: { name, age, gender, email, countryCode, phoneNumber },
      files,
      overrides,
    });

    res.status(202).json({
      success: true,
      message: 'Automation started',
      data: run,
    });
  } catch (error) {
    console.error('Error starting automation:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Failed to start automation',
    });
  }
};

exports.listRuns = async (req, res) => {
  try {
    const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 20, 1), 50);
    const runs = await listAutomationRuns({ limit });
    res.status(200).json({
      success: true,
      count: runs.length,
      data: runs,
    });
  } catch (error) {
    console.error('Error listing automation runs:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to list automation runs',
      error: error.message,
    });
  }
};

exports.getRun = async (req, res) => {
  try {
    const { id } = req.params;
    if (!isValidObjectId(id)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid automation run ID',
      });
    }
    const run = await getAutomationRun(id);
    if (!run) {
      return res.status(404).json({
        success: false,
        message: 'Automation run not found',
      });
    }
    res.status(200).json({
      success: true,
      data: run,
    });
  } catch (error) {
    console.error('Error fetching automation run:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch automation run',
      error: error.message,
    });
  }
};

exports.streamRuns = (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');

  if (res.flushHeaders) {
    res.flushHeaders();
  }

  res.write(': automation-stream-start\n\n');

  const unsubscribe = subscribeToAutomationUpdates((payload) => {
    if (!payload) return;
    res.write(`data: ${JSON.stringify(payload)}\n\n`);
  });

  const heartbeat = setInterval(() => {
    res.write(': ping\n\n');
  }, 25000);

  req.on('close', () => {
    clearInterval(heartbeat);
    unsubscribe();
  });
};
