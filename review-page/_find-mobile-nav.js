const fs = require('fs');
const s = fs.readFileSync('index.html', 'utf8');
const keys = [
  'Für Unternehmen',
  'mobile-navigation',
  'styles_mobileNavigation',
  'data-mobile-menu',
  'aria-expanded',
  'headerMenu',
  'burger',
  'Menu öffnen',
];
keys.forEach((k) => {
  const i = s.indexOf(k);
  console.log(k, i >= 0 ? i : 'NO');
});
const i = s.indexOf('Für Unternehmen');
if (i >= 0) console.log('\n---\n', s.slice(i - 800, i + 1200));
