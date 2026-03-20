/**
 * DormLift Pro - Backend Server (Production Ready)
 * 核心功能：用户认证、8888测试后门、图片云存储、任务流转、留言板
 */

const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const multer = require('multer');
const cloudinary = require('cloudinary').v2;
const { CloudinaryStorage } = require('multer-storage-cloudinary');
const bcrypt = require('bcryptjs');

const app = express();
// Railway 自动分配端口，若无则默认 8080
const PORT = process.env.PORT || 8080;

// --- 1. 环境变量自检与兼容性处理 ---
const MONGO_CONNECTION_STRING = process.env.MONGO_URL || process.env.MONGO_URI;
const GAS_URL = process.env.GAS_URL;

console.log("----- DormLift System Startup Check -----");
if (MONGO_CONNECTION_STRING) {
    const source = process.env.MONGO_URL ? "MONGO_URL" : "MONGO_URI";
    console.log(`✅ Database URL Found (Source: ${source})`);
} else {
    console.log("❌ FATAL ERROR: MONGO_URL or MONGO_URI is MISSING in Railway Variables.");
}
console.log("GAS_URL Status:", GAS_URL ? "✅ Configured" : "❌ UNDEFINED");
console.log("Cloudinary Config Status:", (process.env.CLOUDINARY_NAME && process.env.CLOUDINARY_KEY) ? "✅ Configured" : "❌ MISSING");
console.log("-----------------------------------------");

// --- 2. Cloudinary 图片云存储配置 ---
cloudinary.config({ 
  cloud_name: process.env.CLOUDINARY_NAME, 
  api_key: process.env.CLOUDINARY_KEY, 
  api_secret: process.env.CLOUDINARY_SECRET 
});

const storage = new CloudinaryStorage({
  cloudinary: cloudinary,
  params: { 
    folder: 'dormlift_prod', 
    allowed_formats: ['jpg', 'png', 'jpeg'],
    transformation: [{ width: 1000, height: 800, crop: 'limit' }]
  }
});
const upload = multer({ storage: storage });

// --- 3. 数据库连接 ---
if (MONGO_CONNECTION_STRING) {
    mongoose.connect(MONGO_CONNECTION_STRING)
      .then(() => console.log("✅ MongoDB Connected Successfully."))
      .catch(err => console.error("❌ MongoDB Connection Error:", err.message));
}

// --- 4. 数据模型定义 (Schemas) ---

// 用户模型
const UserSchema = new mongoose.Schema({
    student_id: { type: String, required: true, unique: true },
    first_name: String,
    given_name: String,
    anonymous_name: String,
    phone: String,
    email: { type: String, required: true, unique: true },
    password: { type: String, required: true },
    rating_avg: { type: Number, default: 5.0 }
});
const User = mongoose.model('User', UserSchema);

// 任务模型
const TaskSchema = new mongoose.Schema({
    publisher_id: String,
    helper_id: { type: String, default: null },
    move_date: String,
    move_time: String,
    from_addr: String,
    to_addr: String,
    items_desc: String,
    reward: String,
    img_url: String,
    has_elevator: { type: String, default: 'No' }, // 是否有电梯 (Yes/No)
    status: { type: String, default: 'pending' },  // pending, assigned, completed
    comments: [{
        user_id: String,
        name: String,
        text: String,
        created_at: { type: Date, default: Date.now }
    }]
}, { timestamps: true });
const Task = mongoose.model('Task', TaskSchema);

// 验证码内存存储
const verificationCodes = new Map();

// --- 5. 中间件配置 ---
app.use(cors()); 
app.use(express.json()); 
app.use(express.static(__dirname));

/* =========================================
   🔑 认证模块 (Authentication)
   =========================================
*/

// 发送验证码接口
app.post('/api/auth/send-code', async (req, res) => {
    const { email } = req.body;
    if (!email) return res.status(400).json({ success: false, message: "Email is required" });

    const code = Math.floor(100000 + Math.random() * 900000).toString();
    verificationCodes.set(email, { code, expires: Date.now() + 600000 });

    const payload = {
        to: email,
        subject: "DormLift Verification Code",
        html: `<div style="padding:20px; border:1px solid #ddd; border-radius:10px; font-family:sans-serif;">
                <h2 style="color:#2563eb;">Verification Code</h2>
                <p>Your code is:</p>
                <h1 style="background:#f1f5f9; padding:15px; text-align:center; letter-spacing:10px;">${code}</h1>
                <p style="font-size:12px; color:#64748b;">Valid for 10 minutes.</p></div>`
    };

    try {
        await fetch(GAS_URL, { 
            method: 'POST', 
            headers: { 'Content-Type': 'application/json' }, 
            body: JSON.stringify(payload) 
        });
        res.json({ success: true });
    } catch (err) {
        console.error("Mail Error:", err.message);
        res.status(500).json({ success: false });
    }
});

