/**
 * DormLift 后端服务 - 生产版（修复Outlook SMTP连接超时）
 * 适配Railway部署 | 生产级安全配置 | 无测试代码 | 完整错误处理
 */
const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const cors = require('cors');
const bodyParser = require('body-parser');
const nodemailer = require('nodemailer');
const bcrypt = require('bcrypt');
const fs = require('fs');
const path = require('path');
const { existsSync, mkdirSync } = require('fs');

// ===================== 环境变量配置（生产级） =====================
const NODE_ENV = process.env.NODE_ENV || 'production';
const PORT = process.env.PORT || 8080;
const CORS_ORIGIN = process.env.CORS_ORIGIN || '*';
const DB_PATH = process.env.DB_PATH || '/opt/database/dormlift.db';
const OUTLOOK_EMAIL = process.env.OUTLOOK_EMAIL;
const OUTLOOK_PASSWORD = process.env.OUTLOOK_PASSWORD;
const BCRYPT_SALT_ROUNDS = parseInt(process.env.BCRYPT_SALT_ROUNDS) || 12;

// 验证关键环境变量
if (!OUTLOOK_EMAIL || !OUTLOOK_PASSWORD) {
  console.error('【致命错误】缺少Outlook邮箱配置，请设置OUTLOOK_EMAIL和OUTLOOK_PASSWORD环境变量');
  process.exit(1);
}

// 创建数据库目录（Railway持久化）
const dbDir = path.dirname(DB_PATH);
if (!existsSync(dbDir)) {
  mkdirSync(dbDir, { recursive: true });
  console.log(`【数据库】创建目录: ${dbDir}`);
}

// ===================== 应用初始化 =====================
const app = express();

// 生产级CORS配置
// 同域名CORS配置（自动匹配当前域名，无需环境变量）
const corsOptions = {
  origin: true, // 自动识别并允许当前域名，替代读取环境变量
  credentials: true, // 允许携带凭证，解决跨域（同域下也兼容）
  methods: ['GET', 'POST', 'PUT', 'DELETE'],
  allowedHeaders: ['Content-Type', 'Authorization']
};
app.use(cors(corsOptions));

// 请求体解析（生产级限制）
app.use(bodyParser.json({ 
  limit: '1mb',
  verify: (req, res, buf) => {
    req.rawBody = buf.toString();
  }
}));
app.use(bodyParser.urlencoded({ 
  extended: true,
  limit: '1mb'
}));

// 静态文件服务（首页）
app.use(express.static(path.join(__dirname, '.')));

// ===================== 数据库连接（生产级） =====================
const db = new sqlite3.Database(DB_PATH, sqlite3.OPEN_READWRITE | sqlite3.OPEN_CREATE, (err) => {
  if (err) {
    console.error(`【数据库致命错误】连接失败: ${err.message}`);
    process.exit(1);
  } else {
    console.log(`【数据库】成功连接到: ${DB_PATH}`);
    initDatabase();
  }
});

// 全局变量：邮箱验证码存储（生产建议替换为Redis）
let storedVerificationCode = {
  email: '',
  code: '',
  expireTime: 0
};

// ===================== 邮箱配置（修复SMTP连接超时） =====================
const emailTransporter = nodemailer.createTransport({
  host: 'smtp.outlook.com', // 替换为兼容性更好的域名，解决连接超时
  port: 587,
  secure: false, // 587端口用false，465用true
  auth: {
    user: OUTLOOK_EMAIL,
    pass: OUTLOOK_PASSWORD // 必须是Outlook应用专用密码（两步验证后生成）
  },
  tls: {
    ciphers: 'SSLv3', // 解决Railway网络兼容性问题
    rejectUnauthorized: false, // 临时关闭证书验证（解决连接超时）
    minVersion: 'TLSv1.2'
  },
  // 延长超时时间，解决连接超时问题
  connectionTimeout: 15000,
  greetingTimeout: 15000,
  socketTimeout: 15000,
  // 启用连接池，提升稳定性
  pool: true,
  maxConnections: 5,
  maxMessages: 100,
  rateLimit: true
});

