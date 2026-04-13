const fs = require('fs');

const p = 'c:/Projects/Trustpilot/review-page/en/index.html';
let s = fs.readFileSync(p, 'utf8');

// Replace the company logo picture in the header with the One Shop logo,
// matching the DE copy approach (local file).
// We target the specific header image class used by Trustpilot business profile.
const re = /<picture class="business-profile-image_containmentWrapper__xJZjr profile-image_logo__UEQ4H" data-cpl="true">[\s\S]*?<img alt="One Shop logo" class="business-profile-image_image__V14jr" src="[^"]*"\/>[\s\S]*?<\/picture>/;

const replacement =
  '<picture class="business-profile-image_containmentWrapper__xJZjr profile-image_logo__UEQ4H" data-cpl="true">' +
  '<source srcset="logo-oneshop.png" type="image/avif"/>' +
  '<source srcset="logo-oneshop.png" type="image/jpeg"/>' +
  '<img alt="One Shop-Logo" class="business-profile-image_image__V14jr" src="logo-oneshop.png"/>' +
  '</picture>';

if (!re.test(s)) {
  console.error('Could not find header logo <picture> block to replace.');
  process.exit(1);
}

s = s.replace(re, replacement);
fs.writeFileSync(p, s, 'utf8');
console.log('ok');

