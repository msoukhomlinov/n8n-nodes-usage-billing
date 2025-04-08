const { src, dest } = require('gulp');
const fs = require('node:fs');
const path = require('node:path');

// Copy node icons to dist folder
exports['build:icons'] = () => {
  // Ensure dist/nodes directory exists
  const distNodesPath = path.join(__dirname, 'dist', 'nodes');
  const distBillingCalcPath = path.join(distNodesPath, 'BillingCalculator');

  console.log(`Creating directory: ${distNodesPath}`);
  if (!fs.existsSync(distNodesPath)) {
    fs.mkdirSync(distNodesPath, { recursive: true });
  }

  console.log(`Creating directory: ${distBillingCalcPath}`);
  if (!fs.existsSync(distBillingCalcPath)) {
    fs.mkdirSync(distBillingCalcPath, { recursive: true });
  }

  console.log('Looking for SVG files in ./src/nodes/**/*.svg');
  return src('./src/nodes/**/*.svg')
    .on('data', (file) => {
      console.log(`Processing file: ${file.path}`);
    })
    .on('error', (err) => {
      console.error(`Error processing files: ${err}`);
    })
    .pipe(dest('./dist/nodes'))
    .on('end', () => {
      console.log('Finished copying SVG files');
      // Check if files were copied
      const files = fs.readdirSync(distBillingCalcPath);
      console.log(`Files in ${distBillingCalcPath}: ${files.join(', ') || 'None'}`);
    });
};
