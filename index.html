<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>DormLift Pro | Professional Student Logistics</title>
    <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.0.0/css/all.min.css" />
    <link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" />
    <script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
    <style>
        :root { --primary: #3498db; --success: #27ae60; --danger: #e74c3c; --dark: #2c3e50; --gray: #95a5a6; --light: #f4f7f6; }
        body { margin: 0; font-family: 'Inter', sans-serif; background: var(--light); color: #333; }
        
        .page { display: none !important; opacity: 0; }
        .page.active { display: block !important; opacity: 1; animation: fadeIn 0.4s; }
        @keyframes fadeIn { from { opacity:0; } to { opacity:1; } }

        nav { background: var(--dark); padding: 15px 5%; display: flex; justify-content: space-between; align-items: center; color: white; position: sticky; top: 0; z-index: 1000; box-shadow: 0 4px 10px rgba(0,0,0,0.1); }
        .logo { font-size: 22px; font-weight: 800; cursor: pointer; color: white; }
        .nav-links a { color: #bdc3c7; margin-left: 20px; text-decoration: none; cursor: pointer; font-weight: 600; font-size: 14px; transition: 0.3s; }
        .nav-links a:hover, .nav-links a.active { color: white; }

        .container { max-width: 1100px; margin: 30px auto; padding: 0 20px; }
        .card { background: white; border-radius: 20px; padding: 30px; box-shadow: 0 10px 30px rgba(0,0,0,0.05); border: 1px solid #eee; margin-bottom: 25px; }

        /* 注册页：验证码样式 */
        .verify-row { display: flex; gap: 10px; }
        .btn-verify { background: #5d6d7e; width: 150px; font-size: 12px; }

        /* 个人资料卡：复刻版 */
        .profile-info-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 20px; margin-top: 20px; }
        .info-box { background: #fafafa; padding: 15px; border-radius: 12px; border: 1px solid #eee; }
        .info-box label { display: block; font-size: 10px; color: var(--gray); font-weight: 800; text-transform: uppercase; margin-bottom: 5px; }
        .info-box div { font-weight: 700; font-size: 14px; }

        /* 任务列表 */
        .list-section { margin-top: 30px; }
        .list-section h3 { border-bottom: 2px solid var(--primary); display: inline-block; padding-bottom: 5px; margin-bottom: 15px; font-size: 16px; }
        .task-item { display: flex; justify-content: space-between; align-items: center; padding: 15px; background: white; border-radius: 12px; margin-bottom: 10px; border: 1px solid #eee; }

        /* 任务详情弹窗 */
        .modal { display: none; position: fixed; top:0; left:0; width:100%; height:100%; background:rgba(0,0,0,0.8); z-index:2000; align-items:center; justify-content:center; }
        .modal-content { background:white; width:550px; padding:30px; border-radius:25px; max-height: 90vh; overflow-y: auto; }

        /* 地图 */
        #map { height: 300px; border-radius: 15px; margin-bottom: 20px; border: 2px solid #eee; }
        input, select, textarea { width: 100%; padding: 12px; border: 1px solid #ddd; border-radius: 10px; margin-bottom: 15px; box-sizing: border-box; }
        .btn { background: var(--primary); color: white; padding: 12px 25px; border: none; border-radius: 10px; cursor: pointer; font-weight: 700; transition: 0.3s; }
        .btn-danger { background: var(--danger); }
    </style>
</head>
<body>

<nav>
    <div class="logo" onclick="navigate('home')">DormLift Pro</div>
    <div class="nav-links" id="menu"></div>
</nav>

<div class="container">
    <div id="home" class="page active">
        <div class="card" style="text-align:center; padding: 80px 20px;">
            <i class="fas fa-truck-fast fa-4x" style="color:var(--primary); margin-bottom:20px;"></i>
            <h1 style="font-size: 3rem; margin:0;">DormLift Pro</h1>
            <p style="color:var(--gray); font-size: 1.2rem; max-width: 600px; margin: 20px auto;">
                Auckland's premium peer-to-peer student moving network. Connect with fellow students for safe, efficient, and affordable logistics.
            </p>
            <div style="margin-top:40px; display:flex; justify-content:center; gap:20px;">
                <button class="btn" style="width:200px" onclick="navigate('post-task')">Post Request</button>
                <button class="btn" style="width:200px; background:var(--dark);" onclick="navigate('hall')">Find Tasks</button>
            </div>
        </div>
    </div>

    <div id="post-task" class="page">
        <div class="card">
            <h2>Post a New Task</h2>
            <div id="map"></div>
            <form id="taskForm">
                <div style="display:grid; grid-template-columns:1fr 1fr; gap:15px;">
                    <input type="text" id="p_from" placeholder="Pickup (Select on Map)" readonly required>
                    <input type="text" id="p_to" placeholder="Destination (Select on Map)" readonly required>
                    <input type="date" id="p_date" required>
                    <input type="text" id="p_reward" placeholder="Reward (e.g. $50)" required>
                    <select id="p_people"><option value="1">1 Person Needed</option><option value="2">2 People Needed</option><option value="3">3+ People Needed</option></select>
                    <select id="p_lift"><option value="Yes">Elevator Available</option><option value="No">No Elevator (Stairs)</option></select>
                </div>
                <textarea id="p_desc" placeholder="Instruction/Description (e.g. 3 suitcases, 1 queen bed, meet at gate)" rows="3"></textarea>
                <label style="font-size:12px; font-weight:bold; color:var(--primary)">Upload Item Photos:</label>
                <input type="file" id="p_file" multiple style="margin-top:5px;">
                <button type="submit" class="btn" style="width:100%; margin-top:10px;">Broadcast Task</button>
            </form>
        </div>
    </div>

    <div id="hall" class="page">
        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:20px;">
            <h2>Task Marketplace</h2>
            <button class="btn" style="padding:8px 15px; font-size:12px;" onclick="loadHall()">Refresh</button>
        </div>
        <div id="hall_list" style="display:grid; grid-template-columns: repeat(auto-fill, minmax(300px, 1fr)); gap:20px;"></div>
    </div>

    <div id="profile" class="page">
        <div class="card">
            <div style="display:flex; gap:30px; align-items:center; margin-bottom:20px;">
                <div id="prof_avatar" style="width:80px; height:80px; background:var(--primary); border-radius:50%; display:flex; align-items:center; justify-content:center; color:white; font-size:35px; font-weight:bold;">?</div>
                <div><h2 id="prof_nickname" style="margin:0;">-</h2><p style="margin:0; color:var(--primary)">Verified Student Member</p></div>
            </div>
            <div class="profile-info-grid" id="prof_details"></div>
        </div>

        <div class="list-section">
            <h3>My Posted Requests</h3>
            <div id="my_posts"></div>
        </div>
        <div class="list-section">
            <h3>My Accepted Shifts</h3>
            <div id="my_shifts"></div>
        </div>
    </div>

    <div id="register" class="page">
        <div class="card" style="max-width:600px; margin:auto;">
            <h2 style="text-align:center;">Establish Membership</h2>
            <form id="regForm">
                <input type="text" id="r_fullname" placeholder="Full Name" required>
                <input type="text" id="r_anon" placeholder="Anonymous Nickname" required>
                <input type="text" id="r_school" placeholder="University Name" required>
                <select id="r_gender"><option>Male</option><option>Female</option><option>Other</option></select>
                <div class="verify-row">
                    <input type="email" id="r_email" placeholder="Student Email" required>
                    <button type="button" class="btn btn-verify" onclick="sendCode()">Send Code</button>
                </div>
                <input type="text" id="r_code" placeholder="Verification Code" required>
                <input type="text" id="r_phone" placeholder="Phone Number" required>
                <input type="password" id="r_pwd" placeholder="Password" required>
                <input type="password" id="r_pwd_confirm" placeholder="Confirm Password" required>
                <button type="submit" class="btn" style="width:100%; margin-top:10px;">Complete Registration</button>
            </form>
        </div>
    </div>

    <div id="login" class="page">
        <div class="card" style="max-width:400px; margin:auto; text-align:center;">
            <h2>Portal Login</h2>
            <form id="loginForm">
                <input type="email" id="l_email" placeholder="Email" required>
                <input type="password" id="l_pwd" placeholder="Password" required>
                <button type="submit" class="btn" style="width:100%;">Login</button>
            </form>
        </div>
    </div>
</div>

<div id="taskModal" class="modal">
    <div class="modal-content">
        <h2 id="m_reward" style="color:var(--success); margin:0 0 15px 0;">-</h2>
        <div id="m_imgs" style="display:flex; gap:10px; overflow-x:auto; margin-bottom:20px;"></div>
        <div id="m_details" style="background:var(--light); padding:20px; border-radius:15px; font-size:14px; line-height:1.8;"></div>
        <div id="m_action" style="margin-top:20px; display:flex; gap:10px;"></div>
        <button class="btn" style="background:var(--gray); width:100%; margin-top:15px;" onclick="document.getElementById('taskModal').style.display='none'">Close</button>
    </div>
</div>

<script>
    let user = JSON.parse(localStorage.getItem('user'));
    let map, markers = [], taskCache = {};

    function navigate(p) {
        if(!user && ['post-task', 'profile'].includes(p)) p = 'login';
        document.querySelectorAll('.page').forEach(el => el.classList.remove('active'));
        document.getElementById(p).classList.add('active');
        updateMenu();
        if(p==='post-task') initMap();
        if(p==='hall') loadHall();
        if(p==='profile') loadProfile();
    }

    function updateMenu() {
        const m = document.getElementById('menu');
        if(!user) m.innerHTML = `<a onclick="navigate('home')">Home</a><a onclick="navigate('login')">Log In</a><a onclick="navigate('register')">Register</a>`;
        else m.innerHTML = `<a onclick="navigate('home')">Home</a><a onclick="navigate('post-task')">Post Task</a><a onclick="navigate('hall')">Find Tasks</a><a onclick="navigate('profile')">My Profile</a><a onclick="logout()" style="color:var(--danger)">Log Out</a>`;
    }
    function logout() { localStorage.clear(); location.reload(); }

    function sendCode() { alert("Verification code sent to email!"); } // 模拟发送

    function initMap() {
        if(map) return;
        setTimeout(() => {
            map = L.map('map').setView([-36.8509, 174.7645], 13);
            L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png').addTo(map);
            map.on('click', e => {
                if(markers.length >= 2) { markers.forEach(m => map.removeLayer(m)); markers = []; }
                let m = L.marker(e.latlng).addTo(map); markers.push(m);
                const loc = `${e.latlng.lat.toFixed(4)}, ${e.latlng.lng.toFixed(4)}`;
                if(markers.length===1) document.getElementById('p_from').value = loc;
                else document.getElementById('p_to').value = loc;
            });
        }, 300);
    }

    async function loadHall() {
        const res = await fetch('/api/task/all'); const d = await res.json();
        document.getElementById('hall_list').innerHTML = d.list.map(t => {
            taskCache[t._id] = t; const imgs = JSON.parse(t.img_url || '[]');
            return `<div class="card" style="padding:15px; cursor:pointer" onclick="viewTask('${t._id}')">
                <img src="${imgs[0] || 'https://via.placeholder.com/300x150'}" style="width:100%; height:120px; object-fit:cover; border-radius:10px;">
                <h3 style="color:var(--success); margin:10px 0 5px 0;">${t.reward}</h3>
                <p style="font-size:12px; color:var(--gray); margin:0;">📅 ${t.move_date} | 👥 ${t.people_needed}p</p>
            </div>`;
        }).join('');
    }

    function viewTask(id) {
        const t = taskCache[id]; const imgs = JSON.parse(t.img_url || '[]');
        document.getElementById('m_reward').innerText = t.reward;
        document.getElementById('m_imgs').innerHTML = imgs.map(u => `<img src="${u}" style="height:100px; border-radius:10px;">`).join('');
        document.getElementById('m_details').innerHTML = `
            <b>Pickup:</b> ${t.from_addr}<br><b>Drop-off:</b> ${t.to_addr}<br>
            <b>Date:</b> ${t.move_date}<br><b>People Needed:</b> ${t.people_needed}<br>
            <b>Elevator:</b> ${t.elevator}<br><b>Description:</b> ${t.items_desc}
        `;
        let btn = '';
        if(user && t.publisher_id !== user.email && t.status === 'pending') {
            btn = `<button class="btn" style="flex:1" onclick="updateStatus('${t._id}', 'assigned', '${user.email}')">Accept Task</button>`;
        }
        document.getElementById('m_action').innerHTML = btn;
        document.getElementById('taskModal').style.display = 'flex';
    }

    async function loadProfile() {
        const res = await fetch('/api/user/profile', { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({email:user.email})});
        const d = await res.json(); const u = d.user;
        document.getElementById('prof_nickname').innerText = u.anonymous_name;
        document.getElementById('prof_details').innerHTML = `
            <div class="info-box"><label>Full Name</label><div>${u.full_name}</div></div>
            <div class="info-box"><label>School</label><div>${u.school_name}</div></div>
            <div class="info-box"><label>Email</label><div>${u.email}</div></div>
            <div class="info-box"><label>Phone</label><div>${u.phone}</div></div>
            <div class="info-box"><label>Gender</label><div>${u.gender}</div></div>
            <div class="info-box"><label>Rating</label><div style="color:var(--success)">5.0 ★</div></div>
        `;
        const res2 = await fetch('/api/user/dashboard', { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({email:user.email})});
        const d2 = await res2.json();
        document.getElementById('my_posts').innerHTML = d2.list.filter(t => t.publisher_id === user.email).map(t => `
            <div class="task-item">
                <div><b>${t.reward}</b><br><small>${t.status.toUpperCase()}</small></div>
                <button class="btn btn-danger" style="padding:5px 10px; font-size:11px;" onclick="cancelTask('${t._id}')">Cancel</button>
            </div>`).join('') || '<p>No posts.</p>';
        document.getElementById('my_shifts').innerHTML = d2.list.filter(t => t.helper_id === user.email).map(t => `
            <div class="task-item">
                <div><b>${t.reward}</b><br><small>ASSIGNED</small></div>
                <button class="btn btn-danger" style="padding:5px 10px; font-size:11px;" onclick="cancelTask('${t._id}', 'unassign')">Quit</button>
            </div>`).join('') || '<p>No assignments.</p>';
    }

    async function updateStatus(id, s, h) {
        await fetch('/api/task/workflow', { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({task_id:id, status:s, helper_id:h})});
        document.getElementById('taskModal').style.display = 'none'; navigate('profile');
    }

    async function cancelTask(id, type='delete') {
        if(!confirm("Are you sure?")) return;
        await fetch('/api/task/cancel', { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({task_id:id, type:type})});
        loadProfile();
    }

    document.getElementById('regForm').onsubmit = async e => {
        e.preventDefault();
        if(document.getElementById('r_pwd').value !== document.getElementById('r_pwd_confirm').value) return alert("Passwords mismatch");
        const b = { full_name: document.getElementById('r_fullname').value, anonymous_name: document.getElementById('r_anon').value, school_name: document.getElementById('r_school').value, gender: document.getElementById('r_gender').value, email: document.getElementById('r_email').value, phone: document.getElementById('r_phone').value, password: document.getElementById('r_pwd').value };
        await fetch('/api/auth/register', { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify(b)});
        navigate('login');
    };

    document.getElementById('loginForm').onsubmit = async e => {
        e.preventDefault();
        const r = await fetch('/api/auth/login', { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({email: document.getElementById('l_email').value, password: document.getElementById('l_pwd').value})});
        const d = await r.json();
        if(d.success) { user = d.user; localStorage.setItem('user', JSON.stringify(user)); navigate('home'); } else alert("Login Failed");
    };

    document.getElementById('taskForm').onsubmit = async e => {
        e.preventDefault(); const f = new FormData();
        f.append('publisher_id', user.email); f.append('from_addr', document.getElementById('p_from').value);
        f.append('to_addr', document.getElementById('p_to').value); f.append('move_date', document.getElementById('p_date').value);
        f.append('reward', document.getElementById('p_reward').value); f.append('items_desc', document.getElementById('p_desc').value);
        f.append('people_needed', document.getElementById('p_people').value); f.append('elevator', document.getElementById('p_lift').value);
        const files = document.getElementById('p_file').files; for(let i=0; i<files.length; i++) f.append('task_images', files[i]);
        await fetch('/api/task/create', { method:'POST', body:f });
        navigate('hall');
    };

    updateMenu(); navigate('home');
</script>
</body>
</html>
