const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const multer = require('multer');
const cloudinary = require('cloudinary').v2;
const { CloudinaryStorage } = require('multer-storage-cloudinary');
const bcrypt = require('bcryptjs');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 8080;

// --- 1. 数据库连接 (使用你提供的 MongoDB Atlas 地址) ---
// 建议在 Railway 的 Variables 中设置 MONGO_URI 环境变量
const MONGO_URI = process.env.MONGO_URI || "mongodb+srv://wuta5554_db_user:WHT275024WHT!@free.lnciszk.mongodb.net/Dormlift?appName=Free";

mongoose.connect(MONGO_URI)
    .then(() => console.log('🚀 MongoDB 云数据库连接成功！数据现在是永久性的了。'))
    .catch(err => console.error('❌ 数据库连接失败:', err));

// --- 2. 数据模型定义 (Schema) ---

// 用户模型 (完整包含 10 个字段)
const userSchema = new mongoose.Schema({
    student_id: { type: String, unique: true, required: true },
    password: { type: String, required: true },
    email: { type: String, lowercase: true, trim: true },
    school_name: String,
    first_name: String,
    given_name: String,
    gender: String,
    phone: String,
    anonymous_name: String,
    rating_avg: { type: Number, default: 5.0 },
    task_count: { type: Number, default: 0 }
});
const User = mongoose.model('User', userSchema);

// 任务模型
const taskSchema = new mongoose.Schema({
    publisher_id: String,
    helper_id: String,
    move_date: String,
    move_time: String,
    from_addr: String,
    to_addr: String,
    items_desc: String,
    reward: String,
    img_url: String, // 存储为图片 URL 的 JSON 字符串
    status: { type: String, default: 'pending' },
    created_at: { type: Date, default: Date.now }
});
const Task = mongoose.model('Task', taskSchema);

// --- 3. Cloudinary 云存储配置 ---
cloudinary.config({ 
    cloud_name: 'ddlbhkmwb', 
    api_key: '659513524184184', 
    api_secret: 'iRTD1m-vPfaIu0DQ0uLUf4LUyLU' 
});

const upload = multer({ 
    storage: new CloudinaryStorage({ 
        cloudinary, 
        params: { 
            folder: 'dormlift_production', 
            allowed_formats: ['jpg', 'png', 'jpeg', 'webp'] 
        } 
    }) 
});

app.use(cors());
app.use(express.json());
app.use(express.static(__dirname));

// --- 4. API 接口逻辑 ---

// [注册] 10 字段全量入库
app.post('/api/auth/register', async (req, res) => {
    try {
        const { password, student_id, ...rest } = req.body;
        const hashed = await bcrypt.hash(password, 10);
        const newUser = new User({ 
            student_id: (student_id || "").trim(),
            password: hashed,
            ...rest 
        });
        await newUser.save();
        res.json({ success: true });
    } catch (err) {
        console.error("注册失败:", err);
        res.status(400).json({ success: false, message: "Registration Failed (ID exists?)" });
    }
});

// [登录] 兼容性保护
app.post('/api/auth/login', async (req, res) => {
    try {
        const sid = (req.body.student_id || "").trim();
        const user = await User.findOne({ student_id: sid });
        if (user && await bcrypt.compare(req.body.password, user.password)) {
            const u = user.toObject();
            delete u.password;
            res.json({ success: true, user: u });
        } else {
            res.status(400).json({ success: false, message: "Invalid ID or Password" });
        }
    } catch (e) {
        res.status(500).json({ success: false });
    }
});

// [发布任务] 多图支持
app.post('/api/task/create', upload.array('task_images', 5), async (req, res) => {
    try {
        const imgUrls = JSON.stringify(req.files ? req.files.map(f => f.path) : []);
        const newTask = new Task({ ...req.body, img_url: imgUrls });
        await newTask.save();
        res.json({ success: true });
    } catch (e) {
        console.error("发布失败:", e);
        res.status(500).json({ success: false });
    }
});

// [任务大厅] 实时获取
app.get('/api/task/all', async (req, res) => {
    try {
        const list = await Task.find({ status: 'pending' }).sort({ created_at: -1 });
        res.json({ success: true, list });
    } catch (e) {
        res.json({ success: false, list: [] });
    }
});

// [个人资料] 实时获取最新字段
app.post('/api/user/profile', async (req, res) => {
    try {
        const user = await User.findOne({ student_id: req.body.student_id });
        if (user) {
            const u = user.toObject();
            delete u.password;
            res.json({ success: true, user: u });
        } else {
            res.status(404).json({ success: false });
        }
    } catch (e) {
        res.status(500).json({ success: false });
    }
});

// [仪表盘]
app.post('/api/user/dashboard', async (req, res) => {
    try {
        const sid = req.body.student_id;
        const list = await Task.find({ $or: [{ publisher_id: sid }, { helper_id: sid }] }).sort({ created_at: -1 });
        res.json({ success: true, list });
    } catch (e) {
        res.json({ success: false, list: [] });
    }
});

// [工作流更新]
app.post('/api/task/workflow', async (req, res) => {
    try {
        const { task_id, status, helper_id } = req.body;
        const updateData = { status };
        if (helper_id) updateData.helper_id = helper_id;
        await Task.findByIdAndUpdate(task_id, updateData);
        res.json({ success: true });
    } catch (e) {
        res.status(500).json({ success: false });
    }
});

app.listen(PORT, '0.0.0.0', () => console.log(`✅ Master Engine running on port ${PORT}`));
