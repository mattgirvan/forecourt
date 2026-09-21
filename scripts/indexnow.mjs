#!/usr/bin/env node
/**
 * Ping Bing IndexNow for www.forecourt.me after deploy.
 *
 * Key file (committed): public/59089c19-e671-4399-a1c5-0cb95500923a.txt
 *
 * Usage:
 *   node scripts/indexnow.mjs
 *   node scripts/indexnow.mjs https://www.forecourt.me/for/beside-crm
 *
 * Or curl:
 *   curl -X POST "https://api.indexnow.org/indexnow" \
 *     -H "Content-Type: application/json; charset=utf-8" \
 *     -d '{"host":"www.forecourt.me","key":"59089c19-e671-4399-a1c5-0cb95500923a","keyLocation":"https://www.forecourt.me/59089c19-e671-4399-a1c5-0cb95500923a.txt","urlList":["https://www.forecourt.me/"]}'
 */

const KEY = "59089c19-e671-4399-a1c5-0cb95500923a";
const HOST = "www.forecourt.me";
const KEY_LOCATION = `https://${HOST}/${KEY}.txt`;

const DEFAULT_URLS = [
  "https://www.forecourt.me/",
  "https://www.forecourt.me/how",
  "https://www.forecourt.me/pricing",
  "https://www.forecourt.me/contact",
  "https://www.forecourt.me/trust",
  "https://www.forecourt.me/pilot",
  "https://www.forecourt.me/for/beside-crm",
  "https://www.forecourt.me/for/key-locator",
  "https://www.forecourt.me/for/photo-status",
  "https://www.forecourt.me/for/customer-live-track",
  "https://www.forecourt.me/security",
  "https://www.forecourt.me/privacy",
  "https://www.forecourt.me/terms",
  "https://www.forecourt.me/dpa",
];

const urlList = process.argv.slice(2).length > 0 ? process.argv.slice(2) : DEFAULT_URLS;

const body = {
  host: HOST,
  key: KEY,
  keyLocation: KEY_LOCATION,
  urlList,
};

const res = await fetch("https://api.indexnow.org/indexnow", {
  method: "POST",
  headers: { "Content-Type": "application/json; charset=utf-8" },
  body: JSON.stringify(body),
});

const text = await res.text();
console.log(`IndexNow ${res.status} ${res.statusText}`);
if (text) console.log(text);
if (!res.ok) process.exit(1);
console.log(`Submitted ${urlList.length} URL(s) for ${HOST}`);
