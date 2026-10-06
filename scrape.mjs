// Mainland Floral potted-plants scrape, for `node /opt/mlb/mlb.mjs run scrape.mjs`.
//
// Exists because two selectors in the routine text do not match the live DOM. Both
// were re-confirmed against the live category page on 6 Oct 2026 (see README).
// Use this module rather than re-deriving the selectors each run.
//
// Writes the result as JSON to MAINLAND_SCRAPE_OUT (default /tmp/mainland-scrape.json)
// and logs a one-line summary plus the two scrape-gate verdicts.

const CATEGORY = 'https://mainlandfloral.com/products/potted-plants/?sort_by=12';
const page = n => `https://mainlandfloral.com/products/potted-plants/100/12/${n}/?sort_by=12`;
const ASSETS = 'https://assets.1.commercebuild.com/48175c725d940977481c2593f0485f38/contents';

// Runs in the page. Returns one row per tile.
const EXTRACT = `JSON.stringify((() => {
  const digits = s => (String(s || '').match(/\\d+/) || [])[0] || null;
  return Array.from(document.querySelectorAll('.module-category-product-listing')).map(t => {
    // Code: the label is in the DOM text ("Code: 1-10-210"), so strip it. Without the
    // strip every code mismatches the ledger and the whole catalogue looks new.
    // Take the FIRST TEXT NODE only. .item-code also contains the pack-size span, so
    // textContent yields "1-02-124  Pack Size: 20", which mismatches every ledger row
    // and makes the whole catalogue look new. Strip the "Code:" label too.
    const codeEl = t.querySelector('.item-code');
    let code = null;
    if (codeEl) {
      const firstText = Array.from(codeEl.childNodes)
        .find(n => n.nodeType === 3 && (n.textContent || '').trim());
      code = (firstText ? firstText.textContent : codeEl.textContent || '')
        .replace(/^\\s*Code:\\s*/i, '')
        .replace(/\\s*Pack\\s*Size:.*$/i, '')
        .trim();
    }

    const nameEl = t.querySelector('.product-name-link');
    const name = nameEl ? (nameEl.getAttribute('title') || nameEl.textContent || '').trim() : null;

    const pack = digits(t.querySelector('.category-pack-size')?.textContent);

    // Cost: NOT "a node whose text contains CA$". The symbol sits in its own nested
    // span (<span class="product_pricetag">CA\$</span>3.14), so no leaf node holds both
    // the symbol and the digits and a leaf match returns zero costs for every tile.
    // Read the price container and pull the number out of its combined text.
    const priceEl = t.querySelector('.module-category-product-listing__price, .price-box, .regular-price');
    const priceTxt = priceEl ? (priceEl.textContent || '').replace(/[^0-9.]/g, ' ') : '';
    const m = priceTxt.match(/\\d+(?:\\.\\d+)?/);
    const cost = m ? parseFloat(m[0]) : null;

    // Photo: tiles lazy-load, so src is often /assets/images/defaults/ajax-loader.gif
    // and the real URL is in data-src. Reading src alone makes placeholder items look
    // photographed and would publish Mainland's logo onto live listings. Prefer
    // data-src, fall back to src once the tile has loaded.
    const img = t.querySelector('img');
    const rawSrc = img ? (img.getAttribute('data-src') || img.getAttribute('src') || '') : '';
    const lazy = /ajax-loader|\\/assets\\/images\\/defaults\\//i.test(rawSrc);
    const placeholder = /Products-Default\\.png/i.test(rawSrc);
    const imgDigits = digits((rawSrc.match(/contents\\/(\\d+)\\//) || [])[1]);

    return { code, name, pack: pack ? Number(pack) : null, cost,
             img_digits: imgDigits, has_photo: !!(imgDigits && !placeholder && !lazy),
             placeholder, raw_img: rawSrc.slice(0, 200) };
  });
})())`;

export default async ({ open, js, log }) => {
  await open(CATEGORY);
  const totalTxt = await js(`(document.body.innerText.match(/([\\d,]+)\\s+Results/i)||[])[1]||null`);
  const total = totalTxt ? Number(String(totalTxt).replace(/,/g, '')) : null;
  if (!total) throw new Error('could not read the "N Results" total - refusing to scrape blind');
  log(`results total: ${total}`);

  const rows = [];
  const pages = Math.ceil(total / 100);
  for (let p = 1; p <= pages; p++) {
    await open(page(p));
    const batch = JSON.parse(await js(EXTRACT));
    rows.push(...batch);
    log(`page ${p}/${pages}: ${batch.length} tiles (running ${rows.length})`);
  }

  // Scrape gate 1: count must equal the advertised total and be plausible.
  const countOk = rows.length === total && rows.length >= 100;
  // Scrape gate 2 (login check 2): a plausible number of non-null costs.
  const withCost = rows.filter(r => r.cost !== null).length;
  const costOk = withCost === rows.length;

  const photos = rows.filter(r => r.has_photo).length;
  log(`scraped ${rows.length}/${total}; costs ${withCost}; photos ${photos}; ` +
      `placeholders ${rows.filter(r => r.placeholder).length}`);
  log(`GATE_COUNT=${countOk ? 'PASS' : 'FAIL'} GATE_COST=${costOk ? 'PASS' : 'FAIL'}` +
      (withCost < rows.length / 2 ? ' (under half have a cost - do NOT write prices)' : ''));

  const out = process.env.MAINLAND_SCRAPE_OUT || '/tmp/mainland-scrape.json';
  const { writeFileSync } = await import('node:fs');
  writeFileSync(out, JSON.stringify(
    { scraped_at: new Date().toISOString(), total, count: rows.length,
      gate_count: countOk, gate_cost: costOk, assets_base: ASSETS, rows }, null, 2));
  log(`wrote ${out}`);
};
