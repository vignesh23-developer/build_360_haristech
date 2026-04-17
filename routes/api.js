const express = require('express');
const router = express.Router();
const { authMiddleware } = require('../middleware/auth');
const authCtrl = require('../controllers/authController');
const coreCtrl = require('../controllers/coreController');
const featCtrl = require('../controllers/featureController');

// ── Auth (Public) ────────────────────────────────────────────────────────────
router.post('/auth/send-otp', authCtrl.sendOtp);
router.post('/auth/verify-otp', authCtrl.verifyOtp);
router.post('/auth/login', authCtrl.login);

// ── Protected routes ─────────────────────────────────────────────────────────
router.use(authMiddleware);

// Profile
router.get('/auth/profile', authCtrl.getProfile);

// Dashboard
router.get('/dashboard/:projectId', coreCtrl.getDashboardStats);

// Attendance
router.get('/attendance/workers/:projectId', coreCtrl.getTodayWorkers);
router.post('/attendance/check-in', coreCtrl.checkIn);
router.put('/attendance/check-out/:id', coreCtrl.checkOut);
router.post('/attendance/bulk', coreCtrl.bulkAttendance);

// Progress Reports
router.get('/progress/:projectId', coreCtrl.getProgressReports);
router.post('/progress', coreCtrl.submitProgressReport);

// PO Requests
router.get('/po-requests/:projectId', featCtrl.getPORequests);
router.post('/po-requests', featCtrl.createPORequest);
router.put('/po-requests/:id/approve', featCtrl.approvePORequest);

// BOQ
router.get('/boq/:projectId', featCtrl.getBOQItems);
router.put('/boq/:id/update', featCtrl.updateBOQProgress);

// Issues
router.get('/issues/:projectId', featCtrl.getIssues);
router.post('/issues', featCtrl.createIssue);
router.put('/issues/:id/escalate', featCtrl.escalateIssue);

// Notifications
router.get('/notifications', featCtrl.getNotifications);
router.put('/notifications/:id/read', featCtrl.markRead);
router.put('/notifications/read-all', featCtrl.markAllRead);

// Wages
router.get('/wages/:userId', featCtrl.getWages);

module.exports = router;
