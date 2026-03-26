/**
 * Пагинация списка отзывов (section[class*="reviewListContainer"]).
 * Только <button> внутри #spliff-reviews-pagination-host — иначе link_internal__
 * перехватывается скриптами Trustpilot и уводит на de.trustpilot.com.
 */
(function() {
  const PER_PAGE = 20;
  /** Сброс кэша браузера для reviews.json после правок данных */
  const REVIEWS_JSON_CACHE_PARAM = '20250326noseelinger';
  const AVATAR_COLORS = ['green','orange','yellow','pink','blue'];
  const STARS_SVG = 'assets/cdn.trustpilot.net/brand-assets/4.1.0/stars/stars-';
  const COMPANY_LOGO_FALLBACK = 'https://s3-eu-west-1.amazonaws.com/tpd/logos/65a8f486fe59a0421a2a19f2/0x0.png';
  const TP_BASE = 'https://de.trustpilot.com';
  /** Логотип компании + «Zur Website» + любые spliff.fr / www.spliff.fr без UTM → сюда же */
  const ONE_SHOP_WEBSITE =
    'https://oneshops.de/?utm_medium=company_profile&utm_source=trustpilot&utm_campaign=domain_click';
  const SPLIFF_DOMAIN = ONE_SHOP_WEBSITE;
  const SPLIFF_LOGO = ONE_SHOP_WEBSITE;

  function ensureOneshopsTrustpilotUtm(href) {
    if (typeof href !== 'string' || href.indexOf('oneshops.de') < 0) return href;
    try {
      var u = new URL(href);
      var host = u.hostname.toLowerCase();
      if (host !== 'oneshops.de' && host !== 'www.oneshops.de') return href;
      u.searchParams.set('utm_medium', 'company_profile');
      u.searchParams.set('utm_source', 'trustpilot');
      u.searchParams.set('utm_campaign', 'domain_click');
      return u.toString();
    } catch (e) {
      return href;
    }
  }

  /** Уход на trustpilot.com* без заголовка Referer (копия → оригинал). */
  function isTrustpilotOutboundHostname(host) {
    if (!host || typeof host !== 'string') return false;
    host = host.toLowerCase();
    return host === 'trustpilot.com' || host.endsWith('.trustpilot.com');
  }

  function applyNoReferrerForTrustpilotOutboundLinks() {
    document.querySelectorAll('a[href]').forEach(function (a) {
      if (a.closest('#spliff-reviews-pagination-host')) return;
      if (a.closest('#spliff-reviews-toolbar')) return;
      if (a.closest('#spliff-filter-modal-overlay')) return;
      if (a.closest('#spliff-basierend-review-modal')) return;
      if (a.closest('#spliff-tp-badge-modal')) return;
      var href = a.getAttribute('href') || '';
      if (!href || href === '#') return;
      try {
        var u = new URL(href, window.location.href);
        if (u.protocol !== 'http:' && u.protocol !== 'https:') return;
        if (isTrustpilotOutboundHostname(u.hostname)) {
          a.setAttribute('referrerpolicy', 'no-referrer');
        }
      } catch (e) {}
    });
  }

  /** Полный текст блока «Bewertungsübersicht» (KI-Zusammenfassung) после «Mehr ansehen». */
  const BEWERTUNG_OVERVIEW_FULL_TEXT =
    'Rezensenten hatten eine großartige Erfahrung mit diesem Unternehmen. Kunden loben die Qualität der Produkte als hervorragend und gleichbleibend gut. Viele sind beeindruckt von der schnellen und zuverlässigen Lieferung sowie dem exzellenten Kundenservice, insbesondere der freundlichen und kompetenten Unterstützung durch das Personal.\n\n' +
    'Einige Kunden äußerten sich jedoch kritisch bezüglich der Produktwirkung, wobei einige Produkte als wirkungslos empfunden wurden. Zudem gab es vereinzelt Probleme mit der Bearbeitung von Bestellungen und dem Versand, wobei Sendungen nicht ankamen oder es zu Lieferverzögerungen kam, oft in Verbindung mit dem Logistikpartner.';

  function getCompanyLogoUrl() {
    if (typeof window.__spliffCompanyLogo === 'string') return window.__spliffCompanyLogo;
    var img = document.querySelector('div[class*="businessInfoColumnTop"] section picture img, div[class*="businessInfoColumnTop"] section img');
    if (img && img.src) return img.src;
    try {
      var script = document.getElementById('__NEXT_DATA__');
      if (script && script.textContent) {
        var data = JSON.parse(script.textContent);
        var url = data?.props?.pageProps?.businessUnit?.profileImageUrl;
        if (url) return url.startsWith('//') ? 'https:' + url : url;
      }
    } catch (e) {}
    return COMPANY_LOGO_FALLBACK;
  }

  function getAvatarColor(name) {
    const n = (name || '').split('').reduce((a,c)=>a+c.charCodeAt(0),0);
    return AVATAR_COLORS[n % AVATAR_COLORS.length];
  }

  function getInitials(name) {
    return (name || '??').split(/\s+/).map(s=>s[0]).join('').toUpperCase().slice(0,2);
  }

  function formatDate(iso) {
    if (!iso) return '';
    const d = new Date(iso);
    return d.toLocaleDateString('de-DE', { year:'numeric', month:'long', day:'numeric' });
  }

  function extractUserIdFromImage(url) {
    if (!url) return '';
    var m = url.match(/\/([a-f0-9]{24})\/(?:73x73|64x64)/i) || url.match(/\/([a-f0-9]{24})\//);
    return m ? m[1] : '';
  }

  /** Те же правила, что в tools/apply_review_text_replacements.py (текст отзыва и ответ компании). */
  function normalizeReviewCopy(s) {
    if (typeof s !== 'string' || !s) return s;
    var out = s;
    var k1 =
      'Außerdem möchte ich daran erinnern, dass CBD in erster Linie eine entspannende und keine psychoaktive Wirkung hat. Wenn Sie eine stärkere Alternative bevorzugen, empfehlen wir Ihnen unsere THCX-Produktreihe.';
    var k1to =
      'Außerdem möchte ich darauf hinweisen, dass die spürbare Wirkung je nach Sorte, Zubereitung und Dosierung stark variieren kann. Wenn Sie eine intensivere Wirkung anstreben, empfehlen wir Ihnen unsere höher dosierten THC-Sorten oder die Magic-Vape-Linie.';
    var k2 =
      'Nehme unter ärztlicher Aufsicht und Empfehlung eine Kombi von 2 Medikamente und CBD und THC.';
    var k2to =
      'Nehme unter ärztlicher Aufsicht und Empfehlung eine Kombi aus verschreibungspflichtigen Medikamenten und THC.';
    if (out.indexOf(k1) >= 0) out = out.split(k1).join(k1to);
    if (out.indexOf(k2) >= 0) out = out.split(k2).join(k2to);
    out = out.split('info@spliff.fr').join('info@oneshop.de');
    out = out.split('spliff.fr').join('oneshop.de');
    out = out.split('Spliffsupport').join('One Shop Support');
    out = out.split('Spliffstore').join('One Shop Store');
    out = out.replace(/spliffstore\.de/gi, '__SPLIFFSTORE_DE__');
    out = out.replace(/spliffstore/gi, 'One Shop Store');
    out = out.split('__SPLIFFSTORE_DE__').join('spliffstore.de');
    out = out.split('Spliff-Team').join('One Shop Team');
    out = out.split('Spliff-team').join('One Shop team');
    out = out.split('spliff-team').join('One Shop team');
    out = out.split('SPLIFF').join('One Shop');
    out = out.split('Spliff').join('One Shop');
    out = out.split('spliff').join('One Shop');
    out = out.replace(/thc\s*[-\u2013]?\s*x/gi, 'THC');
    out = out.replace(/\bTHCX\b/g, 'THC');
    out = out.replace(/\bTHCx\b/g, 'THC');
    out = out.replace(/\bthcx\b/gi, 'THC');
    out = out.replace(/\bTHCa\b/g, 'THC');
    out = out.replace(/\bTHCA\b/g, 'THC');
    out = out.replace(/\bthca\b/gi, 'THC');
    out = out.replace(/\bcbd\b/gi, 'THC');
    out = out.replace(/\bTHA\b/g, 'THC');
    out = out.replace(/\bCBG\b/gi, 'THC');
    out = out.replace(/\bCBN\b/gi, 'THC');
    out = out.replace(/\bHHC\b/gi, 'THC');
    out = out.replace(/Die THC Alternative "THC"/gi, 'Das THC-Gras');
    out = out.replace(new RegExp('Die THC Alternative \u201ETHC\u201C', 'gi'), 'Das THC-Gras');
    out = out.replace(/\bTHC und THC\b/g, 'THC');
    out = out.replace(/\bTHC,\s*THC\b/g, 'THC');
    return out;
  }

  function renderReviewCard(r) {
    const initials = getInitials(r.consumerName);
    const color = getAvatarColor(r.consumerName);
    const imgSrc = r.consumerImageUrl || '';
    const userHref = r.consumerProfileUrl || (extractUserIdFromImage(r.consumerImageUrl) ? 'https://de.trustpilot.com/users/' + extractUserIdFromImage(r.consumerImageUrl) : '#');
    const avatarHtml = imgSrc
      ? '<div class="CDS_Avatar_imageWrapper__dd7fc3" style="width:44px;height:44px;min-width:44px;min-height:44px" data-testid="consumer-avatar"><img alt="" data-consumer-avatar-image="true" loading="lazy" width="44" height="44" decoding="async" data-nimg="1" style="color:transparent" src="'+imgSrc+'"/></div>'
      : '<div class="CDS_Avatar_avatar__dd7fc3 CDS_Avatar_'+color+'__dd7fc3" style="width:44px;min-width:44px;height:44px;min-height:44px" data-testid="consumer-avatar"><span class="CDS_Typography_appearance-default__68c681 CDS_Typography_prettyStyle__68c681 CDS_Typography_heading-xs__68c681 CDS_Avatar_avatarName__dd7fc3">'+initials+'</span></div>';
    const starsUrl = STARS_SVG + r.rating + '.svg';
    var replyHtml = '';
    if (r.companyReply && r.companyReply.text) {
      const replyText = normalizeReviewCopy(r.companyReply.text || '').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/\n/g,'<br/>');
      const replyDateStr = formatDate(r.companyReply.date);
      const logoUrl = getCompanyLogoUrl();
      const logoImg = '<img src="'+logoUrl+'" alt="One Shop" style="height:32px;max-width:80px;object-fit:contain;flex-shrink:0" loading="lazy"/>';
      replyHtml = '<div class="CDS_Card_card__146e7a CDS_Card_borderRadius-m__146e7a styles_wrapper__WD_1K" style="margin-top:16px;padding:16px;background:transparent;border-radius:8px;border-left:3px solid #e5e5e5"><div class="styles_content__eJmhl"><div class="styles_replyHeader__zKV_w" style="display:flex;align-items:center;gap:12px;margin-bottom:12px">'+logoImg+'<div class="styles_replyInfo__41_in"><p class="CDS_Typography_appearance-default__68c681 CDS_Typography_prettyStyle__68c681 CDS_Typography_body-m__68c681 CDS_Typography_weight-heavy__68c681 styles_replyCompany__DgFhD">Antwort von One Shop</p><time dateTime="'+(r.companyReply.date||'')+'" class="CDS_Typography_appearance-default__68c681 CDS_Typography_prettyStyle__68c681 CDS_Typography_body-s__68c681">'+replyDateStr+'</time></div></div><p class="CDS_Typography_appearance-default__68c681 CDS_Typography_prettyStyle__68c681 CDS_Typography_body-m__68c681 styles_message__jAzYB">'+replyText+'</p></div></div>';
    } else if (r.hasReply) {
      replyHtml = '<div class="styles_companyReply__WrkCW" style="margin-top:8px"><svg xmlns="http://www.w3.org/2000/svg" width="14" height="13" viewBox="0 0 14 13" fill="none"><path d="M1 1V1C1 7.07513 5.92574 12 12.0009 12C12.3442 12 12.6783 12 13 12" stroke="#E5E5DD" stroke-width="2" stroke-linecap="round"></path></svg><p class="CDS_Typography_appearance-subtle__68c681 CDS_Typography_prettyStyle__68c681 CDS_Typography_body-m__68c681">Unternehmen hat geantwortet</p></div>';
    }
    const badgeText = r.isVerified ? 'Verifiziert' : 'Bewertung ohne vorherige Einladung';
    const text = normalizeReviewCopy(r.text || '').replace(/</g,'&lt;').replace(/>/g,'&gt;');
    const title = normalizeReviewCopy(r.title || '').replace(/</g,'&lt;').replace(/>/g,'&gt;');
    const dateStr = formatDate(r.date);
    const reviewHref = r.reviewUrl || ('https://de.trustpilot.com/reviews/' + (r.id || ''));
    const isExternal = (userHref !== '#' && userHref.startsWith('http'));
    const userLinkAttrs = isExternal ? ' rel="noopener noreferrer" target="_blank"' : '';
    const reviewLinkAttrs = ' rel="noopener noreferrer" target="_blank"';
    return '<div class="styles_cardWrapper__g8amG styles_show__Z8n7u"><article class="CDS_Card_card__146e7a styles_reviewCard__Qwhpy" data-service-review-card-paper="true" data-review-id="'+(r.id||'')+'"><div data-testid="service-review-card-v2"><div class="styles_reviewCardInnerHeader__8Xqy8"><aside class="styles_consumerInfoWrapper__6HN5O" aria-label="Infos zu '+r.consumerName+'"><div class="styles_consumerDetailsWrapper__4eZod">'+avatarHtml+'<a data-cpl="true" href="'+userHref+'" rel="nofollow" name="consumer-profile"'+userLinkAttrs+' class="link_internal__Eam_b link_wrapper__ahpyq styles_consumerDetails__POC79" data-consumer-profile-link="true"><span class="CDS_Typography_appearance-default__68c681 CDS_Typography_prettyStyle__68c681 CDS_Typography_heading-xs__68c681 styles_consumerName__xKr9c" data-consumer-name-typography="true">'+r.consumerName+'</span><div class="styles_consumerExtraDetails__NY6RP" data-consumer-reviews-count="1"><span class="CDS_Typography_appearance-subtle__68c681 CDS_Typography_prettyStyle__68c681 CDS_Typography_body-m__68c681" data-consumer-country-typography="true">DE</span><span class="CDS_Typography_appearance-subtle__68c681 CDS_Typography_prettyStyle__68c681 CDS_Typography_body-xs__68c681" data-lil-dot-typography="true">•</span><span class="CDS_Typography_appearance-subtle__68c681 CDS_Typography_prettyStyle__68c681 CDS_Typography_body-m__68c681" data-consumer-reviews-count-typography="true">1 Bewertung</span></div></a></div></aside><div class="CDS_Typography_appearance-subtle__68c681 CDS_Typography_prettyStyle__68c681 CDS_Typography_body-m__68c681 styles_datesWrapper__jszhG"><time data-cpl="true" dateTime="'+(r.date||'')+'" class="" data-service-review-date-time-ago="true">'+dateStr+'</time></div></div><section class="styles_reviewContentwrapper__K2aRu" aria-disabled="false"><div class="styles_reviewHeader__DzoAZ" data-service-review-rating="'+r.rating+'"><img class="CDS_StarRating_starRating__614d2e" alt="Bewertet mit '+r.rating+' von 5 Sternen" width="108px" src="'+starsUrl+'"/></div><div class="styles_reviewContent__tuXiN" aria-hidden="false" data-review-content="true"><a class="CDS_Typography_appearance-inherit__68c681 CDS_Typography_prettyStyle__68c681 CDS_Link_link__0e2efd CDS_Link_noUnderline__0e2efd" href="'+reviewHref+'" rel="nofollow"'+reviewLinkAttrs+' data-review-title-typography="true"><h2 class="CDS_Typography_appearance-default__68c681 CDS_Typography_prettyStyle__68c681 CDS_Typography_heading-xs__68c681" data-service-review-title-typography="true">'+title+'</h2></a><p class="CDS_Typography_appearance-default__68c681 CDS_Typography_prettyStyle__68c681 CDS_Typography_body-l__68c681" data-service-review-text-typography="true">'+text+'</p><div class="styles_reviewBadges__Rmr_i"><div class="styles_badgesContainer__4pZPJ"><div class="CDS_Badge_badge__083901 CDS_Badge_s__083901 CDS_Badge_variant-subtle__083901 CDS_Badge_type-default__083901" data-testid="review-badge-date"><span class="CDS_Typography_appearance-inherit__68c681 CDS_Typography_prettyStyle__68c681 CDS_Typography_body-s__68c681 CDS_Typography_disableResponsiveSizing__68c681 CDS_Badge_badgeText__083901">'+dateStr+'</span></div><div class="CDS_Badge_badge__083901 CDS_Badge_s__083901 CDS_Badge_variant-subtle__083901 CDS_Badge_type-default__083901" data-testid="'+(r.isVerified?'review-badge-verified':'review-badge-unprompted')+'"><span class="CDS_Typography_appearance-inherit__68c681 CDS_Typography_prettyStyle__68c681 CDS_Typography_body-s__68c681 CDS_Typography_disableResponsiveSizing__68c681 CDS_Badge_badgeText__083901">'+badgeText+'</span></div></div></div>'+replyHtml+'<div class="styles_reviewActionsControl__5YwE_"></div></div></section></div></article></div>';
  }

  /** Номера страниц + многоточие между разрывами (как на Trustpilot) */
  function pagesToRender(page, totalPages) {
    var set = {};
    set[1] = true;
    set[totalPages] = true;
    for (var i = page - 2; i <= page + 2; i++) {
      if (i >= 1 && i <= totalPages) set[i] = true;
    }
    var nums = Object.keys(set)
      .map(Number)
      .sort(function (a, b) {
        return a - b;
      });
    var out = [];
    for (var j = 0; j < nums.length; j++) {
      if (j > 0 && nums[j] - nums[j - 1] > 1) out.push('ellipsis');
      out.push(nums[j]);
    }
    return out;
  }

  /**
   * Только <button> — не <a class="link_internal__">, иначе Next/Trustpilot ведёт на de.trustpilot.com.
   * Десктоп: сегменты Zurück | 1 2 3 … | Nächste Seite
   * Мобильная: Zurück | Nächste Seite
   */
  function renderTrustpilotPagination(page, totalPages) {
    if (totalPages <= 1) return '';
    var canPrev = page > 1;
    var canNext = page < totalPages;
    var pagesArr = pagesToRender(page, totalPages);
    var desk = [];
    desk.push(
      '<nav data-spliff-pagination="desktop" class="spliff-tp-pag-desktop spliff-tp-segmented" aria-label="Pagination" role="navigation">'
    );
    desk.push(
      '<button type="button" data-spliff-pager="prev" class="spliff-tp-seg spliff-tp-seg-prev' +
        (canPrev ? '' : ' spliff-tp-seg-disabled') +
        '"' +
        (canPrev ? '' : ' disabled') +
        '>Zurück</button>'
    );
    for (var k = 0; k < pagesArr.length; k++) {
      var item = pagesArr[k];
      if (item === 'ellipsis') {
        desk.push(
          '<span class="spliff-tp-seg spliff-tp-seg-ellipsis" aria-hidden="true">…</span>'
        );
      } else {
        var active = item === page;
        desk.push(
          '<button type="button" data-spliff-page="' +
            item +
            '" class="spliff-tp-seg spliff-tp-seg-num' +
            (active ? ' spliff-tp-seg-active' : '') +
            '"' +
            (active ? ' aria-current="page"' : '') +
            (active ? ' disabled' : '') +
            '>' +
            item +
            '</button>'
        );
      }
    }
    desk.push(
      '<button type="button" data-spliff-pager="next" class="spliff-tp-seg spliff-tp-seg-next' +
        (canNext ? '' : ' spliff-tp-seg-disabled') +
        '"' +
        (canNext ? '' : ' disabled') +
        '>Nächste Seite</button>'
    );
    desk.push('</nav>');

    var mob = [];
    mob.push(
      '<nav data-spliff-pagination="mobile" class="spliff-tp-pag-mobile" aria-label="Pagination" role="navigation">'
    );
    mob.push(
      '<button type="button" data-spliff-pager="prev" class="spliff-tp-mob-btn spliff-tp-mob-prev' +
        (canPrev ? '' : ' spliff-tp-mob-disabled') +
        '"' +
        (canPrev ? '' : ' disabled') +
        '>Zurück</button>'
    );
    mob.push(
      '<button type="button" data-spliff-pager="next" class="spliff-tp-mob-btn spliff-tp-mob-next' +
        (canNext ? '' : ' spliff-tp-mob-disabled') +
        '"' +
        (canNext ? '' : ' disabled') +
        '>Nächste Seite</button>'
    );
    mob.push('</nav>');

    return desk.join('') + mob.join('');
  }

  function getPageFromUrl() {
    try {
      var p = parseInt(new URLSearchParams(location.search).get('page'), 10);
      return (p >= 1 && !isNaN(p)) ? p : 1;
    } catch (e) { return 1; }
  }

  function getReviewsUrl() {
    var path = location.pathname.replace(/\/[^/]*$/, '/');
    return location.origin + path + 'reviews.json?v=' + REVIEWS_JSON_CACHE_PARAM;
  }

  /** Убрать однозвёздочные карточки только из статичного HTML (карусель), не из списка JSON. */
  function removeStaticOneStarReviewCards() {
    document.querySelectorAll('article[data-service-review-card-paper="true"]').forEach(function (art) {
      if (art.closest('#spliff-reviews-list-root')) return;
      var img1 =
        art.querySelector('img[alt*="Bewertet mit 1 von"]') ||
        art.querySelector('img[alt*="Rated 1 out of"]') ||
        art.querySelector('img[src*="stars-1."]');
      if (img1) art.remove();
    });
  }

  /** data-star-rating на строках распределения (сайдбар / основной блок) */
  var STAR_RATING_ATTR_TO_NUM = { five: 5, four: 4, three: 3, two: 2, one: 1 };

  function normalizeStarNumber(x) {
    var n = parseInt(x, 10);
    if (isNaN(n) || n < 1 || n > 5) return NaN;
    return n;
  }

  /** Теги «Top-Erwähnungen» — совпадение подстроки в title/text (без учёта регистра) */
  var MENTION_TAGS = [
    'Produkt', 'Lieferung', 'Bestellung', 'Qualität', 'Empfehlung',
    'Dienstleistung', 'Kundenservice', 'Preis', 'Kundenkommunikation', 'Spam'
  ];

  function defaultFilterSlice() {
    return {
      stars: [],
      verifiedOnly: false,
      withReplyOnly: false,
      datePreset: 'all',
      mentions: []
    };
  }

  var filterState = defaultFilterSlice();
  var modalPending = defaultFilterSlice();
  var searchQuery = '';
  var sortKey = 'newest';

  function cloneFilter(f) {
    return {
      stars: f.stars.slice(),
      verifiedOnly: f.verifiedOnly,
      withReplyOnly: f.withReplyOnly,
      datePreset: f.datePreset,
      mentions: f.mentions.slice()
    };
  }

  function reviewSearchBlob(r) {
    return ((r.title || '') + ' ' + (r.text || '') + ' ' + (r.consumerName || '')).toLowerCase();
  }

  function reviewMatchesDatePreset(r, preset) {
    if (preset === 'all' || !r.date) return true;
    var t = new Date(r.date).getTime();
    if (isNaN(t)) return true;
    var ms = Date.now() - t;
    var day = 86400000;
    if (preset === '30d') return ms <= 30 * day;
    if (preset === '3m') return ms <= 92 * day;
    if (preset === '6m') return ms <= 183 * day;
    if (preset === '12m') return ms <= 366 * day;
    return true;
  }

  function reviewHasReply(r) {
    return !!(r.hasReply || (r.companyReply && r.companyReply.text));
  }

  function applyFiltersToReviews(raw, state, q) {
    var query = (q || '').trim().toLowerCase();
    return raw.filter(function (r) {
      if (query && reviewSearchBlob(r).indexOf(query) === -1) return false;
      if (state.stars.length) {
        var rr = normalizeStarNumber(r.rating);
        if (isNaN(rr)) return false;
        var starOk = false;
        for (var si = 0; si < state.stars.length; si++) {
          if (normalizeStarNumber(state.stars[si]) === rr) {
            starOk = true;
            break;
          }
        }
        if (!starOk) return false;
      }
      if (state.verifiedOnly && !r.isVerified) return false;
      if (state.withReplyOnly && !reviewHasReply(r)) return false;
      if (!reviewMatchesDatePreset(r, state.datePreset)) return false;
      if (state.mentions.length) {
        var blob = ((r.title || '') + ' ' + (r.text || '')).toLowerCase();
        var ok = false;
        for (var mi = 0; mi < state.mentions.length; mi++) {
          if (blob.indexOf(state.mentions[mi].toLowerCase()) !== -1) {
            ok = true;
            break;
          }
        }
        if (!ok) return false;
      }
      return true;
    });
  }

  function applySortToReviews(arr, key) {
    var out = arr.slice();
    if (key === 'oldest') {
      out.sort(function (a, b) {
        return new Date(a.date || 0) - new Date(b.date || 0);
      });
    } else if (key === 'rating_desc') {
      out.sort(function (a, b) {
        return (b.rating || 0) - (a.rating || 0);
      });
    } else if (key === 'rating_asc') {
      out.sort(function (a, b) {
        return (a.rating || 0) - (b.rating || 0);
      });
    } else {
      out.sort(function (a, b) {
        return new Date(b.date || 0) - new Date(a.date || 0);
      });
    }
    return out;
  }

  function countForFilterState(state) {
    var raw = window.__spliffReviewsRaw;
    if (!raw) return 0;
    return applyFiltersToReviews(raw, state, searchQuery).length;
  }

  function escapeHtml(s) {
    return String(s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
  }

  function escapeAttr(s) {
    return String(s).replace(/"/g, '&quot;');
  }

  /** Верхняя карточка TrustScore / распределение звёзд — только прокрутка к отзывам, без фильтров и чекбоксов */
  function isHeaderRatingDistributionCard(el) {
    return !!(el && el.closest && el.closest('div[class*="styles_ratingDistributionCard"]'));
  }

  /**
   * Баннер с дисклеймером Trustpilot над блоком отзывов («Unternehmen auf Trustpilot dürfen keine…»).
   */
  function findReviewsDisclaimerBanner() {
    var sections = document.querySelectorAll('section[class*="CDS_BannerAlert_"]');
    var needle = 'Unternehmen auf Trustpilot';
    for (var i = 0; i < sections.length; i++) {
      var s = sections[i];
      var t = s.textContent || '';
      if (t.indexOf(needle) !== -1) return s;
    }
    return null;
  }

  /** Доп. отступ сверху: баннер дисклеймера чуть ниже в окне (виден контент над ним). */
  var REVIEWS_DISCLAIMER_SCROLL_EXTRA_PX = 96;

  /** Прокрутка к зоне отзывов: сначала к дисклеймеру сверху, иначе к списку. */
  function scrollToReviewsSection() {
    var banner = findReviewsDisclaimerBanner();
    if (banner) {
      var y =
        banner.getBoundingClientRect().top +
        window.pageYOffset -
        REVIEWS_DISCLAIMER_SCROLL_EXTRA_PX;
      window.scrollTo({ top: Math.max(0, y), behavior: 'smooth' });
      return;
    }
    var el = document.getElementById('spliff-reviews-list-root');
    if (!el) {
      var sec = document.querySelector('section[class*="reviewListContainer"]');
      if (sec) el = sec;
    }
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  /**
   * Клик по карточке распределения оценок (сайдбар) и по компактному TrustScore в шапке.
   * Кнопка модалки «Wie wird der TrustScore…» и обычные ссылки не трогаем.
   */
  function bindTrustScoreScrollToReviews() {
    if (window.__spliffTrustScoreScrollBound) return;
    window.__spliffTrustScoreScrollBound = true;
    document.addEventListener(
      'click',
      function (e) {
        var t = e.target;
        if (!t || !t.closest) return;
        var card = t.closest('div[class*="styles_ratingDistributionCard"]');
        var ratingComp = t.closest('div[data-rating-component="true"]');
        if (!card && !ratingComp) return;
        if (card && t.closest('button')) return;
        if (ratingComp && t.closest('button')) return;
        if (card && t.closest('a[href]')) return;
        if (ratingComp && t.closest('a[href]')) return;
        e.preventDefault();
        e.stopPropagation();
        scrollToReviewsSection();
      },
      true
    );
    document.addEventListener(
      'keydown',
      function (e) {
        if (e.key !== 'Enter' && e.key !== ' ') return;
        var t = e.target;
        if (!t || !t.closest) return;
        var card = t.closest('div[class*="styles_ratingDistributionCard"]');
        var ratingComp = t.closest('div[data-rating-component="true"]');
        if (!card && !ratingComp) return;
        if (card && t.closest('button')) return;
        if (ratingComp && t.closest('button')) return;
        if (card && t.closest('a[href]')) return;
        if (ratingComp && t.closest('a[href]')) return;
        e.preventDefault();
        scrollToReviewsSection();
      },
      true
    );
  }

  /** Кнопка «Alle N Bewertungen ansehen» — прокрутка к блоку отзывов */
  function bindSeeAllReviewsScroll() {
    if (window.__spliffSeeAllReviewsScrollBound) return;
    window.__spliffSeeAllReviewsScrollBound = true;
    function handleSeeAll(e) {
      var t = e.target;
      if (!t || !t.closest) return;
      var btn = t.closest('[data-see-all-reviews-button="true"]');
      if (!btn) return;
      e.preventDefault();
      e.stopPropagation();
      if (e.stopImmediatePropagation) e.stopImmediatePropagation();
      scrollToReviewsSection();
    }
    document.addEventListener('click', handleSeeAll, true);
    document.addEventListener(
      'keydown',
      function (e) {
        if (e.key !== 'Enter' && e.key !== ' ') return;
        var t = e.target;
        if (!t || !t.closest) return;
        if (!t.closest('[data-see-all-reviews-button="true"]')) return;
        e.preventDefault();
        e.stopPropagation();
        if (e.stopImmediatePropagation) e.stopImmediatePropagation();
        scrollToReviewsSection();
      },
      true
    );
  }

  /**
   * Строки «5 Sterne» … в сайдбаре и на странице: фильтр по звёздам.
   * Делегирование на document (capture), иначе Next/React сбрасывает onclick на узлах.
   * Регистрируется после bindTrustScoreScrollToReviews. Строки в styles_ratingDistributionCard не фильтруем — там только прокрутка к отзывам.
   */
  function bindStarDistributionDocumentCapture() {
    if (window.__spliffStarDocCaptureBound) return;
    window.__spliffStarDocCaptureBound = true;
    document.addEventListener(
      'change',
      function (e) {
        var t = e.target;
        if (!t || t.type !== 'checkbox') return;
        if (t.closest('#spliff-filter-modal-overlay')) return;
        if (t.id === 'spliff-fm-verified' || t.id === 'spliff-fm-reply') return;
        var starEl = t.closest('[data-star-rating]');
        if (!starEl) return;
        if (isHeaderRatingDistributionCard(starEl)) return;
        var attr = starEl.getAttribute('data-star-rating');
        var num = STAR_RATING_ATTR_TO_NUM[attr];
        if (!num) return;
        var rf = window.__spliffReviewsRender;
        if (typeof rf !== 'function') return;
        syncStarFilterFromCheckbox(t, num, rf);
        setTimeout(function () {
          scrollToReviewsSection();
        }, 80);
      },
      true
    );
    document.addEventListener(
      'click',
      function (e) {
        var t = e.target;
        if (!t || !t.closest) return;
        var starEl = t.closest('[data-star-rating]');
        if (!starEl) return;
        if (isHeaderRatingDistributionCard(starEl)) return;
        var attr = starEl.getAttribute('data-star-rating');
        var num = STAR_RATING_ATTR_TO_NUM[attr];
        if (!num) return;
        if (isStarRowClickOnCheckboxControl(starEl, t)) return;
        e.preventDefault();
        e.stopPropagation();
        if (e.stopImmediatePropagation) e.stopImmediatePropagation();
        var rf = window.__spliffReviewsRender;
        if (typeof rf !== 'function') return;
        toggleStarRatingFilter(num, rf);
        setTimeout(function () {
          scrollToReviewsSection();
        }, 80);
      },
      true
    );
    document.addEventListener(
      'keydown',
      function (e) {
        if (e.key !== 'Enter' && e.key !== ' ') return;
        var t = e.target;
        if (!t || !t.closest) return;
        var starEl = t.closest('[data-star-rating]');
        if (!starEl) return;
        if (isHeaderRatingDistributionCard(starEl)) return;
        var attr = starEl.getAttribute('data-star-rating');
        var num = STAR_RATING_ATTR_TO_NUM[attr];
        if (!num) return;
        e.preventDefault();
        e.stopPropagation();
        if (e.stopImmediatePropagation) e.stopImmediatePropagation();
        var rf = window.__spliffReviewsRender;
        if (typeof rf !== 'function') return;
        toggleStarRatingFilter(num, rf);
        setTimeout(function () {
          scrollToReviewsSection();
        }, 80);
      },
      true
    );
  }

  /** Блок «Das haben sich andere Leute angesehen» — карусель похожих компаний */
  function findSimilarBusinessesSection() {
    return document.querySelector('[data-business-unit-about-section="true"]');
  }

  function findSimilarBusinessesCarouselEl(section) {
    return section ? section.querySelector('div[class*="styles_carouselContainer__"]') : null;
  }

  var similarBizDisabledBtnClass = '';

  function captureSimilarBizDisabledBtnClass() {
    if (similarBizDisabledBtnClass) return;
    var b = document.querySelector(
      '[data-business-unit-about-section="true"] button[data-scroll-back-button][disabled]'
    );
    if (b) {
      similarBizDisabledBtnClass =
        Array.from(b.classList).find(function (c) {
          return c.indexOf('CDS_Button_disabled__') === 0;
        }) || '';
    }
    if (!similarBizDisabledBtnClass) similarBizDisabledBtnClass = 'CDS_Button_disabled__7e7b1d';
  }

  function setSimilarCarouselBtnDisabled(btn, disabled) {
    if (!btn) return;
    captureSimilarBizDisabledBtnClass();
    btn.disabled = disabled;
    if (disabled) btn.classList.add(similarBizDisabledBtnClass);
    else btn.classList.remove(similarBizDisabledBtnClass);
  }

  /** За один клик показываем следующие/предыдущие 4 компании (как ряд на десктопе). */
  var SIMILAR_CAROUSEL_STEP_COUNT = 4;

  function getSimilarCarouselStepPx(carousel) {
    var col = carousel.querySelector('div[class*="styles_column__"]');
    var gap = 16;
    try {
      var st = window.getComputedStyle(carousel);
      gap = parseFloat(st.columnGap || st.gap) || 16;
    } catch (err) {}
    var n = SIMILAR_CAROUSEL_STEP_COUNT;
    if (col && col.offsetWidth) {
      return Math.round(n * col.offsetWidth + (n - 1) * gap);
    }
    return Math.round(Math.max(200, carousel.clientWidth * 0.85));
  }

  function syncSimilarBusinessesCarouselNav(carousel) {
    var section = carousel.closest('[data-business-unit-about-section="true"]');
    if (!section) return;
    var back = section.querySelector('button[data-scroll-back-button="true"]');
    var fwd = section.querySelector('button[data-scroll-forward-button="true"]');
    if (!back || !fwd) return;
    var maxScroll = Math.max(0, carousel.scrollWidth - carousel.clientWidth - 2);
    var sl = carousel.scrollLeft;
    setSimilarCarouselBtnDisabled(back, sl <= 2);
    setSimilarCarouselBtnDisabled(fwd, sl >= maxScroll - 2);
  }

  function wireSimilarBusinessesCarouselEl(carousel) {
    if (!carousel || carousel.dataset.spliffSimilarCarouselWired === '1') return;
    carousel.dataset.spliffSimilarCarouselWired = '1';
    carousel.addEventListener('scroll', function () {
      if (carousel.spliffSimilarScrollRaf) return;
      carousel.spliffSimilarScrollRaf = requestAnimationFrame(function () {
        carousel.spliffSimilarScrollRaf = 0;
        syncSimilarBusinessesCarouselNav(carousel);
      });
    });
    syncSimilarBusinessesCarouselNav(carousel);
  }

  function wireAllSimilarBusinessesCarousels() {
    document.querySelectorAll('[data-business-unit-about-section="true"]').forEach(function (sec) {
      var c = findSimilarBusinessesCarouselEl(sec);
      if (c) wireSimilarBusinessesCarouselEl(c);
    });
  }

  /** Горизонтальная полоса внутри styles_carouselWrapper__ (отзывы / темы). */
  function getCarouselWrapperHorizontalStepPx(scrollEl) {
    if (scrollEl && scrollEl.clientWidth) {
      return Math.round(scrollEl.clientWidth * 0.92);
    }
    return 320;
  }

  function syncCarouselWrapperScrollNav(scrollEl) {
    var wrap = scrollEl.closest('div[class*="styles_carouselWrapper__"]');
    if (!wrap) return;
    var back = wrap.querySelector('button[data-scroll-back-button="true"]');
    var fwd = wrap.querySelector('button[data-scroll-forward-button="true"]');
    var maxScroll = Math.max(0, scrollEl.scrollWidth - scrollEl.clientWidth - 2);
    var sl = scrollEl.scrollLeft;
    if (back) setSimilarCarouselBtnDisabled(back, sl <= 2);
    if (fwd) setSimilarCarouselBtnDisabled(fwd, sl >= maxScroll - 2);
  }

  function wireCarouselWrapperHorizontalEl(scrollEl) {
    if (!scrollEl || scrollEl.dataset.spliffTpCarouselWired === '1') return;
    scrollEl.dataset.spliffTpCarouselWired = '1';
    scrollEl.addEventListener('scroll', function () {
      if (scrollEl.spliffTpCarouselRaf) return;
      scrollEl.spliffTpCarouselRaf = requestAnimationFrame(function () {
        scrollEl.spliffTpCarouselRaf = 0;
        syncCarouselWrapperScrollNav(scrollEl);
      });
    });
    syncCarouselWrapperScrollNav(scrollEl);
  }

  function wireAllCarouselWrapperHorizontal() {
    document
      .querySelectorAll(
        'div[class*="styles_reviewSummarySection__"],div[class*="styles_topicSummarySection__"]'
      )
      .forEach(function (el) {
        wireCarouselWrapperHorizontalEl(el);
      });
  }

  /**
   * Статичные карусели Trustpilot без React: похожие компании, «Was am häufigsten genannt wird»,
   * «Basierend auf diesen Bewertungen».
   */
  function bindSimilarBusinessesCarousel() {
    if (window.__spliffSimilarBusinessesCarouselBound) return;
    window.__spliffSimilarBusinessesCarouselBound = true;
    document.addEventListener(
      'click',
      function (e) {
        var t = e.target;
        if (!t || !t.closest) return;
        var btn = t.closest(
          'button[data-scroll-forward-button="true"],button[data-scroll-back-button="true"]'
        );
        if (!btn) return;

        var bizSection = btn.closest('[data-business-unit-about-section="true"]');
        if (bizSection) {
          var carousel = findSimilarBusinessesCarouselEl(bizSection);
          if (!carousel) return;
          e.preventDefault();
          e.stopPropagation();
          if (e.stopImmediatePropagation) e.stopImmediatePropagation();
          var step = getSimilarCarouselStepPx(carousel);
          var dir = btn.hasAttribute('data-scroll-forward-button') ? 1 : -1;
          carousel.scrollBy({ left: dir * step, behavior: 'smooth' });
          setTimeout(function () {
            syncSimilarBusinessesCarouselNav(carousel);
          }, 550);
          return;
        }

        var wrap = btn.closest('div[class*="styles_carouselWrapper__"]');
        if (!wrap) return;
        var horizScroll =
          wrap.querySelector('div[class*="styles_reviewSummarySection__"]') ||
          wrap.querySelector('div[class*="styles_topicSummarySection__"]');
        if (!horizScroll) return;
        e.preventDefault();
        e.stopPropagation();
        if (e.stopImmediatePropagation) e.stopImmediatePropagation();
        var stepH = getCarouselWrapperHorizontalStepPx(horizScroll);
        var dirH = btn.hasAttribute('data-scroll-forward-button') ? 1 : -1;
        horizScroll.scrollBy({ left: dirH * stepH, behavior: 'smooth' });
        setTimeout(function () {
          syncCarouselWrapperScrollNav(horizScroll);
        }, 450);
      },
      true
    );
    wireAllSimilarBusinessesCarousels();
    wireAllCarouselWrapperHorizontal();
    [100, 500, 1500, 3500].forEach(function (ms) {
      setTimeout(function () {
        wireAllSimilarBusinessesCarousels();
        wireAllCarouselWrapperHorizontal();
      }, ms);
    });
  }

  function findReviewDataForBasierendCard(article) {
    var raw = window.__spliffReviewsRaw;
    if (!raw || !raw.length) return null;
    var link = article.querySelector('a[data-consumer-profile-link="true"]');
    var href = (link && link.getAttribute('href')) || '';
    var m = href.match(/\/users\/([a-f0-9]{24})/i);
    if (!m) return null;
    var uid = m[1];
    var timeEl = article.querySelector('time[datetime]');
    var iso = timeEl ? timeEl.getAttribute('datetime') || '' : '';
    var cand = [];
    for (var i = 0; i < raw.length; i++) {
      var r = raw[i];
      var pu = r.consumerProfileUrl || '';
      if (pu.indexOf(uid) === -1) continue;
      cand.push(r);
    }
    if (cand.length === 0) return null;
    if (cand.length === 1) return cand[0];
    if (iso) {
      var iso10 = iso.length >= 10 ? iso.slice(0, 10) : '';
      var best = null;
      var bestDiff = Infinity;
      for (var j = 0; j < cand.length; j++) {
        var d = cand[j].date || '';
        if (d === iso) return cand[j];
        if (iso10 && d.length >= 10 && d.slice(0, 10) === iso10) return cand[j];
        if (iso10 && d.length >= 10) {
          var diff = Math.abs(new Date(iso).getTime() - new Date(d).getTime());
          if (!isNaN(diff) && diff < bestDiff) {
            bestDiff = diff;
            best = cand[j];
          }
        }
      }
      if (best) return best;
    }
    return cand[0];
  }

  function escapeHtmlBasierend(s) {
    return String(s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function closeBasierendReviewModal() {
    var ov = document.getElementById('spliff-basierend-review-modal');
    if (!ov) return;
    ov.classList.remove('spliff-open');
    ov.setAttribute('aria-hidden', 'true');
    document.body.classList.remove('spliff-basierend-modal-open');
  }

  function ensureBasierendReviewModal() {
    if (document.getElementById('spliff-basierend-review-modal')) return;
    var ov = document.createElement('div');
    ov.id = 'spliff-basierend-review-modal';
    ov.className = 'spliff-basierend-modal';
    ov.setAttribute('aria-hidden', 'true');
    ov.innerHTML =
      '<div class="spliff-basierend-modal-backdrop" data-spliff-basierend-close tabindex="-1"></div>' +
      '<div class="spliff-basierend-modal-panel" role="dialog" aria-modal="true" aria-labelledby="spliff-basierend-modal-title">' +
      '<button type="button" class="spliff-basierend-modal-x" data-spliff-basierend-close aria-label="Schließen">&times;</button>' +
      '<div class="spliff-basierend-modal-headrow">' +
      '<div class="spliff-basierend-modal-avatar" id="spliff-basierend-modal-avatar"></div>' +
      '<div class="spliff-basierend-modal-user">' +
      '<div class="spliff-basierend-modal-name" id="spliff-basierend-modal-name"></div>' +
      '<div class="spliff-basierend-modal-sub" id="spliff-basierend-modal-sub"></div>' +
      '</div></div>' +
      '<div class="spliff-basierend-modal-starsrow">' +
      '<img class="spliff-basierend-modal-stars" id="spliff-basierend-modal-stars" width="108" height="20" alt=""/>' +
      '<time class="spliff-basierend-modal-dateline" id="spliff-basierend-modal-dateline"></time>' +
      '</div>' +
      '<h2 class="spliff-basierend-modal-title" id="spliff-basierend-modal-title"></h2>' +
      '<div class="spliff-basierend-modal-body" id="spliff-basierend-modal-body"></div>' +
      '<div class="spliff-basierend-modal-badges" id="spliff-basierend-modal-badges"></div>' +
      '</div></div>';
    document.body.appendChild(ov);
    ov.addEventListener('click', function (e) {
      if (e.target.closest('[data-spliff-basierend-close]')) closeBasierendReviewModal();
    });
  }

  function getBasierendConsumerSubline(article) {
    var wrap = article.querySelector('[data-consumer-reviews-count]');
    var n = wrap ? String(wrap.getAttribute('data-consumer-reviews-count') || '1').trim() : '';
    if (!n) {
      var subTxt = article.querySelector('div[class*="styles_consumerExtraDetails__"]');
      if (subTxt) {
        var t = (subTxt.textContent || '').replace(/\s+/g, ' ').trim();
        if (t) return t;
      }
      n = '1';
    }
    var num = parseInt(n, 10);
    if (isNaN(num) || num < 1) num = 1;
    return 'DE • ' + num + ' Bewertung' + (num === 1 ? '' : 'en');
  }

  function openBasierendReviewModal(article) {
    ensureBasierendReviewModal();
    var rv = findReviewDataForBasierendCard(article);
    var avSlot = document.getElementById('spliff-basierend-modal-avatar');
    avSlot.innerHTML = '';
    var avSrc = article.querySelector('[data-testid="consumer-avatar"]');
    if (avSrc) avSlot.appendChild(avSrc.cloneNode(true));

    var nameEl = article.querySelector('[data-consumer-name-typography="true"]');
    document.getElementById('spliff-basierend-modal-name').textContent = nameEl
      ? nameEl.textContent.trim()
      : '—';
    document.getElementById('spliff-basierend-modal-sub').textContent = getBasierendConsumerSubline(article);

    var rating = 5;
    var starImg = article.querySelector('img[src*="stars-"]');
    if (starImg) {
      var alt = starImg.getAttribute('alt') || '';
      var ma = alt.match(/mit (\d) von/i);
      if (ma) rating = parseInt(ma[1], 10);
      else {
        var src = starImg.getAttribute('src') || '';
        var ms = src.match(/stars-(\d)\.svg/i);
        if (ms) rating = parseInt(ms[1], 10);
      }
    }
    if (rv && rv.rating != null) {
      var pr = parseInt(rv.rating, 10);
      if (!isNaN(pr)) rating = pr;
    }

    var starsEl = document.getElementById('spliff-basierend-modal-stars');
    starsEl.src = STARS_SVG + rating + '.svg';
    starsEl.setAttribute('alt', 'Bewertet mit ' + rating + ' von 5 Sternen');

    var dateIso = '';
    if (rv && rv.date) dateIso = rv.date;
    else {
      var te = article.querySelector('time[datetime]');
      dateIso = te ? te.getAttribute('datetime') || '' : '';
    }
    var dateline = document.getElementById('spliff-basierend-modal-dateline');
    dateline.textContent = dateIso ? formatDate(dateIso) : '';
    if (dateIso) dateline.setAttribute('datetime', dateIso);
    else dateline.removeAttribute('datetime');

    var title = rv && rv.title ? normalizeReviewCopy(rv.title) : '';
    document.getElementById('spliff-basierend-modal-title').textContent = title || '';

    var text = '';
    if (rv && rv.text) text = normalizeReviewCopy(rv.text);
    else {
      var p = article.querySelector('[data-relevant-review-text-typography="true"]');
      if (!p) p = article.querySelector('div[class*="styles_reviewText__"] p');
      text = (p && p.textContent ? p.textContent : '')
        .replace(/\s*Mehr ansehen\s*$/i, '')
        .trim();
    }
    var paras = text.split(/\n+/).filter(function (x) {
      return x.trim();
    });
    document.getElementById('spliff-basierend-modal-body').innerHTML = paras
      .map(function (line) {
        return (
          '<p class="spliff-basierend-modal-p">' +
          escapeHtmlBasierend(line.trim()) +
          '</p>'
        );
      })
      .join('');

    var badge = rv && rv.isVerified ? 'Verifizierte Bewertung' : 'Bewertung ohne vorherige Einladung';
    var badgeDate = dateIso ? formatDate(dateIso) : '';
    document.getElementById('spliff-basierend-modal-badges').innerHTML =
      (badgeDate
        ? '<span class="spliff-basierend-badge-date">' + escapeHtmlBasierend(badgeDate) + '</span>'
        : '') +
      '<span class="spliff-basierend-badge-pill">' + escapeHtmlBasierend(badge) + '</span>';

    var ov = document.getElementById('spliff-basierend-review-modal');
    ov.classList.add('spliff-open');
    ov.setAttribute('aria-hidden', 'false');
    document.body.classList.add('spliff-basierend-modal-open');
  }

  function bindBasierendSeeMoreModal() {
    if (window.__spliffBasierendModalBound) return;
    window.__spliffBasierendModalBound = true;
    document.addEventListener(
      'click',
      function (e) {
        var t = e.target;
        if (t && t.nodeType === 3) t = t.parentElement;
        if (!t || !t.closest) return;
        var textWrap = t.closest('div[class*="styles_reviewText__"]');
        if (!textWrap) return;
        var article = textWrap.closest('article[class*="styles_carouselReviewCard__"]');
        if (!article) return;
        if (!article.closest('div[class*="styles_reviewSummarySection__"]')) return;
        if (t.closest('a[href]')) return;
        e.preventDefault();
        e.stopPropagation();
        if (e.stopImmediatePropagation) e.stopImmediatePropagation();
        openBasierendReviewModal(article);
      },
      true
    );
    document.addEventListener(
      'keydown',
      function (e) {
        if (e.key !== 'Escape') return;
        var ov = document.getElementById('spliff-basierend-review-modal');
        if (!ov || !ov.classList.contains('spliff-open')) return;
        e.stopPropagation();
        closeBasierendReviewModal();
      },
      true
    );
  }

  function bindBewertungsuebersichtExpand() {
    if (window.__spliffBewertungsuebersichtBound) return;
    window.__spliffBewertungsuebersichtBound = true;
    var backupMap = window.__spliffOverviewCollapsedBackup || (window.__spliffOverviewCollapsedBackup = new WeakMap());
    document.addEventListener(
      'click',
      function (e) {
        var t = e.target;
        if (t && t.nodeType === 3) t = t.parentElement;
        if (!t || !t.closest) return;
        var btn = t.closest('button[data-toggle-text-truncation-button="true"]');
        if (!btn) return;
        var summary = btn.closest('div[class*="styles_summaryContainer__"]');
        if (!summary) return;
        var p = btn.closest('p[class*="styles_expandableText__"]');
        if (!p || !summary.contains(p)) return;
        e.preventDefault();
        e.stopPropagation();
        if (e.stopImmediatePropagation) e.stopImmediatePropagation();

        if (p.getAttribute('data-spliff-overview-expanded') === 'true') {
          var bak = backupMap.get(p);
          if (bak != null) p.innerHTML = bak;
          backupMap.delete(p);
          p.removeAttribute('data-spliff-overview-expanded');
          return;
        }

        backupMap.set(p, p.innerHTML);
        p.setAttribute('data-spliff-overview-expanded', 'true');
        var fullRaw = normalizeReviewCopy(BEWERTUNG_OVERVIEW_FULL_TEXT);
        var fullEsc = escapeHtmlBasierend(fullRaw).replace(/\r\n/g, '\n').split('\n').join('<br/>');
        p.innerHTML =
          '<span class="spliff-bewertung-overview-full">' +
          fullEsc +
          '</span>' +
          '<button class="CDS_Typography_appearance-action__68c681 CDS_Typography_prettyStyle__68c681 CDS_Link_link__0e2efd styles_readMore__sWM_1 CDS_Link_asButton__0e2efd CDS_Link_buttonInherit__0e2efd CDS_Link_noUnderline__0e2efd" data-testid="toggle-text-truncation-button" data-toggle-text-truncation-button="true" type="button">Weniger anzeigen</button>';
      },
      true
    );
  }

  function findReviewListWrapper() {
    var section = document.querySelector('section[class*="reviewListContainer"]');
    if (!section) {
      var article = document.querySelector('article[data-service-review-card-paper="true"], article[class*="reviewCard"]');
      if (article) section = article.closest('section') || article.closest('div[class*="mainContent"]') || article.parentElement;
    }
    if (!section) section = document.querySelector('main') || document.querySelector('div[class*="mainContent"]') || document.querySelector('[class*="carousel"]')?.parentElement;
    if (!section) return null;
    var wrapper = section.querySelector('div[class*="styles_wrapper"]');
    return wrapper || section;
  }

  /** Старая версия скрипта: nav с «Seite X von Y» — убрать, если осталось из кэша / двойного запуска */
  function removeObsoleteSpliffPagination() {
    document.querySelectorAll('nav[aria-label="Seitennavigation"]').forEach(function (n) {
      n.remove();
    });
    document.querySelectorAll('nav.styles_pagination__VxdH_').forEach(function (n) {
      n.remove();
    });
    document.querySelectorAll('.styles_paginationInfo__VxdH_').forEach(function (el) {
      var nav = el.closest('nav');
      if (nav) nav.remove();
    });
  }

  /**
   * Второй блок пагинации — нативный Trustpilot (Next) после гидрации.
   * Оставляем только nav внутри #spliff-reviews-pagination-host.
   */
  function removeStrayReviewPaginationNavs() {
    var section = document.querySelector('section[class*="reviewListContainer"]');
    if (!section) return;
    var host = document.getElementById('spliff-reviews-pagination-host');
    section.querySelectorAll("nav").forEach(function (nav) {
      if (host && host.contains(nav)) return;
      nav.remove();
    });
    section.querySelectorAll('[role="navigation"]').forEach(function (el) {
      if (host && host.contains(el)) return;
      var cls = el.getAttribute("class") || "";
      if (cls.indexOf("pagination") !== -1) el.remove();
    });
    var hosts = section.querySelectorAll("#spliff-reviews-pagination-host");
    for (var i = 1; i < hosts.length; i++) {
      hosts[i].remove();
    }
  }

  function injectStyles() {
    if (document.getElementById('spliff-reviews-styles')) return;
    var s = document.createElement('style');
    s.id = 'spliff-reviews-styles';
    s.textContent =
      'section[class*="styles_filterSection__"]{display:none !important}' +
      'section[class*="styles_filterSection__"]+hr{display:none !important}' +
      'div[class*="styles_ratingDistributionCard"] div[class*="rating-distribution-row_row__"][data-star-rating]{cursor:pointer;touch-action:manipulation}' +
      'div[class*="rating-distribution-row_row__"][data-star-rating]{display:flex;flex-direction:row;align-items:center;gap:10px;cursor:pointer;border-radius:8px;touch-action:manipulation;position:relative;isolation:isolate}' +
      'div[class*="rating-distribution-row_row__"][data-star-rating] [class*="rating-distribution-row_bar__"]{flex:1;min-width:0}' +
      'div[class*="rating-distribution-row_row__"][data-star-rating] input[type=checkbox]:not([data-spliff-star-cb]){' +
      'pointer-events:auto!important;z-index:5;cursor:pointer;accent-color:#204ce5}' +
      'div[class*="rating-distribution-row_row__"][data-star-rating] label:has(>input[type=checkbox]:not([data-spliff-star-cb])){' +
      'pointer-events:auto!important;position:relative;z-index:5;cursor:pointer;align-self:center;line-height:1}' +
      'input.spliff-star-cb[data-spliff-star-cb]{' +
      'position:relative;width:20px;height:20px;min-width:20px;min-height:20px;margin:0!important;flex-shrink:0;' +
      'accent-color:#204ce5;cursor:pointer;pointer-events:auto!important;box-sizing:border-box;vertical-align:middle}' +
      'label.spliff-star-cb-wrap{display:inline-flex;align-items:center;justify-content:center;flex-shrink:0;' +
      'padding:8px;margin:-8px 6px -8px -8px;cursor:pointer;box-sizing:content-box;pointer-events:auto!important;' +
      'line-height:0;align-self:center}' +
      '#spliff-reviews-toolbar.spliff-reviews-toolbar{max-width:720px;margin:0 auto 24px;padding:0 4px;font-family:inherit}' +
      '.spliff-tb-search-row{position:relative;margin-bottom:16px}' +
      '.spliff-tb-search-icon{position:absolute;left:16px;top:50%;transform:translateY(-50%);width:18px;height:18px;opacity:.45;pointer-events:none}' +
      '.spliff-tb-search{width:100%;box-sizing:border-box;padding:12px 16px 12px 44px;border:1px solid #d4d4d8;border-radius:999px;font:inherit;font-size:15px;background:#fff}' +
      '.spliff-tb-search:focus{outline:2px solid #204ce5;outline-offset:1px;border-color:#b8c9f0}' +
      '.spliff-tb-row2{display:flex;flex-wrap:wrap;gap:10px;align-items:center;margin-bottom:20px}' +
      '.spliff-tb-pill{border:1px solid #d4d4d8;border-radius:999px;background:#fff;padding:10px 16px;font:inherit;font-size:14px;cursor:pointer;display:inline-flex;align-items:center;gap:8px;color:#1a1a1a}' +
      '.spliff-tb-pill:hover{background:#f7f7f8}' +
      '.spliff-tb-pill.spliff-active{border-color:#204ce5;background:#e8f2fc;color:#0d3d99}' +
      '.spliff-tb-sort-wrap{position:relative;display:inline-flex;align-items:center;border:1px solid #d4d4d8;border-radius:999px;background:#fff;padding:0 12px}' +
      '.spliff-tb-sort-wrap select{appearance:none;border:none;background:transparent;font:inherit;font-size:14px;padding:10px 28px 10px 4px;cursor:pointer;color:#1a1a1a}' +
      '.spliff-tb-sort-chev{position:absolute;right:10px;top:50%;transform:translateY(-50%);width:10px;height:10px;opacity:.5;pointer-events:none}' +
      '.spliff-tb-top-title{font-size:16px;font-weight:600;margin:0 0 12px;color:#1a1a1a}' +
      '.spliff-tb-tags{display:flex;flex-wrap:wrap;gap:8px}' +
      '.spliff-tb-tag{border:1px solid #d4d4d8;border-radius:999px;background:#fff;padding:8px 14px;font:inherit;font-size:13px;cursor:pointer;color:#1a1a1a}' +
      '.spliff-tb-tag:hover{background:#f7f7f8}' +
      '.spliff-tb-tag.spliff-active{border-color:#204ce5;background:#e8f2fc;color:#0d3d99}' +
      '#spliff-filter-modal-overlay{position:fixed;inset:0;z-index:2147483000;display:none;justify-content:flex-end;align-items:stretch}' +
      '#spliff-filter-modal-overlay.spliff-open{display:flex}' +
      '.spliff-filter-backdrop{position:absolute;inset:0;background:rgba(15,17,20,.45);opacity:0;transition:opacity .22s ease;-webkit-tap-highlight-color:transparent}' +
      '#spliff-filter-modal-overlay.spliff-open .spliff-filter-backdrop{opacity:1}' +
      '.spliff-filter-panel{position:relative;z-index:1;display:flex;flex-direction:column;height:100%;max-height:100%;width:min(420px,max(300px,34vw));background:#fff;box-shadow:-8px 0 40px rgba(0,0,0,.14);border-radius:12px 0 0 12px;transform:translate3d(100%,0,0);transition:transform .28s cubic-bezier(.4,0,.2,1);overflow:hidden;box-sizing:border-box;-webkit-tap-highlight-color:transparent;touch-action:manipulation}' +
      '#spliff-filter-modal-overlay.spliff-open .spliff-filter-panel{transform:translate3d(0,0,0)}' +
      '@media (max-width:767px){' +
      '#spliff-filter-modal-overlay{align-items:flex-end;justify-content:center}' +
      '.spliff-filter-panel{width:100%;max-width:100%;height:90vh;height:90dvh;max-height:90vh;max-height:90dvh;border-radius:16px 16px 0 0;box-shadow:0 -8px 32px rgba(0,0,0,.16);transform:translate3d(0,105%,0)}' +
      '#spliff-filter-modal-overlay.spliff-open .spliff-filter-panel{transform:translate3d(0,0,0)}' +
      '.spliff-fm-foot{flex-direction:column;align-items:stretch;gap:10px;padding:12px 16px calc(16px + env(safe-area-inset-bottom,0px))}' +
      '.spliff-fm-reset{padding:4px 0}' +
      '.spliff-fm-apply{width:100%;flex:none;max-width:none;padding:14px 16px;font-size:15px}' +
      '.spliff-filter-panel-body{padding:8px 16px 12px}' +
      '.spliff-fm-head{padding:16px 16px 14px}' +
      '}' +
      '.spliff-filter-panel-body{flex:1;min-height:0;overflow-y:auto;overflow-x:hidden;-webkit-overflow-scrolling:touch;padding:8px 20px 16px;overscroll-behavior:contain}' +
      '.spliff-fm-head{display:flex;align-items:center;justify-content:space-between;flex-shrink:0;padding:20px 20px 16px;border-bottom:1px solid #e8e8ec;background:#fff}' +
      '.spliff-fm-title{font-size:18px;font-weight:600;margin:0;color:#1a1a1a}' +
      'body.spliff-filter-drawer-open{overflow:hidden;position:relative}' +
      'body.spliff-tp-mobile-nav-open{overflow:hidden}' +
      '.spliff-fm-close{display:flex;align-items:center;justify-content:center;width:40px;height:40px;border-radius:50%;border:1px solid #204ce5;background:#fff;cursor:pointer;font-size:22px;line-height:1;color:#1a1a1a;flex-shrink:0}' +
      '.spliff-fm-close:hover{background:#f5f5f7}' +
      '.spliff-fm-sec{margin-bottom:20px}' +
      '.spliff-fm-label{font-size:14px;font-weight:600;margin:0 0 10px;color:#1a1a1a}' +
      '.spliff-fm-stars{display:flex;flex-wrap:wrap;gap:8px}' +
      '.spliff-fm-star{border:1px solid #d4d4d8;border-radius:8px;padding:8px 12px;background:#fff;font:inherit;font-size:14px;cursor:pointer}' +
      '.spliff-fm-star.spliff-active{border-color:#204ce5;background:#e8f2fc;color:#0d3d99}' +
      '.spliff-fm-check{margin-bottom:14px}' +
      '.spliff-fm-check label{display:flex;align-items:flex-start;gap:10px;cursor:pointer;font-size:14px;color:#1a1a1a}' +
      '.spliff-fm-check input{margin-top:3px}' +
      '.spliff-fm-hint{font-size:12px;color:#6b6b7a;margin:4px 0 0 24px;line-height:1.4}' +
      '.spliff-fm-date label{display:flex;align-items:center;gap:10px;padding:8px 0;font-size:14px;cursor:pointer;color:#1a1a1a}' +
      '.spliff-fm-date input{accent-color:#204ce5}' +
      '.spliff-fm-badge{font-size:10px;background:#e8e8ec;color:#5c5c66;padding:2px 6px;border-radius:4px;margin-left:6px;vertical-align:middle}' +
      '.spliff-fm-tags{display:flex;flex-wrap:wrap;gap:8px}' +
      '.spliff-fm-tag{border:1px solid #d4d4d8;border-radius:999px;background:#fff;padding:8px 12px;font:inherit;font-size:13px;cursor:pointer}' +
      '.spliff-fm-tag.spliff-active{border-color:#204ce5;background:#e8f2fc}' +
      '.spliff-fm-foot{display:flex;flex-direction:row;align-items:center;justify-content:space-between;gap:12px;flex-shrink:0;padding:16px 20px calc(20px + env(safe-area-inset-bottom,0px));margin:0;border-top:1px solid #e8e8ec;background:#fff;box-shadow:0 -1px 0 rgba(0,0,0,.04)}' +
      '.spliff-fm-reset{background:none;border:none;padding:8px 0;font:inherit;font-size:14px;color:#204ce5;text-decoration:underline;cursor:pointer;text-align:left;white-space:nowrap}' +
      '.spliff-fm-apply{flex:0 1 auto;width:auto;max-width:100%;border:none;border-radius:12px;background:#204ce5;color:#fff;font:inherit;font-size:14px;font-weight:600;padding:12px 20px;cursor:pointer;white-space:nowrap}' +
      '.spliff-fm-apply:hover{background:#183a9e}' +
      'div[class*="styles_ratingDistributionCard"]{cursor:pointer}' +
      '#spliff-reviews-list-root .styles_cardWrapper__g8amG{margin-bottom:40px}' +
      '#spliff-reviews-list-root .styles_cardWrapper__g8amG:last-of-type{margin-bottom:16px}' +
      '#spliff-reviews-pagination-host{width:100%;max-width:720px;margin-left:auto;margin-right:auto}' +
      '.spliff-tp-segmented{display:none;align-items:stretch;margin-top:32px;border:1px solid #d4d4d8;border-radius:8px;overflow:hidden;background:#fff;font-family:inherit;font-size:15px;line-height:1.3}' +
      '.spliff-tp-seg{margin:0;padding:12px 14px;border:none;border-right:1px solid #d4d4d8;background:#fff;color:#1a1a1a;cursor:pointer;font:inherit;min-width:44px;box-sizing:border-box}' +
      '.spliff-tp-segmented .spliff-tp-seg:last-child{border-right:0}' +
      '.spliff-tp-seg-prev,.spliff-tp-seg-next{white-space:nowrap}' +
      '.spliff-tp-seg-next{flex:1.2;text-align:center;color:#204ce5;font-weight:500}' +
      '.spliff-tp-seg-next.spliff-tp-seg-disabled,.spliff-tp-seg-prev.spliff-tp-seg-disabled{color:#b0b0b8;cursor:not-allowed}' +
      '.spliff-tp-seg-num.spliff-tp-seg-active{background:#e8f2fc;color:#204ce5;font-weight:600;cursor:default}' +
      '.spliff-tp-seg-num:not(.spliff-tp-seg-active):hover{background:#f5f5f7}' +
      '.spliff-tp-seg-ellipsis{display:flex;align-items:center;justify-content:center;padding:12px 8px;border-right:1px solid #d4d4d8;color:#1a1a1a;user-select:none}' +
      '.spliff-tp-pag-mobile{display:none;flex-direction:row;gap:0;margin-top:28px;width:100%;max-width:100%;border:1px solid #d4d4d8;border-radius:8px;overflow:hidden;background:#fff}' +
      '.spliff-tp-mob-btn{flex:1;margin:0;padding:14px 12px;border:none;border-right:1px solid #d4d4d8;background:#fff;font:inherit;font-size:15px;cursor:pointer;box-sizing:border-box}' +
      '.spliff-tp-pag-mobile .spliff-tp-mob-btn:last-child{border-right:0}' +
      '.spliff-tp-mob-prev{color:#9a9aa8;font-weight:500}' +
      '.spliff-tp-mob-prev:not(.spliff-tp-mob-disabled){color:#1a1a1a}' +
      '.spliff-tp-mob-next{color:#204ce5;font-weight:500;border-color:#c5d4f5}' +
      '.spliff-tp-mob-disabled{opacity:.55;cursor:not-allowed}' +
      '@media (min-width:768px){' +
      '[data-spliff-pagination="mobile"]{display:none !important;}' +
      '.spliff-tp-segmented{display:flex !important;}' +
      '}' +
      '@media (max-width:767px){' +
      '.spliff-tp-segmented{display:none !important;}' +
      '[data-spliff-pagination="mobile"]{display:flex !important;}' +
      '}' +
      '#spliff-basierend-review-modal{position:fixed;inset:0;z-index:2147483010;display:none;align-items:center;justify-content:center;padding:24px 16px;box-sizing:border-box;font-family:inherit}' +
      '#spliff-basierend-review-modal.spliff-open{display:flex}' +
      'body.spliff-basierend-modal-open{overflow:hidden}' +
      '.spliff-basierend-modal-backdrop{position:absolute;inset:0;background:rgba(15,17,20,.55);cursor:pointer}' +
      '.spliff-basierend-modal-panel{position:relative;z-index:1;width:100%;max-width:560px;max-height:min(90vh,720px);overflow-y:auto;background:#fff;border-radius:12px;box-shadow:0 16px 48px rgba(0,0,0,.2);padding:24px 24px 20px;box-sizing:border-box;-webkit-overflow-scrolling:touch}' +
      '.spliff-basierend-modal-x{position:absolute;top:12px;right:12px;width:40px;height:40px;border:none;border-radius:50%;background:transparent;cursor:pointer;font-size:28px;line-height:1;color:#1a1a1a;opacity:.65;display:flex;align-items:center;justify-content:center}' +
      '.spliff-basierend-modal-x:hover{opacity:1;background:#f3f3f5}' +
      '.spliff-basierend-modal-headrow{display:flex;align-items:flex-start;gap:12px;margin-bottom:16px;padding-right:36px}' +
      '.spliff-basierend-modal-avatar{flex-shrink:0}' +
      '.spliff-basierend-modal-avatar [data-testid="consumer-avatar"]{width:44px!important;height:44px!important;min-width:44px!important;min-height:44px!important}' +
      '.spliff-basierend-modal-name{font-size:16px;font-weight:600;color:#1a1a1a;line-height:1.3}' +
      '.spliff-basierend-modal-sub{font-size:14px;color:#6c6c85;margin-top:4px}' +
      '.spliff-basierend-modal-starsrow{display:flex;align-items:center;justify-content:space-between;gap:12px;margin-bottom:12px;flex-wrap:wrap}' +
      '.spliff-basierend-modal-stars{height:auto;display:block}' +
      '.spliff-basierend-modal-dateline{font-size:14px;color:#6c6c85}' +
      '.spliff-basierend-modal-title{font-size:18px;font-weight:600;margin:0 0 12px;color:#1a1a1a;line-height:1.35}' +
      '.spliff-basierend-modal-body{margin-bottom:16px}' +
      '.spliff-basierend-modal-p{font-size:15px;line-height:1.55;color:#1a1a1a;margin:0 0 12px}' +
      '.spliff-basierend-modal-p:last-child{margin-bottom:0}' +
      '.spliff-basierend-modal-badges{display:flex;flex-wrap:wrap;align-items:center;gap:10px;margin-bottom:0}' +
      '.spliff-basierend-badge-date{font-size:13px;color:#6c6c85}' +
      '.spliff-basierend-badge-pill{font-size:12px;padding:4px 10px;border-radius:999px;background:#e8e8ec;color:#5c5c66}' +
      'div[class*="styles_reviewSummarySection__"] article[class*="styles_carouselReviewCard__"] div[class*="styles_reviewText__"]{cursor:pointer}' +
      'p[class*="styles_expandableText__"] .spliff-bewertung-overview-full{display:block;margin:0;white-space:normal}' +
      '#spliff-tp-badge-modal{position:fixed;inset:0;z-index:2147483020;display:none;font-family:inherit;-webkit-tap-highlight-color:transparent}' +
      '#spliff-tp-badge-modal.spliff-open{display:block}' +
      'body.spliff-tp-badge-modal-open{overflow:hidden}' +
      '.spliff-tp-badge-backdrop{position:absolute;inset:0;background:rgba(15,17,20,.4);cursor:pointer}' +
      '.spliff-tp-badge-positioner{position:fixed;left:0;top:0;z-index:1;pointer-events:none;box-sizing:border-box}' +
      '.spliff-tp-badge-positioner>*{pointer-events:auto}' +
      '.spliff-tp-badge-arrow{position:absolute;top:-7px;left:20px;width:14px;height:14px;background:#fff;transform:rotate(45deg);border-left:1px solid rgba(0,0,0,.07);border-top:1px solid rgba(0,0,0,.07);z-index:0;box-sizing:border-box}' +
      '.spliff-tp-badge-positioner.spliff-tp-badge--flip .spliff-tp-badge-arrow{top:auto;bottom:-7px;border-left:none;border-top:none;border-right:1px solid rgba(0,0,0,.07);border-bottom:1px solid rgba(0,0,0,.07)}' +
      '.spliff-tp-badge-panel{position:relative;z-index:1;background:#fff;border-radius:12px;box-shadow:0 8px 32px rgba(0,0,0,.18);max-height:min(82vh,620px);overflow-y:auto;-webkit-overflow-scrolling:touch;width:100%;padding:24px 22px 20px;box-sizing:border-box}' +
      '#spliff-tp-badge-modal .spliff-tp-badge-close{position:absolute;top:8px;right:8px;width:40px;height:40px;border-radius:50%;border:1px solid #204ce5;background:#fff;cursor:pointer;font-size:22px;line-height:1;color:#1a1a1a;display:flex;align-items:center;justify-content:center;padding:0;margin:0;z-index:2;-webkit-appearance:none;appearance:none;-webkit-tap-highlight-color:transparent;outline:none!important;outline-width:0!important;outline-offset:0!important;box-shadow:none!important}' +
      '#spliff-tp-badge-modal .spliff-tp-badge-close::-moz-focus-inner{border:0!important;padding:0!important}' +
      '#spliff-tp-badge-modal .spliff-tp-badge-close:hover{background:#f0f4fd}' +
      '#spliff-tp-badge-modal .spliff-tp-badge-close:focus,#spliff-tp-badge-modal .spliff-tp-badge-close:focus-visible,#spliff-tp-badge-modal .spliff-tp-badge-close:active{outline:none!important;outline-width:0!important;outline-offset:0!important;box-shadow:none!important}' +
      '.spliff-tp-badge-inner{padding-right:8px}' +
      '.spliff-tp-badge-lead{font-size:15px;line-height:1.55;color:#1a1a1a;margin:0 0 0}' +
      '.spliff-tp-badge-divider{border:none;border-top:1px solid #e8e8ec;margin:20px 0}' +
      '.spliff-tp-badge-h3{font-size:16px;font-weight:600;margin:0 0 8px;color:#1a1a1a}' +
      '.spliff-tp-badge-sub{font-size:14px;line-height:1.5;color:#5c5c66;margin:0 0 16px}' +
      '.spliff-tp-badge-list{list-style:none;margin:0;padding:0}' +
      '.spliff-tp-badge-list li{display:flex;align-items:flex-start;gap:12px;font-size:14px;line-height:1.45;color:#1a1a1a;margin-bottom:14px}' +
      '.spliff-tp-badge-list li:last-child{margin-bottom:0}' +
      '.spliff-tp-badge-ic{display:inline-flex;width:20px;height:20px;min-width:20px;border-radius:50%;align-items:center;justify-content:center;flex-shrink:0;font-size:11px;font-weight:700;line-height:1;margin-top:1px}' +
      '.spliff-tp-badge-ic--ok{background:#00b67a;color:#fff}' +
      '.spliff-tp-badge-ic--muted{background:#c8c8d0;color:#fff}' +
      '.spliff-tp-badge-inner a{color:#204ce5;text-decoration:underline}' +
      '.spliff-tp-badge-inner a:hover{color:#183a9e}' +
      '@media (max-width:640px){' +
      '.spliff-tp-badge-positioner{left:0!important;top:0!important;right:0!important;bottom:0!important;width:auto!important;display:flex;align-items:flex-start;justify-content:center;padding:16px;padding-bottom:max(16px,env(safe-area-inset-bottom,0px));box-sizing:border-box}' +
      '.spliff-tp-badge-arrow{display:none!important}' +
      '.spliff-tp-badge-panel{max-width:440px;width:100%;max-height:min(88vh,640px);margin-top:0}' +
      '}';
    (document.head || document.documentElement).appendChild(s);
  }

  function fixTrustpilotLinks() {
    var links = document.querySelectorAll('a[href]');
    for (var i = 0; i < links.length; i++) {
      var a = links[i];
      if (a.closest('#spliff-reviews-pagination-host')) continue;
      if (a.closest('#spliff-reviews-toolbar')) continue;
      if (a.closest('#spliff-filter-modal-overlay')) continue;
      if (a.closest('#spliff-basierend-review-modal')) continue;
      if (a.closest('#spliff-tp-badge-modal')) continue;
      var h = a.getAttribute('href') || '';
      if (h.startsWith('/') && !h.startsWith('//')) {
        if (h.startsWith('/users/') || h.startsWith('/reviews/') || h.startsWith('/evaluate/') || h.startsWith('/categories/') || h.startsWith('/review/')) {
          a.href = TP_BASE + h;
          a.setAttribute('target', '_blank');
          a.setAttribute('rel', 'noopener noreferrer');
        }
      } else if ((h.indexOf('spliff.fr') >= 0 || h === 'https://www.spliff.fr/' || h === 'https://spliff.fr') && h.indexOf('utm_medium') < 0) {
        a.href = h.indexOf('logo') >= 0 || a.closest('picture') || (a.querySelector && a.querySelector('img')) ? SPLIFF_LOGO : SPLIFF_DOMAIN;
      } else if (h.indexOf('oneshops.de') >= 0) {
        var ou = ensureOneshopsTrustpilotUtm(h);
        a.setAttribute('href', ou);
        a.href = ou;
      }
    }
  }

  function fixOneshopOutboundLinks() {
    var sel =
      'a[data-business-unit-header-profile-image-link="true"],' +
      'a[data-visit-website-button-link="true"],' +
      'a[data-navbar-visit-website-button-link="true"]';
    document.querySelectorAll(sel).forEach(function (a) {
      a.setAttribute('href', ONE_SHOP_WEBSITE);
      a.href = ONE_SHOP_WEBSITE;
    });
  }

  var TP_BADGE_PROFILE_INNER =
    '<p class="spliff-tp-badge-lead">Dieses Unternehmen hat sein Trustpilot-Profil beansprucht. Jedes Unternehmen kann sein Profil kostenlos beanspruchen, um auf Bewertungen zu antworten, Kunden zur Bewertungsabgabe einzuladen und mehr.</p>' +
    '<hr class="spliff-tp-badge-divider"/>' +
    '<h3 class="spliff-tp-badge-h3">Bestätigte Unternehmensinformationen</h3>' +
    '<p class="spliff-tp-badge-sub">Dieses Unternehmen hat sich entschieden, bestimmte Informationen zu seinem Unternehmen auf Trustpilot zu bestätigen.</p>' +
    '<ul class="spliff-tp-badge-list">' +
    '<li><span class="spliff-tp-badge-ic spliff-tp-badge-ic--ok" aria-hidden="true">✓</span> Identitätsnachweis eines Nutzers dieses Accounts</li>' +
    '<li><span class="spliff-tp-badge-ic spliff-tp-badge-ic--muted" aria-hidden="true">−</span> Kontaktdaten</li>' +
    '<li><span class="spliff-tp-badge-ic spliff-tp-badge-ic--ok" aria-hidden="true">✓</span> Bankkonto</li>' +
    '</ul>';

  var TP_BADGE_SUBSCR_INNER =
    '<p class="spliff-tp-badge-lead">Ein kostenpflichtiges Trustpilot-Abonnement gibt Unternehmen Zugang zu wertvollen Einblicken in das Feedback ihrer Kunden, Tools, um das Sammeln von Bewertungen zu automatisieren, die Möglichkeit, Trustpilot-Brandingelemente in eigenen Marketingmaterialien zu verwenden sowie <a href="https://de.business.trustpilot.com/features" target="_blank" rel="noopener noreferrer">weitere nützliche Features</a>.</p>';

  function ensureTpBadgeModal() {
    if (document.getElementById('spliff-tp-badge-modal')) return;
    var root = document.createElement('div');
    root.id = 'spliff-tp-badge-modal';
    root.setAttribute('aria-hidden', 'true');
    root.innerHTML =
      '<div class="spliff-tp-badge-backdrop" data-spliff-tp-badge-close="1" tabindex="-1"></div>' +
      '<div class="spliff-tp-badge-positioner">' +
      '<div class="spliff-tp-badge-arrow" aria-hidden="true"></div>' +
      '<div class="spliff-tp-badge-panel" role="dialog" aria-modal="true" aria-labelledby="spliff-tp-badge-title">' +
      '<button type="button" class="spliff-tp-badge-close" data-spliff-tp-badge-close="1" aria-label="Schließen">×</button>' +
      '<div class="spliff-tp-badge-inner" id="spliff-tp-badge-inner"></div>' +
      '</div></div>';
    document.body.appendChild(root);
    var closeBtn = root.querySelector('.spliff-tp-badge-close');
    if (closeBtn) {
      closeBtn.addEventListener(
        'mousedown',
        function (e) {
          e.preventDefault();
        },
        true
      );
    }
    root.addEventListener(
      'click',
      function (e) {
        if (e.target.closest('[data-spliff-tp-badge-close]')) closeTpBadgeModal();
      },
      false
    );
  }

  function closeTpBadgeModal() {
    var root = document.getElementById('spliff-tp-badge-modal');
    if (!root) return;
    var panel = root.querySelector('.spliff-tp-badge-panel');
    if (panel) panel.style.maxHeight = '';
    root.classList.remove('spliff-open');
    root.setAttribute('aria-hidden', 'true');
    document.body.classList.remove('spliff-tp-badge-modal-open');
    window.__spliffTpBadgeTrigger = null;
  }

  function positionTpBadgePopover(trigger) {
    var root = document.getElementById('spliff-tp-badge-modal');
    if (!root || !trigger) return;
    var pos = root.querySelector('.spliff-tp-badge-positioner');
    var panel = root.querySelector('.spliff-tp-badge-panel');
    var arrow = root.querySelector('.spliff-tp-badge-arrow');
    if (!pos || !panel) return;
    pos.classList.remove('spliff-tp-badge--flip');
    panel.style.maxHeight = '';
    var gap = 16;
    var r = trigger.getBoundingClientRect();
    var mobile = window.matchMedia('(max-width: 640px)').matches;
    if (mobile) {
      pos.style.left = '';
      pos.style.top = '';
      pos.style.width = '';
      var padTop = Math.max(12, Math.floor(r.bottom + gap));
      pos.style.setProperty('padding-top', padTop + 'px', 'important');
      pos.style.setProperty('align-items', 'flex-start', 'important');
      pos.style.setProperty('justify-content', 'center', 'important');
      var availMob = window.innerHeight - padTop - 16 - (parseInt(getComputedStyle(pos).paddingBottom, 10) || 16);
      availMob = Math.max(160, availMob);
      panel.style.maxHeight = Math.min(window.innerHeight * 0.88, availMob) + 'px';
      return;
    }
    pos.style.removeProperty('padding-top');
    pos.style.removeProperty('align-items');
    pos.style.removeProperty('justify-content');
    var pw = Math.min(400, Math.max(300, panel.getBoundingClientRect().width || 400));
    pos.style.width = pw + 'px';
    var left = r.left + r.width / 2 - pw / 2;
    left = Math.max(12, Math.min(left, window.innerWidth - pw - 12));
    var top = r.bottom + gap;
    top = Math.max(12, top);
    pos.style.left = left + 'px';
    pos.style.top = top + 'px';
    var bottomMargin = 16;
    var availDesk = window.innerHeight - top - bottomMargin;
    availDesk = Math.max(140, availDesk);
    panel.style.maxHeight = Math.min(620, availDesk) + 'px';
    if (arrow) {
      var cx = r.left + r.width / 2;
      var al = cx - left - 7;
      al = Math.max(18, Math.min(al, pw - 32));
      arrow.style.left = al + 'px';
    }
  }

  function onResizeOrScrollTpBadge() {
    var m = document.getElementById('spliff-tp-badge-modal');
    if (!m || !m.classList.contains('spliff-open')) return;
    var tr = window.__spliffTpBadgeTrigger;
    if (tr && document.contains(tr)) positionTpBadgePopover(tr);
  }

  function openTpBadgeModal(kind, trigger) {
    ensureTpBadgeModal();
    var root = document.getElementById('spliff-tp-badge-modal');
    var inner = document.getElementById('spliff-tp-badge-inner');
    if (!root || !inner) return;
    inner.innerHTML =
      kind === 'profile' ? TP_BADGE_PROFILE_INNER : TP_BADGE_SUBSCR_INNER;
    var accTitle = document.createElement('h2');
    accTitle.id = 'spliff-tp-badge-title';
    accTitle.className = 'spliff-tp-badge-sr-only';
    accTitle.style.cssText =
      'position:absolute;width:1px;height:1px;padding:0;margin:-1px;overflow:hidden;clip:rect(0,0,0,0);white-space:nowrap;border:0';
    accTitle.textContent =
      kind === 'profile'
        ? 'Profil beansprucht'
        : 'Kostenpflichtiges Trustpilot-Abonnement';
    inner.insertBefore(accTitle, inner.firstChild);
    window.__spliffTpBadgeTrigger = trigger;
    root.classList.add('spliff-open');
    root.setAttribute('aria-hidden', 'false');
    document.body.classList.add('spliff-tp-badge-modal-open');
    fixTrustpilotLinks();
    applyNoReferrerForTrustpilotOutboundLinks();
    requestAnimationFrame(function () {
      requestAnimationFrame(function () {
        positionTpBadgePopover(trigger);
      });
    });
  }

  function attachTpBadgeClickHandlers() {
    document
      .querySelectorAll('button[type="button"][class*="styles_labelWrapper__"]')
      .forEach(function (btn) {
        if (btn.getAttribute('data-spliff-tp-badge-bound') === '1') return;
        var label = (btn.textContent || '').replace(/\s+/g, ' ').trim();
        var kind =
          label.indexOf('Profil beansprucht') !== -1
            ? 'profile'
            : label.indexOf('Kostenpflichtiges Trustpilot-Abonnement') !== -1
              ? 'subscription'
              : null;
        if (!kind) return;
        btn.setAttribute('data-spliff-tp-badge-bound', '1');
        btn.addEventListener(
          'click',
          function (e) {
            e.preventDefault();
            e.stopPropagation();
            if (e.stopImmediatePropagation) e.stopImmediatePropagation();
            openTpBadgeModal(kind, btn);
          },
          true
        );
      });
  }

  function bindTrustpilotBadgeModals() {
    ensureTpBadgeModal();
    if (!window.__spliffTpBadgeGlobalBound) {
      window.__spliffTpBadgeGlobalBound = true;
      document.addEventListener(
        'keydown',
        function (e) {
          if (e.key !== 'Escape') return;
          var m = document.getElementById('spliff-tp-badge-modal');
          if (!m || !m.classList.contains('spliff-open')) return;
          e.preventDefault();
          closeTpBadgeModal();
        },
        true
      );
      window.addEventListener('resize', function () {
        if (window.__spliffTpBadgeResizeT)
          clearTimeout(window.__spliffTpBadgeResizeT);
        window.__spliffTpBadgeResizeT = setTimeout(onResizeOrScrollTpBadge, 80);
      });
      window.addEventListener('scroll', onResizeOrScrollTpBadge, true);
    }
    attachTpBadgeClickHandlers();
  }

  /** Класс открытия мобильного drawer (Trustpilot CSS): .styles_wrapper__YewUk.styles_isOpen__… */
  function getTrustpilotMobileNavOpenClass(panel) {
    if (!panel || !panel.classList) return 'styles_isOpen__f8Q7T';
    var found = '';
    panel.classList.forEach(function (c) {
      if (c.indexOf('styles_isOpen__') === 0) found = c;
    });
    return found || 'styles_isOpen__f8Q7T';
  }

  function findTrustpilotMobileNavPanel() {
    var bg = document.querySelector(
      'header [aria-label="Menü schließen"][role="button"]'
    );
    return bg && bg.parentElement ? bg.parentElement : null;
  }

  /**
   * Мобильное меню шапки: без React Next.js класс isOpen не вешается — панель остаётся visibility:hidden.
   * Открытие по [data-header-menu], закрытие по затемнению, повторный клик по гамбургеру, Escape.
   */
  function bindTrustpilotMobileNavMenu() {
    if (window.__spliffTpMobileNavBound) return;
    var panel = findTrustpilotMobileNavPanel();
    var menuBtn = document.querySelector('header button[data-header-menu="true"]');
    if (!panel || !menuBtn) return;
    window.__spliffTpMobileNavBound = true;
    var OPEN = getTrustpilotMobileNavOpenClass(panel);

    function navIsOpen() {
      return panel.classList.contains(OPEN);
    }

    function setNavOpen(open) {
      var on = !!open;
      panel.classList.toggle(OPEN, on);
      menuBtn.setAttribute('aria-expanded', on ? 'true' : 'false');
      document.body.classList.toggle('spliff-tp-mobile-nav-open', on);
    }

    setNavOpen(false);
    if (!menuBtn.hasAttribute('aria-expanded')) {
      menuBtn.setAttribute('aria-expanded', 'false');
    }

    menuBtn.addEventListener(
      'click',
      function (e) {
        e.preventDefault();
        e.stopPropagation();
        if (e.stopImmediatePropagation) e.stopImmediatePropagation();
        setNavOpen(!navIsOpen());
      },
      true
    );

    panel.addEventListener('click', function (e) {
      var t = e.target;
      if (
        t &&
        t.getAttribute &&
        t.getAttribute('aria-label') === 'Menü schließen' &&
        t.getAttribute('role') === 'button'
      ) {
        e.preventDefault();
        setNavOpen(false);
      }
    });

    panel.addEventListener('keydown', function (e) {
      var t = e.target;
      if (
        !t ||
        t.getAttribute('aria-label') !== 'Menü schließen' ||
        t.getAttribute('role') !== 'button'
      ) {
        return;
      }
      if (e.key !== 'Enter' && e.key !== ' ') return;
      e.preventDefault();
      setNavOpen(false);
    });

    document.addEventListener('keydown', function (e) {
      if (e.key !== 'Escape') return;
      var tpBd = document.getElementById('spliff-tp-badge-modal');
      if (tpBd && tpBd.classList.contains('spliff-open')) {
        closeTpBadgeModal();
        e.preventDefault();
        return;
      }
      var fo = document.getElementById('spliff-filter-modal-overlay');
      if (fo && fo.classList.contains('spliff-open')) return;
      if (!navIsOpen()) return;
      setNavOpen(false);
    });
  }

  /** Шапка: Kategorien / Blog → de.trustpilot.com; логотип Trustpilot → перезагрузка текущей копии страницы. */
  function fixTrustpilotHeaderNavLinks() {
    var TP_CAT = 'https://de.trustpilot.com/categories';
    var TP_BLOG = 'https://de.trustpilot.com/blog';
    document.querySelectorAll('header a[href]').forEach(function (a) {
      var h = (a.getAttribute('href') || '').trim();
      if (h === '/categories') {
        a.setAttribute('href', TP_CAT);
        a.href = TP_CAT;
        a.setAttribute('target', '_blank');
        a.setAttribute('rel', 'noopener noreferrer');
        return;
      }
      if (h === '/blog') {
        a.setAttribute('href', TP_BLOG);
        a.href = TP_BLOG;
        a.setAttribute('target', '_blank');
        a.setAttribute('rel', 'noopener noreferrer');
      }
    });
    document
      .querySelectorAll(
        'header a[data-company-logo-link="true"], header a[name="company-logo"]'
      )
      .forEach(function (a) {
        a.removeAttribute('target');
        a.setAttribute('href', '#');
        if (a.__spliffTrustpilotLogoReloadBound) return;
        a.__spliffTrustpilotLogoReloadBound = true;
        a.addEventListener(
          'click',
          function (e) {
            e.preventDefault();
            e.stopPropagation();
            if (e.stopImmediatePropagation) e.stopImmediatePropagation();
            window.location.reload();
          },
          true
        );
      });
  }

  /**
   * Футер: рабочие публичные URL (corporate.trustpilot.com часто отдаёт 403 через CloudFront).
   * Кнопка «Land auswählen» / страна — по-прежнему Trustpilot UI (button), не ссылка.
   */
  function fixTrustpilotFooterLinks() {
    var foot = document.querySelector('footer[role="contentinfo"]');
    if (!foot) return;
    var map = {
      'Über uns': 'https://de.trustpilot.com/about',
      Jobs: 'https://business.trustpilot.com/jobs',
      Kontakt: 'https://de.trustpilot.com/contact',
      Blog: 'https://de.trustpilot.com/blog',
      'So funktioniert Trustpilot': 'https://de.trustpilot.com/trust',
      Presse: 'https://press.trustpilot.com',
      'Investor Relations': 'https://investors.trustpilot.com',
      'Bewertungen Ihres Vertrauens': 'https://de.trustpilot.com/trust',
      Hilfecenter: 'https://help.trustpilot.com/s?language=de',
      Einloggen: 'https://de.trustpilot.com/users/connect',
      Anmelden: 'https://de.trustpilot.com/users/connect?signup=True',
      'Trustpilot Business': 'https://de.business.trustpilot.com',
      Produkte: 'https://de.business.trustpilot.com/features',
      'Leistungen und Preise': 'https://de.business.trustpilot.com/pricing',
      'Login für Unternehmen': 'https://businessapp.b2b.trustpilot.com/?locale=de-de',
      'Blog für Unternehmen': 'https://de.business.trustpilot.com/blog',
      Rechtliches: 'https://de.legal.trustpilot.com',
      Datenschutzerklärung: 'https://de.legal.trustpilot.com/end-user-privacy-terms',
      Nutzungsbedingungen:
        'https://de.legal.trustpilot.com/for-reviewers/end-user-terms-and-conditions',
      'Richtlinien für Bewerter':
        'https://de.legal.trustpilot.com/for-reviewers/guidelines-for-reviewers',
      Impressum: 'https://de.trustpilot.com/impressum',
      Systemstatus: 'https://status.trustpilot.com/',
      'Modern Slavery Statement':
        'https://de.legal.trustpilot.com/for-everyone/modern-slavery-and-human-trafficking-statement',
    };
    var iosApp = 'https://apps.apple.com/app/trustpilot-reviews-ratings/id1608392803';
    map['Download the Trustpilot iOS app'] = iosApp;

    foot.querySelectorAll('a[href]').forEach(function (a) {
      var key = (a.textContent || '').replace(/\s+/g, ' ').trim();
      var img = a.querySelector('img[alt]');
      var alt = img ? (img.getAttribute('alt') || '').trim() : '';
      var url = map[key] || (alt && map[alt] ? map[alt] : '');
      if (url) {
        a.setAttribute('href', url);
        a.href = url;
        return;
      }
      var h = a.getAttribute('href') || '';
      if (h.startsWith('/') && !h.startsWith('//')) {
        var abs = TP_BASE + h;
        a.setAttribute('href', abs);
        a.href = abs;
      }
    });
  }

  function buildToolbarInnerHtml() {
    var parts = [];
    parts.push('<div class="spliff-tb-search-row">');
    parts.push(
      '<svg class="spliff-tb-search-icon" viewBox="0 0 16 16" xmlns="http://www.w3.org/2000/svg" aria-hidden="true"><path fill="currentColor" d="M6.5 2a4.5 4.5 0 1 1 0 9 4.5 4.5 0 0 1 0-9Zm0-1a5.5 5.5 0 1 0 3.14 10.03l3.22 3.22.7-.7-3.22-3.22A5.5 5.5 0 0 0 6.5 1Z"/></svg>'
    );
    parts.push(
      '<input type="search" id="spliff-tb-search" class="spliff-tb-search" placeholder="Geben Sie einen Suchbegriff ein..." autocomplete="off" aria-label="Bewertungen durchsuchen"/>'
    );
    parts.push('</div>');
    parts.push('<div class="spliff-tb-row2">');
    parts.push(
      '<button type="button" class="spliff-tb-pill" id="spliff-tb-open-filters" aria-haspopup="dialog">'
    );
    parts.push(
      '<svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true"><path fill="currentColor" d="M2 4h12v2H2V4Zm3 5h6v2H5V9Zm2 5h2v2H7v-2Z"/></svg>'
    );
    parts.push('Weitere Filter</button>');
    parts.push('<div class="spliff-tb-sort-wrap">');
    parts.push(
      '<select id="spliff-tb-sort" class="spliff-tb-sort" aria-label="Sortieren">'
    );
    parts.push('<option value="newest">Neueste zuerst</option>');
    parts.push('<option value="oldest">Älteste zuerst</option>');
    parts.push('<option value="rating_desc">Höchste Bewertung</option>');
    parts.push('<option value="rating_asc">Niedrigste Bewertung</option>');
    parts.push('</select>');
    parts.push(
      '<svg class="spliff-tb-sort-chev" viewBox="0 0 10 6" xmlns="http://www.w3.org/2000/svg" aria-hidden="true"><path fill="none" stroke="currentColor" stroke-width="1.4" d="M1 1l4 4 4-4"/></svg>'
    );
    parts.push('</div></div>');
    parts.push('<h3 class="spliff-tb-top-title">Top-Erwähnungen</h3>');
    parts.push('<div class="spliff-tb-tags" id="spliff-tb-tags">');
    for (var ti = 0; ti < MENTION_TAGS.length; ti++) {
      var tg = MENTION_TAGS[ti];
      parts.push(
        '<button type="button" class="spliff-tb-tag" data-spliff-mention="' +
          escapeAttr(tg) +
          '">' +
          escapeHtml(tg) +
          '</button>'
      );
    }
    parts.push('</div>');
    return parts.join('');
  }

  function buildModalInnerHtml() {
    var parts = [];
    parts.push(
      '<div class="spliff-filter-backdrop" data-spliff-modal-dismiss="1" aria-hidden="true"></div>'
    );
    parts.push(
      '<div class="spliff-filter-panel" role="dialog" aria-modal="true" aria-labelledby="spliff-fm-title">'
    );
    parts.push(
      '<div class="spliff-fm-head"><h2 class="spliff-fm-title" id="spliff-fm-title">Filtern</h2>'
    );
    parts.push(
      '<button type="button" class="spliff-fm-close" data-spliff-modal-dismiss="1" aria-label="Schließen">×</button></div>'
    );
    parts.push('<div class="spliff-filter-panel-body">');
    parts.push('<div class="spliff-fm-sec"><p class="spliff-fm-label">Bewertung</p><div class="spliff-fm-stars" id="spliff-fm-stars">');
    for (var si = 5; si >= 1; si--) {
      parts.push(
        '<button type="button" class="spliff-fm-star" data-spliff-star="' +
          si +
          '">★ ' +
          si +
          '</button>'
      );
    }
    parts.push('</div></div>');
    parts.push('<div class="spliff-fm-sec"><p class="spliff-fm-label">Empfohlen</p>');
    parts.push(
      '<div class="spliff-fm-check"><label><input type="checkbox" id="spliff-fm-verified"/> Verifiziert</label>'
    );
    parts.push(
      '<p class="spliff-fm-hint">Bewertungen mit dem Hinweis „verifiziert“, wenn das Unternehmen zur Bewertung eingeladen hat.</p></div>'
    );
    parts.push(
      '<div class="spliff-fm-check"><label><input type="checkbox" id="spliff-fm-reply"/> Mit Antwort</label>'
    );
    parts.push(
      '<p class="spliff-fm-hint">Bewertungen mit einer Antwort des Unternehmens.</p></div></div>'
    );
    parts.push(
      '<div class="spliff-fm-sec"><p class="spliff-fm-label">Datum der Veröffentlichung</p><div class="spliff-fm-date" id="spliff-fm-dates">'
    );
    var dates = [
      { v: 'all', l: 'Alle Bewertungen', badge: 'STANDARD' },
      { v: '30d', l: 'Die letzten 30 Tage', badge: '' },
      { v: '3m', l: 'Die letzten 3 Monate', badge: '' },
      { v: '6m', l: 'Die letzten 6 Monate', badge: '' },
      { v: '12m', l: 'Die letzten 12 Monate', badge: '' }
    ];
    for (var di = 0; di < dates.length; di++) {
      var d = dates[di];
      var id = 'spliff-fm-date-' + d.v;
      parts.push(
        '<label><input type="radio" name="spliff-fm-date" id="' +
          id +
          '" value="' +
          d.v +
          '"' +
          (d.v === 'all' ? ' checked' : '') +
          '/> ' +
          escapeHtml(d.l)
      );
      if (d.badge) {
        parts.push(' <span class="spliff-fm-badge">' + d.badge + '</span>');
      }
      parts.push('</label>');
    }
    parts.push('</div></div>');
    parts.push(
      '<div class="spliff-fm-sec"><p class="spliff-fm-label">Beliebte Erwähnungen</p><div class="spliff-fm-tags" id="spliff-fm-tags">'
    );
    for (var mi = 0; mi < MENTION_TAGS.length; mi++) {
      var mt = MENTION_TAGS[mi];
      parts.push(
        '<button type="button" class="spliff-fm-tag" data-spliff-mention="' +
          escapeAttr(mt) +
          '">' +
          escapeHtml(mt) +
          ' +</button>'
      );
    }
    parts.push('</div></div>');
    parts.push('</div>');
    parts.push('<div class="spliff-fm-foot">');
    parts.push(
      '<button type="button" class="spliff-fm-reset" id="spliff-fm-reset">Zurücksetzen</button>'
    );
    parts.push(
      '<button type="button" class="spliff-fm-apply" id="spliff-fm-apply">Bewertungen anzeigen</button>'
    );
    parts.push('</div></div>');
    return parts.join('');
  }

  function ensureSpliffFilterModal() {
    if (document.getElementById('spliff-filter-modal-overlay')) return;
    var ov = document.createElement('div');
    ov.id = 'spliff-filter-modal-overlay';
    ov.setAttribute('aria-hidden', 'true');
    ov.innerHTML = buildModalInnerHtml();
    document.body.appendChild(ov);
  }

  function ensureSpliffToolbar(listParent) {
    if (document.getElementById('spliff-reviews-toolbar')) return;
    var tb = document.createElement('div');
    tb.id = 'spliff-reviews-toolbar';
    tb.className = 'spliff-reviews-toolbar';
    tb.innerHTML = buildToolbarInnerHtml();
    listParent.insertBefore(tb, listParent.firstChild);
  }

  function toggleMentionIn(arr, mention) {
    var i = arr.indexOf(mention);
    if (i === -1) arr.push(mention);
    else arr.splice(i, 1);
  }

  function syncToolbarTagsFromState() {
    document.querySelectorAll('#spliff-tb-tags .spliff-tb-tag').forEach(function (btn) {
      var m = btn.getAttribute('data-spliff-mention');
      btn.classList.toggle('spliff-active', filterState.mentions.indexOf(m) !== -1);
    });
  }

  function syncFilterButtonActive() {
    var btn = document.getElementById('spliff-tb-open-filters');
    if (!btn) return;
    var extra =
      filterState.stars.length > 0 ||
      filterState.verifiedOnly ||
      filterState.withReplyOnly ||
      filterState.datePreset !== 'all' ||
      filterState.mentions.length > 0;
    btn.classList.toggle('spliff-active', !!extra);
  }

  /** Клик по полосе/подписи — через capture+preventDefault; по чекбоксу — нативный toggle + change (иначе label/input ломаются). */
  function isStarRowClickOnCheckboxControl(starEl, t) {
    if (!t || !t.closest) return false;
    if (t.closest('[class*="rating-distribution-row_bar__"]')) return false;
    var cb = starEl.querySelector('input[type=checkbox]');
    if (!cb) return false;
    if (t === cb) return true;
    var lab = cb.closest('label');
    if (lab && starEl.contains(lab) && lab.contains(t)) return true;
    var cds = cb.closest('[class*="Checkbox"]');
    if (cds && starEl.contains(cds) && cds.contains(t)) return true;
    return false;
  }

  function syncStarFilterFromCheckbox(cb, num, renderFn) {
    var wasOn = filterState.stars.indexOf(num) !== -1;
    if (cb.checked === wasOn) return;
    if (cb.checked) {
      if (filterState.stars.indexOf(num) === -1) filterState.stars.push(num);
    } else {
      var ix = filterState.stars.indexOf(num);
      if (ix !== -1) filterState.stars.splice(ix, 1);
    }
    filterState.stars.sort(function (a, b) {
      return b - a;
    });
    syncFilterButtonActive();
    window.__spliffReviewsPage = 1;
    try {
      var u2 = new URL(location.href);
      u2.searchParams.set('page', '1');
      history.replaceState({}, '', u2.pathname + u2.search);
    } catch (er2) {}
    if (typeof renderFn === 'function') renderFn();
  }

  function toggleStarRatingFilter(num, renderFn) {
    var n = normalizeStarNumber(num);
    if (isNaN(n)) return;
    var idx = filterState.stars.indexOf(n);
    if (idx === -1) filterState.stars.push(n);
    else filterState.stars.splice(idx, 1);
    filterState.stars.sort(function (a, b) {
      return b - a;
    });
    syncFilterButtonActive();
    window.__spliffReviewsPage = 1;
    try {
      var u2 = new URL(location.href);
      u2.searchParams.set('page', '1');
      history.replaceState({}, '', u2.pathname + u2.search);
    } catch (er2) {}
    if (typeof renderFn === 'function') renderFn();
  }

  function syncDistributionStarRows() {
    document.querySelectorAll('[data-star-rating]').forEach(function (row) {
      var attr = row.getAttribute('data-star-rating');
      var n = STAR_RATING_ATTR_TO_NUM[attr];
      if (!n) return;
      if (isHeaderRatingDistributionCard(row)) {
        row.querySelectorAll('.spliff-star-cb-wrap').forEach(function (w) {
          w.remove();
        });
        row.querySelectorAll('input[type="checkbox"]').forEach(function (inp) {
          var par = inp.parentElement;
          inp.remove();
          if (
            par &&
            par !== row &&
            par.children.length === 0 &&
            !String(par.textContent || '').trim()
          ) {
            par.remove();
          }
        });
        row.removeAttribute('role');
        row.removeAttribute('tabindex');
        row.removeAttribute('aria-pressed');
        return;
      }
      var on = filterState.stars.indexOf(n) !== -1;
      row.querySelectorAll('.spliff-star-cb-wrap').forEach(function (w) {
        w.remove();
      });
      var list;
      while (true) {
        list = row.querySelectorAll('input[type="checkbox"]');
        if (list.length <= 1) break;
        var kill = list[0];
        var par = kill.parentElement;
        kill.remove();
        if (
          par &&
          par !== row &&
          par.children.length === 0 &&
          !String(par.textContent || '').trim()
        ) {
          par.remove();
        }
      }
      var cb = row.querySelector('input[type="checkbox"]');
      if (!cb) {
        var wrap = document.createElement('label');
        wrap.className = 'spliff-star-cb-wrap';
        var inp = document.createElement('input');
        inp.type = 'checkbox';
        inp.className = 'spliff-star-cb';
        inp.tabIndex = 0;
        inp.setAttribute('data-spliff-star-cb', 'true');
        inp.setAttribute(
          'aria-label',
          n === 5
            ? '5 Sterne'
            : n === 4
              ? '4 Sterne'
              : n === 3
                ? '3 Sterne'
                : n === 2
                  ? '2 Sterne'
                  : '1 Stern'
        );
        wrap.appendChild(inp);
        row.insertBefore(wrap, row.firstChild);
        cb = inp;
      }
      cb.checked = !!on;
      row.removeAttribute('role');
      row.removeAttribute('tabindex');
      row.removeAttribute('aria-pressed');
    });
  }

  function syncModalFromPending() {
    document.querySelectorAll('#spliff-fm-stars .spliff-fm-star').forEach(function (b) {
      var n = parseInt(b.getAttribute('data-spliff-star'), 10);
      b.classList.toggle('spliff-active', modalPending.stars.indexOf(n) !== -1);
    });
    var v = document.getElementById('spliff-fm-verified');
    var r = document.getElementById('spliff-fm-reply');
    if (v) v.checked = modalPending.verifiedOnly;
    if (r) r.checked = modalPending.withReplyOnly;
    document.querySelectorAll('input[name="spliff-fm-date"]').forEach(function (rad) {
      rad.checked = rad.value === modalPending.datePreset;
    });
    document.querySelectorAll('#spliff-fm-tags .spliff-fm-tag').forEach(function (b) {
      var m = b.getAttribute('data-spliff-mention');
      b.classList.toggle('spliff-active', modalPending.mentions.indexOf(m) !== -1);
    });
  }

  function updateModalApplyLabel() {
    var btn = document.getElementById('spliff-fm-apply');
    if (!btn) return;
    var n = countForFilterState(modalPending);
    btn.textContent =
      n + ' Bewertung' + (n === 1 ? '' : 'en') + ' anzeigen';
  }

  function setFilterDrawerScrollLock(on) {
    document.body.classList.toggle('spliff-filter-drawer-open', !!on);
  }

  function bindSpliffReviewsControls(renderFn) {
    if (window.__spliffReviewsUiBound) return;
    window.__spliffReviewsUiBound = true;

    var searchTimer = null;
    function resetPageAndRender() {
      window.__spliffReviewsPage = 1;
      try {
        var u = new URL(location.href);
        u.searchParams.set('page', '1');
        history.replaceState({}, '', u.pathname + u.search);
      } catch (e3) {}
      renderFn();
    }

    document.addEventListener('input', function (e) {
      if (!e.target || e.target.id !== 'spliff-tb-search') return;
      clearTimeout(searchTimer);
      var inputEl = e.target;
      searchTimer = setTimeout(function () {
        searchQuery = (inputEl.value || '').trim();
        resetPageAndRender();
        var ov = document.getElementById('spliff-filter-modal-overlay');
        if (ov && ov.classList.contains('spliff-open')) {
          updateModalApplyLabel();
        }
      }, 280);
    });

    document.addEventListener('change', function (e) {
      var t = e.target;
      if (t && t.id === 'spliff-tb-sort') {
        sortKey = t.value || 'newest';
        renderFn();
        return;
      }
      if (!t || !t.closest || !t.closest('#spliff-filter-modal-overlay')) return;
      if (t.id === 'spliff-fm-verified') {
        modalPending.verifiedOnly = !!t.checked;
        updateModalApplyLabel();
      }
      if (t.id === 'spliff-fm-reply') {
        modalPending.withReplyOnly = !!t.checked;
        updateModalApplyLabel();
      }
      if (t.name === 'spliff-fm-date' && t.type === 'radio') {
        modalPending.datePreset = t.value;
        updateModalApplyLabel();
      }
    });

    document.addEventListener('click', function (e) {
      var t = e.target;
      if (!t || !t.closest) return;

      var tagTop = t.closest('#spliff-tb-tags .spliff-tb-tag');
      if (tagTop) {
        e.preventDefault();
        var m1 = tagTop.getAttribute('data-spliff-mention');
        if (!m1) return;
        toggleMentionIn(filterState.mentions, m1);
        syncToolbarTagsFromState();
        syncFilterButtonActive();
        resetPageAndRender();
        return;
      }

      var openBtn = t.closest('#spliff-tb-open-filters');
      if (openBtn) {
        e.preventDefault();
        modalPending = cloneFilter(filterState);
        ensureSpliffFilterModal();
        var ov = document.getElementById('spliff-filter-modal-overlay');
        ov.classList.add('spliff-open');
        ov.setAttribute('aria-hidden', 'false');
        setFilterDrawerScrollLock(true);
        syncModalFromPending();
        updateModalApplyLabel();
        return;
      }

      var overlay = document.getElementById('spliff-filter-modal-overlay');
      if (!overlay || !overlay.classList.contains('spliff-open')) return;

      if (t.closest('[data-spliff-modal-dismiss]')) {
        overlay.classList.remove('spliff-open');
        overlay.setAttribute('aria-hidden', 'true');
        setFilterDrawerScrollLock(false);
        return;
      }

      var starBtn = t.closest('[data-spliff-star]');
      if (starBtn && starBtn.closest('#spliff-fm-stars')) {
        e.preventDefault();
        var sn = parseInt(starBtn.getAttribute('data-spliff-star'), 10);
        var idx = modalPending.stars.indexOf(sn);
        if (idx === -1) modalPending.stars.push(sn);
        else modalPending.stars.splice(idx, 1);
        modalPending.stars.sort(function (a, b) {
          return b - a;
        });
        syncModalFromPending();
        updateModalApplyLabel();
        return;
      }

      var fmt = t.closest('#spliff-fm-tags .spliff-fm-tag');
      if (fmt) {
        e.preventDefault();
        var mm = fmt.getAttribute('data-spliff-mention');
        toggleMentionIn(modalPending.mentions, mm);
        syncModalFromPending();
        updateModalApplyLabel();
        return;
      }

      if (t.id === 'spliff-fm-reset') {
        e.preventDefault();
        modalPending = defaultFilterSlice();
        syncModalFromPending();
        updateModalApplyLabel();
        return;
      }

      if (t.id === 'spliff-fm-apply') {
        e.preventDefault();
        filterState = cloneFilter(modalPending);
        overlay.classList.remove('spliff-open');
        overlay.setAttribute('aria-hidden', 'true');
        setFilterDrawerScrollLock(false);
        syncToolbarTagsFromState();
        syncFilterButtonActive();
        resetPageAndRender();
      }
    });

    document.addEventListener('keydown', function (e) {
      if (e.key !== 'Escape') return;
      var o = document.getElementById('spliff-filter-modal-overlay');
      if (o && o.classList.contains('spliff-open')) {
        o.classList.remove('spliff-open');
        o.setAttribute('aria-hidden', 'true');
        setFilterDrawerScrollLock(false);
      }
    });
  }

  function init() {
    if (window.__spliffReviewsAppInit) return;
    window.__spliffReviewsAppInit = true;
    injectStyles();
    bindTrustScoreScrollToReviews();
    bindSeeAllReviewsScroll();
    bindStarDistributionDocumentCapture();
    removeObsoleteSpliffPagination();
    removeStrayReviewPaginationNavs();
    fixTrustpilotLinks();
    fixOneshopOutboundLinks();
    fixTrustpilotFooterLinks();
    fixTrustpilotHeaderNavLinks();
    applyNoReferrerForTrustpilotOutboundLinks();
    bindTrustpilotMobileNavMenu();
    bindTrustpilotBadgeModals();
    bindSimilarBusinessesCarousel();
    bindBasierendSeeMoreModal();
    bindBewertungsuebersichtExpand();
    fetch(getReviewsUrl()).then(function(r){return r.json()}).then(function(data){
      var reviews = Array.isArray(data) ? data : (data.reviews || data.items || []);
      if (!reviews.length) return console.warn('No reviews in reviews.json');
      window.__spliffReviewsRaw = reviews;
      filterState = defaultFilterSlice();
      modalPending = defaultFilterSlice();
      searchQuery = '';
      sortKey = 'newest';
      window.__spliffReviewsPage = getPageFromUrl();

      var listParent = findReviewListWrapper();
      if (!listParent) return console.warn('Review list container not found');

      window.__spliffReviewsSetPage = function(p){
        window.__spliffReviewsPage = Math.max(1, parseInt(p, 10));
        var u = new URL(location.href);
        u.searchParams.set('page', String(window.__spliffReviewsPage));
        history.replaceState({}, '', u.pathname + u.search);
        render();
        scrollToReviewsSection();
      };

      listParent.addEventListener(
        'click',
        function (e) {
          var host = document.getElementById('spliff-reviews-pagination-host');
          if (!host || !host.contains(e.target)) return;
          var btn = e.target.closest(
            'button[data-spliff-pager],button[data-spliff-page]'
          );
          if (!btn || btn.disabled) return;
          e.preventDefault();
          e.stopPropagation();
          e.stopImmediatePropagation();
          var cur = window.__spliffReviewsPage;
          var tp = Math.max(
            1,
            Math.ceil((window.__spliffReviewsData || []).length / PER_PAGE)
          );
          if (btn.hasAttribute('data-spliff-page')) {
            var pn = parseInt(btn.getAttribute('data-spliff-page'), 10);
            if (!isNaN(pn) && pn >= 1 && pn <= tp) {
              window.__spliffReviewsSetPage(pn);
            }
            return;
          }
          var dir = btn.getAttribute('data-spliff-pager');
          if (dir === 'prev' && cur > 1) window.__spliffReviewsSetPage(cur - 1);
          if (dir === 'next' && cur < tp) window.__spliffReviewsSetPage(cur + 1);
        },
        true
      );

      function render() {
        window.__spliffReviewsRender = render;
        removeObsoleteSpliffPagination();
        removeStrayReviewPaginationNavs();
        var raw = window.__spliffReviewsRaw;
        if (!raw || !raw.length) return;
        ensureSpliffToolbar(listParent);
        ensureSpliffFilterModal();
        var data = applySortToReviews(
          applyFiltersToReviews(raw, filterState, searchQuery),
          sortKey
        );
        window.__spliffReviewsData = data;
        var totalPages = Math.max(1, Math.ceil(data.length / PER_PAGE));
        var page = Math.min(Math.max(1, window.__spliffReviewsPage), totalPages);
        window.__spliffReviewsPage = page;
        var start = (page - 1) * PER_PAGE;
        var pageReviews = data.slice(start, start + PER_PAGE);

        var container = document.getElementById('spliff-reviews-list-root');
        var pagHost = document.getElementById('spliff-reviews-pagination-host');
        if (!container) {
          container = document.createElement('div');
          container.id = 'spliff-reviews-list-root';
          listParent.appendChild(container);
        }
        if (!pagHost) {
          pagHost = document.createElement('div');
          pagHost.id = 'spliff-reviews-pagination-host';
          pagHost.className = 'spliff-reviews-pagination-host';
          listParent.appendChild(pagHost);
        }
        var tbEl = document.getElementById('spliff-reviews-toolbar');
        if (tbEl && listParent.firstChild !== tbEl) {
          listParent.insertBefore(tbEl, listParent.firstChild);
        }

        var html = '';
        pageReviews.forEach(function (r) {
          html += renderReviewCard(r);
        });
        container.innerHTML = html;
        pagHost.innerHTML = renderTrustpilotPagination(page, totalPages);
        var sortEl = document.getElementById('spliff-tb-sort');
        if (sortEl) sortEl.value = sortKey;
        var searchEl = document.getElementById('spliff-tb-search');
        if (searchEl && searchEl.value !== searchQuery) {
          searchEl.value = searchQuery;
        }
        syncToolbarTagsFromState();
        syncFilterButtonActive();
        syncDistributionStarRows();
        fixTrustpilotLinks();
        fixOneshopOutboundLinks();
        fixTrustpilotFooterLinks();
        fixTrustpilotHeaderNavLinks();
        applyNoReferrerForTrustpilotOutboundLinks();
        bindTrustpilotMobileNavMenu();
        bindTrustpilotBadgeModals();
        removeStrayReviewPaginationNavs();
      }

      if (!document.getElementById('spliff-reviews-list-root')) {
        listParent.innerHTML = '';
      }
      bindSpliffReviewsControls(function () {
        render();
      });
      render();
      [100, 600, 2000, 4000].forEach(function (ms) {
        setTimeout(function () {
          removeStaticOneStarReviewCards();
          removeObsoleteSpliffPagination();
          removeStrayReviewPaginationNavs();
          fixOneshopOutboundLinks();
          fixTrustpilotFooterLinks();
          fixTrustpilotHeaderNavLinks();
          applyNoReferrerForTrustpilotOutboundLinks();
          bindTrustpilotMobileNavMenu();
          bindTrustpilotBadgeModals();
          syncDistributionStarRows();
        }, ms);
      });
    }).catch(function(e){ console.warn('Could not load reviews.json', e); });
  }

  if (document.readyState === 'complete') init();
  else window.addEventListener('load', init);
})();
