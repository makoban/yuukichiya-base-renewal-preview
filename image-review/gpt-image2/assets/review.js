const PAGE_SIZE = 60;
const STATUS_LABELS = {
  queued: "GPT Image 2生成待ち",
  processing: "生成中",
  review_pending: "確認待ち",
  regenerate: "再生成",
  skipped: "文字資料・加工なし",
  approved: "承認済み",
};

const elements = {
  stats: document.querySelector("#stats"), query: document.querySelector("#query"),
  status: document.querySelector("#status"), summary: document.querySelector("#result-summary"),
  grid: document.querySelector("#grid"), prev: document.querySelector("#prev"),
  next: document.querySelector("#next"), page: document.querySelector("#page"),
  zoom: document.querySelector("#zoom"), zoomImage: document.querySelector("#zoom-image"),
  zoomCaption: document.querySelector("#zoom-caption"), zoomClose: document.querySelector("#zoom-close"),
};
let manifest; let rows = []; let filtered = []; let currentPage = 1; let lastZoomTrigger;

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"]/g, (c) => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"})[c]);
}
function flatten(products) {
  return products.flatMap((p) => p.images.map((image) => ({...p, image})));
}
function stat(value, label) { return `<div class="stat"><strong>${Number(value || 0).toLocaleString("ja-JP")}</strong><span>${label}</span></div>`; }
function renderStats() {
  const counts = rows.reduce((a, r) => { a[r.image.status] = (a[r.image.status] || 0) + 1; return a; }, {});
  elements.stats.innerHTML = [stat(manifest.meta.productCount,"商品"),stat(manifest.meta.imageCount,"全画像"),stat(counts.queued,"生成待ち"),stat(counts.review_pending,"確認待ち"),stat(counts.skipped,"文字資料")].join("");
}
function imageButton(src, caption, width) {
  return `<button class="zoom-trigger" type="button" data-src="${escapeHtml(src)}" data-caption="${escapeHtml(caption)}"><img src="${escapeHtml(src)}" width="${width}" height="${width}" loading="lazy" decoding="async" alt="${escapeHtml(caption)}"></button>`;
}
function card(row) {
  const {image} = row;
  const after = image.processedUrl ? imageButton(image.processedUrl, `${row.title} GPT Image 2加工後`, 1024) : `<div class="placeholder">${image.status === "skipped" ? "文字資料のため加工なし" : "GPT Image 2生成待ち"}</div>`;
  const score = image.scores ? `<div class="score"><span>忠実度 ${image.scores.truthfulness ?? "-"}点</span><span>見栄え ${image.scores.appearance ?? "-"}点</span><span>文字・ロゴ ${image.scores.textLogoIntegrity ?? "-"}点</span><span>生成 ${image.attempts}回</span></div>` : `<div class="score"><span>採点前</span></div>`;
  const reasons = image.scores?.reasons?.length ? `<p class="risk-reasons">${escapeHtml(image.scores.reasons.join("／"))}</p>` : "";
  return `<article class="card"><header class="card__header"><h2>${escapeHtml(row.title)}</h2><p class="meta">商品ID ${escapeHtml(row.itemId)}・画像 ${image.imageNo}</p></header><div class="compare"><figure class="figure">${imageButton(image.originalUrl, `${row.title} 原本`, 640)}<figcaption>原本</figcaption></figure><figure class="figure">${after}<figcaption>GPT Image 2加工後</figcaption></figure></div><div class="card__body"><span class="status status--${escapeHtml(image.status)}">${escapeHtml(STATUS_LABELS[image.status] || image.status)}</span>${score}${image.skipReason ? `<p class="skip-note">${escapeHtml(image.skipReason)}</p>` : ""}${reasons}<details><summary>商品説明を見る</summary><p class="description">${escapeHtml(row.description || "商品説明未登録")}</p></details><div class="card__actions"><a href="${escapeHtml(row.publicUrl)}" target="_blank" rel="noopener">BASE商品を見る</a></div></div></article>`;
}
function render() {
  const pages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE)); currentPage = Math.min(currentPage, pages);
  const start = (currentPage - 1) * PAGE_SIZE; elements.grid.innerHTML = filtered.slice(start, start + PAGE_SIZE).map(card).join("");
  elements.summary.textContent = `${filtered.length.toLocaleString("ja-JP")}画像中 ${filtered.length ? start + 1 : 0}〜${Math.min(start + PAGE_SIZE, filtered.length)}件を表示`;
  elements.page.textContent = `${currentPage} / ${pages}`; elements.prev.disabled = currentPage <= 1; elements.next.disabled = currentPage >= pages;
}
function filter() {
  const query = elements.query.value.trim().toLocaleLowerCase("ja"); const status = elements.status.value;
  filtered = rows.filter((r) => (!query || `${r.title} ${r.description} ${r.itemId}`.toLocaleLowerCase("ja").includes(query)) && (status === "all" || r.image.status === status)); currentPage = 1; render();
}
function openZoom(trigger) { lastZoomTrigger = trigger; elements.zoomImage.src = trigger.dataset.src; elements.zoomImage.alt = trigger.dataset.caption; elements.zoomCaption.textContent = trigger.dataset.caption; elements.zoom.showModal(); }
function closeZoom() { elements.zoom.close(); elements.zoomImage.removeAttribute("src"); lastZoomTrigger?.focus(); }
elements.query.addEventListener("input", filter); elements.status.addEventListener("change", filter);
elements.prev.addEventListener("click", () => { currentPage -= 1; render(); }); elements.next.addEventListener("click", () => { currentPage += 1; render(); });
elements.grid.addEventListener("click", (event) => { const trigger = event.target.closest(".zoom-trigger"); if (trigger) openZoom(trigger); });
elements.zoomClose.addEventListener("click", closeZoom); elements.zoom.addEventListener("click", (event) => { if (event.target === elements.zoom) closeZoom(); });

fetch("data/manifest.json", {cache:"no-store"}).then((r) => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.json(); }).then((data) => { manifest = data; rows = flatten(data.products); filtered = rows; renderStats(); render(); }).catch((error) => { elements.summary.textContent = `DB出力を読み込めませんでした：${error.message}`; });
