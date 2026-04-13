/**
 * Собирает отзывы с страницы компании Trustpilot UK из __NEXT_DATA__.
 * Пишет в review-page/en/reviews.json.
 *
 * Запуск из корня проекта:
 *   node scripts/scrape-reviews-uk.js
 *   node scripts/scrape-reviews-uk.js https://uk.trustpilot.com/review/highrollas.cc
 */
const https = require('https');
const fs = require('fs');
const path = require('path');
 
const TRUSTPILOT_BASE = 'https://uk.trustpilot.com';
const DEFAULT_REVIEW_URL = TRUSTPILOT_BASE + '/review/highrollas.cc';
const argUrl = process.argv[2];
const BASE_URL = (argUrl && /^https?:\/\//i.test(argUrl) ? argUrl : DEFAULT_REVIEW_URL).replace(/\/$/, '');
const DELAY_MS = 2000;
const OUTPUT_FILE = path.join(__dirname, '../review-page/en/reviews.json');
 
function fetchPage(url) {
  return new Promise((resolve, reject) => {
    https
      .get(
        url,
        {
          headers: {
            'User-Agent':
              'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
            'Accept-Language': 'en-GB,en;q=0.9',
          },
        },
        (res) => {
          let data = '';
          res.on('data', (chunk) => (data += chunk));
          res.on('end', () => resolve(data));
        }
      )
      .on('error', reject);
  });
}
 
function extractPageProps(html) {
  const match = html.match(
    /<script id="__NEXT_DATA__" type="application\/json">([\s\S]*?)<\/script>/
  );
  if (!match) return { reviews: [], totalOnSite: null };
  try {
    const json = JSON.parse(match[1]);
    const pp = json?.props?.pageProps;
    const reviews = pp?.reviews || [];
    const totalOnSite =
      pp?.businessUnit?.numberOfReviews != null
        ? Number(pp.businessUnit.numberOfReviews)
        : null;
    return { reviews, totalOnSite };
  } catch (e) {
    return { reviews: [], totalOnSite: null };
  }
}
 
function getConsumerId(r) {
  const id = r.consumer?.id || r.consumer?.reviewerId;
  if (id) return id;
  const imgUrl = r.consumer?.imageUrl || '';
  const m =
    imgUrl.match(/\/([a-f0-9]{24})\/(?:73x73|64x64)/i) ||
    imgUrl.match(/\/([a-f0-9]{24})\//);
  return m ? m[1] : null;
}
 
function normalizeReview(r) {
  const reply = r.reply || r.companyReply;
  const replyText = reply?.message || reply?.text;
  const companyReply = replyText
    ? {
        text: replyText,
        date:
          reply?.publishedDate ||
          reply?.dates?.publishedDate ||
          reply?.publishedAt ||
          '',
      }
    : null;
 
  const consumerId = getConsumerId(r);
  const consumerImageUrl = r.consumer?.imageUrl || null;
  return {
    id: r.id,
    title: r.title || '',
    text: r.text || '',
    rating: r.rating,
    date: r.dates?.publishedDate || r.dates?.experiencedDate || '',
    consumerName: r.consumer?.displayName || 'Anonymous',
    consumerImageUrl,
    consumerProfileUrl: consumerId ? `${TRUSTPILOT_BASE}/users/${consumerId}` : null,
    reviewUrl: r.id ? `${TRUSTPILOT_BASE}/reviews/${r.id}` : null,
    isVerified: r.labels?.verification?.isVerified || false,
    hasReply: !!companyReply,
    companyReply: companyReply,
  };
}
 
async function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}
 
async function main() {
  const allReviews = [];
  const seenIds = new Set();
  let page = 1;
  let totalOnTrustpilot = null;
 
  console.log('Fetching reviews from:', BASE_URL);
 
  while (true) {
    const url = page === 1 ? BASE_URL : `${BASE_URL}?page=${page}`;
    console.log(`  Page ${page}: ${url}`);
 
    try {
      const html = await fetchPage(url);
      const { reviews, totalOnSite } = extractPageProps(html);
 
      if (page === 1 && totalOnSite != null && !Number.isNaN(totalOnSite)) {
        totalOnTrustpilot = totalOnSite;
        console.log(`  (Trustpilot profile reports ${totalOnTrustpilot} reviews total)`);
      }
 
      if (reviews.length === 0) {
        if (page > 1 && totalOnTrustpilot != null && allReviews.length < totalOnTrustpilot) {
          console.log(
            '  Empty __NEXT_DATA__ reviews — Trustpilot often stops embedding JSON after ~10 pages (~200 reviews).'
          );
        } else {
          console.log('  No more reviews found. Stopping.');
        }
        break;
      }
 
      for (const r of reviews) {
        if (!seenIds.has(r.id)) {
          seenIds.add(r.id);
          allReviews.push(normalizeReview(r));
        }
      }
 
      console.log(`  Got ${reviews.length} reviews, total: ${allReviews.length}`);
 
      if (reviews.length < 10) break;
      page++;
      await sleep(DELAY_MS);
    } catch (err) {
      console.error('Error:', err.message);
      break;
    }
  }
 
  fs.mkdirSync(path.dirname(OUTPUT_FILE), { recursive: true });
  fs.writeFileSync(OUTPUT_FILE, JSON.stringify(allReviews, null, 2), 'utf8');
  console.log(`\nDone! Saved ${allReviews.length} reviews to ${OUTPUT_FILE}`);
  if (totalOnTrustpilot != null && allReviews.length < totalOnTrustpilot) {
    console.log(
      `\nNote: ${totalOnTrustpilot - allReviews.length} reviews are on the site but not in SSR data — need browser/API access to fetch the rest (see Trustpilot ToS).`
    );
  }
}
 
main();

