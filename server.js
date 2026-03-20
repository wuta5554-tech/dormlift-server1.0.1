const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const multer = require('multer');
const cloudinary = require('cloudinary').v2;
const { CloudinaryStorage } = require('multer-storage-cloudinary');
const bcrypt = require('bcryptjs');

const app = express();
const PORT = process.env.PORT || 8080;
const MONGO_URI = process.env.MONGO_URI || "mongodb+srv://wuta5554_db_user:WHT275024WHT%21@free.lnciszk.mongodb.net/Dormlift?appName=Free";

mongoose.connect(MONGO_URI).then(() => console.log('✅ Master DB Connected'));

// 1. 用户模型 (10个字段全量)
const User = mongoose.model('User', new mongoose.Schema({
    full_name: String, anonymous_name: String, school_name: String,
    gender: String, email: { type: String, unique: true }, phone: String,
    password: { type: String }, rating_avg: { type: Number, default: 5.0 },
    task_count: { type: Number, default: 0 }, created_at: { type: Date, default: Date.now }
}));

// 2. 任务模型 (含地图坐标、图片、电梯、人数)
const Task = mongoose.model('Task', new mongoose.Schema({
    publisher_id: String, helper_id: { type: String, default: null },
    move_date: String, from_addr: String, to_addr: String,
    items_desc: String, reward: String, img_url: String,
    people_needed: String, elevator: String,
    status: { type: String, enum: ['pending', 'assigned', 'finished'], default: 'pending' },
    created_at: { type: Date, default: Date.now }
}));

cloudinary.config({ cloud_name: 'ddlbhkmwb', api_key: '659513524184184', api_secret: 'iRTD1m-vPfaIu0DQ0uLUf4LUyLU' });
const upload = multer({ storage: new CloudinaryStorage({ cloudinary, params: { folder: 'dormlift_v14' } }) });

app.use(cors()); app.use(express.json()); app.use(express.static(__dirname));

// --- API 路由 ---
app.post('/api/auth/register', async (req, res) => {
    try {
        const hashed = await bcrypt.hash(req.body.password, 10);
        await new User({ ...req.body, password: hashed }).save();
        res.status(201).json({ success: true });
    } catch (e) { res.status(400).json({ success: false }); }
});

app.post('/api/auth/login', async (req, res) => {
    const user = await User.findOne({ email: req.body.email });
    if (user && await bcrypt.compare(req.body.password, user.password)) {
        res.json({ success: true, user: { email: user.email, anonymous_name: user.anonymous_name } });
    } else { res.status(401).json({ success: false }); }
});

app.post('/api/user/profile', async (req, res) => {
    const user = await User.findOne({ email: req.body.email });
    if(user) { const u = user.toObject(); delete u.password; res.json({ success: true, user: u }); }
    else res.status(404).json({ success: false });
});

app.post('/api/task/create', upload.array('task_images', 5), async (req, res) => {
    const urls = req.files ? req.files.map(f => f.path) : [];
    await new Task({ ...req.body, img_url: JSON.stringify(urls) }).save();
    res.json({ success: true });
});

app.get('/api/task/all', async (req, res) => {
    const list = await Task.find({ status: 'pending' }).sort({ created_at: -1 });
    res.json({ success: true, list });
});

app.post('/api/user/dashboard', async (req, res) => {
    const list = await Task.find({ $or: [{ publisher_id: req.body.email }, { helper_id: req.body.email }] }).sort({ created_at: -1 });
    res.json({ success: true, list });
});

app.post('/api/task/workflow', async (req, res) => {
    await Task.findByIdAndUpdate(req.body.task_id, { status: req.body.status, helper_id: req.body.helper_id });
    res.json({ success: true });
});

app.post('/api/task/cancel', async (req, res) => {
    const { task_id, type } = req.body;
    if(type === 'delete') await Task.findByIdAndDelete(task_id);
    else await Task.findByIdAndUpdate(task_id, { status: 'pending', helper_id: null });
    res.json({ success: true });
});

app.listen(PORT, '0.0.0.0', () => console.log(`🚀 Master Server on ${PORT}`));