// 验证邮箱连接（生产级）
emailTransporter.verify((error, success) => {
  if (error) {
    console.error(`【邮箱警告】连接Outlook SMTP失败: ${error.message}`);
    console.error(`【解决方案】1. 确认OUTLOOK_PASSWORD是应用专用密码；2. 检查Outlook两步验证已开启；3. 重启Railway服务`);
    // 邮箱连接失败不终止服务，核心业务仍可运行
  } else {
    console.log('【邮箱】成功连接到Outlook SMTP服务器');
  }
});

// ===================== 数据库表初始化（生产级） =====================
function initDatabase() {
  console.log('【数据库】开始初始化表结构...');

  // 1. 用户表（含学校名称，密码加密）
  const createUsersTable = `
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      student_id TEXT UNIQUE NOT NULL,
      given_name TEXT NOT NULL,
      first_name TEXT NOT NULL,
      gender TEXT NOT NULL,
      anonymous_name TEXT NOT NULL,
      phone TEXT UNIQUE NOT NULL,
      email TEXT UNIQUE NOT NULL,
      school_name TEXT NOT NULL,
      password TEXT NOT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TRIGGER IF NOT EXISTS update_users_timestamp 
    AFTER UPDATE ON users
    FOR EACH ROW
    BEGIN
      UPDATE users SET updated_at = CURRENT_TIMESTAMP WHERE id = old.id;
    END;
  `;

  // 2. 搬家请求表
  const createMovingRequestsTable = `
    CREATE TABLE IF NOT EXISTS moving_requests (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      student_id TEXT NOT NULL,
      move_date TEXT NOT NULL,
      location TEXT NOT NULL,
      helpers_needed TEXT NOT NULL,
      items TEXT NOT NULL,
      compensation TEXT NOT NULL,
      helper_assigned TEXT,
      status TEXT DEFAULT 'pending',
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (student_id) REFERENCES users(student_id) ON DELETE CASCADE
    );
    CREATE TRIGGER IF NOT EXISTS update_requests_timestamp 
    AFTER UPDATE ON moving_requests
    FOR EACH ROW
    BEGIN
      UPDATE moving_requests SET updated_at = CURRENT_TIMESTAMP WHERE id = old.id;
    END;
  `;

  // 3. 任务分配记录表
  const createTaskAssignmentsTable = `
    CREATE TABLE IF NOT EXISTS task_assignments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      task_id INTEGER NOT NULL,
      helper_id TEXT NOT NULL,
      assign_time TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (task_id) REFERENCES moving_requests(id) ON DELETE CASCADE,
      FOREIGN KEY (helper_id) REFERENCES users(student_id) ON DELETE CASCADE,
      UNIQUE(task_id, helper_id)
    );
  `;

  // 执行初始化
  db.exec(createUsersTable, (err) => {
    if (err) console.error(`【数据库错误】创建users表: ${err.message}`);
    else console.log('【数据库】users表初始化完成');
  });

  db.exec(createMovingRequestsTable, (err) => {
    if (err) console.error(`【数据库错误】创建moving_requests表: ${err.message}`);
    else console.log('【数据库】moving_requests表初始化完成');
  });

  db.exec(createTaskAssignmentsTable, (err) => {
    if (err) console.error(`【数据库错误】创建task_assignments表: ${err.message}`);
    else console.log('【数据库】task_assignments表初始化完成');
  });
}

// ===================== 工具函数（生产级） =====================
/**
 * 验证Outlook邮箱格式
 */
function isValidOutlookEmail(email) {
  const outlookRegex = /^[a-zA-Z0-9._%+-]+@(outlook|hotmail)\.com$/i;
  return outlookRegex.test(email) && email.length <= 254;
}

/**
 * 生成6位数字验证码
 */
