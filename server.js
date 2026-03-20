require('dotenv').config();
const express = require('express');
const { Pool } = require('pg');
const cors = require('cors');
const multer = require('multer');
const cloudinary = require('cloudinary').v2;
const { CloudinaryStorage } = require('multer-storage-cloudinary');
const bcrypt = require('bcryptjs');
const nodemailer = require('nodemailer');

const app = express();
const PORT = process.env.PORT || 8080;

// --- 1. 生产级 SMTP 邮件配置 (465端口强制SSL穿透) ---
const transporter = nodemailer.createTransport({
  host: 'smtp.gmail.com',
  port: 465, 
  secure: true, // 必须为 true 才能使用 465 端口
  auth: {
    user: process.env.SMTP_EMAIL,    // 你的 Gmail 邮箱
    pass: process.env.SMTP_PASSWORD // 16位 App Password
  },
  pool: true, // 开启连接池，防止高并发时被 Google 阻断
  maxConnections: 5
});

// 启动时自动测试邮件服务是否连通
transporter.verify((error) => {
  if (error) {
    console.error("❌ SMTP Service Error:", error.message);
  } else {
    console.log("✅ SMTP Mail Server Ready.");
  }
});

// --- 2. Cloudinary 图片云存储配置 ---
cloudinary.config({ 
  cloud_name: process.env.CLOUDINARY_NAME, 
  api_key: process.env.CLOUDINARY_KEY, 
  api_secret: process.env.CLOUDINARY_SECRET 
});

const storage = new CloudinaryStorage({
  cloudinary: cloudinary,
  params: { folder: 'dormlift_prod', allowed_formats: ['jpg', 'png', 'jpeg'] }
});
const upload = multer({ storage: storage });

// --- 3. PostgreSQL 数据库连接 (已修复 SSL 报错) ---
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

// 初始化数据库表
const initDB = async () => {
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS users (
        student_id TEXT PRIMARY KEY, 
        first_name TEXT, 
        given_name TEXT, 
        anonymous_name TEXT, 
        phone TEXT, 
        email TEXT UNIQUE, 
        password TEXT,
        rating_avg REAL DEFAULT 5.0
      );
      CREATE TABLE IF NOT EXISTS tasks (
        id SERIAL PRIMARY KEY, 
        publisher_id TEXT, 
        helper_id TEXT,
        move_date TEXT, 
        move_time TEXT, 
        from_addr TEXT, 
        to_addr TEXT, 
        items_desc TEXT, 
        reward TEXT, 
        img_url TEXT, 
        status TEXT DEFAULT 'pending',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);
    console.log("✅ Database Tables Synced.");
  } catch (err) { 
    console.error("❌ DB Init Error:", err.message); 
  }
};
initDB();

// 用于在内存中临时存储验证码
const verificationCodes = new Map();

app.use(cors());
app.use(express.json());
app.use(express.static(__dirname));

// --- 4. 身份验证 API (发送真实邮件) ---
app.post('/api/auth/send-code', async (req, res) => {
    const { email } = req.body;
    // 生成 6 位随机验证码
    const code = Math.floor(100000 + Math.random() * 900000).toString();
    verificationCodes.set(email, { code, expires: Date.now() + 600000 }); // 10分钟有效期

    console.log(`[AUTH] Sending verification code to ${email}`);

    try {
        await transporter.sendMail({
            from: `"DormLift NZ" <${process.env.SMTP_EMAIL}>`,
            to: email,
            subject: "DormLift Verification Code",
            html: `
                <div style="font-family: Arial, sans-serif; padding: 20px; border: 1px solid #ddd; border-radius: 10px; max-width: 500px; margin: 0 auto;">
                    <h2 style="color: #3498db; text-align: center;">Account Verification</h2>
                    <p>Kia Ora!</p>
                    <p>Your verification code for DormLift is:</p>
                    <h1 style="background: #f4f7f9; padding: 20px; text-align: center; font-size: 36px; letter-spacing: 8px; color: #2c3e50; border-radius: 8px;">${code}</h1>
                    <p style="color: #7f8c8d; font-size: 12px; text-align: center;">This code will expire in 10 minutes.</p>
                </div>`
        });
        res.json({ success: true, message: "Verification code sent! Please check your inbox." });
    } catch (err) {
        console.error("❌ SMTP Delivery Failed:", err.message);
        res.status(500).json({ success: false, message: "Mail service error. Please try again later." });
    }
});

