/**
 * DormLift Pro - Technical Master Backend V12.6
 * 核心功能：10字段校验、多图云端直传、任务状态流转机
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

// --- 1. 环境与安全配置 ---
// 注意：MONGO_URI 必须处理密码中的特殊字符（! -> %21）
const MONGO_URI = process.env.MONGO_URI || "mongodb+srv://wuta5554_db_user:WHT275024WHT%21@free.lnciszk.mongodb.net/Dormlift?appName=Free";
const PORT = process.env.PORT || 8080;

// --- 2. 数据库建模 (精确对应 10 个前端字段) ---
const userSchema = new mongoose.Schema({
    student_id: { type: String, unique: true, required: true },
    password: { type: String, required: true },
    email: { type: String, required: true },
    school_name: String,
    first_name: String,
    given_name: String, // 对应 Last Name
    gender: String,
    phone: String,
    anonymous_name: String,
    created_at: { type: Date, default: Date.now }
});
const User = mongoose.model('User', userSchema);

const taskSchema = new mongoose.Schema({
    publisher_id: { type: String, required: true },
    helper_id: { type: String, default: null },
    move_date: String,
    from_addr: String, // 存储经纬度字符串
    to_addr: String,   // 存储经纬度字符串
    items_desc: String,
    reward: String,
    img_url: String,   // 存储图片路径数组的 JSON 字符串
    status: { type: String, enum: ['pending', 'assigned', 'finished'], default: 'pending' },
    created_at: { type: Date, default: Date.now }
});
const Task = mongoose.model('Task', taskSchema);

// --- 3. 云端存储集成 (Cloudinary) ---
cloudinary.config({ 
    cloud_name: 'ddlbhkmwb', 
    api_key: '659513524184184', 
    api_secret: 'iRTD1m-vPfaIu0DQ0uLUf4LUyLU' 
});

const storage = new CloudinaryStorage({
    cloudinary: cloudinary,
    params: {
        folder: 'dormlift_v12_pro',
        allowed_formats: ['jpg', 'png', 'jpeg', 'webp']
    }
});
const upload = multer({ storage: storage });

// --- 4. 中间件设置 ---
app.use(cors());
app.use(express.json());
app.use(express.static(__dirname)); // 托管 index.html 及其资源

// --- 5. 满血版 API 接口 ---

// [用户注册]：处理所有 10 个字段
app.post('/api/auth/register', async (req, res) => {
    try {
        console.log(`[AUTH] Registering user: ${req.body.student_id}`);
        const hashedPassword = await bcrypt.hash(req.body.password, 10);
        const newUser = new User({
            ...req.body,
            password: hashedPassword
        });
        await newUser.save();
        res.status(201).json({ success: true });
    } catch (error) {
        console.error("[AUTH ERROR]", error.message);
        res.status(400).json({ success: false, error: "ID already exists or invalid data" });
    }
});

// [用户登录]
app.post('/api/auth/login', async (req, res) => {
    try {
        const { student_id, password } = req.body;
        const user = await User.findOne({ student_id });
        if (user && await bcrypt.compare(password, user.password)) {
            const userObj = user.toObject();
            delete userObj.password; // 安全起见，不传回密码
            res.json({ success: true, user: userObj });
        } else {
            res.status(401).json({ success: false, message: "Invalid credentials" });
        }
    } catch (error) {
        res.status(500).json({ success: false });
    }
});

// [发布任务]：处理地图经纬度和图片上传
app.post('/api/task/create', upload.array('task_images', 5), async (req, res) => {
    try {
        console.log(`[TASK] New task from: ${req.body.publisher_id}`);
        const imageUrls = req.files ? req.files.map(file => file.path) : [];
        const newTask = new Task({
            ...req.body,
            img_url: JSON.stringify(imageUrls)
        });
        await newTask.save();
        res.status(201).json({ success: true });
    } catch (error) {
        console.error("[TASK ERROR]", error.message);
        res.status(500).json({ success: false });
    }
});

// [大厅查询]：获取所有待接单任务
app.get('/api/task/all', async (req, res) => {
    try {
        const tasks = await Task.find({ status: 'pending' }).sort({ created_at: -1 });
        res.json({ success: true, list: tasks });
    } catch (error) {
        res.status(500).json({ success: false });
    }
});

// [个人看板]：查询与我相关的任务（我发的或我接的）
app.post('/api/user/dashboard', async (req, res) => {
    try {
        const { student_id } = req.body;
        const myTasks = await Task.find({
            $or: [{ publisher_id: student_id }, { helper_id: student_id }]
        }).sort({ created_at: -1 });
        res.json({ success: true, list: myTasks });
    } catch (error) {
        res.status(500).json({ success: false });
    }
});

// [个人资料]：获取完整的 10 字段信息
app.post('/api/user/profile', async (req, res) => {
    try {
        const user = await User.findOne({ student_id: req.body.student_id });
        if (user) {
            const userObj = user.toObject();
            delete userObj.password;
            res.json({ success: true, user: userObj });
        } else {
            res.status(404).json({ success: false });
        }
    } catch (error) {
        res.status(500).json({ success: false });
    }
});

// [工作流更新]：核心接口，处理接单与完工
app.post('/api/task/workflow', async (req, res) => {
    try {
        const { task_id, status, helper_id } = req.body;
        const updateData = { status };
        if (helper_id) updateData.helper_id = helper_id;
        
        await Task.findByIdAndUpdate(task_id, updateData);
        console.log(`[WORKFLOW] Task ${task_id} updated to ${status}`);
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ success: false });
    }
});

// --- 6. 启动与数据库连接 ---
console.log("📡 [DB] Connecting to MongoDB Atlas...");
mongoose.connect(MONGO_URI)
    .then(() => {
        console.log("✅ [DB] Successfully connected to Database Cluster.");
        app.listen(PORT, '0.0.0.0', () => {
            console.log(`🚀 [SERVER] DormLift Pro V12.6 is Live on Port ${PORT}`);
        });
    })
    .catch(err => {
        console.error("❌ [DB] Initial connection failed!", err.message);
    });