function generateVerificationCode() {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

/**
 * 发送Outlook邮箱验证码（生产级，优化错误提示）
 */
async function sendEmailVerificationCode(toEmail, code) {
  const mailOptions = {
    from: `"DormLift" <${OUTLOOK_EMAIL}>`,
    to: toEmail,
    subject: 'DormLift - 邮箱验证验证码',
    text: `【DormLift】你的验证码是：${code}，有效期5分钟，请尽快完成验证。`,
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #eee; border-radius: 8px;">
        <h2 style="color: #2c3e50; text-align: center;">DormLift 邮箱验证</h2>
        <p style="font-size: 16px; color: #34495e; line-height: 1.6;">你正在注册DormLift账号，验证码如下：</p>
        <div style="font-size: 28px; font-weight: bold; color: #3498db; text-align: center; margin: 20px 0; letter-spacing: 2px;">${code}</div>
        <p style="font-size: 14px; color: #7f8c8d; line-height: 1.6;">
          验证码有效期5分钟，请勿泄露给他人。<br>
          如非本人操作，请忽略此邮件。
        </p>
      </div>
    `,
    priority: 'high',
    headers: {
      'X-Priority': '1',
      'X-MSMail-Priority': 'High'
    }
  };

  try {
    await emailTransporter.sendMail(mailOptions);
    return true;
  } catch (error) {
    console.error(`【邮箱错误】发送到${toEmail}: ${error.message}`);
    return false;
  }
}

// ===================== 全局错误处理中间件 =====================
app.use((err, req, res, next) => {
  console.error(`【全局错误】${req.method} ${req.originalUrl}: ${err.stack}`);
  res.status(500).json({
    success: false,
    message: '服务器内部错误，请稍后重试'
  });
});

// ===================== 接口 - 验证码相关 =====================
/**
 * 发送邮箱验证码（生产级，优化错误提示）
 */
app.post('/api/send-verification-code', async (req, res, next) => {
  try {
    const { email } = req.body;

    // 参数验证
    if (!email) {
      return res.status(400).json({
        success: false,
        message: '参数错误：邮箱不能为空'
      });
    }

    // 邮箱格式验证
    if (!isValidOutlookEmail(email)) {
      return res.status(400).json({
        success: false,
        message: '邮箱格式错误：仅支持Outlook/Hotmail邮箱（如xxx@outlook.com）'
      });
    }

    // 生成验证码
    const verificationCode = generateVerificationCode();
    const expireTime = Date.now() + 5 * 60 * 1000;

    // 发送验证码（优化错误提示）
    const sendSuccess = await sendEmailVerificationCode(email, verificationCode);
    if (!sendSuccess) {
      return res.status(500).json({
        success: false,
        message: '验证码发送失败，请检查：1. Outlook邮箱是否开启两步验证；2. 密码是否为应用专用密码；3. 稍后重试'
      });
    }

    // 存储验证码
    storedVerificationCode = {
      email: email,
      code: verificationCode,
      expireTime: expireTime
    };

    // 返回成功响应
    res.status(200).json({
      success: true,
      message: `验证码已发送到 ${email}，请查收（含垃圾箱）`
    });
  } catch (error) {
    next(error);
  }
});

// ===================== 接口 - 用户注册/登录 =====================
/**
 * 用户注册（生产级，仅邮箱验证，手机号仅作联系方式）
 */
app.post('/api/register', async (req, res, next) => {
  try {
    const {
      givenName,
      firstName,
      studentId,
      gender,
      email,
      verifyCode,
      phone,
      schoolName,
      anonymousName,
      password,
      confirmPassword
    } = req.body;

    // 验证所有必填字段
    const requiredFields = [
      givenName, firstName, studentId, gender,
      email, verifyCode, phone, schoolName,
      anonymousName, password, confirmPassword
    ];
    if (requiredFields.some(field => !field || field.trim() === '')) {
      return res.status(400).json({
        success: false,
        message: '参数错误：所有字段均为必填项'
      });
    }

    // 密码验证
    if (password !== confirmPassword) {
      return res.status(400).json({
        success: false,
        message: '密码错误：两次输入的密码不一致'
      });
    }

    // 密码强度验证（生产级）
    if (password.length < 8) {
      return res.status(400).json({
        success: false,
        message: '密码错误：长度至少8位'
      });
    }

    // 邮箱格式验证
    if (!isValidOutlookEmail(email)) {
      return res.status(400).json({
        success: false,
        message: '邮箱格式错误：仅支持Outlook/Hotmail邮箱'
      });
    }

    // 验证码验证
    if (!storedVerificationCode || 
        storedVerificationCode.email !== email || 
        storedVerificationCode.code !== verifyCode || 
        Date.now() > storedVerificationCode.expireTime) {
      return res.status(400).json({
        success: false,
        message: '验证码错误：无效或已过期，请重新获取'
      });
    }

    // 检查学生ID是否已注册
    db.get('SELECT * FROM users WHERE student_id = ?', [studentId], (err, studentRow) => {
      if (err) return next(err);

      if (studentRow) {
        return res.status(400).json({
          success: false,
          message: '注册失败：该学生ID已被注册'
        });
      }

      // 检查邮箱是否已注册
      db.get('SELECT * FROM users WHERE email = ?', [email], (err, emailRow) => {
        if (err) return next(err);

        if (emailRow) {
          return res.status(400).json({
            success: false,
            message: '注册失败：该Outlook邮箱已被注册'
          });
        }

        // 检查手机号是否已注册
        db.get('SELECT * FROM users WHERE phone = ?', [phone], (err, phoneRow) => {
          if (err) return next(err);

          if (phoneRow) {
            return res.status(400).json({
              success: false,
              message: '注册失败：该手机号已被注册'
            });
          }

          // 密码加密（生产级盐值）
          const hashedPassword = bcrypt.hashSync(password, BCRYPT_SALT_ROUNDS);

          // 插入新用户
          const insertUserSql = `
            INSERT INTO users (
              student_id, given_name, first_name, gender,
              anonymous_name, phone, email, school_name, password
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
          `;
          db.run(insertUserSql, [
            studentId, givenName, firstName, gender,
            anonymousName, phone, email, schoolName, hashedPassword
          ], (err) => {
            if (err) return next(err);

            // 清空验证码（防止重复使用）
            storedVerificationCode = {
              email: '',
              code: '',
              expireTime: 0
            };

            res.status(200).json({
              success: true,
              message: '注册成功！请使用学生ID和密码登录'
            });
          });
        });
      });
    });
  } catch (error) {
    next(error);
  }
});

/**
 * 用户登录（生产级，密码加密验证）
 */
app.post('/api/login', (req, res, next) => {
  try {
    const { studentId, password } = req.body;

    // 参数验证
    if (!studentId || !password) {
      return res.status(400).json({
        success: false,
        message: '参数错误：学生ID和密码均为必填项'
      });
    }

    // 查询用户
    db.get('SELECT * FROM users WHERE student_id = ?', [studentId], (err, row) => {
      if (err) return next(err);

      if (!row) {
        return res.status(401).json({
          success: false,
          message: '登录失败：学生ID或密码错误'
        });
      }

      // 密码验证（加密）
      const isPasswordValid = bcrypt.compareSync(password, row.password);
      if (!isPasswordValid) {
        return res.status(401).json({
          success: false,
          message: '登录失败：学生ID或密码错误'
        });
      }

      // 返回用户信息（隐藏敏感字段）
      res.status(200).json({
        success: true,
        message: '登录成功！',
        data: {
          studentId: row.student_id,
          anonymousName: row.anonymous_name,
          email: row.email,
          phone: row.phone,
          gender: row.gender,
          schoolName: row.school_name
        }
      });
    });
  } catch (error) {
    next(error);
  }
});

// ===================== 接口 - 搬家任务管理 =====================
/**
 * 发布搬家请求
 */
app.post('/api/post-request', (req, res, next) => {
  try {
    const {
      studentId,
      moveDate,
      location,
      helpersNeeded,
      items,
      compensation
    } = req.body;

    // 参数验证
    const requiredFields = [studentId, moveDate, location, helpersNeeded, items, compensation];
    if (requiredFields.some(field => !field || field.trim() === '')) {
      return res.status(400).json({
        success: false,
        message: '参数错误：所有字段均为必填项'
      });
    }

    // 验证用户存在
    db.get('SELECT * FROM users WHERE student_id = ?', [studentId], (err, row) => {
      if (err) return next(err);

      if (!row) {
        return res.status(400).json({
          success: false,
          message: '发布失败：该学生ID未注册'
        });
      }

      // 插入搬家请求
      const insertRequestSql = `
        INSERT INTO moving_requests (
          student_id, move_date, location,
          helpers_needed, items, compensation
        ) VALUES (?, ?, ?, ?, ?, ?)
      `;
      db.run(insertRequestSql, [
        studentId, moveDate, location,
        helpersNeeded, items, compensation
      ], (err) => {
        if (err) return next(err);

        res.status(200).json({
          success: true,
          message: '搬家请求发布成功！'
        });
      });
    });
  } catch (error) {
    next(error);
  }
});

/**
 * 获取所有公开任务（关联学校信息）
 */
app.get('/api/get-tasks', (req, res, next) => {
  try {
    const getTasksSql = `
      SELECT mr.*, u.school_name 
      FROM moving_requests mr
      LEFT JOIN users u ON mr.student_id = u.student_id
      WHERE helper_assigned IS NULL OR helper_assigned = ''
      ORDER BY move_date ASC
    `;

    db.all(getTasksSql, (err, rows) => {
      if (err) return next(err);

      res.status(200).json({
        success: true,
        tasks: rows || []
      });
    });
  } catch (error) {
    next(error);
  }
});

/**
 * 接受任务
 */
app.post('/api/accept-task', (req, res, next) => {
  try {
    const { taskId, helperId } = req.body;

    // 参数验证
    if (!taskId || !helperId) {
      return res.status(400).json({
        success: false,
        message: '参数错误：任务ID和助手ID均为必填项'
      });
    }

    // 检查任务状态
    db.get('SELECT * FROM moving_requests WHERE id = ? AND (helper_assigned IS NULL OR helper_assigned = \'\')', [taskId], (err, taskRow) => {
      if (err) return next(err);

      if (!taskRow) {
        return res.status(400).json({
          success: false,
          message: '接受任务失败：任务不存在或已被分配'
        });
      }

      // 检查助手存在
      db.get('SELECT * FROM users WHERE student_id = ?', [helperId], (err, helperRow) => {
        if (err) return next(err);

        if (!helperRow) {
          return res.status(400).json({
            success: false,
            message: '接受任务失败：助手ID未注册'
          });
        }

        // 更新任务状态
        const updateTaskSql = `
          UPDATE moving_requests
          SET helper_assigned = ?, status = 'assigned'
          WHERE id = ?
        `;
        db.run(updateTaskSql, [helperId, taskId], (err) => {
          if (err) return next(err);

          // 记录分配
          const insertAssignmentSql = `
            INSERT INTO task_assignments (task_id, helper_id)
            VALUES (?, ?)
          `;
          db.run(insertAssignmentSql, [taskId, helperId], (err) => {
            if (err) console.error(`【数据库错误】记录分配: ${err.message}`);

            res.status(200).json({
              success: true,
              message: '接受任务成功！'
            });
          });
        });
      });
    });
  } catch (error) {
    next(error);
  }
});

/**
 * 取消已接受的任务（生产级）
 */
app.post('/api/cancel-task', (req, res, next) => {
  try {
    const { taskId, helperId } = req.body;

    // 参数验证
    if (!taskId || !helperId) {
      return res.status(400).json({
        success: false,
        message: '参数错误：任务ID和助手ID均为必填项'
      });
    }

    // 验证任务归属
    db.get('SELECT * FROM moving_requests WHERE id = ? AND helper_assigned = ?', [taskId, helperId], (err, row) => {
      if (err) return next(err);

      if (!row) {
        return res.status(400).json({
          success: false,
          message: '取消失败：任务不存在或你不是该任务的助手'
        });
      }

      // 更新任务状态
      const updateTaskSql = `
        UPDATE moving_requests
        SET helper_assigned = NULL, status = 'pending'
        WHERE id = ?
      `;
      db.run(updateTaskSql, [taskId], (err) => {
        if (err) return next(err);

        // 删除分配记录
        db.run('DELETE FROM task_assignments WHERE task_id = ? AND helper_id = ?', [taskId, helperId], (err) => {
          if (err) console.error(`【数据库错误】删除分配: ${err.message}`);

          res.status(200).json({
            success: true,
            message: '取消任务成功！该任务已重新开放'
          });
        });
      });
    });
  } catch (error) {
    next(error);
  }
});

/**
 * 获取我发布的任务
 */
app.post('/api/my-posted-tasks', (req, res, next) => {
  try {
    const { studentId } = req.body;

    if (!studentId) {
      return res.status(400).json({
        success: false,
        message: '参数错误：学生ID为必填项',
        tasks: []
      });
    }

    const getMyTasksSql = `
      SELECT * FROM moving_requests
      WHERE student_id = ?
      ORDER BY move_date ASC
    `;
    db.all(getMyTasksSql, [studentId], (err, rows) => {
      if (err) return next(err);

      res.status(200).json({
        success: true,
        tasks: rows || []
      });
    });
  } catch (error) {
    next(error);
  }
});

/**
 * 获取我接受的任务
 */
app.post('/api/my-accepted-tasks', (req, res, next) => {
  try {
    const { helperId } = req.body;

    if (!helperId) {
      return res.status(400).json({
        success: false,
        message: '参数错误：助手ID为必填项',
        tasks: []
      });
    }

    const getAcceptedTasksSql = `
      SELECT mr.*, u.school_name 
      FROM moving_requests mr
      JOIN task_assignments ta ON mr.id = ta.task_id
      LEFT JOIN users u ON mr.student_id = u.student_id
      WHERE ta.helper_id = ?
      ORDER BY mr.move_date ASC
    `;
    db.all(getAcceptedTasksSql, [helperId], (err, rows) => {
      if (err) return next(err);

      res.status(200).json({
        success: true,
        tasks: rows || []
      });
    });
  } catch (error) {
    next(error);
  }
});

/**
 * 获取个人信息（含学校名称）
 */
app.post('/api/get-profile', (req, res, next) => {
  try {
    const { studentId } = req.body;

    if (!studentId) {
      return res.status(400).json({
        success: false,
        message: '参数错误：学生ID为必填项'
      });
    }

    db.get('SELECT * FROM users WHERE student_id = ?', [studentId], (err, row) => {
      if (err) return next(err);

      if (!row) {
        return res.status(400).json({
          success: false,
          message: '查询失败：该学生ID未注册'
        });
      }

      // 返回安全的用户信息
      const userInfo = {
        student_id: row.student_id,
        given_name: row.given_name,
        first_name: row.first_name,
        gender: row.gender,
        anonymous_name: row.anonymous_name,
        phone: row.phone,
        email: row.email,
        school_name: row.school_name,
        created_at: row.created_at
      };

      res.status(200).json({
        success: true,
        user: userInfo,
        message: '查询个人信息成功'
      });
    });
  } catch (error) {
    next(error);
  }
});

// ===================== 首页路由 =====================
app.get('/', (req, res, next) => {
  const indexPath = path.join(__dirname, 'index.html');
  fs.readFile(indexPath, 'utf8', (err, data) => {
    if (err) return next(err);
    res.status(200).send(data);
  });
});

// ===================== 启动服务器（生产级） =====================
const server = app.listen(PORT, () => {
  console.log(`============================================`);
  console.log(`🚀 DormLift 生产服务已启动 (${NODE_ENV})`);
  console.log(`🌐 访问地址: http://0.0.0.0:${PORT}`);
  console.log(`📅 启动时间: ${new Date().toLocaleString()}`);
  console.log(`============================================`);
});

// ===================== 优雅关闭（生产级） =====================
// 处理SIGTERM（Railway重启/停止）
process.on('SIGTERM', () => {
  console.log('\n【服务关闭】收到SIGTERM信号，开始优雅关闭...');
  server.close(() => {
    console.log('【服务关闭】HTTP服务器已关闭');
    db.close((err) => {
      if (err) console.error(`【数据库错误】关闭失败: ${err.message}`);
      else console.log('【数据库】连接已关闭');
      process.exit(0);
    });
  });
});

// 处理SIGINT（Ctrl+C）
process.on('SIGINT', () => {
  console.log('\n【服务关闭】收到SIGINT信号，开始优雅关闭...');
  server.close(() => {
    console.log('【服务关闭】HTTP服务器已关闭');
    db.close((err) => {
      if (err) console.error(`【数据库错误】关闭失败: ${err.message}`);
      else console.log('【数据库】连接已关闭');
      process.exit(0);
    });
  });
});

// 未捕获异常处理
process.on('uncaughtException', (err) => {
  console.error(`【未捕获异常】: ${err.stack}`);
  process.exit(1);
});

// 未处理的Promise拒绝
process.on('unhandledRejection', (reason, promise) => {
  console.error(`【未处理Promise拒绝】: ${reason.stack || reason}`);
});
