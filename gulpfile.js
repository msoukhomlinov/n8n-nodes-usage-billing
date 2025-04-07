const { src, dest } = require('gulp');

/**
 * Copies node icons to the dist folder
 */
function buildIcons() {
  return src('./nodes/**/*.svg').pipe(dest('./dist/nodes'));
}

exports['build:icons'] = buildIcons;
