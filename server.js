// require('dotenv').config(); // ⚠️ Railway 部署时不需要 dotenv，已注释以防报错

const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const multer = require('multer');
const cloudinary = require('cloudinary').v2;
const { CloudinaryStorage } = require('multer-storage-cloudinary');
const bcrypt = require('bcryptjs');

const app = express();
const PORT = process.env.PORT || 8080;

// GAS 邮件代理 (如果代码里直接写了长链接，这里就会生效，否则读取环境变量)
const GAS_URL = process.env.GAS_URL; 

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

// 连接 MongoDB
mongoose.connect(process.env.MONGO_URL)
  .then(() => console.log("✅ MongoDB Connected Successfully."))
  .catch(err => console.error("❌ MongoDB Connection Error:", err.message));

// --- 数据库模型 (Models) ---
const UserSchema = new mongoose.Schema({
    student_id: { type: String, required: true, unique: true },
    first_name: String, given_name: String, anonymous_name: String,
    phone: String, email: { type: String, required: true, unique: true },
    password: { type: String, required: true },
    rating_avg: { type: Number, default: 5.0 }, task_count: { type: Number, default: 0 }
});
const User = mongoose.model('User', UserSchema);

const TaskSchema = new mongoose.Schema({
    publisher_id: String,
    helper_id: { type: String, default: null },
    move_date: String, move_time: String,
    from_addr: String, to_addr: String,
    items_desc: String, reward: String, img_url: String,
    status: { type: String, default: 'pending' },
    comments: [{ // 🌟 留言区数据结构
        user_id: String,
        name: String,
        text: String,
        created_at: { type: Date, default: Date.now }
    }]
}, { timestamps: { createdAt: 'created_at', updatedAt: false } });
const Task = mongoose.model('Task', TaskSchema);

const verificationCodes = new Map();

app.use(cors()); 
app.use(express.json()); 
app.use(express.static(__dirname));

/* --- 🔑 认证与注册 API (Auth) --- */
app.post('/api/auth/send-code', async (req, res) => {
    const { email } = req.body;
    const code = Math.floor(100000 + Math.random() * 900000).toString();
    verificationCodes.set(email, { code, expires: Date.now() + 600000 });
    const payload = {
        to: email, subject: "DormLift Verification Code",
        html: `<div style="font-family: Arial; padding: 20px; text-align: center; border: 1px solid #ddd; border-radius: 10px; max-width: 400px; margin: 0 auto;">
                <h2 style="color: #3498db;">Account Verification</h2><p>Your 6-digit verification code is:</p>
                <h1 style="background: #f4f7f9; padding: 20px; letter-spacing: 8px; color: #2c3e50;">${code}</h1><p style="font-size: 12px; color: #7f8c8d;">Expires in 10 minutes.</p></div>`
    };
    try {
        await fetch(GAS_URL, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload), redirect: 'follow' });
        res.json({ success: true, message: "Code sent via GAS proxy." });
    } catch (err) { res.status(500).json({ success: false }); }
});

app.post('/api/auth/register', async (req, res) => {
    const { student_id, email, password, code, first_name, given_name, anonymous_name, phone } = req.body;
    const record = verificationCodes.get(email);
    if (!record || record.code !== code || Date.now() > record.expires) return res.status(400).json({ success: false, message: "Invalid code." });
    try {
        const hashed = await bcrypt.hash(password, 10);
        const newUser = new User({ student_id, email, password: hashed, first_name, given_name, anonymous_name, phone });
        await newUser.save(); verificationCodes.delete(email); res.json({ success: true });
    } catch (err) { res.status(400).json({ success: false, message: "ID or Email already exists." }); }
});

app.post('/api/auth/login', async (req, res) => {
    try {
        const user = await User.findOne({ student_id: req.body.student_id }).lean();
        if (!user || !(await bcrypt.compare(req.body.password, user.password))) return res.status(401).json({ success: false, message: "Invalid credentials." });
        delete user.password; res.json({ success: true, user });
    } catch (err) { res.status(500).json({ success: false }); }
});

/* --- 📦 任务大厅 API (Tasks) --- */
app.post('/api/task/create', upload.single('task_image'), async (req, res) => {
    try {
        const newTask = new Task({ ...req.body, img_url: req.file ? req.file.path : '' });
        await newTask.save(); res.json({ success: true });
    } catch (err) { res.status(500).json({ success: false }); }
});

app.get('/api/task/all', async (req, res) => {
    try {
        const tasks = await Task.aggregate([
            { $match: { status: 'pending' } },
            { $sort: { created_at: -1 } },
            { $lookup: { from: 'users', localField: 'publisher_id', foreignField: 'student_id', as: 'publisher' } },
            { $unwind: '$publisher' }
        ]);
        const formattedList = tasks.map(t => ({
            ...t, id: t._id, anonymous_name: t.publisher.anonymous_name, rating_avg: t.publisher.rating_avg
        }));
        res.json({ success: true, list: formattedList });
    } catch (err) { res.status(500).json({ success: false }); }
});

app.post('/api/task/workflow', async (req, res) => {
    const { task_id, status, helper_id } = req.body;
    try {
        const updateData = status === 'assigned' ? { status, helper_id } : { status };
        await Task.findByIdAndUpdate(task_id, updateData);
        res.json({ success: true });
    } catch (err) { res.status(500).json({ success: false }); }
});

// 🌟 新增：发表评论 API
app.post('/api/task/comment', async (req, res) => {
    const { task_id, user_id, name, text } = req.body;
    try {
        await Task.findByIdAndUpdate(task_id, {
            $push: { comments: { user_id, name, text } }
        });
        // 重新获取包含最新评论的任务列表
        const tasks = await Task.aggregate([
            { $match: { status: 'pending' } },
            { $sort: { created_at: -1 } },
            { $lookup: { from: 'users', localField: 'publisher_id', foreignField: 'student_id', as: 'publisher' } },
            { $unwind: '$publisher' }
        ]);
        const formattedList = tasks.map(t => ({ ...t, id: t._id, anonymous_name: t.publisher.anonymous_name, rating_avg: t.publisher.rating_avg }));
        res.json({ success: true, list: formattedList });
    } catch (err) { res.status(500).json({ success: false }); }
});

/* --- 👤 个人控制台 API (User) --- */
app.post('/api/user/dashboard', async (req, res) => {
    try {
        const tasks = await Task.find({ $or: [{ publisher_id: req.body.student_id }, { helper_id: req.body.student_id }] }).sort({ created_at: -1 }).lean();
        res.json({ success: true, list: tasks.map(t => ({ ...t, id: t._id })) });
    } catch (err) { res.status(500).json({ success: false }); }
});

app.post('/api/user/profile', async (req, res) => {
    try {
        const user = await User.findOne({ student_id: req.body.student_id }, '-password').lean();
        res.json({ success: true, user });
    } catch (err) { res.status(500).json({ success: false }); }
});

/* --- 🛠️ 开发者测试专用 API：一键清空数据库 --- */
app.post('/api/dev/reset', async (req, res) => {
    try {
        await User.deleteMany({}); // 删除所有用户
        await Task.deleteMany({}); // 删除所有任务
        verificationCodes.clear(); // 清空内存中卡住的验证码
        console.log("⚠️ 开发者执行了数据库清空操作！");
        res.json({ success: true });
    } catch (err) { 
        res.status(500).json({ success: false }); 
    }
});

app.listen(PORT, '0.0.0.0', () => console.log(`🚀 DormLift Online on port ${PORT}`));
