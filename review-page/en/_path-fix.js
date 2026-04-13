const fs = require('fs');

const p = 'c:/Projects/Trustpilot/review-page/en/index.html';
let s = fs.readFileSync(p, 'utf8');

// Point to shared assets from the DE snapshot so EN renders identically.
// EN is served from /review-page/en/, so ../assets is the shared folder.
s = s.replaceAll('="assets/', '="../assets/');
s = s.replaceAll('srcset="assets/', 'srcset="../assets/');

// Host-specific URLs / domain display.
s = s.replaceAll('https://trustpilot.oneshops.de/', 'https://trustpilot.oneshops.co/');
s = s.replaceAll('oneshops.de', 'oneshops.co');

fs.writeFileSync(p, s, 'utf8');
console.log('ok');

