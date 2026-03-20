
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const multer = require('multer');
const cloudinary = require('cloudinary').v2;
const { CloudinaryStorage } = require('multer-storage-cloudinary');
const bcrypt = require('bcryptjs');

const app = express();
const PORT = process.env.PORT || 8080;

// === 替换为你刚刚从 Google Apps Script 复制的最新 Web App URL ===
const GAS_URL = process.env.GAS_URL || "https://script.google.com/macros/s/你的部署ID/exec"; 

// --- 1. Cloudinary 配置 ---
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

// --- 2. MongoDB 连接与 Schema ---
mongoose.connect(process.env.MONGO_URL)
  .then(() => console.log("✅ MongoDB Connected Successfully."))
  .catch(err => console.error("❌ MongoDB Connection Error:", err.message));

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
    status: { type: String, default: 'pending' }
}, { timestamps: { createdAt: 'created_at', updatedAt: false } });
const Task = mongoose.model('Task', TaskSchema);

const verificationCodes = new Map();

app.use(cors());
app.use(express.json());
app.use(express.static(__dirname));

// --- 3. 身份验证 API (调用你的 GAS 脚本) ---
app.post('/api/auth/send-code', async (req, res) => {
    const { email } = req.body;
    const code = Math.floor(100000 + Math.random() * 900000).toString();
    verificationCodes.set(email, { code, expires: Date.now() + 600000 });

    console.log(`[AUTH] 准备通过 GAS 代理发送验证码至 ${email}`);

    // 构建传递给 GAS doPost(e) 的参数 (与你脚本中的 params 对应)
    const payload = {
        to: email,
        subject: "DormLift Verification Code",
        html: `<div style="font-family: Arial; padding: 20px; text-align: center; border: 1px solid #ddd; border-radius: 10px; max-width: 400px; margin: 0 auto;">
                <h2 style="color: #3498db;">Account Verification</h2>
                <p>Your 6-digit verification code is:</p>
                <h1 style="background: #f4f7f9; padding: 20px; letter-spacing: 8px; color: #2c3e50;">${code}</h1>
                <p style="font-size: 12px; color: #7f8c8d;">Expires in 10 minutes.</p>
               </div>`
    };

    try {
        // 使用原生 fetch 调用 GAS，注意必须设置 redirect: 'follow'
        const response = await fetch(GAS_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
            redirect: 'follow' 
        });

        const resultText = await response.text();
        console.log(`[GAS 回应]: ${resultText}`);
        
        res.json({ success: true, message: "验证码已通过代理发送，请查收邮箱。" });
    } catch (err) {
        console.error("❌ 调用 GAS 失败:", err.message);
        res.status(500).json({ success: false, message: "邮件代理服务连接失败" });
    }
});

app.post('/api/auth/register', async (req, res) => {
    const { student_id, email, password, code, first_name, given_name, anonymous_name, phone } = req.body;
    const record = verificationCodes.get(email);
    
    if (!record || record.code !== code || Date.now() > record.expires) {
        return res.status(400).json({ success: false, message: "验证码错误或已过期。" });
    }

    try {
        const hashed = await bcrypt.hash(password, 10);
        const newUser = new User({
            student_id, email, password: hashed, first_name, given_name, anonymous_name, phone
        });
        await newUser.save();
        verificationCodes.delete(email);
        res.json({ success: true });
    } catch (err) { 
        console.error("注册失败:", err.message);
        res.status(400).json({ success: false, message: "该学号或邮箱可能已被注册。" }); 
    }
});

app.post('/api/auth/login', async (req, res) => {
    try {
        const user = await User.findOne({ student_id: req.body.student_id }).lean();
        if (!user || !(await bcrypt.compare(req.body.password, user.password))) {
            return res.status(401).json({ success: false, message: "学号或密码错误。" });
        }
        delete user.password;
        res.json({ success: true, user });
    } catch (err) { res.status(500).json({ success: false }); }
});

// --- 4. 任务管理 API (保持不变，已适配 MongoDB) ---
app.post('/api/task/create', upload.single('task_image'), async (req, res) => {
    try {
        const newTask = new Task({ ...req.body, img_url: req.file ? req.file.path : '' });
        await newTask.save();
        res.json({ success: true });
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
            ...t,
            id: t._id, 
            anonymous_name: t.publisher.anonymous_name,
            rating_avg: t.publisher.rating_avg
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

app.post('/api/user/dashboard', async (req, res) => {
    try {
        const tasks = await Task.find({ 
            $or: [{ publisher_id: req.body.student_id }, { helper_id: req.body.student_id }] 
        }).sort({ created_at: -1 }).lean();
        
        const list = tasks.map(t => ({ ...t, id: t._id }));
        res.json({ success: true, list });
    } catch (err) { res.status(500).json({ success: false }); }
});

app.post('/api/user/profile', async (req, res) => {
    try {
        const user = await User.findOne({ student_id: req.body.student_id }, '-password').lean();
        res.json({ success: true, user });
    } catch (err) { res.status(500).json({ success: false }); }
});

app.listen(PORT, '0.0.0.0', () => console.log(`🚀 DormLift MongoDB + GAS PRO Online on port ${PORT}`));
