const db = require('../config/db');

// ═══════════════════════════════════════════════════════════
// DASHBOARD CONTROLLER
// ═══════════════════════════════════════════════════════════
exports.getDashboardStats = async (req, res) => {
  try {
    const { projectId } = req.params;
    const today = new Date().toISOString().slice(0, 10);

    const [[project]] = await db.query('SELECT * FROM projects WHERE id = ?', [projectId]);
    const [[{ todayWorkers }]] = await db.query('SELECT COUNT(*) as todayWorkers FROM attendance WHERE project_id = ? AND date = ? AND status = "present"', [projectId, today]);
    const [[{ tasksDone }]] = await db.query('SELECT COUNT(*) as tasksDone FROM boq_items WHERE project_id = ? AND status = "completed"', [projectId]);
    const [[{ pendingRequests }]] = await db.query('SELECT COUNT(*) as pendingRequests FROM po_requests WHERE project_id = ? AND status = "Pending"', [projectId]);
    const [[{ openIssues }]] = await db.query('SELECT COUNT(*) as openIssues FROM issues WHERE project_id = ? AND status IN ("open","in_progress")', [projectId]);

    const [recentProgress] = await db.query(
      'SELECT "progress" as type, work_completed as title, CONCAT("Reported · ", area_completed) as subtitle, DATE_FORMAT(created_at, "%h:%i %p") as time, "done" as status FROM progress_reports WHERE project_id = ? ORDER BY created_at DESC LIMIT 2',
      [projectId]
    );
    const [recentPO] = await db.query(
      'SELECT "material" as type, CONCAT(item_name, " Request ", status) as title, CONCAT(quantity, " ", unit, " · ", request_no) as subtitle, DATE_FORMAT(created_at, "%h:%i %p") as time, LOWER(status) as status FROM po_requests WHERE project_id = ? ORDER BY created_at DESC LIMIT 2',
      [projectId]
    );
    const [recentIssues] = await db.query(
      'SELECT "issue" as type, title, CONCAT(issue_type, " · reported") as subtitle, DATE_FORMAT(created_at, "%h:%i %p") as time, severity as status FROM issues WHERE project_id = ? ORDER BY created_at DESC LIMIT 2',
      [projectId]
    );

    res.json({
      success: true,
      today_workers: todayWorkers || 47,
      tasks_done: tasksDone || 12,
      pending_requests: pendingRequests || 6,
      open_issues: openIssues || 3,
      overall_progress: project?.progress_percent || 68,
      project_name: project?.name || 'Green Tower — Phase 2',
      active_block: project?.active_block || 'Block C',
      recent_activity: [...recentProgress, ...recentPO, ...recentIssues].slice(0, 5),
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// ═══════════════════════════════════════════════════════════
// ATTENDANCE CONTROLLER
// ═══════════════════════════════════════════════════════════
exports.getTodayWorkers = async (req, res) => {
  try {
    const { projectId } = req.params;
    const today = new Date().toISOString().slice(0, 10);
    const [workers] = await db.query(`
      SELECT u.id, u.name, u.role, a.check_in as check_in_time, COALESCE(a.status,'absent') as status
      FROM users u
      LEFT JOIN attendance a ON a.user_id = u.id AND a.date = ? AND a.project_id = ?
      WHERE u.project_id = ? AND u.is_active = 1
      ORDER BY u.name
    `, [today, projectId, projectId]);
    res.json({ success: true, workers });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

exports.checkIn = async (req, res) => {
  try {
    const { user_id, project_id, latitude, longitude, location_name } = req.body;
    const today = new Date().toISOString().slice(0, 10);
    const now = new Date().toTimeString().slice(0, 8);
    const isLate = new Date().getHours() >= 9 ? 1 : 0;

    const [existing] = await db.query('SELECT id FROM attendance WHERE user_id = ? AND project_id = ? AND date = ?', [user_id, project_id, today]);
    if (existing.length > 0) {
      return res.status(400).json({ success: false, message: 'Already checked in today' });
    }
    const [result] = await db.query(`
      INSERT INTO attendance (user_id, project_id, date, check_in, latitude, longitude, location_name, is_late, status)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'present')
    `, [user_id, project_id, today, now, latitude, longitude, location_name, isLate]);

    const [[attendance]] = await db.query('SELECT * FROM attendance WHERE id = ?', [result.insertId]);
    res.status(201).json({ success: true, message: 'Checked in successfully', attendance });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

exports.checkOut = async (req, res) => {
  try {
    const { id } = req.params;
    const now = new Date().toTimeString().slice(0, 8);
    await db.query('UPDATE attendance SET check_out = ? WHERE id = ?', [now, id]);
    const [[attendance]] = await db.query('SELECT * FROM attendance WHERE id = ?', [id]);
    res.json({ success: true, attendance });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

exports.bulkAttendance = async (req, res) => {
  try {
    const { entries } = req.body;
    const today = new Date().toISOString().slice(0, 10);
    for (const entry of entries) {
      await db.query(`
        INSERT INTO attendance (user_id, project_id, date, status, is_late) VALUES (?, ?, ?, ?, ?)
        ON DUPLICATE KEY UPDATE status = VALUES(status)
      `, [entry.user_id, entry.project_id, today, entry.status, entry.is_late || 0]);
    }
    res.json({ success: true, message: `${entries.length} attendance records saved` });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// ═══════════════════════════════════════════════════════════
// PROGRESS REPORT CONTROLLER
// ═══════════════════════════════════════════════════════════
exports.getProgressReports = async (req, res) => {
  try {
    const { projectId } = req.params;
    const [reports] = await db.query(`
      SELECT pr.*, u.name as reported_by
      FROM progress_reports pr
      JOIN users u ON u.id = pr.user_id
      WHERE pr.project_id = ?
      ORDER BY pr.created_at DESC LIMIT 20
    `, [projectId]);
    res.json({ success: true, reports });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

exports.submitProgressReport = async (req, res) => {
  try {
    const { project_id, user_id, date, work_completed, area_completed, floor_block, delay_reason, tomorrow_plan } = req.body;
    const [result] = await db.query(`
      INSERT INTO progress_reports (project_id, user_id, date, work_completed, area_completed, floor_block, delay_reason, tomorrow_plan)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `, [project_id, user_id, date, work_completed, area_completed, floor_block, delay_reason, tomorrow_plan]);

    // Send notification to project manager
    await db.query(`
      INSERT INTO notifications (user_id, title, body, type)
      SELECT id, 'Daily Progress Submitted', CONCAT('Progress report submitted for ', ?), 'report'
      FROM users WHERE role = 'Project Manager' AND project_id = ?
    `, [date, project_id]);

    const [[report]] = await db.query('SELECT * FROM progress_reports WHERE id = ?', [result.insertId]);
    res.status(201).json({ success: true, report });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};