// 注册 API
app.post('/api/auth/register', async (req, res) => {
    const { student_id, email, password, code, first_name, given_name, anonymous_name, phone } = req.body;
    const record = verificationCodes.get(email);
    
    // 强制验证码逻辑
    if (!record || record.code !== code || Date.now() > record.expires) {
        return res.status(400).json({ success: false, message: "Invalid or expired verification code." });
    }

    try {
        const hashed = await bcrypt.hash(password, 10);
        await pool.query(
            `INSERT INTO users (student_id, email, password, first_name, given_name, anonymous_name, phone) 
             VALUES ($1, $2, $3, $4, $5, $6, $7)`,
            [student_id, email, hashed, first_name, given_name, anonymous_name, phone]
        );
        verificationCodes.delete(email); // 注册成功后销毁验证码
        res.json({ success: true });
    } catch (err) { 
        res.status(400).json({ success: false, message: "Registration failed. ID or Email already exists." }); 
    }
});

// 登录 API
app.post('/api/auth/login', async (req, res) => {
    try {
        const result = await pool.query(`SELECT * FROM users WHERE student_id = $1`, [req.body.student_id]);
        const user = result.rows[0];
        if (!user || !(await bcrypt.compare(req.body.password, user.password))) {
            return res.status(401).json({ success: false, message: "Invalid student ID or password." });
        }
        delete user.password; // 为了安全，不返回密码哈希值
        res.json({ success: true, user });
    } catch (err) { 
        res.status(500).json({ success: false }); 
    }
});

// --- 5. 任务管理 API ---

// 发布任务
app.post('/api/task/create', upload.single('task_image'), async (req, res) => {
    const { publisher_id, move_date, move_time, from_addr, to_addr, items_desc, reward } = req.body;
    const imgUrl = req.file ? req.file.path : '';
    try {
        await pool.query(
            `INSERT INTO tasks (publisher_id, move_date, move_time, from_addr, to_addr, items_desc, reward, img_url) 
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
            [publisher_id, move_date, move_time, from_addr, to_addr, items_desc, reward, imgUrl]
        );
        res.json({ success: true });
    } catch (err) { 
        res.status(500).json({ success: false }); 
    }
});

// 获取所有待处理任务 (大厅展示)
app.get('/api/task/all', async (req, res) => {
    try {
        const result = await pool.query(`
            SELECT t.*, u.anonymous_name, u.rating_avg 
            FROM tasks t JOIN users u ON t.publisher_id = u.student_id 
            WHERE t.status = 'pending' ORDER BY t.id DESC
        `);
        res.json({ success: true, list: result.rows });
    } catch (err) {
        res.status(500).json({ success: false }); 
    }
});

// 任务状态工作流 (接单、完成)
app.post('/api/task/workflow', async (req, res) => {
    const { task_id, status, helper_id } = req.body;
    try {
        if (status === 'assigned') {
            await pool.query(`UPDATE tasks SET status = $1, helper_id = $2 WHERE id = $3`, [status, helper_id, task_id]);
        } else {
            await pool.query(`UPDATE tasks SET status = $1 WHERE id = $2`, [status, task_id]);
        }
        res.json({ success: true });
    } catch (err) { 
        res.status(500).json({ success: false }); 
    }
});

// --- 6. 用户中心 API ---

// 个人控制台 (我发布的和我接的单)
app.post('/api/user/dashboard', async (req, res) => {
    try {
        const result = await pool.query(
            `SELECT * FROM tasks WHERE publisher_id = $1 OR helper_id = $1 ORDER BY id DESC`, 
            [req.body.student_id]
        );
        res.json({ success: true, list: result.rows });
    } catch (err) {
        res.status(500).json({ success: false });
    }
});

// 个人资料
app.post('/api/user/profile', async (req, res) => {
    try {
        const result = await pool.query(`SELECT * FROM users WHERE student_id = $1`, [req.body.student_id]);
        res.json({ success: true, user: result.rows[0] });
    } catch (err) {
        res.status(500).json({ success: false });
    }
});

// 启动服务器
app.listen(PORT, '0.0.0.0', () => {
    console.log(`🚀 DormLift NZ V8.0 Final Production Online on port ${PORT}`);
});
