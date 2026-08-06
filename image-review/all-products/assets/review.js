const PAGE_SIZE = 60;
const STATUS_LABELS = {
  queued: "加工待ち",
  review_pending: "確認待ち",
  regenerate: "再生成",
  approved: "承認済み",
  uploaded_verified: "BASE反映済み",
};

const elements = {
  stats: document.querySelector("#stats"),
  query: document.querySelector("#query"),
  status: document.querySelector("#status"),
  export: document.querySelector("#export"),
  summary: document.querySelector("#result-summary"),
  grid: document.querySelector("#grid"),
  prev: document.querySelector("#prev"),
  next: document.querySelector("#next"),
  page: document.querySelector("#page"),
  zoom: document.querySelector("#zoom"),
  zoomImage: document.querySelector("#zoom-image"),
  zoomCaption: document.querySelector("#zoom-caption"),
  zoomClose: document.querySelector("#zoom-close"),
};

let manifest;
let rows = [];
let filtered = [];
let currentPage = 1;
let lastZoomTrigger = null;
const decisions = JSON.parse(localStorage.getItem("yuukichiya-image-decisions-v1") || "{}");

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"]/g, (character) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
  })[character]);
}

function keyFor(row) { return `${row.itemId}:${row.image.imageNo}`; }

function effectiveStatus(row) {
  return decisions[keyFor(row)]?.decision === "regenerate" ? "regenerate" : row.image.status;
}

function flattenProducts(products) {
  return products.flatMap((product) => product.images.map((image) => ({
    itemId: product.itemId,
    title: product.title,
    publicUrl: product.publicUrl,
    image,
  })));
}

function stat(value, label) {
  return `<div class="stat"><strong>${Number(value).toLocaleString("ja-JP")}</strong><span>${label}</span></div>`;
}

function renderStats() {
  const counts = rows.reduce((result, row) => {
    const status = effectiveStatus(row);
    result[status] = (result[status] || 0) + 1;
    return result;
  }, {});
  elements.stats.innerHTML = [
    stat(manifest.meta.productCount, "商品"),
    stat(manifest.meta.imageCount, "全画像"),
    stat(counts.uploaded_verified || 0, "BASE反映済み"),
    stat((counts.queued || 0) + (counts.regenerate || 0), "加工・再生成待ち"),
  ].join("");
}

function cardMarkup(row) {
  const { image } = row;
  const status = effectiveStatus(row);
  const key = keyFor(row);
  const retryActive = decisions[key]?.decision === "regenerate";
  const processed = image.processedUrl
    ? `<button class="zoom-trigger" type="button" data-src="${escapeHtml(image.processedUrl)}" data-caption="${escapeHtml(`${row.title} 加工後`)}"><img src="${escapeHtml(image.processedUrl)}" width="1024" height="1024" loading="lazy" decoding="async" alt="${escapeHtml(`${row.title}の加工後画像`)}"></button>`
    : `<div class="placeholder">加工後画像を生成中</div>`;
  const score = image.scores
    ? `<div class="score"><span>忠実度 ${image.scores.truthfulness}点</span><span>見栄え ${image.scores.appearance}点</span><span>生成 ${image.attempts}回</span></div>`
    : `<div class="score"><span>採点前</span></div>`;
  return `<article class="card" data-key="${escapeHtml(key)}">
    <header class="card__header">
      <h2>${escapeHtml(row.title)}</h2>
      <p class="meta">商品ID ${escapeHtml(row.itemId)}・画像 ${image.imageNo}</p>
    </header>
    <div class="compare">
      <figure class="figure">
        <button class="zoom-trigger" type="button" data-src="${escapeHtml(image.originalUrl)}" data-caption="${escapeHtml(`${row.title} 原本`)}"><img src="${escapeHtml(image.originalUrl)}" width="640" height="640" loading="lazy" decoding="async" alt="${escapeHtml(`${row.title}の原本画像`)}"></button>
        <figcaption>原本</figcaption>
      </figure>
      <figure class="figure">${processed}<figcaption>加工後</figcaption></figure>
    </div>
    <div class="card__body">
      <span class="status status--${escapeHtml(status)}">${escapeHtml(STATUS_LABELS[status] || status)}</span>
      ${score}
      <div class="card__actions">
        <button class="retry${retryActive ? " is-active" : ""}" type="button" data-key="${escapeHtml(key)}">${retryActive ? "再生成指定済み" : "再生成候補にする"}</button>
        <a href="${escapeHtml(row.publicUrl)}" target="_blank" rel="noopener">BASE商品を見る</a>
      </div>
    </div>
  </article>`;
}

