// add-tasks.js - 给数据库添加测试任务
const sqlite3 = require('sqlite3').verbose();

// 连接数据库
const db = new sqlite3.Database('./dormlift.db', (err) => {
  if (err) {
    console.error('连接数据库失败:', err.message);
    process.exit(1); // 连接失败则退出
  }
  console.log('✅ 成功连接数据库');
  
  // 添加测试任务
  addTestTasks();
});

// 定义要添加的测试任务
function addTestTasks() {
  // 任务列表
  const tasks = [
    ['123456', '2026-03-25T14:00', 'Hall B to Hall D', '2', '3 boxes, 1 desk, 1 chair', '$15 per person'],
    ['789012', '2026-03-28T10:00', 'Move into Freshman Hall', '1', '2 suitcases, small kitchen gear', '3 campus credits'],
    ['345678', '2026-04-05T11:30', 'Move out of Hall A', '3', 'Bed frame, 4 boxes, monitor', '$20 per person']
  ];

  // 插入任务
  let successCount = 0;
  tasks.forEach((task, index) => {
    db.run(
      'INSERT INTO moving_requests (student_id, move_date, location, helpers_needed, items, compensation) VALUES (?, ?, ?, ?, ?, ?)',
      task,
      (err) => {
        if (err) {
          console.log(`❌ 任务${index+1}添加失败:`, err.message);
        } else {
          successCount++;
          console.log(`✅ 任务${index+1}添加成功: ${task[2]}`);
        }

        // 所有任务处理完后，查询并显示结果
        if (index === tasks.length - 1) {
          queryTasks();
        }
      }
    );
  });
}

// 查询并显示所有任务
function queryTasks() {
  console.log('\n=== 数据库中的所有任务 ===');
  db.all('SELECT * FROM moving_requests', (err, rows) => {
    if (err) {
      console.error('❌ 查询任务失败:', err.message);
    } else if (rows.length === 0) {
      console.log('📦 数据库中暂无任务');
    } else {
      rows.forEach((row, i) => {
        console.log(`[${i+1}] 地点: ${row.location} | 发布者: ${row.student_id} | 日期: ${row.move_date}`);
      });
    }
    // 关闭数据库连接
    db.close((err) => {
      if (err) console.error('关闭数据库失败:', err.message);
      else console.log('\n✅ 操作完成，数据库连接已关闭');
    });
  });
}