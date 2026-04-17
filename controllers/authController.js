const db = require('../config/db');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
require('dotenv').config();

// In-memory OTP store (use Redis in production)
const otpStore = new Map();

const generateOtp = () => Math.floor(100000 + Math.random() * 900000).toString();

const generateToken = (user) => jwt.sign(
  { id: user.id, mobile: user.mobile, role: user.role, name: user.name },
  process.env.JWT_SECRET || 'build360_secret',
  { expiresIn: process.env.JWT_EXPIRES_IN || '30d' }
);

// ── Send OTP ─────────────────────────────────────────────────────────────────
exports.sendOtp = async (req, res) => {
  try {
    const { mobile } = req.body;
    if (!mobile || mobile.length < 10) {
      return res.status(400).json({ success: false, message: 'Valid mobile number required' });
    }
    const otp = generateOtp();
    const expiry = Date.now() + (parseInt(process.env.OTP_EXPIRY_MINUTES || '10') * 60000);
    otpStore.set(mobile, { otp, expiry });

    // In dev mode return OTP; in production integrate Twilio/MSG91
    const isDev = process.env.NODE_ENV !== 'production';
    console.log(`📱 OTP for ${mobile}: ${otp}`);

    res.json({
      success: true,
      message: 'OTP sent successfully',
      ...(isDev && { dev_otp: otp }) // Remove in production
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// ── Verify OTP ───────────────────────────────────────────────────────────────
exports.verifyOtp = async (req, res) => {
  try {
    const { mobile, otp, role } = req.body;
    if (!mobile || !otp) {
      return res.status(400).json({ success: false, message: 'Mobile and OTP required' });
    }

    const stored = otpStore.get(mobile);
    // Allow hardcoded OTP 123456 for development
    const isDevOtp = otp === '123456' && process.env.NODE_ENV !== 'production';
    if (!isDevOtp) {
      if (!stored) return res.status(400).json({ success: false, message: 'OTP not found. Request a new OTP.' });
      if (Date.now() > stored.expiry) { otpStore.delete(mobile); return res.status(400).json({ success: false, message: 'OTP expired' }); }
      if (stored.otp !== otp) return res.status(400).json({ success: false, message: 'Invalid OTP' });
    }

    otpStore.delete(mobile);

    // Find or create user
    let [rows] = await db.query('SELECT * FROM users WHERE mobile = ?', [mobile]);
    let user;
    if (rows.length === 0) {
      const empId = `B360-EMP-${String(Date.now()).slice(-4)}`;
      const [result] = await db.query(
        'INSERT INTO users (name, mobile, role, employee_id, project_id, project_name) VALUES (?, ?, ?, ?, 1, "Green Tower Phase 2")',
        [`User ${mobile.slice(-4)}`, mobile, role || 'Site Engineer', empId]
      );
      [rows] = await db.query('SELECT * FROM users WHERE id = ?', [result.insertId]);
    }
    user = rows[0];
    const token = generateToken(user);

    res.json({
      success: true,
      message: 'Login successful',
      token,
      user: {
        id: user.id, name: user.name, mobile: user.mobile,
        role: user.role, employee_id: user.employee_id,
        project_name: user.project_name, rating: user.rating,
      }
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// ── Login with Password ───────────────────────────────────────────────────────
exports.login = async (req, res) => {
  try {
    const { username, password } = req.body;
    if (!username || !password) {
      return res.status(400).json({ success: false, message: 'Username and password required' });
    }
    const [rows] = await db.query('SELECT * FROM users WHERE username = ? AND is_active = 1', [username]);
    if (rows.length === 0) return res.status(401).json({ success: false, message: 'Invalid credentials' });

    const user = rows[0];
    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) return res.status(401).json({ success: false, message: 'Invalid credentials' });

    const token = generateToken(user);
    res.json({
      success: true,
      message: 'Login successful',
      token,
      user: {
        id: user.id, name: user.name, mobile: user.mobile,
        role: user.role, employee_id: user.employee_id,
        project_name: user.project_name, rating: user.rating,
      }
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// ── Get Profile ───────────────────────────────────────────────────────────────
exports.getProfile = async (req, res) => {
  try {
    const [rows] = await db.query('SELECT id,name,mobile,role,employee_id,project_name,rating FROM users WHERE id = ?', [req.user.id]);
    if (rows.length === 0) return res.status(404).json({ success: false, message: 'User not found' });
    res.json({ success: true, user: rows[0] });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};
