const mysql = require('mysql2/promise');
require('dotenv').config();

async function setupDatabase() {
  const conn = await mysql.createConnection({
    host: process.env.DB_HOST || 'localhost',
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
  });

  console.log('🔧 Setting up Build360 database...');

  await conn.query(`CREATE DATABASE IF NOT EXISTS \`${process.env.DB_NAME || 'build360_db'}\``);
  await conn.query(`USE \`${process.env.DB_NAME || 'build360_db'}\``);

  // ── Users ────────────────────────────────────────────────────────────────────
  await conn.query(`
    CREATE TABLE IF NOT EXISTS users (
      id INT AUTO_INCREMENT PRIMARY KEY,
      name VARCHAR(100) NOT NULL,
      mobile VARCHAR(15) NOT NULL UNIQUE,
      username VARCHAR(50),
      password VARCHAR(255),
      role ENUM('Site Engineer','Supervisor','Foreman','Store Keeper','Labour Incharge','Contractor','Project Manager') DEFAULT 'Site Engineer',
      employee_id VARCHAR(30),
      project_id INT,
      project_name VARCHAR(150),
      rating DECIMAL(3,2) DEFAULT 0.00,
      otp VARCHAR(10),
      otp_expiry DATETIME,
      is_active TINYINT(1) DEFAULT 1,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    )
  `);

  // ── Projects ─────────────────────────────────────────────────────────────────
  await conn.query(`
    CREATE TABLE IF NOT EXISTS projects (
      id INT AUTO_INCREMENT PRIMARY KEY,
      name VARCHAR(200) NOT NULL,
      location VARCHAR(300),
      status ENUM('active','completed','on_hold','cancelled') DEFAULT 'active',
      progress_percent DECIMAL(5,2) DEFAULT 0.00,
      active_block VARCHAR(50),
      active_floor VARCHAR(50),
      start_date DATE,
      end_date DATE,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // ── Attendance ────────────────────────────────────────────────────────────────
  await conn.query(`
    CREATE TABLE IF NOT EXISTS attendance (
      id INT AUTO_INCREMENT PRIMARY KEY,
      user_id INT NOT NULL,
      project_id INT NOT NULL,
      date DATE NOT NULL,
      check_in TIME,
      check_out TIME,
      latitude DECIMAL(10,8),
      longitude DECIMAL(11,8),
      location_name VARCHAR(200),
      is_late TINYINT(1) DEFAULT 0,
      status ENUM('present','absent','half_day','holiday') DEFAULT 'present',
      face_capture_url VARCHAR(500),
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      UNIQUE KEY unique_attendance (user_id, project_id, date)
    )
  `);

  // ── Progress Reports ──────────────────────────────────────────────────────────
  await conn.query(`
    CREATE TABLE IF NOT EXISTS progress_reports (
      id INT AUTO_INCREMENT PRIMARY KEY,
      project_id INT NOT NULL,
      user_id INT NOT NULL,
      date DATE NOT NULL,
      work_completed TEXT NOT NULL,
      area_completed VARCHAR(100),
      floor_block VARCHAR(100),
      delay_reason TEXT,
      tomorrow_plan TEXT NOT NULL,
      photos JSON,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // ── PO Requests ───────────────────────────────────────────────────────────────
  await conn.query(`
    CREATE TABLE IF NOT EXISTS po_requests (
      id INT AUTO_INCREMENT PRIMARY KEY,
      request_no VARCHAR(20) NOT NULL UNIQUE,
      project_id INT NOT NULL,
      user_id INT NOT NULL,
      category VARCHAR(100) NOT NULL,
      item_name VARCHAR(200) NOT NULL,
      brand VARCHAR(100),
      quantity DECIMAL(10,2) NOT NULL,
      unit VARCHAR(20) NOT NULL,
      required_date VARCHAR(50) NOT NULL,
      priority ENUM('Low','Medium','High','Urgent') DEFAULT 'Medium',
      reason TEXT,
      estimated_cost DECIMAL(12,2),
      supplier_preferred VARCHAR(200),
      attachment_url VARCHAR(500),
      status ENUM('Pending','Approved','Rejected','Ordered','Delivered','Cancelled') DEFAULT 'Pending',
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    )
  `);

  // ── PO Approvals ──────────────────────────────────────────────────────────────
  await conn.query(`
    CREATE TABLE IF NOT EXISTS po_request_approvals (
      id INT AUTO_INCREMENT PRIMARY KEY,
      request_id INT NOT NULL,
      approved_by VARCHAR(100) NOT NULL,
      approver_role VARCHAR(50),
      action ENUM('approved','rejected','forwarded') NOT NULL,
      remarks TEXT,
      date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (request_id) REFERENCES po_requests(id) ON DELETE CASCADE
    )
  `);

  // ── BOQ Items ─────────────────────────────────────────────────────────────────
  await conn.query(`
    CREATE TABLE IF NOT EXISTS boq_items (
      id INT AUTO_INCREMENT PRIMARY KEY,
      project_id INT NOT NULL,
      task_name VARCHAR(200) NOT NULL,
      category VARCHAR(100),
      location VARCHAR(200),
      planned_qty DECIMAL(12,2) DEFAULT 0,
      done_qty DECIMAL(12,2) DEFAULT 0,
      unit VARCHAR(20) NOT NULL,
      status ENUM('planned','in_progress','completed','delayed') DEFAULT 'planned',
      target_date DATE,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    )
  `);

  // ── Issues ────────────────────────────────────────────────────────────────────
  await conn.query(`
    CREATE TABLE IF NOT EXISTS issues (
      id INT AUTO_INCREMENT PRIMARY KEY,
      project_id INT NOT NULL,
      user_id INT NOT NULL,
      issue_type VARCHAR(100) NOT NULL,
      title VARCHAR(300) NOT NULL,
      description TEXT,
      severity ENUM('critical','high','medium','low') DEFAULT 'medium',
      status ENUM('open','in_progress','resolved','closed') DEFAULT 'open',
      assigned_to VARCHAR(100),
      photos JSON,
      escalated_at TIMESTAMP NULL,
      resolved_at TIMESTAMP NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    )
  `);

  // ── Equipment ─────────────────────────────────────────────────────────────────
  await conn.query(`
    CREATE TABLE IF NOT EXISTS equipment_logs (
      id INT AUTO_INCREMENT PRIMARY KEY,
      project_id INT NOT NULL,
      name VARCHAR(100) NOT NULL,
      type VARCHAR(100),
      operator VARCHAR(100),
      hours_used DECIMAL(6,2) DEFAULT 0,
      fuel_used DECIMAL(8,2),
      date DATE NOT NULL,
      status ENUM('operational','breakdown','maintenance','idle') DEFAULT 'operational',
      notes TEXT,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // ── Wages ─────────────────────────────────────────────────────────────────────
  await conn.query(`
    CREATE TABLE IF NOT EXISTS wages (
      id INT AUTO_INCREMENT PRIMARY KEY,
      user_id INT NOT NULL,
      worker_name VARCHAR(100) NOT NULL,
      period VARCHAR(30) NOT NULL,
      attendance_days INT DEFAULT 0,
      overtime_hours DECIMAL(6,2) DEFAULT 0,
      basic_wage DECIMAL(10,2) DEFAULT 0,
      overtime_pay DECIMAL(10,2) DEFAULT 0,
      deductions DECIMAL(10,2) DEFAULT 0,
      total_wage DECIMAL(10,2) DEFAULT 0,
      paid_wages DECIMAL(10,2) DEFAULT 0,
      pending_wages DECIMAL(10,2) DEFAULT 0,
      payment_date DATE,
      status ENUM('pending','paid','partial') DEFAULT 'pending',
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // ── Notifications ─────────────────────────────────────────────────────────────
  await conn.query(`
    CREATE TABLE IF NOT EXISTS notifications (
      id INT AUTO_INCREMENT PRIMARY KEY,
      user_id INT NOT NULL,
      title VARCHAR(200) NOT NULL,
      body TEXT NOT NULL,
      type VARCHAR(50) DEFAULT 'general',
      is_read TINYINT(1) DEFAULT 0,
      reference_id VARCHAR(50),
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // ── Photo Uploads ─────────────────────────────────────────────────────────────
  await conn.query(`
    CREATE TABLE IF NOT EXISTS photo_uploads (
      id INT AUTO_INCREMENT PRIMARY KEY,
      project_id INT NOT NULL,
      user_id INT NOT NULL,
      category ENUM('before','during','completed','safety') NOT NULL,
      caption VARCHAR(300),
      file_url VARCHAR(500) NOT NULL,
      latitude DECIMAL(10,8),
      longitude DECIMAL(11,8),
      taken_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // ── Seed Data ─────────────────────────────────────────────────────────────────
  const bcrypt = require('bcryptjs');

  // Insert demo project
  await conn.query(`
    INSERT IGNORE INTO projects (id, name, location, status, progress_percent, active_block, active_floor, start_date, end_date)
    VALUES (1, 'Green Tower — Phase 2', 'Coimbatore, Tamil Nadu', 'active', 68.00, 'Block C', '3rd Floor', '2025-01-12', '2026-12-31')
  `);

  // Insert demo users
  const hashedPassword = await bcrypt.hash('admin123', 10);
  await conn.query(`
    INSERT IGNORE INTO users (id, name, mobile, username, password, role, employee_id, project_id, project_name)
    VALUES
      (1, 'Rajesh Kumar', '9876543210', 'rajesh.kumar', '${hashedPassword}', 'Site Engineer', 'B360-EMP-0042', 1, 'Green Tower Phase 2'),
      (2, 'Suresh Patel', '9876543211', 'suresh.patel', '${hashedPassword}', 'Supervisor', 'B360-EMP-0043', 1, 'Green Tower Phase 2'),
      (3, 'Anand Store', '9876543212', 'anand.store', '${hashedPassword}', 'Store Keeper', 'B360-EMP-0044', 1, 'Green Tower Phase 2'),
      (4, 'Vignesh PM', '9876543213', 'vignesh.pm', '${hashedPassword}', 'Project Manager', 'B360-EMP-0045', 1, 'Green Tower Phase 2')
  `);

  // Insert sample BOQ items
  await conn.query(`
    INSERT IGNORE INTO boq_items (id, project_id, task_name, category, location, planned_qty, done_qty, unit, status, target_date) VALUES
      (1, 1, 'RCC Slab Work', 'Structural', 'Block C 3F', 100, 65, 'm³', 'in_progress', '2026-04-30'),
      (2, 1, 'Plastering Work', 'Finishing', 'West Wing 3F', 850, 850, 'm²', 'completed', '2026-04-15'),
      (3, 1, 'Electrical Conduit', 'MEP', 'All Floors', 1200, 380, 'm', 'delayed', '2026-04-20'),
      (4, 1, 'Brick Masonry', 'Structure', 'Block D', 4500, 0, 'Nos', 'planned', '2026-05-15'),
      (5, 1, 'Floor Tiling', 'Finishing', '1F & 2F', 600, 420, 'm²', 'in_progress', '2026-04-25'),
      (6, 1, 'Door Frames', 'Carpentry', 'All Units', 48, 28, 'Nos', 'in_progress', '2026-04-28')
  `);

  // Insert sample PO requests
  await conn.query(`
    INSERT IGNORE INTO po_requests (id, request_no, project_id, user_id, category, item_name, quantity, unit, required_date, priority, reason, estimated_cost, status) VALUES
      (1, 'POR-1023', 1, 1, 'Electrical Items', 'PVC Conduit 25mm', 200, 'Rmt', '20 Apr 2026', 'Medium', 'Electrical conduit work', 12000, 'Delivered'),
      (2, 'POR-1024', 1, 1, 'Steel & Metal', 'Fe 500 TMT Bars', 2.5, 'Ton', '18 Apr 2026', 'High', 'Column reinforcement', 125000, 'Approved'),
      (3, 'POR-1025', 1, 1, 'Cement & Aggregates', 'OPC 53 Cement', 100, 'Bags', 'Tomorrow', 'Urgent', 'RCC slab pour scheduled for Block C', 38500, 'Pending')
  `);

  // Insert sample issues
  await conn.query(`
    INSERT IGNORE INTO issues (id, project_id, user_id, issue_type, title, description, severity, status) VALUES
      (1, 1, 1, 'Labour Shortage', 'Labour Shortage — Block D', '12 out of 20 scheduled workers absent today. RCC pour work cannot proceed.', 'critical', 'open'),
      (2, 1, 2, 'Machine Breakdown', 'Mixer Breakdown — Site Yard', 'Concrete mixer M-3 stopped functioning at 8:15 AM. Estimated repair: 4 hours.', 'high', 'in_progress'),
      (3, 1, 3, 'Material Delay', 'Sand Delivery Delayed', 'Supplier confirmed sand delivery pushed by 1 day due to vehicle breakdown.', 'medium', 'open')
  `);

  // Insert notifications
  await conn.query(`
    INSERT IGNORE INTO notifications (user_id, title, body, type, is_read) VALUES
      (1, 'Material Request Approved', 'POR-1025 · 100 bags OPC Cement approved by Supervisor Kumar.', 'material', 0),
      (1, 'Safety Alert — 3rd Floor', 'Guardrail reported missing on 3F North edge. Immediate action required.', 'safety', 0),
      (1, 'Task Assigned to You', 'PM Vignesh assigned: Supervision of RCC pour — Block C 3F.', 'task', 0),
      (1, 'Wage Payment Released', '₹ 2,34,500 disbursed to 47 workers for week ending 12 Apr 2026.', 'payment', 1)
  `);

  console.log('✅ Database setup complete!');
  console.log('📊 Tables created: users, projects, attendance, progress_reports, po_requests, po_request_approvals, boq_items, issues, equipment_logs, wages, notifications, photo_uploads');
  console.log('🌱 Seed data inserted successfully');
  console.log('\n🔑 Demo Credentials:');
  console.log('   Mobile: 9876543210  OTP: 123456');
  console.log('   Username: rajesh.kumar  Password: admin123');

  await conn.end();
}

setupDatabase().catch(err => {
  console.error('Setup failed:', err);
  process.exit(1);
});
