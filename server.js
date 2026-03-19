const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const cors = require('cors');
const bodyParser = require('body-parser');
const nodemailer = require('nodemailer');

const app = express();
const PORT = process.env.PORT || 3000;

// 配置中间件
app.use(cors());
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

// 连接SQLite数据库
const db = new sqlite3.Database('./dormlift.db', (err) => {
  if (err) {
    console.error('Database connection error:', err.message);
  } else {
    console.log('Connected to SQLite database successfully');
    initDatabase(); // 初始化数据库表
  }
});

// 全局变量：存储验证码（内存中，重启后丢失，仅测试用）
let storedCode = null;

// 初始化数据库表结构
function initDatabase() {
  // 1. 用户表（新增手机号字段）
  db.run(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      student_id TEXT UNIQUE NOT NULL,
      given_name TEXT NOT NULL,
      first_name TEXT NOT NULL,
      gender TEXT NOT NULL,
      anonymous_name TEXT NOT NULL,
      phone TEXT UNIQUE NOT NULL, -- 新增手机号字段（SQL标准注释）
      password TEXT NOT NULL
    )
  `, (err) => {
    if (err) console.error('Error creating users table:', err.message);
    else console.log('Users table initialized');
  });

  // 2. 搬家请求表
  db.run(`
    CREATE TABLE IF NOT EXISTS moving_requests (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      student_id TEXT NOT NULL,
      move_date TEXT NOT NULL,
      location TEXT NOT NULL,
      helpers_needed TEXT NOT NULL,
      items TEXT NOT NULL,
      compensation TEXT NOT NULL,
      helper_assigned TEXT,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (student_id) REFERENCES users(student_id)
    )
  `, (err) => {
    if (err) console.error('Error creating moving_requests table:', err.message);
    else console.log('Moving requests table initialized');
  });
}

// 宽松版：手机号验证（任何非空号码都通过）
function isValidNZPhone(phone) {
  return phone && phone.length > 5;
}

// 宽松版：手机号标准化（直接返回原号码）
function normalizeNZPhone(phone) {
  return phone;
}

// 1. 发送验证码接口（模拟发送，控制台打印验证码）
app.post('/api/send-verification-code', async (req, res) => {
  const { phone } = req.body;

  // 基础验证
  if (!phone) {
    return res.json({ success: false, message: 'Phone number is required' });
  }

  // 生成6位验证码
  const code = Math.floor(100000 + Math.random() * 900000).toString();
  console.log(`【测试验证码】手机号 ${phone} 的验证码是：${code}`); // 控制台打印验证码

  // 存储验证码（有效期5分钟）
  storedCode = { 
    phone: phone, 
    code: code, 
    expireTime: Date.now() + 5 * 60 * 1000 
  };

  // 模拟发送成功（不真发邮件/短信）
  res.json({
    success: true,
    message: `Verification code sent successfully! (Code: ${code})`
  });
});

// 2. 注册接口（跳过验证码校验）
app.post('/api/register', async (req, res) => {
  const { 
    givenName, firstName, studentId, gender, 
    phone, verifyCode, anonymousName, password, confirmPassword 
  } = req.body;

  // 基础验证
  if (!givenName || !firstName || !studentId || !gender || !phone || !verifyCode || !anonymousName || !password || !confirmPassword) {
    return res.json({ success: false, message: 'All fields are required' });
  }

  // 密码验证
  if (password !== confirmPassword) {
    return res.json({ success: false, message: 'Passwords do not match' });
  }

  // ========== 跳过验证码校验（测试用） ==========
  // if (!storedCode || storedCode.phone !== phone || storedCode.code !== verifyCode || Date.now() > storedCode.expireTime) {
  //   return res.json({ success: false, message: 'Invalid or expired verification code' });
  // }

  // 检查学号是否已注册
  db.get('SELECT * FROM users WHERE student_id = ?', [studentId], (err, row) => {
    if (err) {
      return res.json({ success: false, message: 'Database error: ' + err.message });
    }

    if (row) {
      return res.json({ success: false, message: 'Student ID already registered' });
    }

    // 检查手机号是否已注册
    db.get('SELECT * FROM users WHERE phone = ?', [phone], (err, row) => {
      if (err) {
        return res.json({ success: false, message: 'Database error: ' + err.message });
      }

      if (row) {
        return res.json({ success: false, message: 'Phone number already registered' });
      }

      // 插入新用户
      db.run(`
        INSERT INTO users (student_id, given_name, first_name, gender, anonymous_name, phone, password)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `, [studentId, givenName, firstName, gender, anonymousName, phone, password], (err) => {
        if (err) {
          return res.json({ success: false, message: 'Registration failed: ' + err.message });
        }

        // 清空验证码
        storedCode = null;
        res.json({ success: true, message: 'Registration successful! Please login' });
      });
    });
  });
});

// 3. 登录接口
app.post('/api/login', (req, res) => {
  const { studentId, password } = req.body;

  if (!studentId || !password) {
    return res.json({ success: false, message: 'Student ID and password are required' });
  }

  // 验证用户
  db.get('SELECT * FROM users WHERE student_id = ?', [studentId], (err, row) => {
    if (err) {
      return res.json({ success: false, message: 'Database error: ' + err.message });
    }

    if (!row) {
      return res.json({ success: false, message: 'Student ID not found' });
    }

    if (row.password !== password) {
      return res.json({ success: false, message: 'Incorrect password' });
    }

    // 登录成功，返回匿名名称
    res.json({ 
      success: true, 
      message: 'Login successful',
      anonymousName: row.anonymous_name 
    });
  });
});

// 4. 发布搬家请求接口
app.post('/api/post-request', (req, res) => {
  const { studentId, moveDate, location, helpersNeeded, items, compensation } = req.body;

  if (!studentId || !moveDate || !location || !helpersNeeded || !items || !compensation) {
    return res.json({ success: false, message: 'All fields are required' });
  }

  // 插入搬家请求
  db.run(`
    INSERT INTO moving_requests (student_id, move_date, location, helpers_needed, items, compensation)
    VALUES (?, ?, ?, ?, ?, ?)
  `, [studentId, moveDate, location, helpersNeeded, items, compensation], (err) => {
    if (err) {
      return res.json({ success: false, message: 'Failed to post request: ' + err.message });
    }

    res.json({ success: true, message: 'Moving request posted successfully' });
  });
});

// 5. 获取所有公开任务（未被接受的）
app.get('/api/get-tasks', (req, res) => {
  db.all(`
    SELECT * FROM moving_requests 
    WHERE helper_assigned IS NULL OR helper_assigned = ''
    ORDER BY move_date ASC
  `, (err, rows) => {
    if (err) {
      return res.json({ success: false, message: 'Failed to load tasks: ' + err.message });
    }

    res.json({ success: true, tasks: rows });
  });
});

// 6. 接受任务接口
app.post('/api/accept-task', (req, res) => {
  const { taskId, helperId } = req.body;

  if (!taskId || !helperId) {
    return res.json({ success: false, message: 'Task ID and Helper ID are required' });
  }

  // 检查任务是否已被接受
  db.get('SELECT * FROM moving_requests WHERE id = ?', [taskId], (err, row) => {
    if (err) {
      return res.json({ success: false, message: 'Database error: ' + err.message });
    }

    if (!row) {
      return res.json({ success: false, message: 'Task not found' });
    }

    if (row.helper_assigned) {
      return res.json({ success: false, message: 'This task has already been assigned' });
    }

    // 更新任务，分配助手
    db.run(`
      UPDATE moving_requests 
      SET helper_assigned = ? 
      WHERE id = ?
    `, [helperId, taskId], (err) => {
      if (err) {
        return res.json({ success: false, message: 'Failed to accept task: ' + err.message });
      }

      res.json({ success: true, message: 'Task accepted successfully' });
    });
  });
});

// 7. 获取我发布的任务
app.post('/api/my-posted-tasks', (req, res) => {
  const { studentId } = req.body;

  if (!studentId) {
    return res.json({ success: false, message: 'Student ID is required' });
  }

  db.all(`
    SELECT * FROM moving_requests 
    WHERE student_id = ?
    ORDER BY move_date ASC
  `, [studentId], (err, rows) => {
    if (err) {
      return res.json({ success: false, message: 'Failed to load your requests: ' + err.message });
    }

    res.json({ success: true, tasks: rows });
  });
});

// 8. 获取我接受的任务
app.post('/api/my-accepted-tasks', (req, res) => {
  const { helperId } = req.body;

  if (!helperId) {
    return res.json({ success: false, message: 'Helper ID is required' });
  }

  db.all(`
    SELECT * FROM moving_requests 
    WHERE helper_assigned = ?
    ORDER BY move_date ASC
  `, [helperId], (err, rows) => {
    if (err) {
      return res.json({ success: false, message: 'Failed to load your tasks: ' + err.message });
    }

    res.json({ success: true, tasks: rows });
  });
});

// 9. 查看助手学号（发布者）
app.post('/api/view-helper-id', (req, res) => {
  const { taskId, posterId } = req.body;

  if (!taskId || !posterId) {
    return res.json({ success: false, message: 'Task ID and Poster ID are required' });
  }

  db.get(`
    SELECT helper_assigned FROM moving_requests 
    WHERE id = ? AND student_id = ?
  `, [taskId, posterId], (err, row) => {
    if (err) {
      return res.json({ success: false, message: 'Database error: ' + err.message });
    }

    if (!row || !row.helper_assigned) {
      return res.json({ success: false, message: 'No helper assigned to this task' });
    }

    res.json({ success: true, helperId: row.helper_assigned });
  });
});

// 10. 查看发布者学号（助手）
app.post('/api/view-poster-id', (req, res) => {
  const { taskId, helperId } = req.body;

  if (!taskId || !helperId) {
    return res.json({ success: false, message: 'Task ID and Helper ID are required' });
  }

  db.get(`
    SELECT student_id FROM moving_requests 
    WHERE id = ? AND helper_assigned = ?
  `, [taskId, helperId], (err, row) => {
    if (err) {
      return res.json({ success: false, message: 'Database error: ' + err.message });
    }

    if (!row) {
      return res.json({ success: false, message: 'You are not assigned to this task' });
    }

    res.json({ success: true, posterId: row.student_id });
  });
});

// 11. 删除我发布的任务
app.post('/api/delete-task', (req, res) => {
  const { taskId, studentId } = req.body;

  if (!taskId || !studentId) {
    return res.json({ success: false, message: 'Task ID and Student ID are required' });
  }

  // 验证任务归属
  db.get(`
    SELECT * FROM moving_requests 
    WHERE id = ? AND student_id = ?
  `, [taskId, studentId], (err, row) => {
    if (err) {
      return res.json({ success: false, message: 'Database error: ' + err.message });
    }

    if (!row) {
      return res.json({ success: false, message: 'Task not found or you are not the owner' });
    }

    // 删除任务
    db.run(`
      DELETE FROM moving_requests 
      WHERE id = ?
    `, [taskId], (err) => {
      if (err) {
        return res.json({ success: false, message: 'Failed to delete task: ' + err.message });
      }

      res.json({ success: true, message: 'Task deleted successfully' });
    });
  });
});

// 12. 取消我接受的任务
app.post('/api/cancel-task', (req, res) => {
  const { taskId, helperId } = req.body;

  if (!taskId || !helperId) {
    return res.json({ success: false, message: 'Task ID and Helper ID are required' });
  }

  // 验证任务归属
  db.get(`
    SELECT * FROM moving_requests 
    WHERE id = ? AND helper_assigned = ?
  `, [taskId, helperId], (err, row) => {
    if (err) {
      return res.json({ success: false, message: 'Database error: ' + err.message });
    }

    if (!row) {
      return res.json({ success: false, message: 'Task not found or you are not the helper' });
    }

    // 取消任务（清空助手字段）
    db.run(`
      UPDATE moving_requests 
      SET helper_assigned = NULL 
      WHERE id = ?
    `, [taskId], (err) => {
      if (err) {
        return res.json({ success: false, message: 'Failed to cancel task: ' + err.message });
      }

      res.json({ success: true, message: 'Task cancelled successfully' });
    });
  });
});

// 13. 获取个人信息
app.post('/api/get-profile', (req, res) => {
  const { studentId } = req.body;

  if (!studentId) {
    return res.json({ success: false, message: 'Student ID is required' });
  }

  db.get('SELECT * FROM users WHERE student_id = ?', [studentId], (err, row) => {
    if (err) {
      return res.json({ success: false, message: 'Database error: ' + err.message });
    }

    if (!row) {
      return res.json({ success: false, message: 'User not found' });
    }

    res.json({ 
      success: true, 
      user: {
        given_name: row.given_name,
        first_name: row.first_name,
        student_id: row.student_id,
        gender: row.gender,
        anonymous_name: row.anonymous_name,
        phone: row.phone
      }
    });
  });
});
// 🚩 你刚加的测试路由在这里
app.get('/', (req, res) => {
  res.send('🎉 服务器通了！');
});
// 启动服务器
app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});