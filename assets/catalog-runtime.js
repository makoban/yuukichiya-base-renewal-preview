(function () {
  "use strict";

  var apiRoot = "https://yuukichiya-purchase-history-prototype.onrender.com/api/catalog";
  var statusUrl = apiRoot + "/status";
  var currentHash = "";
  var refreshTimer = 0;

  function receive(payload) {
    if (!payload || !payload.meta || !payload.meta.hash) return;
    currentHash = String(payload.meta.hash);
    if (typeof window.ykApplyLiveCatalog === "function") {
      window.ykApplyLiveCatalog(payload);
    } else {
      window.ykPendingLiveCatalog = payload;
    }
  }

  function loadWithScriptFallback() {
    return new Promise(function (resolve, reject) {
      var callbackName = "ykReceiveCatalogJsonp" + Date.now();
      var script = document.createElement("script");
      window[callbackName] = function (payload) {
        receive(payload);
        resolve(payload);
      };
      script.src = apiRoot + ".js?callback=" + encodeURIComponent(callbackName) + "&t=" + Date.now();
      script.async = true;
      script.onerror = function () { reject(new Error("catalog_script_failed")); };
      script.onload = function () {
        script.remove();
        window.setTimeout(function () { delete window[callbackName]; }, 0);
      };
      document.head.appendChild(script);
    });
  }

  function loadCatalog() {
    return fetch(apiRoot, { cache: "no-cache", credentials: "omit" })
      .then(function (response) {
        if (!response.ok) throw new Error("catalog_http_" + response.status);
        return response.json();
      })
      .then(function (payload) {
        receive(payload);
        return payload;
      })
      .catch(function () {
        return loadWithScriptFallback();
      })
      .catch(function () {
        return null;
      });
  }

  function checkForUpdate() {
    fetch(statusUrl, { cache: "no-cache", credentials: "omit" })
      .then(function (response) {
        if (!response.ok) throw new Error("catalog_status_http_" + response.status);
        return response.json();
      })
      .then(function (status) {
        if (status && status.hash && String(status.hash) !== currentHash) loadCatalog();
      })
      .catch(function () {});
  }

  window.ykRefreshBaseCatalog = loadCatalog;
  loadCatalog();
  refreshTimer = window.setInterval(checkForUpdate, 5 * 60 * 1000);
  window.addEventListener("pagehide", function () {
    if (refreshTimer) window.clearInterval(refreshTimer);
  }, { once: true });
})();
