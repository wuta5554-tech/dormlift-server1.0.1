const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const multer = require('multer');
const cloudinary = require('cloudinary').v2;
const { CloudinaryStorage } = require('multer-storage-cloudinary');
const bcrypt = require('bcryptjs');
const nodemailer = require('nodemailer');

const app = express();
const PORT = process.env.PORT || 8080;

// --- 1. SMTP 邮件配置 (加入 family: 4 防超时) ---
const transporter = nodemailer.createTransport({
  host: 'smtp.gmail.com',
  port: 465, 
  secure: true, 
  auth: {
    user: process.env.SMTP_EMAIL,    
    pass: process.env.SMTP_PASSWORD 
  },
  pool: true,
  maxConnections: 5,
  family: 4 // 核心修复：强制 IPv4，绕过 Railway 的 IPv6 解析黑洞
});

transporter.verify((error) => {
  if (error) console.error("❌ SMTP Error:", error.message);
  else console.log("✅ SMTP Mail Server Ready.");
});

// --- 2. Cloudinary 配置 ---
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

// --- 3. MongoDB 连接与 Schema 定义 ---
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

// --- 4. 身份验证 API ---
app.post('/api/auth/send-code', async (req, res) => {
    const { email } = req.body;
    const code = Math.floor(100000 + Math.random() * 900000).toString();
    verificationCodes.set(email, { code, expires: Date.now() + 600000 });

    console.log(`[AUTH] Sending code to ${email}`);

    try {
        await transporter.sendMail({
            from: `"DormLift NZ" <${process.env.SMTP_EMAIL}>`,
            to: email,
            subject: "DormLift Verification Code",
            html: `<div style="font-family: Arial; padding: 20px; text-align: center;">
                    <h2 style="color: #3498db;">Verification Code</h2>
                    <h1 style="background: #f4f7f9; padding: 20px; letter-spacing: 5px;">${code}</h1>
                   </div>`
        });
        res.json({ success: true, message: "Code sent! Check your inbox." });
    } catch (err) {
        console.error("❌ SMTP Error:", err.message);
        res.status(500).json({ success: false, message: "Mail service timeout." });
    }
});

app.post('/api/auth/register', async (req, res) => {
    const { student_id, email, password, code, first_name, given_name, anonymous_name, phone } = req.body;
    const record = verificationCodes.get(email);
    
    if (!record || record.code !== code || Date.now() > record.expires) {
        return res.status(400).json({ success: false, message: "Invalid or expired code." });
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
        res.status(400).json({ success: false, message: "ID or Email already exists." }); 
    }
});

app.post('/api/auth/login', async (req, res) => {
    try {
        const user = await User.findOne({ student_id: req.body.student_id }).lean();
        if (!user || !(await bcrypt.compare(req.body.password, user.password))) {
            return res.status(401).json({ success: false, message: "Invalid credentials." });
        }
        delete user.password;
        res.json({ success: true, user });
    } catch (err) { res.status(500).json({ success: false }); }
});

// --- 5. 任务管理 API ---
app.post('/api/task/create', upload.single('task_image'), async (req, res) => {
    try {
        const newTask = new Task({ ...req.body, img_url: req.file ? req.file.path : '' });
        await newTask.save();
        res.json({ success: true });
    } catch (err) { res.status(500).json({ success: false }); }
});

app.get('/api/task/all', async (req, res) => {
    try {
        // 使用聚合查询关联用户信息，完美模拟 SQL 的 JOIN
        const tasks = await Task.aggregate([
            { $match: { status: 'pending' } },
            { $sort: { created_at: -1 } },
            { $lookup: { from: 'users', localField: 'publisher_id', foreignField: 'student_id', as: 'publisher' } },
            { $unwind: '$publisher' }
        ]);
        
        // 格式化输出以匹配前端 index.html 的变量名
        const formattedList = tasks.map(t => ({
            ...t,
            id: t._id, // MongoDB 的 _id 映射为前端需要的 id
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
        
        // 映射 id
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

app.listen(PORT, '0.0.0.0', () => console.log(`🚀 DormLift MongoDB PRO Online on port ${PORT}`));
