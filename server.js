/**
 * DormLift Pro - Technical Master Backend V12.7
 * 功能：10字段全量存储、多图 Cloudinary 阵列、任务生命周期状态机
 */

const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const multer = require('multer');
const cloudinary = require('cloudinary').v2;
const { CloudinaryStorage } = require('multer-storage-cloudinary');
const bcrypt = require('bcryptjs');
const path = require('path');

const app = express();

// --- 1. 核心配置 ---
// 特别提醒：密码中的 ! 必须转义为 %21，否则 MongoDB 驱动会解析失败
const MONGO_URI = process.env.MONGO_URI || "mongodb+srv://wuta5554_db_user:WHT275024WHT%21@free.lnciszk.mongodb.net/Dormlift?appName=Free";
const PORT = process.env.PORT || 8080;

// --- 2. 数据库建模 (精确匹配 10 个前端字段) ---
const User = mongoose.model('User', new mongoose.Schema({
    student_id: { type: String, unique: true, required: true },
    password: { type: String, required: true },
    email: { type: String, required: true },
    school_name: String,
    first_name: String,
    given_name: String,
    gender: String,
    phone: String,
    anonymous_name: String,
    major: String, // 👈 V12.7 新增字段
    created_at: { type: Date, default: Date.now }
}));

const Task = mongoose.model('Task', new mongoose.Schema({
    publisher_id: { type: String, required: true },
    helper_id: { type: String, default: null },
    move_date: String,
    from_addr: String, // 存储地图抓取的经纬度字符串
    to_addr: String,
    items_desc: String,
    reward: String,
    img_url: String,   // 存储 Cloudinary URL 数组的 JSON 字符串
    status: { 
        type: String, 
        enum: ['pending', 'assigned', 'finished'], 
        default: 'pending' 
    },
    created_at: { type: Date, default: Date.now }
}));

// --- 3. 云端存储服务 (Cloudinary) ---
cloudinary.config({ 
    cloud_name: 'ddlbhkmwb', 
    api_key: '659513524184184', 
    api_secret: 'iRTD1m-vPfaIu0DQ0uLUf4LUyLU' 
});

const upload = multer({ 
    storage: new CloudinaryStorage({ 
        cloudinary, 
        params: { folder: 'dormlift_pro_v12', allowed_formats: ['jpg', 'png', 'jpeg', 'webp'] } 
    }) 
});

// --- 4. 中间件与静态服务 ---
app.use(cors());
app.use(express.json());
app.use(express.static(__dirname)); // 托管 index.html 及其相关资源

// --- 5. 生产级 API 接口 ---

// [用户注册]：全量处理 10 个字段
app.post('/api/auth/register', async (req, res) => {
    try {
        const hashedPassword = await bcrypt.hash(req.body.password, 10);
        const newUser = new User({ ...req.body, password: hashedPassword });
        await newUser.save();
        res.status(201).json({ success: true });
    } catch (e) {
        console.error("Registration Error:", e.message);
        res.status(400).json({ success: false, message: "ID exists or data invalid" });
    }
});

// [用户登录]
app.post('/api/auth/login', async (req, res) => {
    try {
        const user = await User.findOne({ student_id: req.body.student_id });
        if (user && await bcrypt.compare(req.body.password, user.password)) {
            const data = user.toObject(); delete data.password;
            res.json({ success: true, user: data });
        } else {
            res.status(401).json({ success: false });
        }
    } catch (e) { res.status(500).json({ success: false }); }
});

// [发布任务]：处理地图坐标与多图并发上传
app.post('/api/task/create', upload.array('task_images', 5), async (req, res) => {
    try {
        const urls = req.files ? req.files.map(f => f.path) : [];
        const task = new Task({ ...req.body, img_url: JSON.stringify(urls) });
        await task.save();
        res.status(201).json({ success: true });
    } catch (e) { res.status(500).json({ success: false }); }
});

// [查询大厅]
app.get('/api/task/all', async (req, res) => {
    try {
        const list = await Task.find({ status: 'pending' }).sort({ created_at: -1 });
        res.json({ success: true, list });
    } catch (e) { res.status(500).json({ success: false }); }
});

// [个人看板数据]：我发布的 + 我承接的任务
app.post('/api/user/dashboard', async (req, res) => {
    try {
        const sid = req.body.student_id;
        const list = await Task.find({ $or: [{ publisher_id: sid }, { helper_id: sid }] }).sort({ created_at: -1 });
        res.json({ success: true, list });
    } catch (e) { res.status(500).json({ success: false }); }
});

// [完整个人资料]：获取 10 个字段的脱敏数据
app.post('/api/user/profile', async (req, res) => {
    try {
        const user = await User.findOne({ student_id: req.body.student_id });
        if (user) {
            const data = user.toObject(); delete data.password;
            res.json({ success: true, user: data });
        } else { res.status(404).json({ success: false }); }
    } catch (e) { res.status(500).json({ success: false }); }
});

// [任务工作流控制]：接单 (assigned) / 结单 (finished)
app.post('/api/task/workflow', async (req, res) => {
    try {
        const { task_id, status, helper_id } = req.body;
        const update = { status };
        if (helper_id) update.helper_id = helper_id;
        await Task.findByIdAndUpdate(task_id, update);
        res.json({ success: true });
    } catch (e) { res.status(500).json({ success: false }); }
});

// --- 6. 健壮性启动逻辑 ---
console.log("📡 [DB] Connecting to MongoDB Atlas...");
mongoose.connect(MONGO_URI)
    .then(() => {
        console.log("✅ [DB] Successfully synchronized with Cloud Cluster.");
        app.listen(PORT, '0.0.0.0', () => {
            console.log(`🚀 [SERVER] DormLift Pro v12.7 running on port ${PORT}`);
        });
    })
    .catch(err => {
        console.error("❌ [DB] FATAL: Could not connect to database!", err.message);
    });
