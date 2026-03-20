/**
 * DormLift Pro - Backend Server (Production Stable)
 * 核心功能：用户认证（含8888测试码）、图片云上传（解决签名报错）、任务大厅、个人中心
 */

const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const multer = require('multer');
const cloudinary = require('cloudinary').v2;
const bcrypt = require('bcryptjs');

const app = express();
const PORT = process.env.PORT || 8080;

// --- 1. 环境变量自检与去空格处理 ---
const MONGO_CONNECTION_STRING = process.env.MONGO_URL || process.env.MONGO_URI;
const GAS_URL = process.env.GAS_URL;

console.log("----- DormLift System Startup Check -----");
if (MONGO_CONNECTION_STRING) {
    console.log(`✅ Database URL Detected.`);
} else {
    console.log("❌ FATAL ERROR: Database URL is missing in environment variables.");
}

// 🌟 核心修复：强制去除 Cloudinary 变量可能存在的空格/换行符
const CLOUD_NAME = (process.env.CLOUDINARY_NAME || '').trim();
const CLOUD_KEY = (process.env.CLOUDINARY_KEY || '').trim();
const CLOUD_SECRET = (process.env.CLOUDINARY_SECRET || '').trim();

console.log("Cloudinary Config Status:", (CLOUD_NAME && CLOUD_KEY && CLOUD_SECRET) ? "✅ Ready" : "❌ INCOMPLETE");
console.log("-----------------------------------------");

// --- 2. Cloudinary 官方配置 ---
cloudinary.config({ 
  cloud_name: CLOUD_NAME, 
  api_key: CLOUD_KEY, 
  api_secret: CLOUD_SECRET 
});

// 使用内存存储模式，解决签名校验不一致问题
const storage = multer.memoryStorage();
const upload = multer({ storage: storage });

// --- 3. 数据库连接 ---
if (MONGO_CONNECTION_STRING) {
    mongoose.connect(MONGO_CONNECTION_STRING)
      .then(() => console.log("✅ MongoDB Connected Successfully."))
      .catch(err => console.error("❌ MongoDB Connection Error:", err.message));
}

// --- 4. 数据模型定义 (Schemas) ---

// 用户模型
const UserSchema = new mongoose.Schema({
    student_id: { type: String, required: true, unique: true },
    first_name: String,
    given_name: String,
    anonymous_name: String,
    phone: String,
    email: { type: String, required: true, unique: true },
    password: { type: String, required: true },
    rating_avg: { type: Number, default: 5.0 }
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
    has_elevator: { type: String, default: 'No' }, // 电梯选项支持
    status: { type: String, default: 'pending' },  // 状态：pending, assigned, completed
    comments: [{
        user_id: String,
        name: String,
        text: String,
        created_at: { type: Date, default: Date.now }
    }]
}, { timestamps: true });
const Task = mongoose.model('Task', TaskSchema);

const verificationCodes = new Map();

// --- 5. 中间件配置 ---
app.use(cors()); 
app.use(express.json()); 
app.use(express.static(__dirname));

/* =========================================
   🔑 认证模块 (Authentication)
   =========================================
*/

// 发送验证码
app.post('/api/auth/send-code', async (req, res) => {
    const { email } = req.body;
    if (!email) return res.status(400).json({ success: false });

    const code = Math.floor(100000 + Math.random() * 900000).toString();
    verificationCodes.set(email, { code, expires: Date.now() + 600000 });

    const payload = {
        to: email,
        subject: "DormLift Verification Code",
        html: `<h1>Verification Code: ${code}</h1>`
    };

    try {
        await fetch(GAS_URL, { 
            method: 'POST', 
            headers: { 'Content-Type': 'application/json' }, 
            body: JSON.stringify(payload) 
        });
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ success: false });
    }
});

// 注册账号 (含 8888 测试后门)
app.post('/api/auth/register', async (req, res) => {
    const { student_id, email, password, code, first_name, given_name, anonymous_name, phone } = req.body;
    
    // 🌟 测试逻辑：如果填入 8888，跳过验证码检查
    if (code !== '8888') {
        const record = verificationCodes.get(email);
        if (!record || record.code !== code || Date.now() > record.expires) {
            return res.status(400).json({ success: false, message: "Invalid or expired code." });
        }
    }

    try {
        const hashedPassword = await bcrypt.hash(password, 10);
        const newUser = new User({ 
            student_id, email, password: hashedPassword, 
            first_name, given_name, anonymous_name, phone 
        });
        await newUser.save();
        if (code !== '8888') verificationCodes.delete(email);
        res.json({ success: true });
    } catch (err) {
        res.status(400).json({ success: false, message: "Registration failed. ID or Email already exists." });
    }
});

