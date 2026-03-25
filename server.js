/**
 * DormLift Pro - Super App Master Node (V12.1 Finance Edition)
 * -------------------------------------------------------------
 * 包含三大核心生态系统：
 * 1. Peer Logistics (校园互助物流 - 含勋章积分引擎)
 * 2. Flea Market (二手跳蚤市场 - 含 Escrow 担保交易状态机)
 * 3. Campus Buzz (校园八卦社区 - 含点赞与盖楼评论机制)
 * -------------------------------------------------------------
 * 金融核心：
 * - 虚拟钱包体系 (Wallet System)
 * - 7天超时自动打款守护进程 (Auto-Release Daemon)
 */

const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const multer = require('multer');
const cloudinary = require('cloudinary').v2;
const { CloudinaryStorage } = require('multer-storage-cloudinary');
const bcrypt = require('bcryptjs');
const fetch = (...args) => import('node-fetch').then(({default: fetch}) => fetch(...args));

const app = express();
const PORT = process.env.PORT || 8080;

// ==========================================
// 1. Environment & Database Connection
// ==========================================
const MONGO_URI = process.env.MONGO_URI;
const GAS_URL = process.env.GAS_URL;

mongoose.connect(MONGO_URI)
    .then(() => console.log('✅ DormLift Super App DB Connected (V12.1 Finance Engine)'))
    .catch(err => console.error('❌ DB Connection Error:', err));

// ==========================================
// 2. Database Schemas
// ==========================================
const User = mongoose.model('User', new mongoose.Schema({
    student_id: { type: String, required: true, unique: true }, 
    school_name: { type: String, default: "University of Auckland" },
    first_name: { type: String, required: true },
    given_name: { type: String, required: true },
    gender: { type: String, enum: ['Male', 'Female'] },
    anonymous_name: { type: String, required: true },
    phone: { type: String, required: true },
    email: { type: String, unique: true, required: true },
    password: { type: String, required: true },
    rating_avg: { type: Number, default: 5.0 },
    task_count: { type: Number, default: 0 },
    medal_points: { type: Number, default: 0 },
    point_history: { type: Array, default: [] },
    wallet_balance: { type: Number, default: 1000 }, // 初始体验金
    created_at: { type: Date, default: Date.now }
}));

const Task = mongoose.model('Task', new mongoose.Schema({
    publisher_id: { type: String, required: true },
    helper_id: { type: String, default: null },
    move_date: { type: String, required: true },
    move_time: { type: String, default: '' },
    from_addr: { type: String, required: true }, 
    to_addr: { type: String, required: true },   
    items_desc: { type: String, required: true },
    reward: { type: String, required: true },
    has_elevator: { type: String, default: 'false' },
    load_weight: { type: String, enum: ['Light', 'Heavy'], default: 'Light' },
    task_scale: { type: String, enum: ['Small', 'Medium', 'Large'], default: 'Small' },
    medal_points: { type: Number, default: 1 },
    img_url: { type: String, default: "[]" },
    status: { type: String, enum: ['pending', 'assigned', 'completed', 'reviewed'], default: 'pending' },
    comments: { type: Array, default: [] },
    created_at: { type: Date, default: Date.now }
}));

const MarketItem = mongoose.model('MarketItem', new mongoose.Schema({
    seller_id: { type: String, required: true },
    buyer_id: { type: String, default: null },
    title: { type: String, required: true },
    description: { type: String, required: true },
    condition: { type: String, required: true }, 
    price: { type: Number, required: true },
    location: { type: String, required: true },
    img_url: { type: String, default: "[]" },
    status: { type: String, enum: ['available', 'reserved', 'completed'], default: 'available' },
    locked_at: { type: Date, default: null }, // 资金托管计时器起点
    comments: { type: Array, default: [] },
    created_at: { type: Date, default: Date.now }
}));

const ForumPost = mongoose.model('ForumPost', new mongoose.Schema({
    author_id: { type: String, required: true },
    author_name: { type: String, required: true },
    content: { type: String, required: true },
    img_url: { type: String, default: "[]" },
    likes: { type: Array, default: [] }, 
    comments: { type: Array, default: [] },
    created_at: { type: Date, default: Date.now }
}));

const VerifyCode = mongoose.model('VerifyCode', new mongoose.Schema({
    email: { type: String, required: true },
    code: { type: String, required: true },
    expire_at: { type: Date, required: true }
}));

// ==========================================
// 3. Auto-Release Escrow Daemon (7 Days)
// ==========================================
setInterval(async () => {
    try {
        // 查找锁定超过7天的订单
        const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000); 
        const expiredItems = await MarketItem.find({ status: 'reserved', locked_at: { $lte: sevenDaysAgo } });

        for (let item of expiredItems) {
            // 自动把托管资金打入卖家钱包
            await User.findOneAndUpdate({ email: item.seller_id }, { $inc: { wallet_balance: item.price } });
            
            // 变更物品状态为已完成
            item.status = 'completed';
            await item.save();
            console.log(`[Escrow Engine] Auto-released $${item.price} to ${item.seller_id} for item ${item._id}`);
        }
    } catch (e) { 
        console.error("[Escrow Engine] Error:", e); 
    }
}, 1000 * 60 * 60); // 守护进程：每小时巡检一次数据库

