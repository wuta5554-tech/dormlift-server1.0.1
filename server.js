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

// --- 环境变量兼容性处理 ---
// 自动匹配 MONGO_URL 或 MONGO_URI，解决变量名不一致导致的连接失败
const MONGO_CONNECTION_STRING = process.env.MONGO_URL || process.env.MONGO_URI;
const GAS_URL = process.env.GAS_URL;

console.log("----- System Startup Check -----");
if (MONGO_CONNECTION_STRING) {
    console.log("✅ Database URL Found (Source: " + (process.env.MONGO_URL ? "MONGO_URL" : "MONGO_URI") + ")");
} else {
    console.log("❌ FATAL ERROR: Database URL (MONGO_URL or MONGO_URI) is MISSING in Railway Variables.");
}
console.log("GAS_URL Status:", GAS_URL ? "✅ Configured" : "❌ UNDEFINED");
console.log("--------------------------------");

// Cloudinary 图片存储配置
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
    transformation: [{ width: 800, height: 600, crop: 'limit' }]
  }
});
const upload = multer({ storage: storage });

// --- 数据库连接逻辑 ---
if (MONGO_CONNECTION_STRING) {
    mongoose.connect(MONGO_CONNECTION_STRING)
      .then(() => console.log("✅ MongoDB Connected Successfully."))
      .catch(err => console.error("❌ MongoDB Connection Error:", err.message));
}

// --- 数据模型定义 (Models) ---

// 用户模型
const UserSchema = new mongoose.Schema({
    student_id: { type: String, required: true, unique: true },
    first_name: String,
    given_name: String,
    anonymous_name: String,
    phone: String,
    email: { type: String, required: true, unique: true },
    password: { type: String, required: true },
    rating_avg: { type: Number, default: 5.0 },
    task_count: { type: Number, default: 0 }
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
    status: { type: String, default: 'pending' }, // 状态流转: pending -> assigned -> completed
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

// --- 中间件配置 ---
app.use(cors()); 
app.use(express.json()); 
app.use(express.static(__dirname));

/* =========================================
   🔑 认证模块 (Auth)
   =========================================
*/

// 发送验证码
app.post('/api/auth/send-code', async (req, res) => {
    const { email } = req.body;
    if (!email) return res.status(400).json({ success: false, message: "Email required" });

    const code = Math.floor(100000 + Math.random() * 900000).toString();
    verificationCodes.set(email, { code, expires: Date.now() + 600000 });

    const payload = {
        to: email,
        subject: "DormLift Verification Code",
        html: `
            <div style="font-family: Arial, sans-serif; padding: 20px; border: 1px solid #e2e8f0; border-radius: 12px; max-width: 450px;">
                <h2 style="color: #2563eb;">Verification Code</h2>
                <p>Your security code for DormLift is:</p>
                <h1 style="background: #f8fafc; padding: 20px; text-align: center; font-size: 32px; letter-spacing: 10px; color: #0f172a; border-radius: 8px;">
                    ${code}
                </h1>
                <p style="font-size: 12px; color: #64748b; margin-top: 20px;">Code expires in 10 minutes.</p>
            </div>`
    };

    try {
        await fetch(GAS_URL, { 
            method: 'POST', 
            headers: { 'Content-Type': 'application/json' }, 
            body: JSON.stringify(payload) 
        });
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ success: false });
    }
});

// 注册
app.post('/api/auth/register', async (req, res) => {
    const { student_id, email, password, code, first_name, given_name, anonymous_name, phone } = req.body;
    
    const record = verificationCodes.get(email);
    if (!record || record.code !== code || Date.now() > record.expires) {
        return res.status(400).json({ success: false, message: "Invalid or expired code." });
    }

    try {
        const hashedPassword = await bcrypt.hash(password, 10);
        const newUser = new User({ 
            student_id, email, password: hashedPassword, 
            first_name, given_name, anonymous_name, phone 
        });
        await newUser.save();
        verificationCodes.delete(email);
        res.json({ success: true });
    } catch (err) {
        res.status(400).json({ success: false, message: "ID or Email already exists." });
    }
});

