/**
 * DormLift Pro - Ultimate Backend V12.5
 * 适配：10字段个人资料 + 任务工作流 + 自动重连
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
console.log("🚀 [SYSTEM] STARTING MASTER SERVER...");

// --- 1. 配置中心 ---
// 提示：%21 是感叹号 ! 的转义，确保 Railway 变量里也这样填
const MONGO_URI = process.env.MONGO_URI || "mongodb+srv://wuta5554_db_user:WHT275024WHT%21@free.lnciszk.mongodb.net/Dormlift?appName=Free";
const PORT = process.env.PORT || 8080;

// --- 2. 数据库连接 ---
mongoose.connect(MONGO_URI)
    .then(() => console.log('✅ [DB] MONGODB CONNECTED'))
    .catch(err => console.error('❌ [DB] CONNECTION ERROR:', err.message));

// --- 3. 数据模型 (10字段用户 + 任务流) ---
const User = mongoose.model('User', new mongoose.Schema({
    student_id: { type: String, unique: true, required: true },
    password: { type: String, required: true },
    email: String, school_name: String, first_name: String, 
    given_name: String, gender: String, phone: String, 
    anonymous_name: String, created_at: { type: Date, default: Date.now }
}));

const Task = mongoose.model('Task', new mongoose.Schema({
    publisher_id: String, helper_id: { type: String, default: null },
    move_date: String, from_addr: String, to_addr: String,
    items_desc: String, reward: String, img_url: String,
    status: { type: String, default: 'pending' }, // pending, assigned, finished
    created_at: { type: Date, default: Date.now }
}));

// --- 4. 图片存储 (Cloudinary) ---
cloudinary.config({ cloud_name: 'ddlbhkmwb', api_key: '659513524184184', api_secret: 'iRTD1m-vPfaIu0DQ0uLUf4LUyLU' });
const upload = multer({ 
    storage: new CloudinaryStorage({ 
        cloudinary, 
        params: { folder: 'dormlift_v12', allowed_formats: ['jpg', 'png', 'jpeg'] } 
    }) 
});

// --- 5. 中间件 ---
app.use(cors());
app.use(express.json());
app.use(express.static(__dirname)); // 这样能直接访问 index.html

// --- 6. API 接口 ---

// [注册] 支持 10 个字段
app.post('/api/auth/register', async (req, res) => {
    try {
        const hashed = await bcrypt.hash(req.body.password, 10);
        const newUser = new User({ ...req.body, password: hashed });
        await newUser.save();
        res.json({ success: true });
    } catch (e) { res.status(400).json({ success: false, message: "User exists" }); }
});

// [登录]
app.post('/api/auth/login', async (req, res) => {
    try {
        const user = await User.findOne({ student_id: req.body.student_id });
        if (user && await bcrypt.compare(req.body.password, user.password)) {
            const data = user.toObject(); delete data.password;
            res.json({ success: true, user: data });
        } else { res.status(401).json({ success: false }); }
    } catch (e) { res.status(500).json({ success: false }); }
});

// [发布任务] 支持多图上传
app.post('/api/task/create', upload.array('task_images', 5), async (req, res) => {
    try {
        const urls = req.files ? req.files.map(f => f.path) : [];
        const task = new Task({ ...req.body, img_url: JSON.stringify(urls) });
        await task.save();
        res.json({ success: true });
    } catch (e) { res.status(500).json({ success: false }); }
});

// [任务大厅] 只显示待接单任务
app.get('/api/task/all', async (req, res) => {
    const list = await Task.find({ status: 'pending' }).sort({ created_at: -1 });
    res.json({ success: true, list });
});

// [个人看板] 我发布的 + 我接单的
app.post('/api/user/dashboard', async (req, res) => {
    const sid = req.body.student_id;
    const list = await Task.find({ $or: [{ publisher_id: sid }, { helper_id: sid }] }).sort({ created_at: -1 });
    res.json({ success: true, list });
});

// [个人资料] 获取完整 10 字段数据
app.post('/api/user/profile', async (req, res) => {
    const user = await User.findOne({ student_id: req.body.student_id });
    if(user) {
        const data = user.toObject(); delete data.password;
        res.json({ success: true, user: data });
    } else { res.status(404).json({ success: false }); }
});

// [工作流更新] 处理接单 (Assigned) 和完成 (Finished)
app.post('/api/task/workflow', async (req, res) => {
    try {
        const { task_id, status, helper_id } = req.body;
        const update = { status };
        if(helper_id) update.helper_id = helper_id;
        await Task.findByIdAndUpdate(task_id, update);
        res.json({ success: true });
    } catch (e) { res.status(500).json({ success: false }); }
});

// --- 7. 启动 ---
app.listen(PORT, '0.0.0.0', () => {
    console.log(`✅ [READY] SERVER RUNNING ON PORT ${PORT}`);
});
