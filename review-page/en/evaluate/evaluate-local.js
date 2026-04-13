/**
 * Статическая копия evaluate: без MutationObserver на document (ввод в отзыв не ломаем).
 * — Кнопка E-Mail из скрытого .authentication_*.
 * — OneTrust убираем по интервалу.
 * — Плейсхолдеры как на сайте; тестовый текст из снимка сбрасываем.
 * — Звёзды: radio + смена SVG (stars-0…5), т.к. React не гидрируется.
 */
(function () {
  "use strict";

  document.documentElement.classList.add("spliff-evaluate-instant");

  var STAR_ASSET_BASE =
    "https://cdn.trustpilot.net/brand-assets/4.1.0/stars/stars-";
  /** Границы зон по X в долях ширины (SVG stars-*.svg viewBox 512×96, звезда 96 + зазор 8) */
  var STAR_T_BOUNDARIES = [100 / 512, 204 / 512, 308 / 512, 412 / 512];
  var PLACEHOLDER_REVIEW_TEXT =
    "What was so great about your experience? What makes the company stand out? Remember to give honest, helpful and constructive feedback.";
  var PLACEHOLDER_REVIEW_TITLE = "What's important to know?";

  var COOKIE_SELECTORS = [
    "#onetrust-consent-sdk",
    "#onetrust-banner-sdk",
    "#onetrust-pc-sdk",
    "#onetrust-style",
    ".onetrust-pc-dark-filter",
    ".ot-floating-button",
    "#ot-sdk-btn-floating",
    "#ot-sdk-container",
  ];

  function removeCookieUi() {
    COOKIE_SELECTORS.forEach(function (sel) {
      try {
        document.querySelectorAll(sel).forEach(function (el) {
          el.remove();
        });
      } catch (e) {}
    });
    document.querySelectorAll('[id^="onetrust-"]').forEach(function (el) {
      if (el && el.id && el.id.indexOf("onetrust") === 0) {
        el.remove();
      }
    });
  }

  function getEmailLookupForm() {
    var inp = document.getElementById("email-lookup");
    return inp ? inp.closest("form") : null;
  }

  function updateEmailFormDomVisibility() {
    var form = getEmailLookupForm();
    if (!form) return;
    if (document.documentElement.classList.contains("spliff-email-revealed")) {
      form.style.setProperty("display", "block", "important");
      form.style.setProperty("visibility", "visible", "important");
      form.style.setProperty("opacity", "1", "important");
      form.style.removeProperty("height");
      form.style.removeProperty("pointer-events");
    } else {
      form.style.setProperty("display", "none", "important");
      form.style.setProperty("visibility", "hidden", "important");
      form.style.setProperty("opacity", "0", "important");
    }
  }

  function ensureEmailButtonOutsideHiddenAuth() {
    var wrap = document.querySelector(".styles_wrapper__OUaQA");
    var auth = document.querySelector(".authentication_authentication__yhJrJ");
    if (!wrap) return;

    var btn = document.querySelector(
      'button[data-reveal-email-flow-button="true"]'
    );
    var form = getEmailLookupForm();

    if (auth && wrap.contains(auth)) {
      if (btn && auth.contains(btn)) {
        wrap.insertBefore(btn, auth.nextSibling);
      }
      if (form && auth.contains(form)) {
        if (btn && wrap.contains(btn)) {
          wrap.insertBefore(form, btn.nextSibling);
        } else {
          wrap.insertBefore(form, auth.nextSibling);
        }
      }
    }

    if (btn) {
      if (document.documentElement.classList.contains("spliff-email-revealed")) {
        btn.style.setProperty("display", "none", "important");
      } else {
        btn.style.setProperty("display", "inline-block", "important");
        btn.style.visibility = "visible";
        btn.style.opacity = "1";
      }
    }
    updateEmailFormDomVisibility();
  }

  function bindRevealEmailFlow() {
    var btn = document.querySelector(
      'button[data-reveal-email-flow-button="true"]'
    );
    if (!btn || btn.dataset.spliffRevealBound === "1") return;
    btn.dataset.spliffRevealBound = "1";
    btn.addEventListener("click", function (ev) {
      ev.preventDefault();
      document.documentElement.classList.add("spliff-email-revealed");
      updateEmailFormDomVisibility();
      window.setTimeout(function () {
        var inp = document.getElementById("email-lookup");
        if (inp) {
          try {
            inp.focus({ preventScroll: true });
          } catch (e) {
            inp.focus();
          }
        }
      }, 0);
    });
  }

  function cleanupLegacyFallback() {
    var fb = document.getElementById("spliff-local-sso-fallbacks");
    if (fb) fb.remove();
  }

  function resetSnapshotFormFields() {
    var ta = document.getElementById("review-text");
    if (ta) {
      ta.value = "";
      ta.setAttribute("placeholder", PLACEHOLDER_REVIEW_TEXT);
    }
    var title = document.getElementById("review-title");
    if (title) {
      title.value = "";
      title.setAttribute("placeholder", PLACEHOLDER_REVIEW_TITLE);
    }
    var dateEl = document.getElementById("review-date-of-experience");
    if (dateEl) {
      dateEl.value = "";
    }
    document.querySelectorAll('input[name="star-selector"]').forEach(function (inp) {
      inp.checked = false;
      inp.removeAttribute("checked");
    });
    var five = document.querySelector('input[name="star-selector"][value="5"]');
    if (five) {
      five.checked = true;
      five.setAttribute("checked", "checked");
    }
  }

  function getStarRatingImg() {
    var wrap = document.querySelector('[class*="star-rating_starRating"]');
    return wrap && wrap.querySelector("img");
  }

  function syncStarRatingImage() {
    var img = getStarRatingImg();
    if (!img) return;
    var sel = document.querySelector('input[name="star-selector"]:checked');
    var n = sel ? parseInt(sel.value, 10) : 0;
    if (n < 0 || n > 5 || isNaN(n)) n = 0;
    img.src = STAR_ASSET_BASE + n + ".svg";
  }

  function starIndexFromRelativeX(t) {
    if (t < 0) return 1;
    if (t > 1) return 5;
    if (t < STAR_T_BOUNDARIES[0]) return 1;
    if (t < STAR_T_BOUNDARIES[1]) return 2;
    if (t < STAR_T_BOUNDARIES[2]) return 3;
    if (t < STAR_T_BOUNDARIES[3]) return 4;
    return 5;
  }

  /**
   * Координата в системе viewBox SVG (0…1 по X), с учётом object-fit: contain
   * (поля по бокам/сверху не считаем в долю ширины — иначе зона клика уезжает вправо).
   */
  function starNormalizedXFromPointer(ev, img) {
    var rect = img.getBoundingClientRect();
    var boxW = rect.width;
    var boxH = rect.height;
    if (boxW < 4 || boxH < 4) return null;
    var nw = img.naturalWidth;
    var nh = img.naturalHeight;
    if (!nw || !nh) {
      nw = 512;
      nh = 96;
    }
    var scale = Math.min(boxW / nw, boxH / nh);
    var drawW = nw * scale;
    var drawH = nh * scale;
    var offX = (boxW - drawW) / 2;
    var offY = (boxH - drawH) / 2;
    var x = ev.clientX - rect.left - offX;
    var y = ev.clientY - rect.top - offY;
    if (x < 0 || x > drawW || y < 0 || y > drawH) return null;
    return x / drawW;
  }

  function bindStarSelectorStatic() {
    var row = document.querySelector('[class*="star-selector-row_starRatingSelector"] > div');
    var box = document.querySelector('[class*="star-selector_starSelector"]');
    if (!box) return;

    if (box.dataset.spliffStarBound !== "1") {
      box.dataset.spliffStarBound = "1";
      box.addEventListener("change", syncStarRatingImage);
    }

    if (row && row.dataset.spliffStarGeom !== "1") {
      row.dataset.spliffStarGeom = "1";
      row.addEventListener(
        "pointerdown",
        function (ev) {
          if (ev.button !== 0) return;
          var img = getStarRatingImg();
          if (!img) return;
          var t = starNormalizedXFromPointer(ev, img);
          if (t === null) return;
          var n = starIndexFromRelativeX(t);
          var inp = row.querySelector('input[name="star-selector"][value="' + n + '"]');
          if (!inp) return;
          inp.checked = true;
          try {
            inp.focus({ preventScroll: true });
          } catch (e) {
            inp.focus();
          }
          inp.dispatchEvent(new Event("input", { bubbles: true }));
          inp.dispatchEvent(new Event("change", { bubbles: true }));
          syncStarRatingImage();
          ev.preventDefault();
          ev.stopImmediatePropagation();
        },
        true
      );
    }

    syncStarRatingImage();
  }

  function run() {
    removeCookieUi();
    ensureEmailButtonOutsideHiddenAuth();
    bindRevealEmailFlow();
    cleanupLegacyFallback();
    resetSnapshotFormFields();
    bindStarSelectorStatic();
  }

  removeCookieUi();

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", run);
  } else {
    run();
  }

  var t0 = Date.now();
  var tick = setInterval(function () {
    removeCookieUi();
    ensureEmailButtonOutsideHiddenAuth();
    bindRevealEmailFlow();
    if (Date.now() - t0 > 12000) {
      clearInterval(tick);
    }
  }, 400);
})();
