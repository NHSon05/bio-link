/**
 * Runtime phía trình duyệt cho landing (plan mục 5, 6, 8).
 * HTML đã được Astro render đầy đủ lúc build; file này chỉ:
 *   1. Track click (GA4 + sendBeacon)       — [data-track]
 *   2. Nút ← → của video slider             — [data-vid]
 *   3. Đổi tab bộ sưu tập của shop          — [data-tab]
 *   4. Gửi form subscribe                   — form[data-subscribe]
 *   5. Dock: cuộn mượt + đánh dấu tab       — [data-dock]
 *   6. Sắp lại block "hot" theo /{slug}.json — [data-rank]
 *
 * Quy tắc để chạy đúng sau Closure ADVANCED_OPTIMIZATIONS:
 *   - Dữ liệu JSON đọc bằng chuỗi: data["order"], không data.order
 *   - Thuộc tính data-* đọc bằng getAttribute, không dùng el.dataset.x (bị đổi tên)
 *   - gtag nằm trong externs.js
 */
(function () {
  "use strict";

  var root = document.getElementById("app");
  if (!root) return;
  var slug = root.getAttribute("data-slug") || "";
  var beacon = root.getAttribute("data-beacon") || "";
  var isPreview = root.getAttribute("data-preview") === "1";

  /**
   * @param {string} blockId
   * @param {string} pos
   * @param {string} url
   */
  function emit(blockId, pos, url) {
    var payload = { slug: slug, blockId: blockId, position: pos, url: url, ts: Date.now() };
    if (isPreview) return;
    if (typeof window["gtag"] === "function") window["gtag"]("event", "block_click", payload);
    if (beacon && navigator.sendBeacon) navigator.sendBeacon(beacon, JSON.stringify(payload));
  }

  /**
   * @param {Element} node
   * @param {string} attr
   * @return {Element}
   */
  function closest(node, attr) {
    while (node && node.nodeType === 1) {
      if (node.hasAttribute(attr)) return node;
      node = /** @type {Element} */ (node.parentNode);
    }
    return null;
  }

  document.addEventListener("click", function (e) {
    var t = /** @type {Element} */ (e.target);

    var vid = closest(t, "data-vid");
    if (vid) {
      e.preventDefault();
      var box = vid.parentNode;
      var track = /** @type {HTMLElement} */ (box && box.querySelector(".lb-vid-track"));
      if (track)
        track["scrollBy"]({ left: Number(vid.getAttribute("data-vid")) * track.clientWidth, behavior: "smooth" });
      return;
    }

    var tab = closest(t, "data-tab");
    if (tab) {
      var shop = closest(tab, "data-block-id");
      if (!shop) return;
      var i = tab.getAttribute("data-tab");
      Array.prototype.forEach.call(shop.querySelectorAll("[data-tab]"), function (n) {
        n.classList.toggle("on", n.getAttribute("data-tab") === i);
      });
      Array.prototype.forEach.call(shop.querySelectorAll("[data-pane]"), function (n) {
        if (n.getAttribute("data-pane") === i) n.removeAttribute("hidden");
        else n.setAttribute("hidden", "");
      });
      return;
    }

    var dock = closest(t, "data-dock");
    if (dock) {
      e.preventDefault();
      var target = document.getElementById((dock.getAttribute("href") || "").slice(1));
      if (target) target.scrollIntoView({ behavior: "smooth", block: "start" });
      Array.prototype.forEach.call(dock.parentNode.children, function (n) {
        n.classList.remove("on");
      });
      dock.classList.add("on");
      return;
    }

    var a = closest(t, "data-track");
    if (a) {
      emit(a.getAttribute("data-track") || "", a.getAttribute("data-pos") || "", a.getAttribute("href") || "");
      if (isPreview) e.preventDefault(); // trong dashboard không mở tab mới
    }
  });

  document.addEventListener("submit", function (e) {
    var form = /** @type {HTMLFormElement} */ (e.target);
    if (!form.hasAttribute("data-subscribe")) return;
    e.preventDefault();
    var input = /** @type {HTMLInputElement} */ (form.querySelector("input[type=email]"));
    var trap = /** @type {HTMLInputElement} */ (form.querySelector("input[name=website]"));
    if (trap && trap.value) return; // honeypot: bot điền ô ẩn
    var email = input ? input.value : "";
    var endpoint = form.getAttribute("data-endpoint");
    emit(form.getAttribute("data-subscribe") || "", form.getAttribute("data-pos") || "", "subscribe");
    var done = function (ok) {
      var msg = document.createElement("div");
      msg.className = "lb-sub-ok";
      msg.textContent = ok ? "Đã đăng ký: " + email : "Chưa gửi được, thử lại sau.";
      form.parentNode.replaceChild(msg, form);
    };
    if (!endpoint || isPreview) {
      done(true);
      return;
    }
    fetch(endpoint, {
      method: "POST",
      headers: { "content-type": "text/plain" },
      body: JSON.stringify({ email: email, slug: slug, ts: Date.now() }),
    }).then(
      function (r) {
        done(r.ok);
      },
      function () {
        done(false);
      },
    );
  });

  /**
   * Sắp lại block trong các vùng tự xếp theo thứ tự mới nhất trên CDN.
   * Chỉ đổi chỗ node có sẵn; block mới / đổi template vẫn cần build lại.
   */
  function applyOrder(data) {
    var order = data && data["order"];
    if (!order) return;
    Array.prototype.forEach.call(root.querySelectorAll("[data-region][data-rank]"), function (reg) {
      var ids = order[reg.getAttribute("data-region")];
      if (!ids || !ids.length) return;
      var rank = {};
      ids.forEach(function (id, i) {
        rank[id] = i;
      });
      var parents = [reg].concat(Array.prototype.slice.call(reg.querySelectorAll(".lb-track")));
      parents.forEach(function (p) {
        var kids = Array.prototype.filter.call(p.children, function (n) {
          return n.hasAttribute("data-block-id");
        });
        kids.sort(function (x, y) {
          var rx = rank[x.getAttribute("data-block-id")],
            ry = rank[y.getAttribute("data-block-id")];
          return (rx == null ? 1e9 : rx) - (ry == null ? 1e9 : ry);
        });
        kids.forEach(function (n) {
          p.appendChild(n);
        });
      });
    });
  }

  if (slug && !isPreview && window.fetch) {
    fetch("/" + slug + ".json", { cache: "no-cache" })
      .then(function (r) {
        return r.ok ? r.json() : null;
      })
      .then(applyOrder, function () {});
  }
})();