// ==========================================
// 4. Cloudinary Configuration
// ==========================================
cloudinary.config({ 
    cloud_name: process.env.CLOUDINARY_NAME, 
    api_key: process.env.CLOUDINARY_KEY, 
    api_secret: process.env.CLOUDINARY_SECRET 
});

const storage = new CloudinaryStorage({ 
    cloudinary, 
    params: { folder: 'dormlift_superapp', allowed_formats: ['jpg', 'png', 'jpeg', 'mp4'] } 
});
const upload = multer({ storage });

app.use(cors()); 
app.use(express.json()); 
app.use(express.static(__dirname));

// ==========================================
// 5. Authentication APIs
// ==========================================
app.post('/api/auth/send-code', async (req, res) => {
    const { email } = req.body; 
    const code = Math.floor(100000 + Math.random() * 900000).toString();
    try {
        await VerifyCode.findOneAndUpdate({ email }, { code, expire_at: new Date(Date.now() + 5 * 60000) }, { upsert: true });
        await fetch(GAS_URL, { 
            method: 'POST', 
            body: JSON.stringify({ 
                to: email, 
                subject: "DormLift Access Code", 
                html: `<div style="padding:20px;"><h2>Access Code</h2><p><b style="font-size:24px;color:#4f46e5;">${code}</b></p><p>Expires in 5 minutes.</p></div>` 
            }) 
        });
        res.json({ success: true });
    } catch (e) { res.status(500).json({ success: false }); }
});

app.post('/api/auth/register', async (req, res) => {
    const { email, code, password, ...userData } = req.body;
    try {
        // "8888" 开发者测试后门
        if (code !== "8888") {
            const vRecord = await VerifyCode.findOne({ email });
            if (!vRecord || vRecord.code !== code || vRecord.expire_at < new Date()) return res.status(400).json({ success: false, msg: "Invalid code" });
        }
        await new User({ ...userData, email, password: await bcrypt.hash(password, 10) }).save();
        res.status(201).json({ success: true });
    } catch (e) { res.status(400).json({ success: false, msg: "Registration error" }); }
});

app.post('/api/auth/login', async (req, res) => {
    try {
        const user = await User.findOne({ $or: [{ email: req.body.email }, { student_id: req.body.email }] });
        if (user && await bcrypt.compare(req.body.password, user.password)) {
            const userObj = user.toObject(); delete userObj.password; 
            res.json({ success: true, user: userObj });
        } else {
            res.status(401).json({ success: false });
        }
    } catch (e) { res.status(500).json({ success: false }); }
});

app.get('/api/user/detail/:email', async (req, res) => {
    const user = await User.findOne({ email: req.params.email }, { password: 0 }); 
    res.json({ success: true, user });
});

// ==========================================
// 6. Logistics APIs (物流引擎)
// ==========================================
app.post('/api/task/create', upload.array('images', 5), async (req, res) => {
    try {
        let pts = req.body.task_scale === 'Large' ? 5 : (req.body.task_scale === 'Medium' ? 3 : 1);
        await new Task({ ...req.body, medal_points: pts, img_url: JSON.stringify(req.files ? req.files.map(f => f.path) : []) }).save();
        res.json({ success: true });
    } catch (e) { res.status(500).json({ success: false }); }
});

app.get('/api/task/all', async (req, res) => {
    const list = await Task.find({ status: 'pending', helper_id: null }).sort({ created_at: -1 }); 
    res.json({ success: true, list });
});

app.post('/api/task/comment', async (req, res) => {
    try {
        await Task.findByIdAndUpdate(req.body.task_id, { $push: { comments: req.body.comment } }); 
        res.json({ success: true });
    } catch (e) { res.status(500).json({ success: false }); }
});

app.post('/api/task/workflow', async (req, res) => {
    try {
        const { task_id, ...updates } = req.body; 
        const task = await Task.findById(task_id);
        
        // 发放勋章积分
        if (updates.status === 'completed' && task.status !== 'completed' && task.helper_id) {
            let destText = task.to_addr.includes('@@') ? task.to_addr.split('@@')[1] : task.to_addr;
            await User.findOneAndUpdate(
                { email: task.helper_id }, 
                { 
                    $inc: { medal_points: task.medal_points }, 
                    $push: { point_history: { desc: `Logistics: ${destText.substring(0, 30)}`, points: task.medal_points, date: new Date() } } 
                }
            );
        }
        
        if (updates.status === 'pending') updates.helper_id = null;
        await Task.findByIdAndUpdate(task_id, { $set: updates }); 
        res.json({ success: true });
    } catch (e) { res.status(500).json({ success: false }); }
});

app.post('/api/task/delete', async (req, res) => {
    await Task.findByIdAndDelete(req.body.task_id); 
    res.json({ success: true });
});

