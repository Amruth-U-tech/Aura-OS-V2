const express = require('express');
const router = express.Router();
const disciplineController = require('../controllers/disciplineController');
const { protect } = require('../middleware/authMiddleware');

// ======================================================
// DISCIPLINE ROUTES
// All routes protected — require valid JWT
// ======================================================

router.get('/state', protect, disciplineController.getDisciplineState);
router.patch('/toggle', protect, disciplineController.toggleDiscipline);
router.post('/complete', protect, disciplineController.completeDiscipline);

module.exports = router;
