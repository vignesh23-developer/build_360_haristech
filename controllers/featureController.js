const db = require('../config/db');

// ═══════════════════════════════════════════════════════════
// PO REQUESTS CONTROLLER
// ═══════════════════════════════════════════════════════════
const generateRequestNo = () => `POR-${Date.now().toString().slice(-4)}${Math.floor(Math.random() * 10)}`;

exports.getPORequests = async (req, res) => {
  try {
    const { projectId } = req.params;
    const { status } = req.query;
    let query = `
      SELECT pr.*, u.name as requested_by, p.name as project_name
      FROM po_requests pr
      JOIN users u ON u.id = pr.user_id
      JOIN projects p ON p.id = pr.project_id
      WHERE pr.project_id = ?
    `;
    const params = [projectId];
    if (status) { query += ' AND pr.status = ?'; params.push(status); }
    query += ' ORDER BY pr.created_at DESC';

    const [requests] = await db.query(query, params);

    // Attach approvals
    for (const req of requests) {
      const [approvals] = await db.query('SELECT * FROM po_request_approvals WHERE request_id = ? ORDER BY date ASC', [req.id]);
      req.approvals = approvals;
    }
    res.json({ success: true, requests });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

exports.createPORequest = async (req, res) => {
  try {
    const { project_id, user_id, category, item_name, brand, quantity, unit, required_date, priority, reason, estimated_cost, supplier_preferred } = req.body;
    const requestNo = generateRequestNo();

    const [result] = await db.query(`
      INSERT INTO po_requests (request_no, project_id, user_id, category, item_name, brand, quantity, unit, required_date, priority, reason, estimated_cost, supplier_preferred)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [requestNo, project_id, user_id, category, item_name, brand || null, quantity, unit, required_date, priority || 'Medium', reason, estimated_cost || null, supplier_preferred || null]);

    // Notify supervisor
    await db.query(`
      INSERT INTO notifications (user_id, title, body, type, reference_id)
      SELECT id, 'New PO Request Submitted', CONCAT('${requestNo}: ', ?, ' · ', ?, ' ', ?), 'material', '${result.insertId}'
      FROM users WHERE role IN ('Supervisor','Project Manager') AND project_id = ?
    `, [item_name, quantity, unit, project_id]);

    const [[request]] = await db.query(`
      SELECT pr.*, u.name as requested_by, p.name as project_name
      FROM po_requests pr
      JOIN users u ON u.id = pr.user_id
      JOIN projects p ON p.id = pr.project_id
      WHERE pr.id = ?
    `, [result.insertId]);

    res.status(201).json({ success: true, message: 'PO Request submitted successfully', request });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

exports.approvePORequest = async (req, res) => {
  try {
    const { id } = req.params;
    const { action, remarks } = req.body;
    const approverName = req.user.name;
    const approverRole = req.user.role;

    const newStatus = action === 'approved' ? 'Approved' : action === 'rejected' ? 'Rejected' : 'Pending';
    await db.query('UPDATE po_requests SET status = ? WHERE id = ?', [newStatus, id]);
    await db.query('INSERT INTO po_request_approvals (request_id, approved_by, approver_role, action, remarks) VALUES (?, ?, ?, ?, ?)', [id, approverName, approverRole, action, remarks || null]);

    // Notify requester
    const [[poReq]] = await db.query('SELECT * FROM po_requests WHERE id = ?', [id]);
    if (poReq) {
      await db.query(`
        INSERT INTO notifications (user_id, title, body, type, reference_id)
        VALUES (?, ?, ?, 'material', ?)
      `, [poReq.user_id, `Request ${action.charAt(0).toUpperCase() + action.slice(1)}`, `${poReq.request_no} · ${poReq.item_name} has been ${action} by ${approverName}`, id]);
    }

    const [[request]] = await db.query(`
      SELECT pr.*, u.name as requested_by FROM po_requests pr JOIN users u ON u.id = pr.user_id WHERE pr.id = ?
    `, [id]);

    res.json({ success: true, message: `Request ${action} successfully`, request });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// ═══════════════════════════════════════════════════════════
// BOQ CONTROLLER
// ═══════════════════════════════════════════════════════════
exports.getBOQItems = async (req, res) => {
  try {
    const { projectId } = req.params;
    const [items] = await db.query('SELECT * FROM boq_items WHERE project_id = ? ORDER BY category, task_name', [projectId]);
    res.json({ success: true, items });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

exports.updateBOQProgress = async (req, res) => {
  try {
    const { id } = req.params;
    const { done_qty } = req.body;

    const [[current]] = await db.query('SELECT * FROM boq_items WHERE id = ?', [id]);
    if (!current) return res.status(404).json({ success: false, message: 'BOQ item not found' });

    let newStatus = current.status;
    const pct = (done_qty / current.planned_qty) * 100;
    if (pct >= 100) newStatus = 'completed';
    else if (pct > 0) newStatus = 'in_progress';
    else newStatus = 'planned';

    await db.query('UPDATE boq_items SET done_qty = ?, status = ? WHERE id = ?', [done_qty, newStatus, id]);
    const [[item]] = await db.query('SELECT * FROM boq_items WHERE id = ?', [id]);
    res.json({ success: true, item });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// ═══════════════════════════════════════════════════════════
// ISSUES CONTROLLER
// ═══════════════════════════════════════════════════════════
exports.getIssues = async (req, res) => {
  try {
    const { projectId } = req.params;
    const { status } = req.query;
    let query = `
      SELECT i.*, u.name as reported_by
      FROM issues i JOIN users u ON u.id = i.user_id
      WHERE i.project_id = ?
    `;
    const params = [projectId];
    if (status) { query += ' AND i.status = ?'; params.push(status); }
    query += ' ORDER BY FIELD(i.severity,"critical","high","medium","low"), i.created_at DESC';

    const [issues] = await db.query(query, params);
    res.json({ success: true, issues });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

exports.createIssue = async (req, res) => {
  try {
    const { project_id, user_id, issue_type, title, description, severity } = req.body;
    const [result] = await db.query(`
      INSERT INTO issues (project_id, user_id, issue_type, title, description, severity, status)
      VALUES (?, ?, ?, ?, ?, ?, 'open')
    `, [project_id, user_id, issue_type, title, description, severity || 'medium']);

    // Notify supervisor/PM for critical issues
    if (severity === 'critical') {
      await db.query(`
        INSERT INTO notifications (user_id, title, body, type, reference_id)
        SELECT id, '🚨 Critical Issue Reported', ?, 'safety', ?
        FROM users WHERE role IN ('Supervisor','Project Manager') AND project_id = ?
      `, [`${issue_type}: ${title}`, result.insertId, project_id]);
    }

    const [[issue]] = await db.query('SELECT i.*, u.name as reported_by FROM issues i JOIN users u ON u.id = i.user_id WHERE i.id = ?', [result.insertId]);
    res.status(201).json({ success: true, issue });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

exports.escalateIssue = async (req, res) => {
  try {
    const { id } = req.params;
    await db.query('UPDATE issues SET status = "in_progress", escalated_at = NOW() WHERE id = ?', [id]);
    const [[issue]] = await db.query('SELECT i.*, u.name as reported_by FROM issues i JOIN users u ON u.id = i.user_id WHERE i.id = ?', [id]);
    res.json({ success: true, message: 'Issue escalated', issue });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// ═══════════════════════════════════════════════════════════
// NOTIFICATIONS CONTROLLER
// ═══════════════════════════════════════════════════════════
exports.getNotifications = async (req, res) => {
  try {
    const [notifications] = await db.query(`
      SELECT * FROM notifications WHERE user_id = ? ORDER BY created_at DESC LIMIT 50
    `, [req.user.id]);
    res.json({ success: true, notifications });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

exports.markRead = async (req, res) => {
  try {
    await db.query('UPDATE notifications SET is_read = 1 WHERE id = ? AND user_id = ?', [req.params.id, req.user.id]);
    res.json({ success: true, message: 'Marked as read' });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

exports.markAllRead = async (req, res) => {
  try {
    await db.query('UPDATE notifications SET is_read = 1 WHERE user_id = ?', [req.user.id]);
    res.json({ success: true, message: 'All notifications marked as read' });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// ═══════════════════════════════════════════════════════════
// WAGES CONTROLLER
// ═══════════════════════════════════════════════════════════
exports.getWages = async (req, res) => {
  try {
    const { userId } = req.params;
    const [rows] = await db.query('SELECT * FROM wages WHERE user_id = ? ORDER BY created_at DESC LIMIT 1', [userId]);
    if (rows.length === 0) {
      return res.json({ success: true, wages: { user_id: userId, attendance_days: 0, overtime_hours: 0, pending_wages: 0, paid_wages: 0, period: 'Apr 2026' } });
    }
    res.json({ success: true, wages: rows[0] });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};
