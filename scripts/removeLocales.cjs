const fs = require('fs');
const path = require('path');

// Keep only these locales / これらのロケールのみ保持
const KEEP_LOCALES = ['en-US', 'ja'];

exports.default = async function(context) {
  const localesDir = path.join(context.appOutDir, 'locales');
  
  if (!fs.existsSync(localesDir)) {
    console.log('Locales directory not found, skipping...');
    return;
  }
  
  const files = fs.readdirSync(localesDir);
  let removedCount = 0;
  
  for (const file of files) {
    const locale = file.replace('.pak', '');
    if (!KEEP_LOCALES.includes(locale)) {
      fs.unlinkSync(path.join(localesDir, file));
      removedCount++;
    }
  }
  
  console.log(`✓ Removed ${removedCount} unused locales (kept: ${KEEP_LOCALES.join(', ')})`);
};
