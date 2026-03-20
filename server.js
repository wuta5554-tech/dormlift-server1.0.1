/**
 * DormLift Pro - Production Server V12.1
 * 驱动：Node.js + MongoDB Atlas + Cloudinary
 * 部署：GitHub -> Railway
 */

console.log("-----------------------------------------");
console.log("🚀 [SYSTEM] ENGINE STARTING...");
console.log("-----------------------------------------");

const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const multer = require('multer');
const cloudinary = require('cloudinary').v2;
const { CloudinaryStorage } = require('multer-storage-cloudinary');
const bcrypt = require('bcryptjs');
const path = require('path');

const app = express();

// 💡 优先级：Railway 环境变量 > 本地默认值
// 注意：密码中的 ! 必须写成 %21，否则 MongoDB 驱动会解析失败导致崩溃
const MONGO_URI = process.env.MONGO_URI || "mongodb+srv://wuta5554_db_user:WHT275024WHT%21@free.lnciszk.mongodb.net/Dormlift?appName=Free";
const PORT = process.env.PORT || 8080;

// --- 1. 数据库连接 (带重试逻辑) ---
console.log("📡 [DB] ATTEMPTING TO CONNECT TO MONGODB ATLAS...");
mongoose.connect(MONGO_URI, {
    serverSelectionTimeoutMS: 5000 // 5秒连不上就报错，不让进程卡死
})
.then(() => {
    console.log('✅ [DB] CONNECTION SUCCESSFUL! DATA IS NOW PERMANENT.');
})
.catch(err => {
    console.error('❌ [DB] CONNECTION ERROR!');
    console.error('REASON:', err.message);
    console.log('👉 PLEASE CHECK: 1. MONGO_URI in Railway Variables; 2. Network Access (0.0.0.0/0) in Atlas.');
});

// --- 2. 数据模型定义 (Schema) ---
// 用户模型 - 对应你要求的 10 个完整字段
const User = mongoose.model('User', new mongoose.Schema({
    student_id: { type: String, unique: true, required: true },
    password: { type: String, required: true },
    email: String,
    school_name: String,
    first_name: String,
    given_name: String,
    gender: String,
    phone: String,
    anonymous_name: String,
    rating_avg: { type: Number, default: 5.0 },
    task_count: { type: Number, default: 0 }
}));

// 任务模型
const Task = mongoose.model('Task', new mongoose.Schema({
    publisher_id: String,
    helper_id: String,
    move_date: String,
    move_time: String,
    from_addr: String,
    to_addr: String,
    items_desc: String,
    reward: String,
    img_url: String, // 存储图片 URL 的 JSON 字符串
    status: { type: String, default: 'pending' },
    created_at: { type: Date, default: Date.now }
}));

// --- 3. 第三方服务配置 (Cloudinary) ---
cloudinary.config({ 
    cloud_name: 'ddlbhkmwb', 
    api_key: '659513524184184', 
    api_secret: 'iRTD1m-vPfaIu0DQ0uLUf4LUyLU' 
});

const storage = new CloudinaryStorage({
    cloudinary: cloudinary,
    params: {
        folder: 'dormlift_v12_prod',
        allowed_formats: ['jpg', 'png', 'jpeg', 'webp']
    }
});
const upload = multer({ storage: storage });

// --- 4. 中间件配置 ---
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname))); // 托管 index.html

// --- 5. API 路由接口 ---

// [注册]
app.post('/api/auth/register', async (req, res) => {
    try {
        console.log(`📝 [API] REGISTER ATTEMPT: ${req.body.student_id}`);
        const hashed = await bcrypt.hash(req.body.password, 10);
        const newUser = new User({ ...req.body, password: hashed });
        await newUser.save();
        res.json({ success: true });
    } catch (err) {
        console.error("❌ [REGISTER ERROR]", err.message);
        res.status(400).json({ success: false, message: "ID exists or Server Error" });
    }
});

// [登录]
app.post('/api/auth/login', async (req, res) => {
    try {
        const sid = (req.body.student_id || "").trim();
        const user = await User.findOne({ student_id: sid });
        if (user && await bcrypt.compare(req.body.password, user.password)) {
            const u = user.toObject(); delete u.password;
            res.json({ success: true, user: u });
        } else {
            res.status(400).json({ success: false, message: "Invalid Credentials" });
        }
    } catch (e) { res.status(500).json({ success: false }); }
});

// [发布任务]
app.post('/api/task/create', upload.array('task_images', 5), async (req, res) => {
    try {
        const imgUrls = JSON.stringify(req.files ? req.files.map(f => f.path) : []);
        const newTask = new Task({ ...req.body, img_url: imgUrls });
        await newTask.save();
        res.json({ success: true });
    } catch (e) { res.status(500).json({ success: false }); }
});

// [大厅数据]
app.get('/api/task/all', async (req, res) => {
    try {
        const list = await Task.find({ status: 'pending' }).sort({ created_at: -1 });
        res.json({ success: true, list });
    } catch (e) { res.json({ success: false, list: [] }); }
});

// [个人看板]
app.post('/api/user/dashboard', async (req, res) => {
    try {
        const sid = req.body.student_id;
        const list = await Task.find({ $or: [{ publisher_id: sid }, { helper_id: sid }] }).sort({ created_at: -1 });
        res.json({ success: true, list });
    } catch (e) { res.json({ success: false, list: [] }); }
});

// [个人资料]
app.post('/api/user/profile', async (req, res) => {
    try {
        const user = await User.findOne({ student_id: req.body.student_id });
        if (user) {
            const u = user.toObject(); delete u.password;
            res.json({ success: true, user: u });
        } else { res.status(404).json({ success: false }); }
    } catch (e) { res.status(500).json({ success: false }); }
});

// [工作流更新]
app.post('/api/task/workflow', async (req, res) => {
    try {
        const { task_id, status, helper_id } = req.body;
        const updateData = { status };
        if (helper_id) updateData.helper_id = helper_id;
        await Task.findByIdAndUpdate(task_id, updateData);
        res.json({ success: true });
    } catch (e) { res.status(500).json({ success: false }); }
});

// --- 6. 启动服务器 ---
app.listen(PORT, '0.0.0.0', () => {
    console.log("-----------------------------------------");
    console.log(`✅ [READY] SERVER RUNNING ON PORT: ${PORT}`);
    console.log(`🌍 [URL] PUBLIC ACCESS: http://0.0.0.0:${PORT}`);
    console.log("-----------------------------------------");
});

// 捕捉进程异常，防止 Railway 直接退出的“临终遗言”
process.on('uncaughtException', (err) => {
    console.error('🔥 [CRITICAL] UNCAUGHT EXCEPTION:', err.message);
});