// 登录
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

// 发布任务 (含图片上传)
app.post('/api/task/create', upload.single('task_image'), async (req, res) => {
    try {
        const newTask = new Task({
            ...req.body,
            img_url: req.file ? req.file.path : ''
        });
        await newTask.save();
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ success: false });
    }
});

// 获取所有待接单任务
app.get('/api/task/all', async (req, res) => {
    try {
        const tasks = await Task.aggregate([
            { $match: { status: 'pending' } },
            { $sort: { createdAt: -1 } },
            { $lookup: {
                from: 'users',
                localField: 'publisher_id',
                foreignField: 'student_id',
                as: 'publisher'
            }},
            { $unwind: '$publisher' }
        ]);
        
        const formatted = tasks.map(t => ({
            ...t,
            id: t._id,
            anonymous_name: t.publisher.anonymous_name,
            rating_avg: t.publisher.rating_avg
        }));
        res.json({ success: true, list: formatted });
    } catch (err) {
        res.status(500).json({ success: false });
    }
});

// 留言互动
app.post('/api/task/comment', async (req, res) => {
    const { task_id, user_id, name, text } = req.body;
    try {
        await Task.findByIdAndUpdate(task_id, {
            $push: { comments: { user_id, name, text } }
        });
        // 重新获取任务列表以实时刷新留言
        const tasks = await Task.aggregate([
            { $match: { status: 'pending' } },
            { $sort: { createdAt: -1 } },
            { $lookup: { from: 'users', localField: 'publisher_id', foreignField: 'student_id', as: 'pub' } },
            { $unwind: '$pub' }
        ]);
        res.json({ success: true, list: tasks.map(t => ({ ...t, id: t._id, anonymous_name: t.pub.anonymous_name })) });
    } catch (err) {
        res.status(500).json({ success: false });
    }
});

// 状态更新 (接单)
app.post('/api/task/workflow', async (req, res) => {
    const { task_id, status, helper_id } = req.body;
    try {
        const updateData = status === 'assigned' ? { status, helper_id } : { status };
        await Task.findByIdAndUpdate(task_id, updateData);
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ success: false });
    }
});

/* =========================================
   👤 用户资料与 Dashboard
   =========================================
*/

// 获取用户相关的任务 (我发的和我接的)
app.post('/api/user/dashboard', async (req, res) => {
    try {
        const tasks = await Task.find({ 
            $or: [
                { publisher_id: req.body.student_id }, 
                { helper_id: req.body.student_id }
            ] 
        }).sort({ createdAt: -1 }).lean();
        res.json({ success: true, list: tasks.map(t => ({ ...t, id: t._id })) });
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

// 安全更新资料 (需 Code 验证)
app.post('/api/user/update', async (req, res) => {
    const { student_id, email, code, updates } = req.body;
    const record = verificationCodes.get(email);
    
    if (!record || record.code !== code || Date.now() > record.expires) {
        return res.status(400).json({ success: false, message: "Security verification failed." });
    }

    try {
        const updatedUser = await User.findOneAndUpdate(
            { student_id: student_id },
            { $set: updates },
            { new: true, projection: { password: 0 } }
        );
        verificationCodes.delete(email);
        res.json({ success: true, user: updatedUser });
    } catch (err) {
        res.status(500).json({ success: false });
    }
});

/* =========================================
   🛠️ 开发者重置接口 (Dev Reset)
   =========================================
*/
app.post('/api/dev/reset', async (req, res) => {
    try {
        await User.deleteMany({}); 
        await Task.deleteMany({}); 
        verificationCodes.clear();
        console.warn("⚠️ [DATABASE RESET] All data wiped by dev request.");
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ success: false });
    }
});

// 监听端口
app.listen(PORT, '0.0.0.0', () => {
    console.log(`🚀 DormLift Server is LIVE on port ${PORT}`);
});
