// require('dotenv').config(); // Railway 部署时建议注释掉，直接在后台设置环境变量

const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const multer = require('multer');
const cloudinary = require('cloudinary').v2;
const { CloudinaryStorage } = require('multer-storage-cloudinary');
const bcrypt = require('bcryptjs');

const app = express();
const PORT = process.env.PORT || 8080;

// 配置项 (环境变量读取)
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
console.log("Current Mongo URL:", process.env.MONGO_URL);
// 连接数据库
mongoose.connect(process.env.MONGO_URL)
  .then(() => console.log("✅ MongoDB Connected."))
  .catch(err => console.error("❌ DB Error:", err.message));

// --- 数据模型 (Schemas) ---
const UserSchema = new mongoose.Schema({
    student_id: { type: String, required: true, unique: true },
    first_name: String, given_name: String, anonymous_name: String,
    phone: String, email: { type: String, required: true, unique: true },
    password: { type: String, required: true },
    rating_avg: { type: Number, default: 5.0 },
    task_count: { type: Number, default: 0 }
});
const User = mongoose.model('User', UserSchema);

const TaskSchema = new mongoose.Schema({
    publisher_id: String,
    helper_id: { type: String, default: null },
    move_date: String, move_time: String,
    from_addr: String, to_addr: String,
    items_desc: String, reward: String, img_url: String,
    status: { type: String, default: 'pending' }, // pending, assigned, completed
    comments: [{
        user_id: String,
        name: String,
        text: String,
        created_at: { type: Date, default: Date.now }
    }]
}, { timestamps: { createdAt: 'created_at', updatedAt: false } });
const Task = mongoose.model('Task', TaskSchema);

// 验证码内存存储 (Key: Email, Value: {code, expires})
const verificationCodes = new Map();

app.use(cors()); app.use(express.json()); app.use(express.static(__dirname));

/* --- 🔑 认证模块 (Auth) --- */
app.post('/api/auth/send-code', async (req, res) => {
    const { email } = req.body;
    const code = Math.floor(100000 + Math.random() * 900000).toString();
    verificationCodes.set(email, { code, expires: Date.now() + 600000 }); // 10分钟有效

    const payload = {
        to: email, subject: "DormLift Verification Code",
        html: `<div style="font-family:sans-serif;padding:20px;border:1px solid #eee;border-radius:10px;">
                <h2 style="color:#2563eb;">Verification Code</h2>
                <p>Your security code is:</p>
                <h1 style="letter-spacing:5px;background:#f8fafc;padding:15px;text-align:center;">${code}</h1>
                <p style="font-size:12px;color:#64748b;">Valid for 10 minutes. Do not share this with anyone.</p></div>`
    };
    try {
        await fetch(GAS_URL, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload), redirect: 'follow' });
        res.json({ success: true });
    } catch (err) { res.status(500).json({ success: false }); }
});

app.post('/api/auth/register', async (req, res) => {
    const { student_id, email, password, code, first_name, given_name, anonymous_name, phone } = req.body;
    const record = verificationCodes.get(email);
    if (!record || record.code !== code || Date.now() > record.expires) return res.status(400).json({ success: false, message: "Invalid/Expired code." });
    
    try {
        const hashed = await bcrypt.hash(password, 10);
        const newUser = new User({ student_id, email, password: hashed, first_name, given_name, anonymous_name, phone });
        await newUser.save(); verificationCodes.delete(email);
        res.json({ success: true });
    } catch (err) { res.status(400).json({ success: false, message: "ID or Email already taken." }); }
});

app.post('/api/auth/login', async (req, res) => {
    const user = await User.findOne({ student_id: req.body.student_id }).lean();
    if (!user || !(await bcrypt.compare(req.body.password, user.password))) return res.status(401).json({ success: false, message: "Invalid credentials." });
    delete user.password; res.json({ success: true, user });
});

/* --- 📦 任务模块 (Tasks) --- */
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
        res.json({ success: true, list: tasks.map(t => ({ ...t, id: t._id, anonymous_name: t.publisher.anonymous_name, rating_avg: t.publisher.rating_avg })) });
    } catch (err) { res.status(500).json({ success: false }); }
});

app.post('/api/task/comment', async (req, res) => {
    const { task_id, user_id, name, text } = req.body;
    try {
        await Task.findByIdAndUpdate(task_id, { $push: { comments: { user_id, name, text } } });
        // 返回刷新后的数据
        const tasks = await Task.aggregate([
            { $match: { status: 'pending' } },
            { $sort: { created_at: -1 } },
            { $lookup: { from: 'users', localField: 'publisher_id', foreignField: 'student_id', as: 'publisher' } },
            { $unwind: '$publisher' }
        ]);
        res.json({ success: true, list: tasks.map(t => ({ ...t, id: t._id, anonymous_name: t.publisher.anonymous_name, rating_avg: t.publisher.rating_avg })) });
    } catch (err) { res.status(500).json({ success: false }); }
});

app.post('/api/task/workflow', async (req, res) => {
    const { task_id, status, helper_id } = req.body;
    try {
        await Task.findByIdAndUpdate(task_id, { status, helper_id });
        res.json({ success: true });
    } catch (err) { res.status(500).json({ success: false }); }
});

/* --- 👤 用户 & 资料更新模块 (User Update) --- */
app.post('/api/user/profile', async (req, res) => {
    const user = await User.findOne({ student_id: req.body.student_id }, '-password').lean();
    res.json({ success: true, user });
});

app.post('/api/user/dashboard', async (req, res) => {
    const tasks = await Task.find({ $or: [{ publisher_id: req.body.student_id }, { helper_id: req.body.student_id }] }).sort({ created_at: -1 });
    res.json({ success: true, list: tasks.map(t => ({ ...t, id: t._id })) });
});

// 🌟 新增：带验证码的信息更新
app.post('/api/user/update', async (req, res) => {
    const { student_id, email, code, updates } = req.body;
    const record = verificationCodes.get(email);
    
    // 强制校验验证码
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
    } catch (err) { res.status(500).json({ success: false, message: "Update error." }); }
});

/* --- 🛠️ 开发者专用 (Dev Only) --- */
app.post('/api/dev/reset', async (req, res) => {
    try {
        await User.deleteMany({}); 
        await Task.deleteMany({}); 
        verificationCodes.clear();
        console.warn("⚠️ Database wiped by Dev Reset.");
        res.json({ success: true });
    } catch (err) { res.status(500).json({ success: false }); }
});

app.listen(PORT, '0.0.0.0', () => console.log(`🚀 Server running on port ${PORT}`));
