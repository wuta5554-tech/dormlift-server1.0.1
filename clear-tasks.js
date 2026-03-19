const sqlite3 = require('sqlite3').verbose();
const db = new sqlite3.Database('./dormlift.db', (err) => {
  if (err) {
    console.error('连接数据库失败:', err.message);
    process.exit(1);
  }
  console.log('✅ 成功连接数据库');

  // 清空moving_requests表（仅删除数据，保留表结构）
  db.run('DELETE FROM moving_requests', (err) => {
    if (err) {
      console.error('❌ 清空任务失败:', err.message);
    } else {
      console.log('✅ 已清空所有测试任务');
      // 查看清空后的结果
      db.all('SELECT * FROM moving_requests', (err, rows) => {
        if (err) {
          console.error('查询失败:', err.message);
        } else {
          console.log(`📦 清空后数据库剩余任务数: ${rows.length}`);
        }
        db.close();
      });
    }
  });
});