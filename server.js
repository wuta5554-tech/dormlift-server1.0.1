// 如果在本地测试，请取消下面这一行的注释并安装 dotenv: npm install dotenv
// require('dotenv').config(); 

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

// --- 环境变量配置检查 ---
const MONGO_URL = process.env.MONGO_URL;
const GAS_URL = process.env.GAS_URL;

// 打印环境变量状态（用于排查 Railway 配置问题）
console.log("----- System Startup Check -----");
console.log("MONGO_URL Status:", MONGO_URL ? "✅ Configured" : "❌ UNDEFINED");
console.log("GAS_URL Status:", GAS_URL ? "✅ Configured" : "❌ UNDEFINED");
console.log("--------------------------------");

// Cloudinary 图片库配置
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

// --- 数据库连接 ---
if (MONGO_URL) {
    mongoose.connect(MONGO_URL)
      .then(() => console.log("✅ MongoDB Connected Successfully."))
      .catch(err => console.error("❌ MongoDB Connection Error:", err.message));
} else {
    console.error("❌ FATAL ERROR: MONGO_URL is not defined in environment variables.");
}

// --- 数据模型 (Models) ---

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
    status: { type: String, default: 'pending' }, // pending, assigned, completed
    comments: [{
        user_id: String,
        name: String,
        text: String,
        created_at: { type: Date, default: Date.now }
    }]
}, { timestamps: true });
const Task = mongoose.model('Task', TaskSchema);

// 验证码内存存储 (Key: Email, Value: {code, expires})
const verificationCodes = new Map();

// --- 中间件 ---
app.use(cors()); 
app.use(express.json()); 
app.use(express.static(__dirname));

/* =========================================
   🔑 认证模块 (Authentication)
   =========================================
*/

// 发送验证码 (注册及更新通用)
app.post('/api/auth/send-code', async (req, res) => {
    const { email } = req.body;
    if (!email) return res.status(400).json({ success: false, message: "Email required" });

    const code = Math.floor(100000 + Math.random() * 900000).toString();
    verificationCodes.set(email, { code, expires: Date.now() + 600000 }); // 10分钟有效

    const payload = {
        to: email,
        subject: "DormLift Verification Code",
        html: `
            <div style="font-family: Arial, sans-serif; padding: 20px; border: 1px solid #e2e8f0; border-radius: 12px; max-width: 450px;">
                <h2 style="color: #2563eb;">Verify Your Identity</h2>
                <p>Use the following code to complete your action. This code will expire in 10 minutes.</p>
                <div style="background: #f8fafc; padding: 20px; text-align: center; font-size: 32px; font-weight: 800; letter-spacing: 10px; color: #0f172a; border-radius: 8px;">
                    ${code}
                </div>
                <p style="font-size: 12px; color: #64748b; margin-top: 20px;">If you didn't request this, please ignore this email.</p>
            </div>`
    };

    try {
        await fetch(GAS_URL, { 
            method: 'POST', 
            headers: { 'Content-Type': 'application/json' }, 
            body: JSON.stringify(payload) 
        });
        res.json({ success: true, message: "Code sent successfully" });
    } catch (err) {
        console.error("Mail Error:", err);
        res.status(500).json({ success: false, message: "Failed to send email" });
    }
});

// 注册账号
app.post('/api/auth/register', async (req, res) => {
    const { student_id, email, password, code, first_name, given_name, anonymous_name, phone } = req.body;
    
    const record = verificationCodes.get(email);
    if (!record || record.code !== code || Date.now() > record.expires) {
        return res.status(400).json({ success: false, message: "Invalid or expired verification code." });
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
        res.status(400).json({ success: false, message: "Student ID or Email already exists." });
    }
});

// 登录
app.post('/api/auth/login', async (req, res) => {
    try {
        const user = await User.findOne({ student_id: req.body.student_id }).lean();
        if (!user || !(await bcrypt.compare(req.body.password, user.password))) {
            return res.status(401).json({ success: false, message: "Invalid ID or password." });
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

// 创建任务
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

// 获取大厅所有任务 (聚合发布者信息)
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

// 发表评论
app.post('/api/task/comment', async (req, res) => {
    const { task_id, user_id, name, text } = req.body;
    try {
        await Task.findByIdAndUpdate(task_id, {
            $push: { comments: { user_id, name, text } }
        });
        // 返回更新后的任务列表
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

// 接受任务 (状态流转)
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
   👤 用户资料模块 (User Profile)
   =========================================
*/

// 获取个人仪表盘数据 (我发布的和我接受的)
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

// 获取基础资料
app.post('/api/user/profile', async (req, res) => {
    try {
        const user = await User.findOne({ student_id: req.body.student_id }, '-password').lean();
        res.json({ success: true, user });
    } catch (err) {
        res.status(500).json({ success: false });
    }
});

// 更新个人资料 (需邮箱验证)
app.post('/api/user/update', async (req, res) => {
    const { student_id, email, code, updates } = req.body;
    const record = verificationCodes.get(email);
    
    if (!record || record.code !== code || Date.now() > record.expires) {
        return res.status(400).json({ success: false, message: "Verification failed." });
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
        res.status(500).json({ success: false, message: "Update error." });
    }
});

/* =========================================
   🛠️ 开发者专用 (Dev Reset)
   =========================================
*/
app.post('/api/dev/reset', async (req, res) => {
    try {
        await User.deleteMany({}); 
        await Task.deleteMany({}); 
        verificationCodes.clear();
        console.warn("⚠️ DATABASE RESET PERFORMED.");
        res.json({ success: true, message: "All data cleared." });
    } catch (err) {
        res.status(500).json({ success: false });
    }
});

// 启动服务
app.listen(PORT, '0.0.0.0', () => {
    console.log(`🚀 DormLift Server Online`);
    console.log(`📍 Port: ${PORT}`);
});
