(function () {
  "use strict";

  var config = window.ykPreviewConfig || {};
  var cartKey = config.cartKey || "yuukichiya.preview.cart.v1";

  function escapeHtml(value) {
    return String(value || "").replace(/[&<>"']/g, function (char) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" }[char];
    });
  }

  function normalizeItem(item) {
    var id = String(item.id || item.u || item.t || "").trim();
    return {
      id: id || String(Date.now()),
      t: String(item.t || item.title || "商品").trim(),
      v: String(item.v || item.variant || "種類・サイズ確認").trim(),
      p: String(item.p || item.price || "").trim(),
      img: String(item.img || item.image || "assets/hero-uniform-display.png").trim(),
      u: String(item.u || item.url || "").trim(),
      qty: Math.max(1, Number(item.qty) || 1)
    };
  }

  function readCart() {
    try {
      var parsed = JSON.parse(localStorage.getItem(cartKey) || "[]");
      if (!Array.isArray(parsed)) return [];
      return parsed.map(normalizeItem).filter(function (item) { return item.t; });
    } catch (error) {
      return [];
    }
  }

  function writeCart(items) {
    localStorage.setItem(cartKey, JSON.stringify(items.map(normalizeItem)));
    updateCartBadges();
    renderCartPage();
  }

  function cartCount(items) {
    return items.reduce(function (total, item) { return total + item.qty; }, 0);
  }

  function itemKey(item) {
    return [item.id, item.v].join("__");
  }

  function priceNumber(item) {
    var value = String(item.p || "").replace(/[^\d]/g, "");
    return value ? Number(value) : 0;
  }

  function priceLabel(value) {
    return value ? "¥" + Number(value).toLocaleString("ja-JP") : "商品ページで確認";
  }

  function parseItemFromButton(button) {
    return normalizeItem({
      id: button.getAttribute("data-cart-id"),
      t: button.getAttribute("data-cart-title"),
      v: button.getAttribute("data-cart-variant"),
      p: button.getAttribute("data-cart-price"),
      img: button.getAttribute("data-cart-image"),
      u: button.getAttribute("data-cart-url")
    });
  }

  function addToCart(item) {
    var nextItem = normalizeItem(item);
    var nextKey = itemKey(nextItem);
    var items = readCart();
    var existing = items.find(function (entry) { return itemKey(entry) === nextKey; });
    if (existing) existing.qty += 1;
    else items.push(nextItem);
    writeCart(items);
  }

  function updateCartBadges() {
    var count = cartCount(readCart());
    document.querySelectorAll("[data-cart-count]").forEach(function (node) {
      node.textContent = String(count);
      node.hidden = count === 0;
      node.setAttribute("aria-label", count ? "カート内の商品数 " + count + "点" : "カートは空です");
    });
  }

  function renderCartRows(items) {
    return items.map(function (item) {
      var key = escapeHtml(itemKey(item));
      var lineTotal = priceNumber(item) * item.qty;
      var image = escapeHtml(item.img);
      var title = escapeHtml(item.t);
      var variant = escapeHtml(item.v);
      var url = "item-detail-preview.html?id=" + encodeURIComponent(item.id);
      return '<article class="yk-cart-item">' +
        '<a class="yk-cart-item__image" href="' + url + '"><img src="' + image + '" alt="' + title + '" loading="eager" decoding="async" onerror="this.onerror=null;this.src=&quot;assets/hero-uniform-display.png&quot;;"></a>' +
        '<div class="yk-cart-item__body">' +
        '<h2>' + title + '</h2>' +
        '<p>' + variant + '</p>' +
        '<p class="yk-cart-item__price">' + escapeHtml(item.p || "商品ページで確認") + '</p>' +
        '<div class="yk-cart-controls" aria-label="' + title + 'の数量変更">' +
        '<button type="button" data-cart-qty data-key="' + key + '" data-delta="-1">減らす</button>' +
        '<output>' + item.qty + '</output>' +
        '<button type="button" data-cart-qty data-key="' + key + '" data-delta="1">増やす</button>' +
        '<button class="yk-cart-remove" type="button" data-cart-remove data-key="' + key + '">削除</button>' +
        '</div>' +
        '</div>' +
        '<div class="yk-cart-item__total">' + escapeHtml(priceLabel(lineTotal)) + '</div>' +
        '</article>';
    }).join("");
  }

  function renderCartPage() {
    var page = document.querySelector("[data-cart-page]");
    if (!page) return;
    var items = readCart();
    var empty = page.querySelector("[data-cart-empty]");
    var filled = page.querySelector("[data-cart-filled]");
    var list = page.querySelector("[data-cart-list]");
    var totalNode = page.querySelector("[data-cart-total]");
    var countNode = page.querySelector("[data-cart-summary-count]");
    var noteNode = page.querySelector("[data-cart-note]");
    var count = cartCount(items);
    var total = items.reduce(function (sum, item) { return sum + priceNumber(item) * item.qty; }, 0);
    if (empty) empty.hidden = count !== 0;
    if (filled) filled.hidden = count === 0;
    if (list) list.innerHTML = renderCartRows(items);
    if (countNode) countNode.textContent = count + "点";
    if (totalNode) totalNode.textContent = priceLabel(total);
    if (noteNode) {
      noteNode.textContent = items.some(function (item) { return !priceNumber(item); })
        ? "価格未設定の商品は、商品ページで金額をご確認ください。"
        : "確定前に商品ページで種類・サイズをご確認ください。";
    }
  }

  function updateItemQuantity(key, delta) {
    var items = readCart().map(function (item) {
      if (itemKey(item) === key) item.qty += delta;
      return item;
    }).filter(function (item) { return item.qty > 0; });
    writeCart(items);
  }

  function removeItem(key) {
    writeCart(readCart().filter(function (item) { return itemKey(item) !== key; }));
  }

  function buildContactBody(form) {
    var data = new FormData(form);
    return [
      "お名前: " + (data.get("name") || ""),
      "メールアドレス: " + (data.get("email") || ""),
      "電話番号: " + (data.get("tel") || ""),
      "学校名: " + (data.get("school") || ""),
      "お問い合わせの種類: " + (data.get("type") || ""),
      "お問い合わせ内容:",
      data.get("message") || ""
    ].join("\n");
  }

  function renderContactConfirm(form) {
    var panel = document.querySelector("[data-contact-confirm]");
    var summary = document.querySelector("[data-contact-summary]");
    var bodyField = document.querySelector("[data-contact-draft]");
    if (!panel || !summary) return;
    var data = new FormData(form);
    var fields = [
      ["お名前", data.get("name")],
      ["メールアドレス", data.get("email")],
      ["電話番号", data.get("tel") || "未入力"],
      ["学校名", data.get("school") || "未入力"],
      ["お問い合わせの種類", data.get("type") || "未入力"],
      ["お問い合わせ内容", data.get("message")]
    ];
    summary.innerHTML = fields.map(function (field) {
      return "<dt>" + escapeHtml(field[0]) + "</dt><dd>" + escapeHtml(field[1] || "") + "</dd>";
    }).join("");
    if (bodyField) bodyField.value = buildContactBody(form);
    panel.hidden = false;
    panel.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  document.addEventListener("click", function (event) {
    var add = event.target.closest && event.target.closest("[data-cart-add]");
    if (add) {
      event.preventDefault();
      addToCart(parseItemFromButton(add));
      var original = add.getAttribute("data-label") || add.textContent;
      add.setAttribute("data-label", original);
      add.textContent = "追加しました";
      add.disabled = true;
      window.setTimeout(function () {
        add.textContent = original;
        add.disabled = false;
      }, 900);
      return;
    }

    var qty = event.target.closest && event.target.closest("[data-cart-qty]");
    if (qty) {
      event.preventDefault();
      updateItemQuantity(qty.getAttribute("data-key"), Number(qty.getAttribute("data-delta")) || 0);
      return;
    }

    var remove = event.target.closest && event.target.closest("[data-cart-remove]");
    if (remove) {
      event.preventDefault();
      removeItem(remove.getAttribute("data-key"));
      return;
    }

    var clear = event.target.closest && event.target.closest("[data-cart-clear]");
    if (clear) {
      event.preventDefault();
      writeCart([]);
      return;
    }

    var checkout = event.target.closest && event.target.closest("[data-cart-checkout]");
    if (checkout) {
      event.preventDefault();
      var status = document.querySelector("[data-cart-status]");
      if (status) status.textContent = "下書き確認中のため決済は行いません。本番公開後はBASEの安全な決済処理へ接続します。";
      return;
    }

    var contactEdit = event.target.closest && event.target.closest("[data-contact-edit]");
    if (contactEdit) {
      event.preventDefault();
      var panel = document.querySelector("[data-contact-confirm]");
      if (panel) panel.hidden = true;
      var form = document.querySelector("[data-contact-form]");
      if (form) form.scrollIntoView({ behavior: "smooth", block: "center" });
      return;
    }

    var contactSend = event.target.closest && event.target.closest("[data-contact-send]");
    if (contactSend) {
      event.preventDefault();
      var contactStatus = document.querySelector("[data-contact-send-status]");
      if (contactStatus) contactStatus.textContent = "下書き確認中のため送信されません。7月24日の確認後に送信を有効にします。";
    }
  });

  document.addEventListener("submit", function (event) {
    var form = event.target.closest && event.target.closest("[data-contact-form]");
    if (!form) return;
    event.preventDefault();
    if (!form.reportValidity()) return;
    renderContactConfirm(form);
  });

  updateCartBadges();
  renderCartPage();
})();