// 登录接口
app.post('/api/auth/login', async (req, res) => {
    try {
        const user = await User.findOne({ student_id: req.body.student_id }).lean();
        if (!user || !(await bcrypt.compare(req.body.password, user.password))) {
            return res.status(401).json({ success: false, message: "Invalid ID or Password" });
        }
        delete user.password;
        res.json({ success: true, user });
    } catch (err) {
        res.status(500).json({ success: false });
    }
});

/* =========================================
   📦 任务模块 (🌟 修复后的图片上传逻辑)
   =========================================
*/

app.post('/api/task/create', upload.single('task_image'), async (req, res) => {
    try {
        let finalImageUrl = '';

        // 如果用户上传了图片文件
        if (req.file) {
            // 封装 upload_stream 使用 Promise 异步上传
            const streamUpload = (buffer) => {
                return new Promise((resolve, reject) => {
                    const stream = cloudinary.uploader.upload_stream(
                        { folder: 'dormlift_prod' },
                        (error, result) => {
                            if (result) resolve(result.secure_url);
                            else reject(error);
                        }
                    );
                    stream.end(buffer);
                });
            };

            try {
                // 等待图片上传到云端获取 URL
                finalImageUrl = await streamUpload(req.file.buffer);
            } catch (uploadErr) {
                console.error("❌ Cloudinary stream upload failed:", uploadErr.message);
                return res.status(500).json({ success: false, message: "Upload Error: " + uploadErr.message });
            }
        }

        // 保存任务数据到 MongoDB
        const newTask = new Task({
            ...req.body,
            img_url: finalImageUrl
        });
        await newTask.save();
        console.log("✅ Task published successfully.");
        res.json({ success: true });

    } catch (err) {
        console.error("❌ Task Creation Error:", err.message);
        res.status(500).json({ success: false, message: err.message });
    }
});

// 获取大厅任务 (带发布者详情聚合)
app.get('/api/task/all', async (req, res) => {
    try {
        const tasks = await Task.aggregate([
            { $match: { status: 'pending' } },
            { $sort: { createdAt: -1 } },
            { $lookup: {
                from: 'users',
                localField: 'publisher_id',
                foreignField: 'student_id',
                as: 'pub'
            }},
            { $unwind: '$pub' }
        ]);
        res.json({ success: true, list: tasks.map(t => ({ 
            ...t, id: t._id, anonymous_name: t.pub.anonymous_name 
        })) });
    } catch (err) {
        res.status(500).json({ success: false });
    }
});

// 留言互动
app.post('/api/task/comment', async (req, res) => {
    try {
        await Task.findByIdAndUpdate(req.body.task_id, { 
            $push: { comments: { 
                user_id: req.body.user_id, 
                name: req.body.name, 
                text: req.body.text 
            } } 
        });
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ success: false });
    }
});

// 任务状态更新 (接单)
app.post('/api/task/workflow', async (req, res) => {
    try {
        await Task.findByIdAndUpdate(req.body.task_id, { 
            status: req.body.status, 
            helper_id: req.body.helper_id 
        });
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ success: false });
    }
});

/* =========================================
   👤 用户中心 (Profile)
   =========================================
*/

// 获取个人仪表盘数据 (我发布的 + 我接受的)
app.post('/api/user/dashboard', async (req, res) => {
    try {
        const list = await Task.find({ 
            $or: [{ publisher_id: req.body.student_id }, { helper_id: req.body.student_id }] 
        }).sort({ createdAt: -1 }).lean();
        res.json({ success: true, list: list.map(t => ({ ...t, id: t._id })) });
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

// 更新个人资料 (含 8888 后门)
app.post('/api/user/update', async (req, res) => {
    const { student_id, email, code, updates } = req.body;
    
    // 如果不是用 8888 万能码，则校验验证码
    if (code !== '8888') {
        const record = verificationCodes.get(email);
        if (!record || record.code !== code) {
            return res.status(400).json({ success: false, message: "Verification failed." });
        }
    }

    try {
        const updatedUser = await User.findOneAndUpdate(
            { student_id: student_id },
            { $set: updates },
            { new: true, projection: { password: 0 } }
        );
        res.json({ success: true, user: updatedUser });
    } catch (err) {
        res.status(500).json({ success: false });
    }
});

/* =========================================
   🛠️ 开发者接口 (Dev Reset)
   =========================================
*/
app.post('/api/dev/reset', async (req, res) => {
    try {
        await User.deleteMany({}); 
        await Task.deleteMany({}); 
        verificationCodes.clear();
        console.warn("⚠️ DATABASE RESET PERFORMED BY DEV.");
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ success: false });
    }
});

// 启动服务
app.listen(PORT, '0.0.0.0', () => {
    console.log(`🚀 DormLift Server Running on Port ${PORT}`);
});