// 注册账号 (含 8888 测试后门)
app.post('/api/auth/register', async (req, res) => {
    const { student_id, email, password, code } = req.body;
    
    // 🌟 测试后门：如果 code 是 8888，直接通过验证
    if (code !== '8888') {
        const record = verificationCodes.get(email);
        if (!record || record.code !== code || Date.now() > record.expires) {
            return res.status(400).json({ success: false, message: "Invalid or expired code." });
        }
    }

    try {
        const hashedPassword = await bcrypt.hash(password, 10);
        const newUser = new User({ ...req.body, password: hashedPassword });
        await newUser.save();
        if (code !== '8888') verificationCodes.delete(email);
        res.json({ success: true });
    } catch (err) {
        console.error("Register Error:", err.message);
        res.status(400).json({ success: false, message: "Registration failed. ID or Email might exist." });
    }
});

// 登录接口
app.post('/api/auth/login', async (req, res) => {
    try {
        const user = await User.findOne({ student_id: req.body.student_id }).lean();
        if (!user || !(await bcrypt.compare(req.body.password, user.password))) {
            return res.status(401).json({ success: false, message: "Invalid credentials." });
        }
        delete user.password;
        res.json({ success: true, user });
    } catch (err) {
        res.status(500).json({ success: false });
    }
});

/* =========================================
   📦 任务模块 (Tasks)
   =========================================
*/

// 发布任务 (增强了错误日志打印)
app.post('/api/task/create', (req, res) => {
    upload.single('task_image')(req, res, async (err) => {
        if (err) {
            console.error("❌ Cloudinary/Multer Upload Error:", err.message);
            return res.status(500).json({ success: false, message: "Image upload failed: " + err.message });
        }
        
        try {
            const newTask = new Task({
                ...req.body,
                img_url: req.file ? req.file.path : ''
            });
            await newTask.save();
            console.log("✅ Task Created Successfully:", newTask._id);
            res.json({ success: true });
        } catch (dbErr) {
            console.error("❌ MongoDB Save Error:", dbErr.message);
            res.status(500).json({ success: false, message: "Database save failed: " + dbErr.message });
        }
    });
});

// 获取大厅任务
app.get('/api/task/all', async (req, res) => {
    try {
        const tasks = await Task.aggregate([
            { $match: { status: 'pending' } },
            { $sort: { createdAt: -1 } },
            { $lookup: {
                from: 'users',
                localField: 'publisher_id',
                foreignField: 'student_id',
                as: 'pub'
            }},
            { $unwind: '$pub' }
        ]);
        res.json({ success: true, list: tasks.map(t => ({ ...t, id: t._id, anonymous_name: t.pub.anonymous_name })) });
    } catch (err) {
        res.status(500).json({ success: false });
    }
});

// 留言互动接口
app.post('/api/task/comment', async (req, res) => {
    const { task_id, user_id, name, text } = req.body;
    try {
        await Task.findByIdAndUpdate(task_id, {
            $push: { comments: { user_id, name, text } }
        });
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ success: false });
    }
});

// 任务流转接口 (接单)
app.post('/api/task/workflow', async (req, res) => {
    const { task_id, status, helper_id } = req.body;
    try {
        await Task.findByIdAndUpdate(task_id, { status, helper_id });
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ success: false });
    }
});

/* =========================================
   👤 个人中心模块 (User Center)
   =========================================
*/

// 获取个人中心 Dashboard
app.post('/api/user/dashboard', async (req, res) => {
    try {
        const list = await Task.find({ 
            $or: [{ publisher_id: req.body.student_id }, { helper_id: req.body.student_id }] 
        }).sort({ createdAt: -1 }).lean();
        res.json({ success: true, list: list.map(t => ({ ...t, id: t._id })) });
    } catch (err) {
        res.status(500).json({ success: false });
    }
});

// 获取个人资料
app.post('/api/user/profile', async (req, res) => {
    try {
        const user = await User.findOne({ student_id: req.body.student_id }, '-password').lean();
        res.json({ success: true, user });
    } catch (err) {
        res.status(500).json({ success: false });
    }
});

// 更新个人资料 (含 8888 后门)
app.post('/api/user/update', async (req, res) => {
    const { student_id, email, code, updates } = req.body;
    
    if (code !== '8888') {
        const record = verificationCodes.get(email);
        if (!record || record.code !== code) {
            return res.status(400).json({ success: false, message: "Security verification failed." });
        }
    }

    try {
        const updatedUser = await User.findOneAndUpdate(
            { student_id: student_id },
            { $set: updates },
            { new: true, projection: { password: 0 } }
        );
        res.json({ success: true, user: updatedUser });
    } catch (err) {
        res.status(500).json({ success: false });
    }
});

/* =========================================
   🛠️ 开发者专用接口
   =========================================
*/
app.post('/api/dev/reset', async (req, res) => {
    try {
        await User.deleteMany({}); 
        await Task.deleteMany({}); 
        verificationCodes.clear();
        console.warn("⚠️ DATABASE RESET PERFORMED.");
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ success: false });
    }
});

// 启动服务器
app.listen(PORT, '0.0.0.0', () => {
    console.log(`🚀 DormLift Server Running on Port ${PORT}`);
});
