// 测试系统设置读取
const sqlite3 = require('better-sqlite3');
const db = sqlite3('./backend/data/sublink.db');

const settings = db.prepare('SELECT key, value FROM settings').all();
console.log('Database settings:');
settings.forEach(s => console.log(`  ${s.key}: ${s.value}`));

const settingsObj = Object.fromEntries(settings.map(s => [s.key, s.value]));
const siteName = settingsObj.siteName || "SubLink";
console.log('\nResolved siteName:', siteName);