function applyFilters() {
  const query = elements.query.value.trim().toLocaleLowerCase("ja");
  const status = elements.status.value;
  filtered = rows.filter((row) => {
    const matchesQuery = !query || `${row.title} ${row.itemId}`.toLocaleLowerCase("ja").includes(query);
    const matchesStatus = status === "all" || effectiveStatus(row) === status;
    return matchesQuery && matchesStatus;
  });
  currentPage = 1;
  render();
}

function render() {
  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  currentPage = Math.min(currentPage, pageCount);
  const start = (currentPage - 1) * PAGE_SIZE;
  const pageRows = filtered.slice(start, start + PAGE_SIZE);
  elements.grid.innerHTML = pageRows.map(cardMarkup).join("");
  elements.summary.textContent = `${filtered.length.toLocaleString("ja-JP")}画像中 ${filtered.length ? start + 1 : 0}〜${Math.min(start + PAGE_SIZE, filtered.length)}件を表示`;
  elements.page.textContent = `${currentPage} / ${pageCount}`;
  elements.prev.disabled = currentPage <= 1;
  elements.next.disabled = currentPage >= pageCount;
}

function storeDecision(key, decision) {
  if (decisions[key]?.decision === decision) delete decisions[key];
  else decisions[key] = { decision, updatedAt: new Date().toISOString() };
  localStorage.setItem("yuukichiya-image-decisions-v1", JSON.stringify(decisions));
  renderStats();
  render();
}

function openZoom(trigger) {
  lastZoomTrigger = trigger;
  elements.zoomImage.src = trigger.dataset.src;
  elements.zoomImage.alt = trigger.dataset.caption;
  elements.zoomCaption.textContent = trigger.dataset.caption;
  elements.zoom.showModal();
}

function closeZoom() {
  elements.zoom.close();
  elements.zoomImage.removeAttribute("src");
  lastZoomTrigger?.focus();
}

elements.query.addEventListener("input", applyFilters);
elements.status.addEventListener("change", applyFilters);
elements.prev.addEventListener("click", () => { currentPage -= 1; render(); scrollTo({ top: elements.grid.offsetTop - 12 }); });
elements.next.addEventListener("click", () => { currentPage += 1; render(); scrollTo({ top: elements.grid.offsetTop - 12 }); });
elements.grid.addEventListener("click", (event) => {
  const zoomTrigger = event.target.closest(".zoom-trigger");
  if (zoomTrigger) return openZoom(zoomTrigger);
  const retry = event.target.closest(".retry");
  if (retry) storeDecision(retry.dataset.key, "regenerate");
});
elements.zoomClose.addEventListener("click", closeZoom);
elements.zoom.addEventListener("click", (event) => { if (event.target === elements.zoom) closeZoom(); });
elements.export.addEventListener("click", () => {
  const payload = {
    exportedAt: new Date().toISOString(),
    catalogHash: manifest.meta.catalogHash,
    decisions,
  };
  const link = document.createElement("a");
  link.href = URL.createObjectURL(new Blob([`${JSON.stringify(payload, null, 2)}\n`], { type: "application/json" }));
  link.download = `yuukichiya-image-decisions-${new Date().toISOString().slice(0, 10)}.json`;
  link.click();
  URL.revokeObjectURL(link.href);
});

fetch("data/manifest.json", { cache: "no-store" })
  .then((response) => {
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return response.json();
  })
  .then((data) => {
    manifest = data;
    rows = flattenProducts(manifest.products);
    filtered = rows;
    renderStats();
    render();
  })
  .catch((error) => {
    elements.summary.textContent = `画像台帳を読み込めませんでした：${error.message}`;
  });
