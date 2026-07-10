(function () {
  "use strict";

  var imageSelector = [
    ".yk-feature-visual img",
    ".yk-pickup__image img",
    ".yk-payment-image img",
    ".yk-store-card > img",
    ".yk-card > img"
  ].join(",");

  function whenReady(callback) {
    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", callback, { once: true });
    } else {
      callback();
    }
  }

  whenReady(function () {
    var previousFocus = null;
    var dialog = document.createElement("dialog");
    dialog.className = "yk-lightbox";
    dialog.setAttribute("aria-label", "画像の拡大表示");
    dialog.innerHTML = [
      '<div class="yk-lightbox__inner">',
      '<div class="yk-lightbox__top"><button class="yk-lightbox__close" type="button" aria-label="拡大表示を閉じる">&times;</button></div>',
      '<div class="yk-lightbox__image-wrap"><img class="yk-lightbox__image" alt=""></div>',
      '<p class="yk-lightbox__caption"></p>',
      '</div>'
    ].join("");
    document.body.appendChild(dialog);

    var dialogImage = dialog.querySelector(".yk-lightbox__image");
    var dialogCaption = dialog.querySelector(".yk-lightbox__caption");
    var closeButton = dialog.querySelector(".yk-lightbox__close");

    function closeDialog() {
      if (typeof dialog.close === "function") {
        dialog.close();
      } else {
        dialog.removeAttribute("open");
        document.body.classList.remove("yk-lightbox-open");
        if (previousFocus) previousFocus.focus();
      }
    }

    function openDialog(trigger) {
      var sourceImage = trigger.matches && trigger.matches("img") ? trigger : trigger.querySelector("img");
      var source = trigger.getAttribute("data-yk-lightbox") || (sourceImage && (sourceImage.currentSrc || sourceImage.src));
      var alt = trigger.getAttribute("data-yk-lightbox-alt") || (sourceImage && sourceImage.alt) || "画像";
      if (!source) return;

      previousFocus = document.activeElement;
      dialogImage.src = source;
      dialogImage.alt = alt;
      dialogCaption.textContent = alt;
      document.body.classList.add("yk-lightbox-open");

      if (!dialog.open) {
        if (typeof dialog.showModal === "function") dialog.showModal();
        else dialog.setAttribute("open", "");
      }
      closeButton.focus();
    }

    function enhanceImages(root) {
      var images = [];
      if (root.matches && root.matches(imageSelector)) images.push(root);
      if (root.querySelectorAll) images = images.concat(Array.prototype.slice.call(root.querySelectorAll(imageSelector)));
      images.forEach(function (image) {
        if (image.dataset.ykZoomReady === "true") return;
        image.dataset.ykZoomReady = "true";
        image.classList.add("yk-zoomable");
        image.setAttribute("role", "button");
        image.setAttribute("tabindex", "0");
        image.setAttribute("aria-label", (image.alt || "画像") + "を拡大表示");
      });
    }

    function buildStoreGalleries() {
      document.querySelectorAll(".yk-store-grid, .yk-grid-2").forEach(function (grid) {
        if (grid.dataset.ykGalleryReady === "true") return;
        var entries = [];
        Array.prototype.forEach.call(grid.children, function (card) {
          var directImage = Array.prototype.find.call(card.children || [], function (child) {
            return child.tagName === "IMG" && /store-illustration/i.test(child.getAttribute("src") || "");
          });
          if (!directImage) return;
          var heading = card.querySelector("h2, h3");
          entries.push({ image: directImage, label: heading ? heading.textContent.trim() : directImage.alt });
        });
        if (entries.length < 2) return;

        var gallery = document.createElement("div");
        gallery.className = "yk-store-gallery";
        gallery.setAttribute("aria-label", "店舗画像。タップすると拡大できます");
        entries.forEach(function (entry) {
          var button = document.createElement("button");
          var image = entry.image.cloneNode(false);
          var label = document.createElement("span");
          button.type = "button";
          button.className = "yk-gallery-button";
          button.setAttribute("data-yk-lightbox", entry.image.currentSrc || entry.image.src);
          button.setAttribute("data-yk-lightbox-alt", entry.image.alt || entry.label);
          button.setAttribute("aria-label", entry.label + "の画像を拡大表示");
          image.removeAttribute("role");
          image.removeAttribute("tabindex");
          image.removeAttribute("aria-label");
          label.textContent = entry.label;
          button.appendChild(image);
          button.appendChild(label);
          gallery.appendChild(button);
        });
        grid.parentNode.insertBefore(gallery, grid);
        grid.classList.add("yk-has-mobile-gallery");
        grid.dataset.ykGalleryReady = "true";
      });
    }

    closeButton.addEventListener("click", closeDialog);
    dialog.addEventListener("click", function (event) {
      if (event.target === dialog) closeDialog();
    });
    dialog.addEventListener("close", function () {
      document.body.classList.remove("yk-lightbox-open");
      dialogImage.removeAttribute("src");
      if (previousFocus && typeof previousFocus.focus === "function") previousFocus.focus();
    });

    document.addEventListener("click", function (event) {
      var trigger = event.target.closest ? event.target.closest("[data-yk-lightbox], " + imageSelector) : null;
      if (!trigger || trigger === dialogImage) return;
      event.preventDefault();
      openDialog(trigger);
    });

    document.addEventListener("keydown", function (event) {
      if (event.key !== "Enter" && event.key !== " ") return;
      if (!event.target.matches || !event.target.matches(imageSelector)) return;
      event.preventDefault();
      openDialog(event.target);
    });

    buildStoreGalleries();
    enhanceImages(document);

    if ("MutationObserver" in window) {
      new MutationObserver(function (records) {
        records.forEach(function (record) {
          Array.prototype.forEach.call(record.addedNodes, function (node) {
            if (node.nodeType === 1) enhanceImages(node);
          });
        });
      }).observe(document.body, { childList: true, subtree: true });
    }
  });
})();
