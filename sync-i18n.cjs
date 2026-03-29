const fs = require('fs');
const path = require('path');

const localesDir = 'apps/web/src/lib/locales';
const zhCN = JSON.parse(fs.readFileSync(path.join(localesDir, 'zh-CN.json'), 'utf8'));

// Get all keys from an object recursively
function getKeys(obj, prefix = '') {
  let keys = [];
  for (const key in obj) {
    const newKey = prefix ? `${prefix}.${key}` : key;
    if (typeof obj[key] === 'object' && obj[key] !== null) {
      keys = keys.concat(getKeys(obj[key], newKey));
    } else {
      keys.push(newKey);
    }
  }
  return keys;
}

// Set a value at a nested path
function setValue(obj, path, value) {
  const parts = path.split('.');
  let current = obj;
  for (let i = 0; i < parts.length - 1; i++) {
    if (!current[parts[i]]) {
      current[parts[i]] = {};
    }
    current = current[parts[i]];
  }
  current[parts[parts.length - 1]] = value;
}

// Get a value at a nested path
function getValue(obj, path) {
  const parts = path.split('.');
  let current = obj;
  for (const part of parts) {
    if (current === null || current === undefined) return undefined;
    current = current[part];
  }
  return current;
}

const zhCNKeys = getKeys(zhCN);

// Sync other locales
['zh-TW', 'ja', 'ko', 'en'].forEach(lang => {
  const filePath = path.join(localesDir, `${lang}.json`);
  const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
  const existingKeys = getKeys(data);
  
  const missingKeys = zhCNKeys.filter(k => !existingKeys.includes(k));
  
  if (missingKeys.length > 0) {
    console.log(`${lang}: Adding ${missingKeys.length} missing keys`);
    missingKeys.forEach(key => {
      const value = getValue(zhCN, key);
      // For zh-TW, use the zh-CN value as placeholder
      // For other languages, also use zh-CN as placeholder (they need translation)
      setValue(data, key, value);
    });
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2) + '\n');
  } else {
    console.log(`${lang}: All keys present`);
  }
});

console.log('Done!');