// ==========================================
// 7. Flea Market APIs (二手担保引擎 Escrow)
// ==========================================
app.post('/api/market/create', upload.array('images', 5), async (req, res) => {
    try {
        await new MarketItem({ ...req.body, img_url: JSON.stringify(req.files ? req.files.map(f => f.path) : []) }).save();
        res.json({ success: true });
    } catch (e) { res.status(500).json({ success: false }); }
});

app.get('/api/market/all', async (req, res) => {
    const list = await MarketItem.find({ status: 'available' }).sort({ created_at: -1 }); 
    res.json({ success: true, list });
});

app.post('/api/market/comment', async (req, res) => {
    try { 
        await MarketItem.findByIdAndUpdate(req.body.item_id, { $push: { comments: req.body.comment } }); 
        res.json({ success: true }); 
    } catch (e) { res.status(500).json({ success: false }); }
});

app.post('/api/market/workflow', async (req, res) => {
    try {
        const { item_id, status, buyer_id } = req.body;
        const item = await MarketItem.findById(item_id);
        let updates = { status };

        // [核心流] 买家下单支付，资金打入托管账户
        if (status === 'reserved' && buyer_id) {
            const buyer = await User.findOne({ email: buyer_id });
            if (buyer.wallet_balance < item.price) {
                return res.status(400).json({ success: false, msg: "INSUFFICIENT_FUNDS" });
            }
            await User.findOneAndUpdate({ email: buyer_id }, { $inc: { wallet_balance: -item.price } });
            updates.buyer_id = buyer_id; 
            updates.locked_at = new Date(); // 启动 7 天自动打款计时器
        }

        // [核心流] 买家确认收货，平台向卖家放款
        if (status === 'completed' && item.status === 'reserved') {
            await User.findOneAndUpdate({ email: item.seller_id }, { $inc: { wallet_balance: item.price } });
        }

        // [核心流] 交易取消，将资金退回给买家
        if (status === 'available' && item.status === 'reserved') {
            if (item.buyer_id) {
                await User.findOneAndUpdate({ email: item.buyer_id }, { $inc: { wallet_balance: item.price } });
            }
            updates.buyer_id = null; 
            updates.locked_at = null; // 取消计时器
        }

        await MarketItem.findByIdAndUpdate(item_id, { $set: updates }); 
        res.json({ success: true });
    } catch (e) { res.status(500).json({ success: false }); }
});

app.post('/api/market/delete', async (req, res) => {
    try {
        await MarketItem.findByIdAndDelete(req.body.task_id); // 复用前端接口字段名 task_id -> item_id
        res.json({ success: true });
    } catch (e) { res.status(500).json({ success: false }); }
});

// ==========================================
// 8. Forum APIs (八卦社区)
// ==========================================
app.post('/api/forum/create', upload.array('images', 5), async (req, res) => {
    try {
        await new ForumPost({ ...req.body, img_url: JSON.stringify(req.files ? req.files.map(f => f.path) : []) }).save(); 
        res.json({ success: true });
    } catch (e) { res.status(500).json({ success: false }); }
});

app.get('/api/forum/all', async (req, res) => {
    const list = await ForumPost.find().sort({ created_at: -1 }); 
    res.json({ success: true, list });
});

app.post('/api/forum/interact', async (req, res) => {
    const { post_id, action, email, comment } = req.body;
    try {
        if (action === 'like') {
            const p = await ForumPost.findById(post_id);
            if (p.likes.includes(email)) {
                await ForumPost.findByIdAndUpdate(post_id, { $pull: { likes: email } });
            } else {
                await ForumPost.findByIdAndUpdate(post_id, { $push: { likes: email } });
            }
        } else if (action === 'comment') {
            await ForumPost.findByIdAndUpdate(post_id, { $push: { comments: comment } });
        }
        res.json({ success: true });
    } catch (e) { res.status(500).json({ success: false }); }
});

// ==========================================
// 9. Global Utilities
// ==========================================
app.post('/api/user/dashboard', async (req, res) => {
    const { email } = req.body;
    try {
        const tasks = await Task.find({ $or: [{ publisher_id: email }, { helper_id: email }] }).sort({ created_at: -1 });
        const market = await MarketItem.find({ $or: [{ seller_id: email }, { buyer_id: email }] }).sort({ created_at: -1 });
        const posts = await ForumPost.find({ author_id: email }).sort({ created_at: -1 });
        res.json({ success: true, tasks, market, posts });
    } catch (e) { res.status(500).json({ success: false }); }
});

// Dev Tool: Wipe DB
app.post('/api/dev/nuke', async (req, res) => {
    await Task.deleteMany({}); 
    await MarketItem.deleteMany({}); 
    await ForumPost.deleteMany({}); 
    await User.deleteMany({}); 
    await VerifyCode.deleteMany({}); 
    res.json({ success: true });
});

app.listen(PORT, '0.0.0.0', () => console.log(`🚀 DormLift Super App V12.1 Active on ${PORT}`));
