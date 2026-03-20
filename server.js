<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>DormLift - NZ Student Moving</title>
    <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.0.0/css/all.min.css" />
    <link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" />
    <script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
    <style>
        :root { --primary: #3498db; --bg: #f4f7f9; --text: #2c3e50; --card: #fff; --border: #e1e8ed; }
        body { margin: 0; font-family: 'Inter', sans-serif; background: var(--bg); color: var(--text); }
        
        /* 导航栏修复 */
        nav { 
            background: #2c3e50; /* 改为深色背景，更专业 */
            padding: 15px 40px; 
            display: flex; 
            justify-content: space-between; 
            align-items: center; 
            position: sticky; 
            top: 0; 
            z-index: 10000; 
            color: white;
        }
        .logo { font-size: 22px; font-weight: 800; color: white; cursor: pointer; text-decoration: none; }
        .nav-items a { 
            color: #bdc3c7; 
            text-decoration: none; 
            margin-left: 20px; 
            font-weight: 600; 
            font-size: 14px;
            transition: 0.3s;
        }
        .nav-items a:hover, .nav-items a.active { color: white; }

        .container { max-width: 1000px; margin: 20px auto; padding: 0 20px; }
        .page { display: none; } 
        .page.active { display: block; }
        
        /* 登录页全屏遮罩 */
        #auth-page { 
            position: fixed; 
            inset: 0; 
            background: var(--bg); 
            z-index: 20000; 
            display: flex; 
            align-items: center; 
            justify-content: center; 
        }
        .auth-box { background: white; padding: 30px; border-radius: 15px; width: 380px; box-shadow: 0 10px 30px rgba(0,0,0,0.1); color: var(--text); }
        
        .input-pro { width: 100%; padding: 12px; border: 1px solid var(--border); border-radius: 8px; margin-bottom: 15px; box-sizing: border-box; }
        .btn { padding: 12px 25px; border-radius: 8px; border: none; font-weight: 600; cursor: pointer; width: 100%; }
        .btn-primary { background: var(--primary); color: white; }
        
        /* 卡片样式 */
        .pro-card { background: white; border-radius: 12px; padding: 20px; border: 1px solid var(--border); margin-bottom: 20px; }
        #loader { display: none; position: fixed; inset: 0; background: rgba(255,255,255,0.8); z-index: 30000; flex-direction: column; align-items: center; justify-content: center; }
    </style>
</head>
<body>

    <div id="loader"><i class="fa-solid fa-spinner fa-spin fa-3x" style="color:var(--primary)"></i><p>Processing...</p></div>

    <div id="auth-page">
        <div class="auth-box">
            <h2 style="text-align:center; color:var(--primary);">DormLift NZ</h2>
            <div id="login-form">
                <input type="text" id="l-id" placeholder="Student ID" class="input-pro">
                <input type="password" id="l-pw" placeholder="Password" class="input-pro">
                <button class="btn btn-primary" onclick="handleLogin()">Login</button>
                <p style="text-align:center; font-size:14px;">No account? <a href="#" onclick="toggleAuth(false)">Register</a></p>
            </div>
            <div id="reg-form" style="display:none;">
                <input type="text" id="r-id" placeholder="Student ID" class="input-pro">
                <div style="display:flex; gap:10px;">
                    <input type="text" id="r-first" placeholder="First Name" class="input-pro">
                    <input type="text" id="r-given" placeholder="Last Name" class="input-pro">
                </div>
                <input type="text" id="r-phone" placeholder="Mobile Phone" class="input-pro">
                <div style="display:flex; gap:10px;">
                    <input type="email" id="r-email" placeholder="Email" class="input-pro">
                    <button class="btn btn-primary" style="width:100px; font-size:12px; background:#2ecc71;" onclick="sendCode()">Verify</button>
                </div>
                <input type="text" id="r-code" placeholder="Verification Code" class="input-pro">
                <input type="text" id="r-anon" placeholder="Display Nickname" class="input-pro">
                <input type="password" id="r-pw" placeholder="Password" class="input-pro">
                <button class="btn btn-primary" onclick="handleRegister()">Complete Registration</button>
                <p style="text-align:center; font-size:14px;"><a href="#" onclick="toggleAuth(true)">Back to Login</a></p>
            </div>
        </div>
    </div>

    <nav id="main-nav">
        <a class="logo" onclick="navigate('home')">DormLift Pro</a>
        <div class="nav-items">
            <a href="#" id="nav-home" onclick="navigate('home')">Market</a>
            <a href="#" id="nav-post" onclick="navigate('post')">Post Task</a>
            <a href="#" id="nav-dash" onclick="navigate('dash')">My Tasks</a>
            <a href="#" id="nav-prof" onclick="navigate('prof')">Profile</a>
        </div>
    </nav>

    <div class="container">
        <div id="home" class="page active">
            <div class="pro-card" style="text-align:center; padding: 40px;">
                <h1>Affordable Moving Help</h1>
                <p>The student-powered platform for reliable moving assistance.</p>
                <button class="btn btn-primary" style="width:auto;" onclick="navigate('post')">Post a Request</button>
            </div>
            <div id="task-list"></div>
        </div>
        
        <div id="post" class="page">
            <h3>Post Task</h3>
            <div id="map" style="height:300px;"></div>
            </div>

        <div id="dash" class="page"><h3>Dashboard</h3><div id="my-tasks"></div></div>
        <div id="prof" class="page"><h3>Profile</h3><div id="profile-info" class="pro-card"></div><button class="btn btn-primary" style="background:#e74c3c;" onclick="logout()">Logout</button></div>
    </div>

    <script>
        const API = window.location.origin + '/api';
        let user = JSON.parse(localStorage.getItem('user')) || null;

        function navigate(p) {
            document.querySelectorAll('.page').forEach(x => x.classList.remove('active'));
            document.querySelectorAll('.nav-items a').forEach(x => x.classList.remove('active'));
            
            document.getElementById(p).classList.add('active');
            document.getElementById('nav-' + p).classList.add('active');
            
            if(p === 'home') loadTasks();
            // ... 其他页面加载逻辑 ...
        }

        // 登录/登出控制
        function checkUser() {
            if (user) {
                document.getElementById('auth-page').style.display = 'none';
                document.getElementById('main-nav').style.display = 'flex';
                navigate('home');
            } else {
                document.getElementById('auth-page').style.display = 'flex';
                document.getElementById('main-nav').style.display = 'none';
            }
        }

        function logout() { localStorage.clear(); location.reload(); }

        // 初始化
        window.onload = checkUser;

        // ... (保留 handleLogin, handleRegister, sendCode 等 API 逻辑) ...
    </script>
</body>
</html>
