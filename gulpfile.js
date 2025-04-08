const { src, dest } = require('gulp');

// Copy node icons to dist folder
exports['build:icons'] = () => src('./src/nodes/**/*.svg').pipe(dest('./dist/nodes'));
