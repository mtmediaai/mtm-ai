/**
 * IIIP SOVEREIGN APEX ENGINE
 * Protocol: MTM-ARENA-BATTLE-v3.0-APEX
 * Authority: Kareem Daniel (The Architect) // MT Media AI
 *
 * Runtime: Pure Vanilla ES6+. Zero frameworks, zero dependencies, $0 COGS.
 *
 * Modules:
 *   1. Engine            Data binding, hydration orchestration, session persistence
 *   2. RefusalClock      Resilient 14 day countdown with terminal urgency states
 *   3. PlaybackDeck      HTML5 audio transport, speed rack, high DPI waveform
 *   4. GaugeBank         Radial SVG diagnostic meters plus forensic autopsy
 *   5. Lightbox          Bento expansion, zoom, keyboard navigation
 *   6. Dispatcher        CTA protocol modals
 *   7. ArchitectHUD      Invisible dual ingestion interface (keyboard gated)
 */

(function (window, document) {
  'use strict';

  var SESSION_CONFIG_KEY = 'iiip.apex.config';
  var SESSION_GEMINI_KEY = 'iiip.apex.gemini';

  var IIIP = {
    version: '5.0.0-APEX',
    config: null,
    clock: null,
    deck: null,
    gauges: null,
    lightbox: null,
    dispatcher: null,
    hud: null
  };

  /* ----------------------------------------------------------------------
     UTILITIES
     ---------------------------------------------------------------------- */

  function resolvePath(root, path) {
    if (!root || !path) return undefined;
    return path.split('.').reduce(function (acc, key) {
      return (acc && acc[key] !== undefined) ? acc[key] : undefined;
    }, root);
  }

  function clockFormat(seconds) {
    if (isNaN(seconds) || seconds < 0) return '00:00';
    var m = Math.floor(seconds / 60);
    var s = Math.floor(seconds % 60);
    return String(m).padStart(2, '0') + ':' + String(s).padStart(2, '0');
  }

  function pad2(value) {
    return String(value).padStart(2, '0');
  }

  // Use the recorded research timestamp, never the page-view date or the visitor's time zone.
  function formatCaptureDate(value, timeZone) {
    if (typeof value !== 'string') return null;
    var iso = value.trim();
    var match = iso.match(/^(\d{4})-(\d{2})-(\d{2})(?:T(?:[01]\d|2[0-3]):[0-5]\d(?::[0-5]\d(?:\.\d{1,3})?)?(?:Z|[+-](?:[01]\d|2[0-3]):[0-5]\d))?$/);
    if (!match) return null;

    var year = Number(match[1]);
    var month = Number(match[2]);
    var day = Number(match[3]);
    var calendarDate = new Date(iso.slice(0, 10) + 'T00:00:00.000Z');
    if (year < 1 || !isFinite(calendarDate.getTime()) ||
        calendarDate.getUTCFullYear() !== year ||
        calendarDate.getUTCMonth() + 1 !== month || calendarDate.getUTCDate() !== day) {
      return null;
    }

    // A date-only capture record must retain its calendar day without conversion.
    if (iso.length === 10) {
      return { iso: iso, display: pad2(month) + '/' + pad2(day) + '/' + String(year).padStart(4, '0') };
    }

    var timestamp = new Date(iso);
    if (!isFinite(timestamp.getTime())) return null;
    try {
      var parts = new Intl.DateTimeFormat('en-US', {
        timeZone: timeZone || 'UTC', month: '2-digit', day: '2-digit', year: 'numeric'
      }).formatToParts(timestamp);
      var fields = {};
      parts.forEach(function (part) { fields[part.type] = part.value; });
      return {
        iso: timestamp.toISOString(),
        display: fields.month + '/' + fields.day + '/' + fields.year.padStart(4, '0')
      };
    } catch (e) {
      return null;
    }
  }

  function writeCaptureDate(node, capture, prefix, fallback) {
    if (!node) return;
    node.textContent = capture ? prefix : fallback;
    if (!capture) return;
    var time = document.createElement('time');
    time.dateTime = capture.iso;
    time.textContent = capture.display;
    node.appendChild(time);
    node.appendChild(document.createTextNode('.'));
  }

  function el(id) {
    return document.getElementById(id);
  }

  function slugify(value) {
    return String(value || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  }

  function viewerTimeZone() {
    try {
      return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
    } catch (e) {
      return 'UTC';
    }
  }

  /* The findings date is never fixed in the template. Precedence:
       1. ?captured=<ISO date or timestamp> on the delivery link
       2. personalizedSnapshot.capturedAt written into the payload at capture
       3. Otherwise the first time this package opens on a device. That moment
          is stamped once and kept, so the date never drifts on reload.
     The date renders in personalizedSnapshot.timeZone when given, and in the
     viewer's own time zone when not, always as MM/DD/YYYY. */
  function resolveCapture(snapshot, prospect) {
    var zone = (snapshot && snapshot.timeZone) || viewerTimeZone();
    var candidates = [];

    try {
      var params = new URLSearchParams(window.location.search);
      candidates.push(params.get('captured'), params.get('capturedAt'));
    } catch (e) { /* no query support */ }

    candidates.push(snapshot && snapshot.capturedAt);

    for (var i = 0; i < candidates.length; i++) {
      var raw = candidates[i];
      if (typeof raw !== 'string') continue;
      raw = raw.trim();
      if (!raw || raw.toLowerCase() === 'auto') continue;
      var parsed = formatCaptureDate(raw, zone);
      if (parsed) return parsed;
    }

    var key = 'iiip.capture.' + slugify((prospect && prospect.companyName) || 'package');

    try {
      var stored = JSON.parse(localStorage.getItem(key) || 'null');
      if (stored && stored.iso) {
        var kept = formatCaptureDate(stored.iso, stored.zone || zone);
        if (kept) return kept;
      }
    } catch (e) { /* storage unavailable */ }

    var stamp = new Date().toISOString();
    try {
      localStorage.setItem(key, JSON.stringify({ iso: stamp, zone: zone }));
    } catch (e) { /* storage unavailable */ }

    return formatCaptureDate(stamp, zone) || formatCaptureDate(stamp, 'UTC');
  }

  function companyCode(prospect) {
    var name = (prospect && prospect.companyName) || '';
    var words = name.replace(/[^A-Za-z0-9 ]/g, '').split(/\s+/).filter(Boolean);
    if (!words.length) return 'XX';
    if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
    return (words[0].charAt(0) + words[1].charAt(0)).toUpperCase();
  }

  function captureCompact(capture) {
    if (!capture || !capture.iso) return '';
    var datePart = String(capture.iso).slice(0, 10).replace(/-/g, '');
    return /^\d{8}$/.test(datePart) ? datePart : '';
  }

  /* Copy can carry tokens so one template reads as written for each prospect.
     {{company}} {{firstName}} {{addressee}} {{executiveName}} {{title}}
     {{territory}} {{field}} {{capturedDate}} {{capturedDateCompact}}
     {{companyCode}} {{researchId}} or any payload path such as
     {{ignitionHub.coreFour.delta_dg.score}}. Unknown tokens render empty. */
  function tokenize(text, cfg) {
    if (typeof text !== 'string' || text.indexOf('{{') === -1) return text;
    cfg = cfg || {};
    var prospect = cfg.prospect || {};
    var aliases = {
      company: prospect.companyName,
      firstName: prospect.firstName,
      executiveName: prospect.executiveName,
      title: prospect.executiveTitle,
      territory: prospect.territory,
      field: prospect.industryVector,
      companyCode: companyCode(prospect),
      addressee: prospect.firstName || (prospect.companyName ? prospect.companyName + ' team' : '')
    };

    return text.replace(/\{\{\s*([\w.\-]+)\s*\}\}/g, function (match, key) {
      if (key === 'researchId') {
        var configured = cfg.diagnosticReadings && cfg.diagnosticReadings.researchId;
        if (configured && configured !== 'auto' && configured.indexOf('{{') === -1) return String(configured);
        var idSnap = {
          capturedAt: (cfg.diagnosticReadings && cfg.diagnosticReadings.capturedAt) ||
            (cfg.personalizedSnapshot && cfg.personalizedSnapshot.capturedAt),
          timeZone: (cfg.diagnosticReadings && cfg.diagnosticReadings.timeZone) ||
            (cfg.personalizedSnapshot && cfg.personalizedSnapshot.timeZone)
        };
        var idCap = resolveCapture(idSnap, prospect);
        var compact = captureCompact(idCap);
        return compact ? ('RSCH-' + compact + '-' + companyCode(prospect)) : '';
      }
      if (key === 'capturedDateCompact') {
        var cSnap = {
          capturedAt: (cfg.diagnosticReadings && cfg.diagnosticReadings.capturedAt) ||
            (cfg.personalizedSnapshot && cfg.personalizedSnapshot.capturedAt),
          timeZone: (cfg.diagnosticReadings && cfg.diagnosticReadings.timeZone) ||
            (cfg.personalizedSnapshot && cfg.personalizedSnapshot.timeZone)
        };
        var cCap = resolveCapture(cSnap, prospect);
        return captureCompact(cCap);
      }
      if (key === 'capturedDate' || key === 'researchDate') {
        var diagSnap = cfg.diagnosticReadings || {};
        var snap = {
          capturedAt: diagSnap.capturedAt || (cfg.personalizedSnapshot && cfg.personalizedSnapshot.capturedAt),
          timeZone: diagSnap.timeZone || (cfg.personalizedSnapshot && cfg.personalizedSnapshot.timeZone)
        };
        var capture = resolveCapture(snap, prospect);
        return capture ? capture.display : '';
      }
      if (Object.prototype.hasOwnProperty.call(aliases, key)) {
        return aliases[key] === undefined || aliases[key] === null ? '' : String(aliases[key]);
      }
      if (key.indexOf('.') !== -1) {
        var value = resolvePath(cfg, key);
        if (value !== undefined && value !== null && typeof value !== 'object') return String(value);
      }
      return '';
    });
  }

  function hasFiles(event) {
    var types = event.dataTransfer && event.dataTransfer.types;
    return !!types && Array.prototype.indexOf.call(types, 'Files') !== -1;
  }

  function downloadHref(href, name) {
    var anchor = document.createElement('a');
    anchor.href = href;
    anchor.download = name || '';
    anchor.rel = 'noopener';
    anchor.style.display = 'none';
    document.body.appendChild(anchor);
    anchor.click();
    document.body.removeChild(anchor);
  }

  function downloadText(text, name) {
    var blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
    var url = URL.createObjectURL(blob);
    downloadHref(url, name);
    setTimeout(function () { URL.revokeObjectURL(url); }, 4000);
  }

  function downloadFromUrl(url, name) {
    if (url.indexOf('blob:') === 0 || url.indexOf('data:') === 0 || !window.fetch) {
      downloadHref(url, name);
      return;
    }
    fetch(url, { mode: 'cors' })
      .then(function (res) {
        if (!res.ok) throw new Error('fetch failed');
        return res.blob();
      })
      .then(function (blob) {
        var local = URL.createObjectURL(blob);
        downloadHref(local, name);
        setTimeout(function () { URL.revokeObjectURL(local); }, 4000);
      })
      .catch(function () {
        downloadHref(url, name);
      });
  }

  function escapeHtml(value) {
    if (value === undefined || value === null) return '';
    return String(value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  /* ======================================================================
     MODULE 1: ENGINE
     ====================================================================== */
  function Engine() {
    this.config = null;
    this.hydrated = false;
    this.objectUrls = [];
  }

  Engine.prototype.init = function (overrideConfig) {
    var self = this;

    // 1. Check URL parameters for explicit config, client alias, or cache reset
    var urlParams = null;
    try {
      urlParams = new URLSearchParams(window.location.search);
    } catch (e) {}

    var configParam = urlParams && (urlParams.get('config') || urlParams.get('cfg') || urlParams.get('deliverable'));
    var clientParam = urlParams && (urlParams.get('client') || urlParams.get('prospect') || urlParams.get('profile'));
    var resetParam = urlParams && (urlParams.get('reset') === '1' || urlParams.get('fresh') === '1');

    if (resetParam) {
      try {
        sessionStorage.removeItem(SESSION_CONFIG_KEY);
        localStorage.removeItem(SESSION_CONFIG_KEY);
      } catch (e) {}
    }

    // Client alias shortcuts (e.g. ?client=score or ?client=jim-osullivan)
    if (clientParam) {
      var c = clientParam.toLowerCase();
      if (c.indexOf('score') !== -1 || c.indexOf('osullivan') !== -1 || c.indexOf('jim') !== -1) {
        configParam = 'score-mentor-jim-osullivan-config.json';
      } else if (c.indexOf('sovereign') !== -1) {
        configParam = 'iiip-config.sample.json';
      }
    }

    if (configParam) {
      return fetch(configParam)
        .then(function (res) {
          if (!res.ok) throw new Error('config fetch failed: ' + configParam);
          return res.json();
        })
        .then(function (json) {
          self.config = json;
          self.commit();
          self.showToast('Deliverable Hydrated: ' + ((json.prospect && json.prospect.companyName) || configParam));
          return self;
        })
        .catch(function (err) {
          console.warn('[IIIP] Failed to load config from URL parameter:', err);
          return self.resolveDefaultConfig(overrideConfig);
        });
    }

    return this.resolveDefaultConfig(overrideConfig);
  };

  Engine.prototype.resolveDefaultConfig = function (overrideConfig) {
    var self = this;

    // Check if override is an explicit dynamic payload from file drop/upload
    var isStaticInline = (overrideConfig && window.IIIP_CONFIG && overrideConfig === window.IIIP_CONFIG);

    if (overrideConfig && !isStaticInline) {
      this.config = overrideConfig;
      return this.commit();
    }

    // Check session or local cache for previously ingested deliverables
    var cached = null;
    try {
      var raw = sessionStorage.getItem(SESSION_CONFIG_KEY) || localStorage.getItem(SESSION_CONFIG_KEY);
      if (raw) cached = JSON.parse(raw);
    } catch (e) {
      cached = null;
    }

    if (cached && cached.prospect && cached.prospect.companyName) {
      this.config = cached;
      return this.commit();
    }

    if (overrideConfig) {
      this.config = overrideConfig;
      return this.commit();
    }

    if (window.IIIP_CONFIG) {
      this.config = window.IIIP_CONFIG;
      return this.commit();
    }

    return fetch('iiip-config.sample.json')
      .then(function (res) {
        if (!res.ok) throw new Error('config fetch failed');
        return res.json();
      })
      .then(function (json) {
        self.config = json;
        return self.commit();
      })
      .catch(function () {
        console.warn('[IIIP] No configuration payload resolved. Template awaits hydration.');
      });
  };

  Engine.prototype.commit = function () {
    if (!this.config) return;

    window.IIIP_CONFIG = this.config;
    IIIP.config = this.config;

    this.bootModules();
    this.hydrate();
    this.persist();
    this.hydrated = true;

    console.log('[IIIP] Apex Engine v' + IIIP.version + ' hydrated.');
  };

  Engine.prototype.bootModules = function () {
    if (!IIIP.clock) IIIP.clock = new RefusalClock();
    if (!IIIP.deck) IIIP.deck = new PlaybackDeck();
    if (!IIIP.gauges) IIIP.gauges = new GaugeBank();
    if (!IIIP.lightbox) IIIP.lightbox = new Lightbox();
    if (!IIIP.dispatcher) IIIP.dispatcher = new Dispatcher();
  };

  Engine.prototype.hydrate = function () {
    var cfg = this.config;

    /* Single source of truth: one capture date drives the snapshot, the
       provenance lines, the footer, the research ID, and the reservation
       window, so every date in the package matches. */
    var masterSnap = {
      capturedAt: (cfg.diagnosticReadings && cfg.diagnosticReadings.capturedAt) ||
        (cfg.personalizedSnapshot && cfg.personalizedSnapshot.capturedAt),
      timeZone: (cfg.diagnosticReadings && cfg.diagnosticReadings.timeZone) ||
        (cfg.personalizedSnapshot && cfg.personalizedSnapshot.timeZone)
    };
    var master = resolveCapture(masterSnap, cfg.prospect || {});
    this.masterCapture = master;
    IIIP.capture = master;

    if (master) {
      if (!cfg.personalizedSnapshot) cfg.personalizedSnapshot = {};
      if (!cfg.diagnosticReadings) cfg.diagnosticReadings = {};
      if (!cfg.diagnostics) cfg.diagnostics = {};
      cfg.personalizedSnapshot.capturedAt = master.iso;
      cfg.diagnosticReadings.capturedAt = master.iso;
      cfg.diagnostics.capturedAt = master.iso;
      if (!cfg.disclaimer) cfg.disclaimer = {};
      cfg.disclaimer.preparedOn = master.display;
      if (!cfg.diagnosticReadings.researchId || cfg.diagnosticReadings.researchId === 'auto' ||
          /2026-?0922/.test(String(cfg.diagnosticReadings.researchId))) {
        cfg.diagnosticReadings.researchId = 'RSCH-' + captureCompact(master) + '-' + companyCode(cfg.prospect || {});
      }
      /* Synchronize DOM anchors directly */
      var hdrDate = el('header-capture-date');
      if (hdrDate) hdrDate.textContent = master.display;
      var ftrDate = el('footer-prepared-date');
      if (ftrDate) ftrDate.textContent = master.display;
    }

    this.bindText(cfg);
    this.bindVitals(cfg.prospect);
    this.bindBento(cfg.visualSnapshot);
    this.bindSnapshot(cfg.personalizedSnapshot, cfg.prospect);
    this.bindDeck(cfg.audioBriefing, cfg);
    this.bindGemini(cfg.ignitionHub, cfg);
    this.bindCtas(cfg.ignitionHub && cfg.ignitionHub.ctas);
    this.bindDeliverableUpload();

    // Dynamically synchronize document title & watermark overlay
    if (cfg.prospect && cfg.prospect.companyName) {
      document.title = cfg.prospect.companyName + ' // Invisible Infrastructure Intelligence Package | MT Media AI';
      var wm = el('iiip-watermark-overlay') || document.querySelector('.iiip-watermark-overlay');
      if (wm) wm.textContent = 'Prepared exclusively for ' + cfg.prospect.companyName;
    }

    if (IIIP.clock) IIIP.clock.arm(cfg.refusalClock, cfg.reservation, this.masterCapture, cfg.prospect);
    if (IIIP.gauges) IIIP.gauges.render(cfg);
    if (IIIP.deck) IIIP.deck.applyConfig(cfg.audioBriefing, this.deckMeta);
    if (IIIP.dispatcher) IIIP.dispatcher.setConfig(cfg);
  };

  Engine.prototype.bindText = function (cfg) {
    var nodes = document.querySelectorAll('[data-bind]');
    Array.prototype.forEach.call(nodes, function (node) {
      var value = resolvePath(cfg, node.getAttribute('data-bind'));
      if (value === undefined) return;
      if (typeof value === 'string') value = tokenize(value, cfg);
      var prefix = node.getAttribute('data-bind-prefix') || '';
      var suffix = node.getAttribute('data-bind-suffix') || '';
      node.textContent = prefix + value + suffix;
    });

    var attrNodes = document.querySelectorAll('[data-bind-attr]');
    Array.prototype.forEach.call(attrNodes, function (node) {
      node.getAttribute('data-bind-attr').split(';').forEach(function (pair) {
        var parts = pair.split(':');
        if (parts.length < 2) return;
        var attr = parts[0].trim();
        var path = parts.slice(1).join(':').trim();
        var value = resolvePath(cfg, path);
        if (value !== undefined) node.setAttribute(attr, value);
      });
    });
  };

  Engine.prototype.bindBento = function (snapshot) {
    var grid = el('bento-grid');
    if (!grid || !snapshot || !Array.isArray(snapshot.items)) return;

    grid.innerHTML = '';

    snapshot.items.forEach(function (item, index) {
      var card = document.createElement('article');
      card.className = 'bento-card ' + (item.gridSpan || '');
      card.setAttribute('tabindex', '0');
      card.setAttribute('role', 'button');
      card.setAttribute('data-slot', String(index + 1));
      card.setAttribute('aria-label', (item.title || 'Finding panel') + '. Activate to expand.');

      var metricsHtml = '';
      if (Array.isArray(item.metrics) && item.metrics.length) {
        metricsHtml = '<div class="bento-metrics">' + item.metrics.map(function (m) {
          return '<div class="metric-well">' +
            '<span class="metric-k">' + escapeHtml(m.label) + '</span>' +
            '<span class="metric-v">' + escapeHtml(m.value) +
            '<span class="metric-delta">' + escapeHtml(m.delta) + '</span></span>' +
            '</div>';
        }).join('') + '</div>';
      }

      var focusStyle = item.imageFocus ? ' style="--bento-focus:' + escapeHtml(item.imageFocus) + ';"' : '';
      var toneAttr = (item.imageTone === 'gold' || item.imageTone === 'pulse')
        ? ' data-tone="' + item.imageTone + '"'
        : '';

      var mediaContent = '';
      if (Array.isArray(item.carouselImages) && item.carouselImages.length > 1) {
        var slidesHtml = item.carouselImages.map(function (cImg, sIdx) {
          var activeCls = sIdx === 0 ? ' is-active' : '';
          var altText = cImg.alt || (cImg.title ? cImg.title + ' analytical chart illustrating ' + (cImg.subtitle || '') + ' with a measured benchmark of ' + (cImg.stat || '') + '.' : 'Analytical evidence visual supporting executive recommendation findings.');
          return '<div class="bento-slide' + activeCls + '" data-slide-index="' + sIdx + '">' +
            '<img src="' + escapeHtml(cImg.url) + '" alt="' + escapeHtml(altText) + '" width="800" height="450" class="bento-img" loading="' + (sIdx === 0 ? 'eager' : 'lazy') + '" decoding="async">' +
            '</div>';
        }).join('');

        var dotsHtml = item.carouselImages.map(function (_, sIdx) {
          var activeCls = sIdx === 0 ? ' is-active' : '';
          return '<button type="button" class="bento-dot' + activeCls + '" data-carousel-dot="' + sIdx + '" aria-label="Slide ' + (sIdx + 1) + '"></button>';
        }).join('');

        mediaContent =
          '<div class="bento-carousel" data-bento-carousel>' +
            '<div class="bento-slides">' + slidesHtml + '</div>' +
            '<div class="bento-carousel-hud">' +
              '<div class="bento-carousel-badge">' +
                '<span class="bento-carousel-pulse"></span>' +
                '<span class="bento-carousel-counter" data-carousel-counter>EVIDENCE 1 OF ' + item.carouselImages.length + '</span>' +
              '</div>' +
              '<div class="bento-carousel-nav">' +
                '<button type="button" class="bento-carousel-btn prev" data-carousel-dir="-1" aria-label="Previous Evidence">' +
                  '<svg viewBox="0 0 24 24" width="12" height="12" fill="currentColor"><path d="M15.41 7.41L14 6l-6 6 6 6 1.41-1.41L10.83 12z"/></svg>' +
                '</button>' +
                '<div class="bento-carousel-dots">' + dotsHtml + '</div>' +
                '<button type="button" class="bento-carousel-btn next" data-carousel-dir="1" aria-label="Next Evidence">' +
                  '<svg viewBox="0 0 24 24" width="12" height="12" fill="currentColor"><path d="M10 6L8.59 7.41 13.17 12l-4.58 4.59L10 18l6-6z"/></svg>' +
                '</button>' +
              '</div>' +
            '</div>' +
          '</div>';
      } else if (item.imageUrl) {
        var staticAlt = item.imageAlt || (item.title ? item.title + ' telemetry graphic detailing ' + (item.description || 'regional market intelligence.') : 'Analytical evidence visual supporting executive recommendation findings.');
        mediaContent = '<img src="' + escapeHtml(item.imageUrl) + '" alt="' + escapeHtml(staticAlt) + '" width="800" height="450" class="bento-img" loading="lazy" decoding="async" onerror="this.style.display=\'none\';"' + focusStyle + '>';
      }

      var badgeHtml = item.badge
        ? '<div class="bento-badge-row"><span class="bento-badge">' + escapeHtml(item.badge) + '</span></div>'
        : '';

      card.innerHTML =
        '<div class="bento-media"' + toneAttr + '>' +
          mediaContent +
          '<div class="bento-scrim"></div>' +
        '</div>' +
        '<div class="bento-body">' +
          '<div class="bento-copy">' +
            '<h3 class="bento-title">' + escapeHtml(item.title) + '</h3>' +
            '<p class="bento-desc">' + escapeHtml(item.description) + '</p>' +
          '</div>' +
          badgeHtml +
          metricsHtml +
          '<div class="bento-hint"><span>EXPAND DETAIL</span>' +
            '<svg viewBox="0 0 24 24" width="13" height="13" fill="currentColor"><path d="M7 14H5v5h5v-2H7v-3zm-2-4h2V7h3V5H5v5zm12 7h-3v2h5v-5h-2v3zM14 5v2h3v3h2V5h-5z"/></svg>' +
          '</div>' +
        '</div>';

      card.addEventListener('click', function (e) {
        if (e.target.closest && e.target.closest('.bento-carousel-nav')) return;
        if (IIIP.lightbox) IIIP.lightbox.open(index);
      });

      card.addEventListener('keydown', function (e) {
        if (e.key === 'Enter' || e.key === ' ') {
          if (e.target.closest && e.target.closest('.bento-carousel-nav')) return;
          e.preventDefault();
          if (IIIP.lightbox) IIIP.lightbox.open(index);
        }
      });

      grid.appendChild(card);
    });

    // Wire up carousel auto-rotation and interactive navigation
    var carousels = grid.querySelectorAll('[data-bento-carousel]');
    carousels.forEach(function (carouselEl) {
      var slides = carouselEl.querySelectorAll('.bento-slide');
      var dots = carouselEl.querySelectorAll('[data-carousel-dot]');
      var counter = carouselEl.querySelector('[data-carousel-counter]');
      var prevBtn = carouselEl.querySelector('.bento-carousel-btn.prev');
      var nextBtn = carouselEl.querySelector('.bento-carousel-btn.next');
      if (!slides.length) return;

      var current = 0;
      var count = slides.length;
      var timer = null;

      function goToSlide(n) {
        slides[current].classList.remove('is-active');
        if (dots[current]) dots[current].classList.remove('is-active');
        current = (n + count) % count;
        slides[current].classList.add('is-active');
        if (dots[current]) dots[current].classList.add('is-active');
        if (counter) counter.textContent = 'EVIDENCE ' + (current + 1) + ' OF ' + count;
      }

      function startTimer() {
        stopTimer();
        timer = setInterval(function () {
          goToSlide(current + 1);
        }, 4500);
      }

      function stopTimer() {
        if (timer) {
          clearInterval(timer);
          timer = null;
        }
      }

      startTimer();

      // Pause rotation on user inspection
      carouselEl.addEventListener('mouseenter', stopTimer);
      carouselEl.addEventListener('mouseleave', startTimer);

      if (prevBtn) {
        prevBtn.addEventListener('click', function (e) {
          e.stopPropagation();
          stopTimer();
          goToSlide(current - 1);
          startTimer();
        });
      }

      if (nextBtn) {
        nextBtn.addEventListener('click', function (e) {
          e.stopPropagation();
          stopTimer();
          goToSlide(current + 1);
          startTimer();
        });
      }

      dots.forEach(function (dot, dIdx) {
        dot.addEventListener('click', function (e) {
          e.stopPropagation();
          stopTimer();
          goToSlide(dIdx);
          startTimer();
        });
      });

      // Mobile swipe support
      var touchStartX = 0;
      carouselEl.addEventListener('touchstart', function (e) {
        touchStartX = e.changedTouches[0].screenX;
        stopTimer();
      }, { passive: true });

      carouselEl.addEventListener('touchend', function (e) {
        var touchEndX = e.changedTouches[0].screenX;
        var diff = touchStartX - touchEndX;
        if (Math.abs(diff) > 40) {
          goToSlide(diff > 0 ? current + 1 : current - 1);
        }
        startTimer();
      }, { passive: true });
    });

    if (IIIP.lightbox) IIIP.lightbox.setItems(snapshot.items);
  };

  /**
   * Rotating vitals panel.
   * Reads prospect.vitals when the research supplies a tailored set, and
   * otherwise derives a sensible set from the core prospect fields so the
   * panel is never empty regardless of how thin the payload is.
   */
  Engine.prototype.bindVitals = function (prospect) {
    var self = this;
    var spotlight = el('vital-spotlight');
    var chipRow = el('vital-chips');
    if (!spotlight || !chipRow) return;

    prospect = prospect || {};
    var vitals = [];

    if (Array.isArray(prospect.vitals) && prospect.vitals.length) {
      vitals = prospect.vitals.filter(function (v) { return v && v.label && v.value; });
    }

    if (!vitals.length) {
      var derived = [
        { label: 'Field of Practice', value: prospect.industryVector, note: 'The specialty your reputation was built on.' },
        { label: 'Standing Today', value: prospect.currentValuation, note: 'How your market currently regards your firm.' },
        { label: 'Standing Available', value: prospect.targetValuationVector, note: 'The position open to you once machine readable records are live.' },
        { label: 'Corridor Scope', value: prospect.territory, note: 'The territory held under your priority reservation.' },
        { label: 'Prepared By', value: prospect.accountLead, note: 'Your direct point of contact throughout this review.' }
      ];
      vitals = derived.filter(function (v) { return v.value; });
    }

    if (!vitals.length) return;

    this.vitals = vitals;
    this.vitalIndex = 0;

    var kEl = el('vital-spot-k');
    var vEl = el('vital-spot-v');
    var nEl = el('vital-spot-note');
    var sweep = el('vital-sweep-fill');
    var panel = el('vitals-rotator');

    chipRow.innerHTML = '';
    vitals.forEach(function (vital, i) {
      var chip = document.createElement('button');
      chip.type = 'button';
      chip.className = 'vital-chip' + (i === 0 ? ' is-active' : '');
      chip.textContent = vital.label;
      chip.setAttribute('aria-label', 'Show ' + vital.label);
      chip.addEventListener('click', function () {
        self.showVital(i, true);
      });
      chipRow.appendChild(chip);
    });

    function paint(index, immediate) {
      var vital = self.vitals[index];
      if (!vital) return;

      if (immediate) {
        if (kEl) kEl.textContent = vital.label;
        if (vEl) vEl.textContent = vital.value;
        if (nEl) nEl.textContent = vital.note || '';
        spotlight.classList.remove('is-swapping');
      } else {
        spotlight.classList.add('is-swapping');
        setTimeout(function () {
          if (kEl) kEl.textContent = vital.label;
          if (vEl) vEl.textContent = vital.value;
          if (nEl) nEl.textContent = vital.note || '';
          spotlight.classList.remove('is-swapping');
        }, 180);
      }

      var chips = chipRow.querySelectorAll('.vital-chip');
      Array.prototype.forEach.call(chips, function (chip, i) {
        chip.classList.toggle('is-active', i === index);
        chip.setAttribute('aria-pressed', String(i === index));
      });
    }

    this.showVital = function (index, manual) {
      self.vitalIndex = (index + self.vitals.length) % self.vitals.length;
      paint(self.vitalIndex, false);
      self.vitalElapsed = 0;
      if (manual) self.vitalHold = true;
    };

    paint(0, true);

    /* Drive the sweep and the advance from a single light interval */
    if (this.vitalTimer) clearInterval(this.vitalTimer);

    var DWELL = 6200;
    var STEP = 60;
    this.vitalElapsed = 0;
    this.vitalPaused = false;
    this.vitalHold = false;

    var reduced = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    if (!reduced) {
      this.vitalTimer = setInterval(function () {
        if (self.vitalPaused) return;

        self.vitalElapsed += STEP;

        /* A manual pick holds twice as long before the cycle resumes */
        var window_ = self.vitalHold ? DWELL * 2 : DWELL;
        if (sweep) sweep.style.width = Math.min((self.vitalElapsed / window_) * 100, 100) + '%';

        if (self.vitalElapsed >= window_) {
          self.vitalHold = false;
          self.vitalElapsed = 0;
          self.vitalIndex = (self.vitalIndex + 1) % self.vitals.length;
          paint(self.vitalIndex);
        }
      }, STEP);
    } else if (sweep) {
      sweep.style.width = '100%';
    }

    if (panel && !panel.dataset.wired) {
      panel.dataset.wired = 'true';
      var hold = function () {
        self.vitalPaused = true;
        panel.classList.add('is-paused');
      };
      var release = function () {
        self.vitalPaused = false;
        panel.classList.remove('is-paused');
      };
      panel.addEventListener('mouseenter', hold);
      panel.addEventListener('mouseleave', release);
      panel.addEventListener('focusin', hold);
      panel.addEventListener('focusout', release);
    }
  };

  /**
   * Personalized 16:9 AI Visibility Snapshot.
   * Renders the prospect specific infographic, wires the download action so the
   * client keeps a permanent copy, and enables the native share sheet where the
   * browser supports it.
   */
  Engine.prototype.bindSnapshot = function (snapshot, prospect) {
    var img = el('snapshot-image');
    var empty = el('snapshot-empty');
    var download = el('snapshot-download');
    var caption = el('snapshot-caption-text');
    var capture = resolveCapture(snapshot, prospect);

    var company = (prospect && prospect.companyName) ? prospect.companyName : 'Your Firm';
    var url = snapshot && snapshot.imageUrl ? snapshot.imageUrl : '';
    var slug = company.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'firm';
    var fileName = (snapshot && snapshot.fileName)
      ? snapshot.fileName
      : slug + '-ai-visibility-snapshot.pdf';

    this.snapshotCompany = company;
    this.snapshotFileName = fileName;
    this.snapshotHasImage = !!url;

    writeCaptureDate(el('snapshot-capture-statement'), capture,
      'These are our findings as of ',
      'The research capture date is not yet available.');
    writeCaptureDate(caption, capture,
      'Research captured on ',
      'Research capture date not yet available.');

    this.bindCompanyLogo(prospect);

    if (url) {
      if (img) {
        img.src = url;
        img.alt = company + ' AI Visibility Snapshot, a landscape infographic summarizing verified search visibility findings.';
        img.classList.remove('is-hidden');
      }
      if (empty) empty.classList.add('is-hidden');

      if (download) {
        download.setAttribute('href', url);
        download.setAttribute('download', fileName);
        download.removeAttribute('aria-disabled');
        download.classList.remove('btn-disabled');
      }
    } else {
      if (img) {
        img.removeAttribute('src');
        img.classList.add('is-hidden');
      }
      if (empty) empty.classList.remove('is-hidden');

      if (download) {
        download.setAttribute('href', '#');
        download.setAttribute('aria-disabled', 'true');
      }
    }

    this.wireSnapshotActions(company, fileName);
  };

  /* Floating company mark: logo when available, otherwise the company name */
  Engine.prototype.bindCompanyLogo = function (prospect) {
    var float = el('snapshot-logo-float');
    var logo = el('snapshot-logo-img');
    var fallback = el('snapshot-logo-fallback');
    if (!float) return;

    var company = (prospect && prospect.companyName) ? prospect.companyName : 'Your Firm';
    var logoUrl = (prospect && (prospect.logoUrl || prospect.companyLogoUrl)) || '';

    if (fallback) fallback.textContent = company;

    if (logoUrl && logo) {
      logo.onload = function () {
        logo.classList.remove('is-hidden');
        float.classList.add('is-loaded');
        float.classList.remove('is-empty');
      };
      logo.onerror = function () {
        logo.classList.add('is-hidden');
        float.classList.remove('is-loaded');
        float.classList.add('is-empty');
      };
      logo.alt = company + ' company mark';
      logo.src = logoUrl;
    } else {
      if (logo) {
        logo.removeAttribute('src');
        logo.classList.add('is-hidden');
      }
      float.classList.remove('is-loaded');
      float.classList.add('is-empty');
    }
  };

  Engine.prototype.wireSnapshotActions = function (company, fileName) {
    var self = this;
    var share = el('snapshot-share');
    var stage = el('snapshot-stage');
    var fileInput = el('snapshot-file-input');
    var menu = el('snapshot-share-menu');
    var download = el('snapshot-download');

    this.syncShareLinks(company);

    /* Download is client facing: one click pulls the file down, never a picker */
    if (download && !download.dataset.wired) {
      download.dataset.wired = 'true';
      download.addEventListener('click', function (e) {
        e.preventDefault();
        self.downloadSnapshot('pdf');
      });
    }

    var downloadPng = el('share-download-png');
    if (downloadPng && !downloadPng.dataset.wired) {
      downloadPng.dataset.wired = 'true';
      downloadPng.addEventListener('click', function (e) {
        e.preventDefault();
        self.closeShareMenu();
        self.downloadSnapshot('png');
      });
    }

    if (share && !share.dataset.wired) {
      share.dataset.wired = 'true';
      share.addEventListener('click', function (e) {
        e.preventDefault();
        e.stopPropagation();
        if (!menu) return;
        var willOpen = menu.classList.contains('is-hidden');
        self.closeShareMenu();
        if (willOpen) {
          menu.classList.remove('is-hidden');
          share.setAttribute('aria-expanded', 'true');
        }
      });
    }

    if (menu && !menu.dataset.wired) {
      menu.dataset.wired = 'true';

      /* 1-Click direct platform intents: native new tab without popup blocker trapping */
      ['share-linkedin', 'share-x', 'share-facebook', 'share-threads',
       'share-whatsapp', 'share-reddit', 'share-telegram'].forEach(function (id) {
        var node = el(id);
        if (!node) return;
        node.setAttribute('target', '_blank');
        node.setAttribute('rel', 'noopener noreferrer');
        node.addEventListener('click', function (e) {
          var target = node.getAttribute('href');
          if (!target || target === '#' || target.indexOf('javascript:') === 0) {
            e.preventDefault();
            return;
          }
          self.closeShareMenu();
          /* Native navigation proceeds unhindered in a new tab */
        });
      });

      var emailLink = el('share-email');
      if (emailLink) {
        emailLink.addEventListener('click', function (e) {
          e.preventDefault();
          var target = emailLink.getAttribute('href');
          if (!target || target === '#') return;
          self.closeShareMenu();
          window.location.href = target;
        });
      }

      var copyBtn = el('share-copy');
      if (copyBtn) {
        copyBtn.addEventListener('click', function () {
          self.copyShareLink(company);
        });
      }

      /* More Options reveals the secondary channels and the device share
         sheet. It always has something to show. */
      var moreBtn = el('share-more');
      var moreGroup = el('share-more-group');
      if (moreBtn && moreGroup) {
        moreBtn.addEventListener('click', function (e) {
          e.preventDefault();
          e.stopPropagation();
          var open = moreGroup.classList.toggle('is-hidden');
          moreBtn.setAttribute('aria-expanded', String(!open));
          var caret = moreBtn.querySelector('.share-menu-caret');
          if (caret) caret.textContent = open ? '+' : '\u2212';
        });
      }

      var nativeBtn = el('share-native');
      if (nativeBtn) {
        if (navigator.share) nativeBtn.classList.remove('is-hidden');
        nativeBtn.addEventListener('click', function () {
          self.nativeShare(company, self.snapshotFileName || fileName);
        });
      }

      document.addEventListener('click', function (e) {
        if (!menu.classList.contains('is-hidden')) {
          if (!menu.contains(e.target) && e.target !== share) self.closeShareMenu();
        }
      });

      document.addEventListener('keydown', function (e) {
        if (e.key === 'Escape') self.closeShareMenu();
      });
    }

    if (stage && !stage.dataset.wired) {
      stage.dataset.wired = 'true';

      stage.addEventListener('click', function (e) {
        if (e.target.closest && e.target.closest('.snapshot-actions, .share-menu')) return;

        var img = el('snapshot-image');
        var hasImage = img && !img.classList.contains('is-hidden') && img.getAttribute('src');

        if (!hasImage) {
          /* Client click never opens system file dialog. File intake is restricted to Architect Console (Ctrl+Shift+U). */
          return;
        }

        if (!IIIP.lightbox) return;
        IIIP.lightbox.openSingle({
          imageUrl: img.getAttribute('src'),
          title: company + ' AI Visibility Snapshot',
          tag: 'Personalized Findings',
          deepDive: el('snapshot-intro')
            ? el('snapshot-intro').textContent.trim()
            : 'Download a copy for your permanent records.'
        });
      });

      stage.addEventListener('keydown', function (e) {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          stage.click();
        }
      });

      ['dragenter', 'dragover'].forEach(function (evt) {
        stage.addEventListener(evt, function (e) {
          e.preventDefault();
          e.stopPropagation();
          stage.classList.add('is-dragover');
        });
      });

      ['dragleave', 'dragend'].forEach(function (evt) {
        stage.addEventListener(evt, function (e) {
          e.preventDefault();
          e.stopPropagation();
          stage.classList.remove('is-dragover');
        });
      });

      stage.addEventListener('drop', function (e) {
        e.preventDefault();
        e.stopPropagation();
        stage.classList.remove('is-dragover');
        var file = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0];
        if (file) self.ingestSnapshotFile(file);
      });
    }

    if (fileInput && !fileInput.dataset.wired) {
      fileInput.dataset.wired = 'true';
      fileInput.addEventListener('change', function (e) {
        var file = e.target.files && e.target.files[0];
        if (file) self.ingestSnapshotFile(file);
        fileInput.value = '';
      });
    }
  };

  Engine.prototype.closeShareMenu = function () {
    var menu = el('snapshot-share-menu');
    var share = el('snapshot-share');
    var moreGroup = el('share-more-group');
    var moreBtn = el('share-more');

    if (menu) menu.classList.add('is-hidden');
    if (share) share.setAttribute('aria-expanded', 'false');
    if (moreGroup) moreGroup.classList.add('is-hidden');
    if (moreBtn) {
      moreBtn.setAttribute('aria-expanded', 'false');
      var caret = moreBtn.querySelector('.share-menu-caret');
      if (caret) caret.textContent = '+';
    }
  };

  /**
   * Opens a platform intent. Tries a new window first. If the popup is
   * blocked (sandboxed frames, strict blockers) it falls back to the current
   * tab so the click always does something.
   */
  Engine.prototype.openExternal = function (url) {
    var win = null;
    try {
      win = window.open(url, '_blank', 'noopener,noreferrer,width=720,height=680');
    } catch (e) {
      win = null;
    }

    if (win) {
      try { win.opener = null; } catch (e) { /* already detached */ }
      win.focus();
      return true;
    }

    /* Popup refused. Navigate directly rather than failing silently. */
    try {
      window.location.assign(url);
      return true;
    } catch (e) {
      window.prompt('Copy this link to share', url);
      return false;
    }
  };

  /**
   * One click download of the bound snapshot. Fetches the asset into a blob
   * so the download attribute is honoured even for cross origin CDN files,
   * then falls back to a direct link, then to opening the image.
   */
  Engine.prototype.downloadSnapshot = function () {
    var self = this;
    var img = el('snapshot-image');
    var button = el('snapshot-download');
    var src = img ? img.getAttribute('src') : '';
    var fileName = this.snapshotFileName || 'ai-visibility-snapshot.webp';

    if (!src) {
      this.flashButton(button, 'Snapshot Pending');
      return false;
    }

    function saveBlob(blob) {
      var objectUrl = URL.createObjectURL(blob);
      self.triggerDownload(objectUrl, fileName);
      setTimeout(function () { URL.revokeObjectURL(objectUrl); }, 4000);
      self.flashButton(button, 'Saved');
    }

    /* Blob and data URLs are already local, no fetch round trip needed */
    if (src.indexOf('blob:') === 0 || src.indexOf('data:') === 0) {
      this.triggerDownload(src, fileName);
      this.flashButton(button, 'Saved');
      return true;
    }

    if (window.fetch) {
      fetch(src, { mode: 'cors' })
        .then(function (res) {
          if (!res.ok) throw new Error('fetch failed');
          return res.blob();
        })
        .then(saveBlob)
        .catch(function () {
          /* CORS or network refusal: hand the browser the raw link */
          self.triggerDownload(src, fileName);
        });
      return true;
    }

    this.triggerDownload(src, fileName);
    return true;
  };

  Engine.prototype.triggerDownload = function (href, fileName) {
    var anchor = document.createElement('a');
    anchor.href = href;
    anchor.download = fileName || '';
    anchor.rel = 'noopener';
    anchor.style.display = 'none';
    document.body.appendChild(anchor);
    anchor.click();
    document.body.removeChild(anchor);
  };

  Engine.prototype.syncShareLinks = function (company) {
    var pageUrl = window.location.href;
    var title = company + ' AI Visibility Snapshot';
    var blurb = 'Our AI visibility findings for ' + company + ', captured just before delivery.';
    var encodedUrl = encodeURIComponent(pageUrl);
    var encodedTitle = encodeURIComponent(title);
    var encodedBlurb = encodeURIComponent(blurb);
    var combined = encodeURIComponent(blurb + ' ' + pageUrl);

    function setHref(id, href) {
      var node = el(id);
      if (node) node.setAttribute('href', href);
    }

    setHref('share-linkedin', 'https://www.linkedin.com/sharing/share-offsite/?url=' + encodedUrl);
    setHref('share-x', 'https://twitter.com/intent/tweet?url=' + encodedUrl + '&text=' + encodedBlurb);
    setHref('share-facebook', 'https://www.facebook.com/sharer/sharer.php?u=' + encodedUrl);
    setHref('share-threads', 'https://www.threads.net/intent/post?text=' + combined);
    setHref('share-whatsapp', 'https://api.whatsapp.com/send?text=' + combined);
    setHref('share-reddit', 'https://www.reddit.com/submit?url=' + encodedUrl + '&title=' + encodedTitle);
    setHref('share-telegram', 'https://t.me/share/url?url=' + encodedUrl + '&text=' + encodedBlurb);
    setHref('share-email', 'mailto:?subject=' + encodedTitle +
      '&body=' + encodeURIComponent(blurb + '\n\n' + pageUrl));
  };

  Engine.prototype.copyShareLink = function (company) {
    var self = this;
    var share = el('snapshot-share');
    var pageUrl = window.location.href;

    function done() {
      self.closeShareMenu();
      self.flashButton(share, 'Link Copied');
    }

    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(pageUrl).then(done).catch(function () {
        window.prompt('Copy this link', pageUrl);
        done();
      });
      return;
    }

    window.prompt('Copy this link', pageUrl);
    done();
  };

  Engine.prototype.nativeShare = function (company, fileName) {
    var self = this;
    var img = el('snapshot-image');
    var src = img ? img.getAttribute('src') : '';
    var title = company + ' AI Visibility Snapshot';
    var blurb = 'Our AI visibility findings for ' + company + '.';
    var pageUrl = window.location.href;

    this.closeShareMenu();
    if (!navigator.share) return;

    var payload = { title: title, text: blurb, url: pageUrl };

    if (src && navigator.canShare) {
      fetch(src)
        .then(function (r) { return r.blob(); })
        .then(function (blob) {
          var file = new File([blob], fileName || 'ai-visibility-snapshot.webp', {
            type: blob.type || 'image/webp'
          });
          if (navigator.canShare({ files: [file] })) {
            return navigator.share({ files: [file], title: title, text: blurb });
          }
          return navigator.share(payload);
        })
        .catch(function () {
          navigator.share(payload).catch(function () {});
        });
      return;
    }

    navigator.share(payload).catch(function () {});
  };

  Engine.prototype.ingestSnapshotFile = function (file) {
    if (!file || !file.type || file.type.indexOf('image/') !== 0) return false;
    var objectUrl = URL.createObjectURL(file);
    return this.setSnapshotImage(objectUrl, file.name);
  };

  Engine.prototype.flashButton = function (node, message) {
    if (!node) return;
    var original = node.textContent;
    node.textContent = message;
    setTimeout(function () { node.textContent = original; }, 1900);
  };

  /* One-click review download. Same pattern as the snapshot and transcript:
     build the file locally and save it, no print dialog, no modal. */
  Engine.prototype.downloadDossier = function () {
    var self = this;
    var cfg = this.config || {};
    var prospect = cfg.prospect || {};
    var button = el('cta-btn-tertiary') || el('cta-label-tertiary');
    var company = prospect.companyName || 'Your Firm';
    var capture = this.masterCapture || resolveCapture({
      capturedAt: (cfg.diagnosticReadings && cfg.diagnosticReadings.capturedAt) ||
        (cfg.personalizedSnapshot && cfg.personalizedSnapshot.capturedAt)
    }, prospect);
    var dateLine = capture ? capture.display : '';
    var rule = '============================================================';
    var thin = '------------------------------------------------------------';
    var lines = [];

    lines.push(company + ' — AI Visibility Review', 'Prepared by MT Media AI', '');
    if (dateLine) lines.push('Findings as of ' + dateLine);
    if (prospect.executiveName) {
      lines.push('Prepared for ' + prospect.executiveName + (prospect.executiveTitle ? ', ' + prospect.executiveTitle : ''));
    }
    if (prospect.territory) lines.push('Territory: ' + prospect.territory);
    lines.push('', rule, '');

    var snap = cfg.personalizedSnapshot || {};
    lines.push('YOUR VISIBILITY SNAPSHOT', '');
    lines.push(tokenize(snap.intro || 'A visual record of what the research found at the time of capture.', cfg));
    lines.push('');

    var audio = cfg.audioBriefing || {};
    lines.push('AUDIO BRIEFING', '');
    lines.push(tokenize(audio.trackTitle || 'Your Audio Briefing', cfg));
    if (Array.isArray(audio.chapters) && audio.chapters.length) {
      lines.push('Chapters:');
      audio.chapters.forEach(function (ch) {
        lines.push('  - ' + clockFormat(ch.timeSec) + '  ' + tokenize(ch.title || '', cfg));
      });
    }
    var note = audio.personalNote;
    if (note) {
      var paras = Array.isArray(note) ? note : String(note).split(/\n{2,}/);
      lines.push('', 'A note from Kareem Daniel:');
      paras.forEach(function (p) { lines.push(tokenize(String(p), cfg)); });
    }
    lines.push('');

    lines.push('DIAGNOSTIC READINGS', '');
    var readings = (cfg.diagnosticReadings && cfg.diagnosticReadings.readings) ||
      (cfg.ignitionHub && cfg.ignitionHub.coreFour) || {};
    var order = (cfg.diagnosticReadings && Array.isArray(cfg.diagnosticReadings.order) && cfg.diagnosticReadings.order.length)
      ? cfg.diagnosticReadings.order
      : Object.keys(readings);
    if (!order.length) {
      lines.push('Readings are being prepared. Nothing here is estimated.');
    } else {
      order.forEach(function (key) {
        var r = readings[key];
        if (!r) return;
        var scoreText = (r.score === undefined || r.score === null || r.score === '')
          ? 'Awaiting research'
          : (String(r.score) + (r.unit ? r.unit : ''));
        lines.push(tokenize(r.title || key, cfg) + ': ' + scoreText);
        if (r.benchmarkValue !== undefined && r.benchmarkValue !== null && r.benchmarkValue !== '') {
          lines.push('  Benchmark: ' + tokenize(r.benchmarkLabel || 'Median', cfg) + ' ' + r.benchmarkValue + (r.unit || ''));
        } else if (r.benchmark) {
          lines.push('  Benchmark: ' + tokenize(String(r.benchmark), cfg));
        }
        if (r.description) lines.push('  ' + tokenize(String(r.description), cfg));
        if (r.implication) lines.push('  What it means: ' + tokenize(String(r.implication), cfg));
        var method = r.research && (r.research.method || r.research.sample);
        if (method) lines.push('  Measured: ' + tokenize(String(r.research.method || r.research.sample), cfg));
        lines.push('');
      });
    }

    var hub = cfg.ignitionHub || {};
    lines.push('YOUR IGNITION HUB', '');
    lines.push(tokenize(hub.sectionSubtitle || 'A read-only notebook of every source behind this review.', cfg));
    if (hub.geminiNotebookUrl) lines.push('Open it here: ' + hub.geminiNotebookUrl);
    lines.push('');

    var reservation = cfg.reservation || {};
    lines.push('PRIORITY RESERVATION', '');
    lines.push(tokenize(reservation.headline || '14 Day Priority Reservation Window', cfg));
    if (reservation.subheadline) lines.push(tokenize(reservation.subheadline, cfg));
    lines.push('');

    lines.push(thin, '', 'Next steps', '  1. Begin Stage One when ready.');
    lines.push('  2. Reserve the window to hold the territory while reviewing.');
    lines.push('  3. Reach Kareem directly: kareem@mtmediaai.com');
    lines.push('     LinkedIn: https://www.linkedin.com/in/kareemdaniel/');
    lines.push('', (cfg.disclaimer && cfg.disclaimer.notice) ? tokenize(cfg.disclaimer.notice, cfg) : '', '');

    var fileName = (slugify(company) || 'firm') + '-ai-visibility-review.txt';
    downloadText(lines.join('\n'), fileName);
    if (button) {
      var label = el('cta-label-tertiary');
      self.flashButton(label || button, 'Saved');
    }
  };

  /* Bind a locally ingested infographic to the personalized snapshot */
  Engine.prototype.setSnapshotImage = function (objectUrl, fileName) {
    if (!this.config) return false;
    if (!this.config.personalizedSnapshot) this.config.personalizedSnapshot = {};
    this.config.personalizedSnapshot.imageUrl = objectUrl;
    if (fileName) this.config.personalizedSnapshot.fileName = fileName;
    this.objectUrls.push(objectUrl);
    this.bindSnapshot(this.config.personalizedSnapshot, this.config.prospect);
    this.persist();
    return true;
  };

  Engine.prototype.bindDeck = function (audio, cfg) {
    if (!audio) return;
    cfg = cfg || this.config || {};

    var list = el('chapter-list');
    if (list && Array.isArray(audio.chapters)) {
      list.innerHTML = '';
      audio.chapters.forEach(function (ch, idx) {
        var chip = document.createElement('button');
        chip.type = 'button';
        chip.className = 'chapter-chip' + (idx === 0 ? ' is-active' : '');
        chip.setAttribute('data-time', String(ch.timeSec));
        chip.innerHTML =
          '<span>' + escapeHtml(tokenize(ch.title, cfg)) + '</span>' +
          '<span class="chapter-time">' + clockFormat(ch.timeSec) + '</span>';
        chip.addEventListener('click', function () {
          if (!IIIP.deck) return;
          IIIP.deck.seekTo(ch.timeSec);
          IIIP.deck.play();
        });
        list.appendChild(chip);
      });
    }

    this.bindPersonalNote(audio, cfg);
    this.bindTranscript(audio, cfg);

    /* Lock screen and headset controls read this, so the briefing is
       identified correctly on a phone while walking, driving, or training */
    this.deckMeta = {
      title: tokenize(audio.trackTitle || 'Audio Briefing', cfg),
      artist: (audio.speaker || 'The Forge') + ' | ' + (audio.speakerRole || 'MT Media AI'),
      album: ((cfg.prospect && cfg.prospect.companyName) || 'Your Firm') + ' AI Visibility Briefing',
      artwork: audio.artworkUrl || ''
    };
  };

  /* The personal note is written once as a template and reads as if it were
     written for this prospect: their name, firm, territory, and capture date. */
  Engine.prototype.bindPersonalNote = function (audio, cfg) {
    var quote = el('transcript-quote');
    if (!quote) return;

    var note = audio.personalNote;
    if (!note && Array.isArray(audio.transcriptHighlights) && audio.transcriptHighlights.length) {
      note = audio.transcriptHighlights[0];
    }

    quote.innerHTML = '';
    if (!note) return;

    var paragraphs = Array.isArray(note) ? note : String(note).split(/\n{2,}/);
    paragraphs.forEach(function (paragraph) {
      var text = String(tokenize(String(paragraph), cfg)).trim();
      if (!text) return;
      var p = document.createElement('p');
      p.className = 'note-text';
      p.textContent = text;
      quote.appendChild(p);
    });

    /* The note is signed by the founder personally. The Forge narrates the
       briefing itself; this closing voice is Kareem's. */
    var footer = document.createElement('footer');
    footer.className = 'note-foot';

    if (audio.noteSignature) {
      var sign = document.createElement('cite');
      sign.className = 'note-sign';
      sign.textContent = tokenize(audio.noteSignature, cfg);
      footer.appendChild(sign);
    }

    var ctaUrl = audio.noteCtaUrl || (cfg.contact && cfg.contact.linkedinUrl) || '';
    if (ctaUrl) {
      var cta = document.createElement('a');
      cta.className = 'note-cta';
      cta.href = ctaUrl;
      cta.target = '_blank';
      cta.rel = 'noopener noreferrer';
      cta.innerHTML =
        '<span class="note-cta-ico" aria-hidden="true">' +
        '<svg viewBox="0 0 24 24"><path d="M20.45 20.45h-3.56v-5.57c0-1.33-.02-3.04-1.85-3.04-1.85 0-2.14 1.45-2.14 2.94v5.67H9.35V9h3.41v1.56h.05a3.74 3.74 0 0 1 3.37-1.85c3.6 0 4.27 2.37 4.27 5.46v6.28zM5.34 7.43a2.06 2.06 0 1 1 0-4.13 2.06 2.06 0 0 1 0 4.13zM7.12 20.45H3.56V9h3.56v11.45zM22.22 0H1.77C.8 0 0 .78 0 1.75v20.5C0 23.22.79 24 1.77 24h20.45c.98 0 1.78-.78 1.78-1.75V1.75C24 .78 23.2 0 22.22 0z"/></svg>' +
        '</span><span>' + escapeHtml(tokenize(audio.noteCtaLabel || 'Connect with me on LinkedIn', cfg)) + '</span>';
      footer.appendChild(cta);
    }

    if (footer.childNodes.length) quote.appendChild(footer);
  };

  Engine.prototype.getTranscriptText = function (audio, cfg) {
    var raw = audio && audio.transcript;
    var text = '';
    if (Array.isArray(raw)) text = raw.join('\n\n');
    else if (typeof raw === 'string') text = raw;
    else if (audio && Array.isArray(audio.transcriptHighlights)) text = audio.transcriptHighlights.join('\n\n');
    return String(tokenize(text, cfg) || '').trim();
  };

  Engine.prototype.getLlmPrompt = function (cfg) {
    var audio = (cfg && cfg.audioBriefing) || {};
    var fallback = 'I run {{company}}. This is the transcript of an audio briefing about how modern AI search engines currently describe my business, with findings as of {{capturedDate}}. Summarize the key findings in plain language, explain what matters most for my business, point out anything I should verify, and list the questions I should ask next.';
    return tokenize(audio.llmPrompt || fallback, cfg);
  };

  /* Transcript hand-off: a clean download the prospect can give to any AI
     assistant. Shown only when a transcript exists. */
  Engine.prototype.bindTranscript = function (audio, cfg) {
    var self = this;
    var card = el('deck-transcript');
    if (!card) return;

    var url = audio.transcriptUrl ? String(audio.transcriptUrl).trim() : '';
    var available = !!(url || this.getTranscriptText(audio, cfg));
    card.classList.toggle('is-hidden', !available);
    if (!available) return;

    var heading = el('transcript-heading');
    var copy = el('transcript-copy');
    var download = el('transcript-download');
    var prompt = el('transcript-prompt');

    if (heading) {
      heading.textContent = tokenize(audio.transcriptHeading || 'Ask your favorite AI about this briefing', cfg);
    }
    if (copy) {
      copy.textContent = tokenize(audio.transcriptCopy || 'Download the transcript and drop it into ChatGPT, Claude, Gemini, or Perplexity. Ask it to explain what matters most for {{company}}, to challenge the findings, or to turn them into a plan. A few minutes of questions will teach you more than a single listen, and everything stays in your hands.', cfg);
    }
    if (download) download.textContent = audio.transcriptLabel || 'Download Transcript';
    if (prompt) prompt.textContent = audio.transcriptPromptLabel || 'Copy Suggested Prompt';

    if (download && !download.dataset.wired) {
      download.dataset.wired = 'true';
      download.addEventListener('click', function () { self.downloadTranscript(); });
    }
    if (prompt && !prompt.dataset.wired) {
      prompt.dataset.wired = 'true';
      prompt.addEventListener('click', function () { self.copyLlmPrompt(); });
    }
  };

  Engine.prototype.downloadTranscript = function () {
    var cfg = this.config || {};
    var audio = cfg.audioBriefing || {};
    var prospect = cfg.prospect || {};
    var button = el('transcript-download');
    var company = prospect.companyName || 'Your Firm';
    var base = slugify(company) + '-audio-briefing-transcript';
    var url = audio.transcriptUrl ? String(audio.transcriptUrl).trim() : '';

    if (url) {
      var pathExt = (url.split('?')[0].match(/\.([a-z0-9]{2,4})$/i) || [])[1];
      downloadFromUrl(url, audio.transcriptFileName || (base + '.' + (pathExt || 'txt')));
      this.flashButton(button, 'Saved');
      return;
    }

    var text = this.getTranscriptText(audio, cfg);
    if (!text) {
      this.flashButton(button, 'Transcript Pending');
      return;
    }

    var capture = resolveCapture(cfg.personalizedSnapshot, prospect);
    var rule = '------------------------------------------------------------';
    var lines = [
      company + ' AI Visibility Briefing: Transcript',
      'Narrated by ' + (audio.speaker || 'The Forge') + ' | ' + (audio.speakerRole || 'MT Media AI')
    ];
    if (capture) lines.push('Findings as of ' + capture.display);
    if (prospect.executiveName) {
      lines.push('Prepared for ' + prospect.executiveName + (prospect.executiveTitle ? ', ' + prospect.executiveTitle : ''));
    }
    lines.push(
      '', rule, '', text, '', rule, '',
      'HOW TO USE THIS WITH AN AI ASSISTANT',
      'Upload or paste this file into ChatGPT, Claude, Gemini, or Perplexity, then try this prompt:',
      '', this.getLlmPrompt(cfg), ''
    );

    downloadText(lines.join('\n'), base + '.txt');
    this.flashButton(button, 'Saved');
  };

  Engine.prototype.copyLlmPrompt = function () {
    var self = this;
    var button = el('transcript-prompt');
    var prompt = this.getLlmPrompt(this.config || {});

    function done() { self.flashButton(button, 'Prompt Copied'); }

    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(prompt).then(done).catch(function () {
        window.prompt('Copy this prompt', prompt);
      });
      return;
    }
    window.prompt('Copy this prompt', prompt);
  };

  /* A transcript dropped onto the deck becomes the downloadable transcript */
  Engine.prototype.setTranscriptFile = function (file) {
    var self = this;
    if (!this.config || !file) return false;

    var audio = this.config.audioBriefing || (this.config.audioBriefing = {});
    var name = file.name || 'transcript.txt';

    if (/\.pdf$/i.test(name) || file.type === 'application/pdf') {
      audio.transcriptUrl = URL.createObjectURL(file);
      audio.transcriptFileName = name;
      this.bindTranscript(audio, this.config);
      return true;
    }

    var reader = new FileReader();
    reader.onload = function (e) {
      audio.transcript = String(e.target.result || '');
      audio.transcriptUrl = '';
      audio.transcriptFileName = '';
      self.bindTranscript(audio, self.config);
      self.persist();
    };
    reader.readAsText(file);
    return true;
  };

  Engine.prototype.bindGemini = function (hub, cfg) {
    var self = this;
    cfg = cfg || this.config || {};
    hub = hub || {};

    var url = hub.geminiNotebookUrl ? String(hub.geminiNotebookUrl).trim() : '';
    var launch = el('gemini-launch');
    var readout = el('gemini-verify-value');
    var valid = this.validateUrl(url);

    /* Grounded capabilities per official Google Gemini Notebook documentation */
    var capabilities = Array.isArray(hub.capabilities) ? hub.capabilities : [
      'Ask questions in plain language and get grounded answers drawn strictly from your curated sources.',
      'Click any in-line citation number to open the exact passage and source document the answer came from.',
      'Review the executive briefing doc, FAQ, and strategic overview already prepared for your firm.',
      'Listen to the audio briefing overview, or generate tailored summaries and mind maps on demand.'
    ];

    var list = el('hub-capability-list');
    if (list) {
      list.innerHTML = '';
      capabilities.forEach(function (entry) {
        if (!entry) return;
        var li = document.createElement('li');
        li.textContent = tokenize(typeof entry === 'string' ? entry : entry.label, cfg);
        list.appendChild(li);
      });
    }

    var assurances = Array.isArray(hub.assurances) ? hub.assurances : [
      'Grounded strictly in verified sources',
      'Read-only shareable notebook',
      'Zero sales pressure'
    ];

    var row = el('hub-assurances');
    if (row) {
      row.innerHTML = '';
      assurances.forEach(function (entry) {
        if (!entry) return;
        var pill = document.createElement('span');
        pill.className = 'assurance';
        pill.textContent = '\u2713 ' + tokenize(typeof entry === 'string' ? entry : entry.label, cfg);
        row.appendChild(pill);
      });
    }

    var launchLabel = el('hub-launch-label');
    if (launchLabel) launchLabel.textContent = tokenize(hub.launchLabel || 'Open Your Ignition Hub', cfg);

    var note = el('hub-access-note');
    if (note) {
      note.textContent = tokenize(hub.accessNote ||
        'Opens in a new tab. Access the notebook with any Google account to review sources and ask natural language questions. The notebook is delivered as a read-only shareable link, so nothing you do there can alter the research.', cfg);
    }

    if (launch) {
      if (valid) {
        launch.setAttribute('href', url);
        launch.classList.remove('btn-disabled');
        launch.removeAttribute('aria-disabled');
      } else {
        launch.setAttribute('href', '#');
        launch.classList.add('btn-disabled');
        launch.setAttribute('aria-disabled', 'true');
      }
    }

    /* Direct native launch in a new tab without popup blocker traps */
    if (launch && !launch.dataset.wired) {
      launch.dataset.wired = 'true';
      launch.setAttribute('target', '_blank');
      launch.setAttribute('rel', 'noopener noreferrer');
      launch.addEventListener('click', function (e) {
        var target = launch.getAttribute('href');
        if (!target || target === '#' || target.indexOf('javascript:') === 0) {
          e.preventDefault();
          return;
        }
      });
    }

    if (readout) {
      readout.textContent = valid ? url : (hub.linkPendingLabel || 'Link assigned upon delivery');
      readout.classList.toggle('is-verified', valid);
    }

    /* Offline route for anyone without a Google account or behind a block */
    var fallback = el('hub-fallback-link');
    if (fallback) {
      var packUrl = hub.offlinePackUrl ? String(hub.offlinePackUrl).trim() : '';
      var contact = cfg.contact || {};
      if (this.validateUrl(packUrl)) {
        fallback.setAttribute('href', packUrl);
        fallback.setAttribute('download', 'research-data-pack.pdf');
        fallback.textContent = hub.offlinePackLabel || 'Download the complete data pack instead';
      } else {
        fallback.setAttribute('href', contact.emailUrl || 'mailto:kareem@mtmediaai.com?subject=Data%20pack%20request');
        fallback.removeAttribute('download');
        fallback.textContent = hub.offlineRequestLabel || 'Request the offline data pack by email';
      }
    }

    return valid;
  };

  Engine.prototype.validateUrl = function (url) {
    if (!url) return false;
    try {
      var parsed = new URL(url);
      return parsed.protocol === 'https:' || parsed.protocol === 'http:';
    } catch (e) {
      return false;
    }
  };

  /**
   * Gemini Notebook share links look like:
   *   https://notebook.google.com/notebook/<id>
   * The product was renamed from NotebookLM, so the previous
   * notebooklm.google.com host is still accepted.
   */
  Engine.prototype.validateNotebookUrl = function (url) {
    if (!this.validateUrl(url)) return false;
    try {
      var host = new URL(String(url).trim()).hostname.toLowerCase();
      return host === 'notebook.google.com' ||
             host === 'notebooklm.google.com' ||
             /(^|\.)notebook(lm)?\.google\.com$/.test(host);
    } catch (e) {
      return false;
    }
  };

  Engine.prototype.bindCtas = function (ctas) {
    if (!ctas) return;
    ['primary', 'secondary', 'tertiary', 'quaternary'].forEach(function (tier) {
      var cta = ctas[tier];
      if (!cta) return;

      var label = el('cta-label-' + tier);
      var badge = el('cta-badge-' + tier);
      var copy = el('cta-copy-' + tier);
      var cardTitle = el('cta-title-' + tier);
      var btn = el('cta-btn-' + tier);

      if (label && cta.label) label.textContent = cta.label;
      if (badge && cta.badge) badge.textContent = cta.badge;
      if (copy && cta.description) copy.textContent = cta.description;
      if (cardTitle && cta.title) cardTitle.textContent = cta.title;
      if (btn && cta.action) btn.setAttribute('data-action', cta.action);
      if (btn && cta.url) btn.setAttribute('data-url', cta.url);
    });
  };

  Engine.prototype.persist = function () {
    try {
      /* Blob object URLs die with the document, so they are stripped before
         the payload is cached. Otherwise a reload renders broken assets. */
      var safe = JSON.parse(JSON.stringify(this.config, function (key, value) {
        if (typeof value === 'string' && value.indexOf('blob:') === 0) return '';
        return value;
      }));
      var serialized = JSON.stringify(safe);
      sessionStorage.setItem(SESSION_CONFIG_KEY, serialized);
      localStorage.setItem(SESSION_CONFIG_KEY, serialized);
    } catch (e) {
      /* storage blocked in sandboxed frames, continue silently */
    }
  };

  /* Executive Toast Telemetry for deliverable uploads */
  Engine.prototype.showToast = function (message, isError) {
    var toast = el('iiip-toast');
    if (!toast) {
      toast = document.createElement('div');
      toast.id = 'iiip-toast';
      toast.className = 'iiip-toast';
      toast.setAttribute('role', 'status');
      toast.setAttribute('aria-live', 'polite');
      document.body.appendChild(toast);
    }

    toast.textContent = message;
    toast.className = 'iiip-toast' + (isError ? ' is-error' : '') + ' is-visible';

    if (this._toastTimer) clearTimeout(this._toastTimer);
    this._toastTimer = setTimeout(function () {
      toast.classList.remove('is-visible');
    }, 4500);
  };

  /* Automatic Deliverable Ingestion & Drop-Zone Orchestration */
  Engine.prototype.bindDeliverableUpload = function () {
    var self = this;
    if (this._deliverableUploadBound) return;
    this._deliverableUploadBound = true;

    var banner = document.querySelector('.iiip-prospect-banner');
    var fileInput = el('deliverables-file-input');

    if (!fileInput) {
      fileInput = document.createElement('input');
      fileInput.type = 'file';
      fileInput.id = 'deliverables-file-input';
      fileInput.className = 'is-hidden';
      fileInput.accept = '.json,image/*,audio/*';
      fileInput.multiple = true;
      fileInput.style.display = 'none';
      fileInput.setAttribute('aria-hidden', 'true');
      fileInput.tabIndex = -1;
      document.body.appendChild(fileInput);
    }

    fileInput.addEventListener('change', function (e) {
      if (e.target.files && e.target.files.length) {
        self.ingestDeliverables(e.target.files);
        fileInput.value = '';
      }
    });

    // Make prospect entity title trigger file picker on double-click
    var entityEl = document.querySelector('.iiip-prospect-entity');
    if (entityEl && !entityEl.dataset.uploadWired) {
      entityEl.dataset.uploadWired = 'true';
      entityEl.setAttribute('title', 'Drag & drop deliverables here or double-click to browse files');
      entityEl.style.cursor = 'pointer';
      entityEl.addEventListener('dblclick', function () {
        fileInput.click();
      });
    }

    // Drag and drop listeners across window and banner
    var dragCount = 0;
    window.addEventListener('dragenter', function (e) {
      dragCount++;
      if (banner) banner.classList.add('is-dragover');
    });

    window.addEventListener('dragleave', function (e) {
      dragCount--;
      if (dragCount <= 0 && banner) {
        dragCount = 0;
        banner.classList.remove('is-dragover');
      }
    });

    window.addEventListener('dragover', function (e) {
      e.preventDefault();
      if (banner) banner.classList.add('is-dragover');
    });

    window.addEventListener('drop', function (e) {
      e.preventDefault();
      dragCount = 0;
      if (banner) banner.classList.remove('is-dragover');

      var files = e.dataTransfer && e.dataTransfer.files;
      if (files && files.length) {
        self.ingestDeliverables(files);
      }
    });
  };

  /* Route dropped deliverable bundle (config.json, images, audio) */
  Engine.prototype.ingestDeliverables = function (files) {
    var self = this;
    var fileList = Array.prototype.slice.call(files);

    // 1. Process JSON configuration first
    var jsonFile = fileList.find(function (f) {
      return (f.name && f.name.toLowerCase().endsWith('.json')) ||
             (f.type && f.type.indexOf('json') !== -1);
    });

    if (jsonFile) {
      var reader = new FileReader();
      reader.onload = function (e) {
        try {
          var parsed = JSON.parse(e.target.result);
          if (parsed && (parsed.prospect || parsed.system || parsed.visualSnapshot)) {
            self.config = parsed;
            self.commit();
            var name = (parsed.prospect && parsed.prospect.companyName) || jsonFile.name;
            self.showToast('Deliverable Hydrated: ' + name);
            console.log('[IIIP] Deliverable successfully hydrated from drop:', jsonFile.name);
          } else {
            self.showToast('Notice: JSON dropped does not contain IIIP deliverable keys.', true);
          }
        } catch (err) {
          self.showToast('JSON Parse Error: ' + err.message, true);
        }
      };
      reader.readAsText(jsonFile);
    }

    // 2. Route images and audio files
    fileList.forEach(function (file) {
      var nameLower = (file.name || '').toLowerCase();
      if (file.type && file.type.indexOf('image/') === 0) {
        if (nameLower.indexOf('snapshot') !== -1 || nameLower.indexOf('infographic') !== -1) {
          if (typeof self.ingestSnapshotFile === 'function') {
            self.ingestSnapshotFile(file);
          }
        } else if (nameLower.indexOf('bento') !== -1 || nameLower.indexOf('carousel') !== -1) {
          var m = nameLower.match(/(\d+)/);
          var slot = m ? parseInt(m[1], 10) : 1;
          var url = URL.createObjectURL(file);
          if (typeof self.setBentoImage === 'function') {
            self.setBentoImage(url, 'carousel-' + slot);
          }
        }
      } else if ((file.type && file.type.indexOf('audio/') === 0) || /\.(mp3|wav|m4a|ogg)$/i.test(file.name)) {
        if (IIIP.deck && typeof IIIP.deck.ingestFiles === 'function') {
          IIIP.deck.ingestFiles([file]);
        }
      }
    });
  };

  /* HUD hook: inject an ingested image into a specific bento slot (1 through 5) */
  Engine.prototype.setBentoImage = function (objectUrl, slot) {
    if (!this.config || !this.config.visualSnapshot) return false;
    var items = this.config.visualSnapshot.items;
    if (!Array.isArray(items) || !items.length) return false;

    if (String(slot).indexOf('carousel-') === 0) {
      var cIdx = Math.max(0, parseInt(String(slot).replace('carousel-', ''), 10) - 1);
      if (items[0]) {
        if (!Array.isArray(items[0].carouselImages)) items[0].carouselImages = [];
        if (!items[0].carouselImages[cIdx]) {
          items[0].carouselImages[cIdx] = {
            url: objectUrl,
            title: 'Evidence ' + (cIdx + 1),
            stat: 'Verified',
            subtitle: 'Ingested Evidence Slide ' + (cIdx + 1),
            alt: 'Bento carousel evidence slide ' + (cIdx + 1)
          };
        } else {
          items[0].carouselImages[cIdx].url = objectUrl;
        }
        if (cIdx === 0) items[0].imageUrl = objectUrl;
      }
    } else {
      var index = Math.max(0, Math.min((parseInt(slot, 10) || 1) - 1, items.length - 1));
      items[index].imageUrl = objectUrl;
      if (index === 0 && Array.isArray(items[0].carouselImages) && items[0].carouselImages.length > 0) {
        items[0].carouselImages[0].url = objectUrl;
      }
    }
    this.objectUrls.push(objectUrl);

    this.bindBento(this.config.visualSnapshot);
    this.persist();
    return true;
  };

  /* HUD hook: bind the notebook share link for this prospect */
  Engine.prototype.setGeminiUrl = function (url) {
    if (!this.config) return false;
    if (!this.config.ignitionHub) this.config.ignitionHub = {};
    this.config.ignitionHub.geminiNotebookUrl = String(url || '').trim();
    var valid = this.bindGemini(this.config.ignitionHub, this.config);
    this.persist();
    return valid ? (this.validateNotebookUrl(url) ? 'notebook' : 'other') : false;
  };

  /* ======================================================================
     MODULE 2: REFUSAL CLOCK
     ====================================================================== */
  function RefusalClock() {
    this.timer = null;
    this.deadline = 0;
    this.urgencyMs = 48 * 3600 * 1000;
    this.critical = false;
  }

  RefusalClock.prototype.arm = function (cfg, reservation, capture, prospect) {
    var self = this;
    if (this.timer) clearInterval(this.timer);

    this.days = el('clock-days');
    this.hours = el('clock-hours');
    this.minutes = el('clock-minutes');
    this.seconds = el('clock-seconds');
    this.hundredths = el('clock-hundredths');
    this.display = el('clock-display');
    this.statusText = el('clock-status-text');
    this.led = el('clock-led');
    this.banner = el('clock-urgency');

    cfg = cfg || {};
    reservation = reservation || {};
    var windowDays = cfg.refusalWindowDays || 14;
    var companySlug = slugify((prospect && prospect.companyName) || '');
    var storageKey = cfg.storageKey && cfg.storageKey.indexOf('sovereign01') === -1
      ? cfg.storageKey
      : ('iiip.reservation.' + (companySlug || 'package'));
    this.urgencyMs = (cfg.urgencyThresholdHours || 48) * 3600 * 1000;

    /* Status vocabulary is config driven so each prospect can carry its own
       reservation language. Client-safe plain language fallbacks below. */
    this.labelActive = cfg.statusActive || cfg.statusLabel || 'Exclusive Hold Active';
    this.labelCritical = cfg.statusCritical || 'Closing Soon, Under 48 Hours Left';
    this.labelExpired = cfg.statusExpired || 'Reservation Window Closed';
    this.noticeExpired = cfg.expiredNotice || reservation.expiredNotice ||
      'This reservation window has closed. If you would like to reopen the conversation, reach out directly and we will take it from there.';

    var target = 0;
    var rawDeadline = cfg.targetDeadlineISO ? String(cfg.targetDeadlineISO).trim() : '';

    /* An explicit future deadline always wins. Anything else ("auto", blank,
       or stale) derives from the capture date so the window matches the
       research date shown everywhere else. */
    if (rawDeadline && rawDeadline.toLowerCase() !== 'auto') {
      var parsed = Date.parse(rawDeadline);
      if (!isNaN(parsed) && parsed > Date.now()) target = parsed;
    }

    if (!target && capture && capture.iso) {
      var base = Date.parse(capture.iso);
      if (!isNaN(base)) {
        var derived = base + windowDays * 86400000;
        if (derived > Date.now()) target = derived;
      }
    }

    if (!target) {
      try {
        var stored = parseInt(localStorage.getItem(storageKey), 10);
        if (!isNaN(stored) && stored > Date.now()) target = stored;
      } catch (e) { /* storage unavailable */ }
    }

    if (!target) {
      var fallbackBase = (capture && capture.iso && !isNaN(Date.parse(capture.iso)))
        ? Date.parse(capture.iso)
        : Date.now();
      target = fallbackBase + windowDays * 86400000;
      if (target <= Date.now()) target = Date.now() + windowDays * 86400000;
      try { localStorage.setItem(storageKey, String(target)); } catch (e) { /* noop */ }
    } else {
      try { localStorage.setItem(storageKey, String(target)); } catch (e) { /* noop */ }
    }

    this.deadline = target;
    this.tick();
    this.timer = setInterval(function () { self.tick(); }, 41);
  };

  RefusalClock.prototype.tick = function () {
    var delta = this.deadline - Date.now();

    if (delta <= 0) {
      this.expire();
      clearInterval(this.timer);
      return;
    }

    if (this.days) this.days.textContent = pad2(Math.floor(delta / 86400000));
    if (this.hours) this.hours.textContent = pad2(Math.floor((delta % 86400000) / 3600000));
    if (this.minutes) this.minutes.textContent = pad2(Math.floor((delta % 3600000) / 60000));
    if (this.seconds) this.seconds.textContent = pad2(Math.floor((delta % 60000) / 1000));
    if (this.hundredths) this.hundredths.textContent = pad2(Math.floor((delta % 1000) / 10));

    var shouldBeCritical = delta <= this.urgencyMs;
    if (shouldBeCritical !== this.critical) {
      this.critical = shouldBeCritical;
      this.setCriticalState(shouldBeCritical);
    }
  };

  RefusalClock.prototype.setCriticalState = function (critical) {
    if (this.display) this.display.classList.toggle('is-critical', critical);
    if (this.led) this.led.classList.toggle('is-critical', critical);
    if (this.banner) this.banner.classList.toggle('is-hidden', !critical);
    if (this.statusText) {
      this.statusText.classList.toggle('is-critical', critical);
      this.statusText.textContent = critical ? this.labelCritical : this.labelActive;
    }
  };

  RefusalClock.prototype.expire = function () {
    ['days', 'hours', 'minutes', 'seconds', 'hundredths'].forEach(function (key) {
      if (this[key]) this[key].textContent = '00';
    }, this);

    if (this.display) this.display.classList.add('is-critical');
    if (this.led) this.led.classList.add('is-critical');
    if (this.statusText) {
      this.statusText.classList.add('is-critical');
      this.statusText.textContent = this.labelExpired;
    }
    if (this.banner) {
      this.banner.classList.remove('is-hidden');
      this.banner.textContent = this.noticeExpired;
    }
  };

  /* ======================================================================
     MODULE 3: PLAYBACK DECK
     ====================================================================== */
  function PlaybackDeck() {
    this.deckEl = el('audio-deck');
    this.audio = el('audio-element');
    this.playBtn = el('transport-play');
    this.iconPlay = el('icon-play');
    this.iconPause = el('icon-pause');
    this.backBtn = el('transport-back');
    this.fwdBtn = el('transport-fwd');
    this.timeNow = el('time-now');
    this.timeTotal = el('time-total');
    this.scrub = el('scrub');
    this.fill = el('scrub-fill');
    this.buffer = el('scrub-buffer');
    this.tip = el('scrub-tip');
    this.canvas = el('wave-canvas');
    this.volume = el('vol-slider');
    this.muteBtn = el('transport-mute');
    this.dropzone = el('audio-dropzone');
    this.fileInput = el('audio-file-input');
    this.statusLine = el('audio-status');
    this.speedBtns = document.querySelectorAll('.speed-btn');

    this.playing = false;
    this.speed = 1;
    this.duration = 0;
    this.elapsed = 0;
    this.hasSource = false;
    this.customSource = false;
    this.resumeKey = '';
    this.lastSave = 0;
    this.scrubbing = false;
    this.meta = {};

    this.wire();
    this.wireUpload();
    this.bindMediaSession();
    this.startVisualizer();
    this.syncState();
  }

  /* Applies the payload. A source the architect dropped in during this
     session is never overwritten by a re-hydration. */
  PlaybackDeck.prototype.applyConfig = function (cfg, meta) {
    if (!cfg) return;
    this.config = cfg;
    if (meta) this.meta = meta;

    var loaded = this.audio && isFinite(this.audio.duration) && this.audio.duration > 0;
    if (cfg.totalDurationSec && !loaded) this.duration = cfg.totalDurationSec;

    if (!this.customSource && this.audio) {
      var url = cfg.audioUrl ? String(cfg.audioUrl).trim() : '';
      if (url) {
        if (this.audio.getAttribute('src') !== url) {
          this.audio.src = url;
          this.audio.load();
        }
        this.hasSource = true;
        this.resumeKey = 'iiip.audio.pos.' + url;
      } else {
        if (this.audio.getAttribute('src')) {
          this.audio.removeAttribute('src');
          this.audio.load();
        }
        this.hasSource = false;
        this.resumeKey = '';
      }
    }

    if (this.timeTotal) this.timeTotal.textContent = clockFormat(this.duration);
    this.syncState();
    this.updateMediaSession();
  };

  /* Binds a locally supplied file. Used by the drop zone, the file picker,
     and the architect console. */
  PlaybackDeck.prototype.setSource = function (url, name) {
    this.customSource = true;
    this.hasSource = true;
    this.resumeKey = '';
    this.pause();
    this.elapsed = 0;
    this.duration = 0;

    if (this.audio) {
      this.audio.src = url;
      this.audio.load();
      this.audio.playbackRate = this.speed;
    }

    this.paint(0, 0);
    if (this.timeTotal) this.timeTotal.textContent = clockFormat(0);
    this.syncState();
    this.setStatus(name ? 'Loaded ' + name : '');
    this.updateMediaSession();
  };

  PlaybackDeck.prototype.wire = function () {
    var self = this;

    if (this.playBtn) this.playBtn.addEventListener('click', function () { self.toggle(); });
    if (this.backBtn) this.backBtn.addEventListener('click', function () { self.nudge(-15); });
    if (this.fwdBtn) this.fwdBtn.addEventListener('click', function () { self.nudge(30); });

    Array.prototype.forEach.call(this.speedBtns, function (btn) {
      btn.addEventListener('click', function () {
        self.setSpeed(parseFloat(btn.getAttribute('data-speed')));
      });
    });

    if (this.volume) {
      this.volume.addEventListener('input', function (e) {
        self.setVolume(parseFloat(e.target.value));
      });
    }

    if (this.muteBtn) {
      this.muteBtn.addEventListener('click', function () {
        if (!self.volume) return;
        var muted = parseFloat(self.volume.value) === 0;
        var next = muted ? 0.85 : 0;
        self.volume.value = String(next);
        self.setVolume(next);
      });
    }

    /* Pointer events make the timeline draggable with a finger as well as a
       mouse, so it works the same on a phone as it does at a desk */
    if (this.scrub) {
      this.scrub.addEventListener('pointerdown', function (e) {
        if (!self.hasSource) { self.openPicker(); return; }
        self.scrubbing = true;
        try { self.scrub.setPointerCapture(e.pointerId); } catch (err) { /* capture unsupported */ }
        self.scrubTo(e);
      });

      this.scrub.addEventListener('pointermove', function (e) {
        if (self.scrubbing) self.scrubTo(e);
        self.hoverTip(e);
      });

      var release = function (e) {
        if (!self.scrubbing) return;
        self.scrubbing = false;
        try { self.scrub.releasePointerCapture(e.pointerId); } catch (err) { /* already released */ }
      };
      this.scrub.addEventListener('pointerup', release);
      this.scrub.addEventListener('pointercancel', release);

      this.scrub.addEventListener('keydown', function (e) {
        if (e.key === 'ArrowRight') { e.preventDefault(); self.nudge(5); }
        if (e.key === 'ArrowLeft') { e.preventDefault(); self.nudge(-5); }
      });
    }

    if (this.audio) {
      var a = this.audio;

      a.addEventListener('timeupdate', function () { self.onTime(); });
      a.addEventListener('loadedmetadata', function () {
        if (isFinite(a.duration) && a.duration > 0) {
          self.duration = a.duration;
          if (self.timeTotal) self.timeTotal.textContent = clockFormat(self.duration);
          self.restoreResume();
        }
      });
      a.addEventListener('progress', function () { self.onBuffer(); });
      a.addEventListener('play', function () { self.setPlayingUI(true); });
      a.addEventListener('pause', function () { self.setPlayingUI(false); });
      a.addEventListener('ended', function () { self.onEnd(); });
      a.addEventListener('error', function () {
        if (!a.getAttribute('src')) return;
        self.setStatus('This audio could not be loaded. Drop a new file here, or try again in a moment.', true);
      });
    }

    /* Save the listening position whenever the page is backgrounded or closed */
    window.addEventListener('pagehide', function () { self.saveResume(true); });
    document.addEventListener('visibilitychange', function () {
      if (document.hidden) self.saveResume(true);
    });
  };

  PlaybackDeck.prototype.toggle = function () {
    if (this.playing) this.pause();
    else this.play();
  };

  /* With no audio bound, play guides the owner to add the file rather than
     making noise. With audio bound it simply plays. */
  PlaybackDeck.prototype.play = function () {
    var self = this;

    if (!this.hasSource || !this.audio || !this.audio.getAttribute('src')) {
      this.setStatus('Add the audio briefing to begin.');
      this.openPicker();
      return;
    }

    var attempt = this.audio.play();
    if (attempt && typeof attempt.catch === 'function') {
      attempt.catch(function () {
        self.setStatus('Your browser held playback. Tap play once more to start.');
      });
    }
  };

  PlaybackDeck.prototype.pause = function () {
    if (this.audio) this.audio.pause();
    this.setPlayingUI(false);
    this.saveResume(true);
  };

  PlaybackDeck.prototype.onEnd = function () {
    this.setPlayingUI(false);
    this.elapsed = 0;
    this.paint(0, this.duration);
    this.clearResume();
    if (this.audio) {
      try { this.audio.currentTime = 0; } catch (e) { /* seek rejected */ }
    }
  };

  PlaybackDeck.prototype.setPlayingUI = function (on) {
    this.playing = on;
    if (this.iconPlay) this.iconPlay.classList.toggle('is-hidden', on);
    if (this.iconPause) this.iconPause.classList.toggle('is-hidden', !on);
    if (this.playBtn) this.playBtn.setAttribute('aria-label', on ? 'Pause briefing' : 'Play briefing');
    if (this.deckEl) this.deckEl.classList.toggle('is-playing', on);
    if ('mediaSession' in navigator) {
      try { navigator.mediaSession.playbackState = on ? 'playing' : 'paused'; } catch (e) { /* unsupported */ }
    }
  };

  PlaybackDeck.prototype.openPicker = function () {
    if (this.fileInput) this.fileInput.click();
  };

  /* The upload zone only shows while there is nothing to play */
  PlaybackDeck.prototype.syncState = function () {
    if (this.deckEl) this.deckEl.classList.toggle('has-audio', this.hasSource);
    if (this.dropzone) this.dropzone.classList.toggle('is-hidden', this.hasSource);
  };

  PlaybackDeck.prototype.setStatus = function (message, sticky) {
    var self = this;
    if (!this.statusLine) return;
    this.statusLine.textContent = message || '';
    clearTimeout(this.statusTimer);
    if (message && !sticky) {
      this.statusTimer = setTimeout(function () { self.statusLine.textContent = ''; }, 4600);
    }
  };

  /* Resume where the listener left off, so a commute, a workout, and a desk
     session can pick up the same briefing without hunting for the spot */
  PlaybackDeck.prototype.saveResume = function (force) {
    if (!this.resumeKey || !this.audio || !this.duration) return;
    var now = Date.now();
    if (!force && now - this.lastSave < 2500) return;
    this.lastSave = now;

    var t = this.audio.currentTime;
    try {
      if (t > 5 && t < this.duration - 8) localStorage.setItem(this.resumeKey, String(Math.floor(t)));
      else localStorage.removeItem(this.resumeKey);
    } catch (e) { /* storage unavailable */ }
  };

  PlaybackDeck.prototype.restoreResume = function () {
    if (!this.resumeKey || !this.audio) return;
    try {
      var saved = parseFloat(localStorage.getItem(this.resumeKey));
      if (isFinite(saved) && saved > 5 && saved < this.duration - 8) {
        this.audio.currentTime = saved;
        this.paint(saved, this.duration);
        this.setStatus('Picking up where you left off at ' + clockFormat(saved) + '.');
      }
    } catch (e) { /* storage unavailable */ }
  };

  PlaybackDeck.prototype.clearResume = function () {
    if (!this.resumeKey) return;
    try { localStorage.removeItem(this.resumeKey); } catch (e) { /* storage unavailable */ }
  };

  /* Lock screen, headset, and car controls: play, pause, skip, and seek all
     work with the screen off */
  PlaybackDeck.prototype.bindMediaSession = function () {
    if (!('mediaSession' in navigator)) return;
    var self = this;

    function set(action, handler) {
      try { navigator.mediaSession.setActionHandler(action, handler); } catch (e) { /* action unsupported */ }
    }

    set('play', function () { self.play(); });
    set('pause', function () { self.pause(); });
    set('seekbackward', function (d) { self.nudge(-((d && d.seekOffset) || 15)); });
    set('seekforward', function (d) { self.nudge((d && d.seekOffset) || 30); });
    set('seekto', function (d) {
      if (d && typeof d.seekTime === 'number') self.seekTo(d.seekTime);
    });
  };

  PlaybackDeck.prototype.updateMediaSession = function () {
    if (!('mediaSession' in navigator) || typeof MediaMetadata === 'undefined') return;
    var m = this.meta || {};
    try {
      var data = {
        title: m.title || 'Audio Briefing',
        artist: m.artist || 'The Forge | MT Media AI',
        album: m.album || ''
      };
      if (m.artwork) data.artwork = [{ src: m.artwork, sizes: '512x512' }];
      navigator.mediaSession.metadata = new MediaMetadata(data);
    } catch (e) { /* metadata unsupported */ }
  };

  PlaybackDeck.prototype.updatePosition = function (total) {
    if (!('mediaSession' in navigator) || !navigator.mediaSession.setPositionState) return;
    if (!isFinite(total) || total <= 0) return;
    try {
      navigator.mediaSession.setPositionState({
        duration: total,
        playbackRate: this.speed,
        position: Math.min(this.elapsed, total)
      });
    } catch (e) { /* unsupported state */ }
  };

  /* Browse and drag and drop, on the whole deck. Audio and the transcript
     can arrive together in a single drop. */
  PlaybackDeck.prototype.wireUpload = function () {
    var self = this;
    var deck = this.deckEl;
    var zone = this.dropzone;
    var input = this.fileInput;

    if (zone && input) {
      zone.addEventListener('click', function () { input.click(); });
      zone.addEventListener('keydown', function (e) {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          input.click();
        }
      });
    }

    if (input) {
      input.addEventListener('change', function (e) {
        self.ingestFiles(e.target.files);
        input.value = '';
      });
    }

    if (deck) {
      var depth = 0;

      deck.addEventListener('dragenter', function (e) {
        if (!hasFiles(e)) return;
        e.preventDefault();
        depth++;
        deck.classList.add('is-dragover');
      });

      deck.addEventListener('dragover', function (e) {
        if (!hasFiles(e)) return;
        e.preventDefault();
        if (e.dataTransfer) e.dataTransfer.dropEffect = 'copy';
      });

      deck.addEventListener('dragleave', function (e) {
        if (!hasFiles(e)) return;
        depth = Math.max(0, depth - 1);
        if (!depth) deck.classList.remove('is-dragover');
      });

      deck.addEventListener('drop', function (e) {
        if (!hasFiles(e)) return;
        e.preventDefault();
        e.stopPropagation();
        depth = 0;
        deck.classList.remove('is-dragover');
        self.ingestFiles(e.dataTransfer.files);
      });
    }
  };

  PlaybackDeck.prototype.ingestFiles = function (files) {
    if (!files || !files.length) return;

    var engine = window.IIIPEngine;
    var audioLoaded = false;
    var transcriptLoaded = false;
    var rejected = 0;

    Array.prototype.forEach.call(files, function (file) {
      var name = file.name || '';
      var type = file.type || '';

      if (type.indexOf('audio/') === 0 || /\.(mp3|wav|m4a|aac|ogg|oga|opus|flac|weba)$/i.test(name)) {
        this.setSource(URL.createObjectURL(file), name);
        audioLoaded = true;
      } else if (/\.(txt|md|pdf)$/i.test(name) || type === 'text/plain' || type === 'text/markdown' || type === 'application/pdf') {
        if (engine && engine.setTranscriptFile(file)) transcriptLoaded = true;
      } else {
        rejected++;
      }
    }, this);

    if (audioLoaded && transcriptLoaded) this.setStatus('Audio briefing and transcript loaded.');
    else if (audioLoaded) this.setStatus('Audio briefing loaded.');
    else if (transcriptLoaded) this.setStatus('Transcript loaded.');
    else if (rejected) this.setStatus('That file type is not supported. Use MP3, WAV, M4A, or OGG for audio, and TXT, MD, or PDF for the transcript.');
  };

  PlaybackDeck.prototype.seekTo = function (seconds) {
    var target = Math.max(0, Math.min(seconds, this.duration));
    this.elapsed = target;

    if (this.audio && isFinite(this.audio.duration)) {
      try { this.audio.currentTime = target; } catch (e) { /* seek rejected */ }
    }

    this.paint(target, this.duration);
    this.syncChapters(target);
  };

  PlaybackDeck.prototype.nudge = function (delta) {
    var base = (this.audio && !this.synthetic && isFinite(this.audio.currentTime))
      ? this.audio.currentTime
      : this.elapsed;
    this.seekTo(base + delta);
  };

  PlaybackDeck.prototype.setSpeed = function (speed) {
    this.speed = speed;
    if (this.audio) {
      this.audio.defaultPlaybackRate = speed;
      this.audio.playbackRate = speed;
    }
    Array.prototype.forEach.call(this.speedBtns, function (btn) {
      btn.classList.toggle('is-active', parseFloat(btn.getAttribute('data-speed')) === speed);
      btn.setAttribute('aria-pressed', String(parseFloat(btn.getAttribute('data-speed')) === speed));
    });
  };

  PlaybackDeck.prototype.setVolume = function (value) {
    if (this.audio) this.audio.volume = value;
    if (this.gain && this.ctx) this.gain.gain.setValueAtTime(value * 0.03, this.ctx.currentTime);
  };

  PlaybackDeck.prototype.scrubTo = function (event) {
    if (!this.scrub) return;
    var rect = this.scrub.getBoundingClientRect();
    if (!this.duration) return;
    var ratio = (event.clientX - rect.left) / rect.width;
    this.seekTo(Math.max(0, Math.min(ratio, 1)) * this.duration);
  };

  PlaybackDeck.prototype.hoverTip = function (event) {
    if (!this.scrub || !this.tip) return;
    var rect = this.scrub.getBoundingClientRect();
    var ratio = Math.max(0, Math.min((event.clientX - rect.left) / rect.width, 1));
    this.tip.textContent = clockFormat(ratio * this.duration);
    this.tip.style.left = (ratio * 100) + '%';
  };

  PlaybackDeck.prototype.onTime = function () {
    if (!this.audio) return;
    var total = isFinite(this.audio.duration) && this.audio.duration > 0 ? this.audio.duration : this.duration;
    this.elapsed = this.audio.currentTime;
    this.paint(this.elapsed, total);
    this.syncChapters(this.elapsed);
    this.saveResume(false);
    this.updatePosition(total);
  };

  PlaybackDeck.prototype.onBuffer = function () {
    if (!this.audio || !this.buffer) return;
    if (!this.audio.buffered || !this.audio.buffered.length) return;
    var end = this.audio.buffered.end(this.audio.buffered.length - 1);
    var total = isFinite(this.audio.duration) && this.audio.duration > 0 ? this.audio.duration : this.duration;
    this.buffer.style.width = Math.min((end / total) * 100, 100) + '%';
  };

  PlaybackDeck.prototype.paint = function (current, total) {
    var pct = total > 0 ? (current / total) * 100 : 0;
    if (this.fill) this.fill.style.width = pct + '%';
    if (this.timeNow) this.timeNow.textContent = clockFormat(current);
    if (this.scrub) this.scrub.setAttribute('aria-valuenow', String(Math.round(pct)));
  };

  PlaybackDeck.prototype.syncChapters = function (current) {
    var chips = document.querySelectorAll('.chapter-chip');
    var activeIndex = 0;
    Array.prototype.forEach.call(chips, function (chip, idx) {
      if (current >= parseFloat(chip.getAttribute('data-time'))) activeIndex = idx;
    });
    Array.prototype.forEach.call(chips, function (chip, idx) {
      chip.classList.toggle('is-active', idx === activeIndex);
    });
  };

  /* High DPI organic spectrum: pulse blue base rising into gold on peaks */
  PlaybackDeck.prototype.startVisualizer = function () {
    if (!this.canvas) return;
    var self = this;
    var ctx = this.canvas.getContext('2d');
    var bars = 72;
    var phase = 0;

    function resize() {
      var dpr = window.devicePixelRatio || 1;
      var rect = self.canvas.getBoundingClientRect();
      if (!rect.width) return;
      self.canvas.width = Math.floor(rect.width * dpr);
      self.canvas.height = Math.floor(rect.height * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      self.cssW = rect.width;
      self.cssH = rect.height;
    }

    resize();
    window.addEventListener('resize', resize);

    function frame() {
      var w = self.cssW || 900;
      var h = self.cssH || 92;

      ctx.clearRect(0, 0, w, h);

      var slot = w / bars;
      var gap = Math.max(2, slot * 0.34);

      for (var i = 0; i < bars; i++) {
        var amp;
        if (self.playing) {
          var a = Math.sin(i / 4.5 + phase * 0.085 * self.speed);
          var b = Math.cos(i / 2.7 - phase * 0.052);
          var c = Math.sin(i / 9 + phase * 0.031);
          amp = Math.abs(a * 0.5 + b * 0.3 + c * 0.2);
        } else {
          amp = 0.06 + Math.abs(Math.sin(i * 0.22 + phase * 0.008)) * 0.05;
        }

        var barH = Math.max(3, amp * h * 0.92);
        var x = i * slot;
        var y = (h - barH) / 2;

        var grad = ctx.createLinearGradient(0, y, 0, y + barH);
        if (amp > 0.72) {
          grad.addColorStop(0, '#FFD700');
          grad.addColorStop(0.5, '#D4AF37');
          grad.addColorStop(1, '#FFD700');
          ctx.shadowColor = 'rgba(212, 175, 55, 0.55)';
        } else {
          grad.addColorStop(0, '#00E5FF');
          grad.addColorStop(0.5, '#0090a8');
          grad.addColorStop(1, '#00E5FF');
          ctx.shadowColor = 'rgba(0, 229, 255, 0.4)';
        }

        ctx.shadowBlur = self.playing ? 9 : 3;
        ctx.fillStyle = grad;
        ctx.beginPath();
        if (ctx.roundRect) ctx.roundRect(x + gap / 2, y, slot - gap, barH, 2);
        else ctx.rect(x + gap / 2, y, slot - gap, barH);
        ctx.fill();
      }

      ctx.shadowBlur = 0;
      phase += 1;
      requestAnimationFrame(frame);
    }

    requestAnimationFrame(frame);
  };

  /* ======================================================================
     MODULE 4: GAUGE BANK
     ====================================================================== */
  function GaugeBank() {
    this.legacyOrder = ['delta_dg', 'aeri', 'bspf', 'epov'];
    this.current = null;
  }

  /* Coerce anything research-shaped (94.8, "94.8", "41.2%", "4.9x") to a number.
     Returns null when there is genuinely no reading, never a fake zero. */
  GaugeBank.prototype.toNum = function (value) {
    if (typeof value === 'number' && isFinite(value)) return value;
    if (typeof value !== 'string') return null;
    var match = value.replace(/,/g, '').match(/-?\d+(\.\d+)?/);
    if (!match) return null;
    var num = parseFloat(match[0]);
    return isFinite(num) ? num : null;
  };

  GaugeBank.prototype.fmt = function (num, decimals) {
    if (num === null || num === undefined || !isFinite(num)) return '—';
    var d = (typeof decimals === 'number' && decimals >= 0 && decimals <= 3) ? decimals : 1;
    return num.toFixed(d);
  };

  /* Status is never invented: research supplies it, otherwise it derives from
     the score's position on its own scale. */
  GaugeBank.prototype.deriveStatus = function (ratio) {
    if (ratio === null) return 'Awaiting research';
    if (ratio >= 0.9) return 'Exceptional';
    if (ratio >= 0.75) return 'Strong';
    if (ratio >= 0.5) return 'Developing';
    if (ratio >= 0.25) return 'Needs attention';
    return 'Critical gap';
  };

  /* Variance is computed from the two real numbers, not trusted as a string.
     research.varianceSuffix carries the plain-language tail per reading. */
  GaugeBank.prototype.computeVariance = function (view) {
    if (view.scoreNum === null || view.benchNum === null) return '';
    var delta = view.scoreNum - view.benchNum;
    var sign = delta > 0 ? '+' : (delta < 0 ? '' : '');
    var text = sign + this.fmt(delta, view.decimals) + (view.unit ? view.unit : '');
    if (view.varianceSuffix) text += ' ' + view.varianceSuffix;
    else text += ' vs median';
    return text;
  };

  /* Normalize one raw research record into a display view. Every text field
     passes through tokenize so {{company}}, {{capturedDate}}, and payload
     paths resolve per prospect. */
  GaugeBank.prototype.normalize = function (key, raw, cfg, capture) {
    var self = this;
    raw = raw || {};
    var research = raw.research || {};

    var scoreNum = this.toNum(raw.score);
    var maxNum = this.toNum(raw.max);
    if (maxNum === null || maxNum <= 0) maxNum = 100;
    var unit = raw.unit !== undefined && raw.unit !== null ? String(raw.unit) : '';
    var decimals = (typeof raw.decimals === 'number') ? raw.decimals : 1;

    var benchNum = this.toNum(raw.benchmarkValue);
    if (benchNum === null && typeof raw.benchmark === 'string') {
      benchNum = this.toNum(raw.benchmark);
    }
    var benchLabel = raw.benchmarkLabel ||
      (typeof raw.benchmark === 'string' && !/\d/.test(raw.benchmark) ? raw.benchmark : null) ||
      'Corridor median';

    var ratio = (scoreNum === null) ? null : Math.min(Math.max(scoreNum / maxNum, 0), 1);

    var view = {
      key: key,
      symbol: tokenize(raw.symbol || key, cfg),
      title: tokenize(raw.title || 'Reading', cfg),
      scoreNum: scoreNum,
      maxNum: maxNum,
      unit: unit,
      decimals: decimals,
      scoreDisplay: scoreNum === null ? '—' : this.fmt(scoreNum, decimals),
      ratio: ratio,
      color: raw.color || '#00E5FF',
      varianceSuffix: tokenize(raw.varianceSuffix || '', cfg),
      formula: tokenize(raw.formula || '', cfg),
      description: tokenize(raw.description || '', cfg),
      implication: tokenize(raw.implication || '', cfg),
      inputs: Array.isArray(raw.inputs) ? raw.inputs : (raw.formulaInputs || null),
      researchId: research.researchId || (cfg.diagnosticReadings && cfg.diagnosticReadings.researchId) || '',
      sample: tokenize(research.sample || research.sampleLabel || '', cfg),
      confidence: tokenize(research.confidence || '', cfg),
      method: tokenize(research.method || '', cfg),
      sources: Array.isArray(research.sources) ? research.sources.map(function (s) { return tokenize(String(s), cfg); }) : [],
      hasScore: scoreNum !== null
    };

    view.benchNum = benchNum;
    view.benchDisplay = benchNum === null ? '' : this.fmt(benchNum, decimals) + unit;
    view.benchLine = benchNum === null
      ? (typeof raw.benchmark === 'string' && raw.benchmark ? tokenize(raw.benchmark, cfg) : '')
      : (tokenize(benchLabel, cfg) + ' ' + view.benchDisplay);

    /* Explicit variance text wins only when the author marks it custom;
       otherwise the numbers speak for themselves. */
    if (raw.varianceMode === 'text' && raw.variance) {
      view.varianceText = tokenize(String(raw.variance), cfg);
    } else {
      view.varianceText = this.computeVariance(view);
      if (!view.varianceText && raw.variance) view.varianceText = tokenize(String(raw.variance), cfg);
    }

    view.status = raw.status ? tokenize(String(raw.status), cfg) : this.deriveStatus(ratio);
    view.capturedDisplay = capture ? capture.display : '';
    view.capturedIso = capture ? capture.iso : '';

    /* Per-reading capture override (a reading re-run on a different day). */
    if (research.capturedAt) {
      var zone = research.timeZone || (cfg.diagnosticReadings && cfg.diagnosticReadings.timeZone) ||
        (cfg.personalizedSnapshot && cfg.personalizedSnapshot.timeZone);
      var own = formatCaptureDate(String(research.capturedAt), zone);
      if (own) {
        view.capturedDisplay = own.display;
        view.capturedIso = own.iso;
      }
    }

    view.ariaLabel = view.title + (view.hasScore
      ? ' scores ' + view.scoreDisplay + (unit ? ' ' + unit : '') + '.'
      : ' is awaiting research.') + ' Activate for the full breakdown.';
    return view;
  };

  /* Resolve readings from the research-first block, falling back to the
     legacy ignitionHub.coreFour payload so older configs keep working. */
  GaugeBank.prototype.resolveSource = function (cfg) {
    cfg = cfg || {};
    var diag = cfg.diagnosticReadings || cfg.diagnostics || {};
    var readings = diag.readings || (cfg.diagnostics && cfg.diagnostics.readings) ||
      (cfg.ignitionHub && cfg.ignitionHub.coreFour) || {};
    var keys = Object.keys(readings);
    var order;

    if (Array.isArray(diag.order) && diag.order.length) {
      order = diag.order.filter(function (k) { return readings[k]; });
      keys.forEach(function (k) { if (order.indexOf(k) === -1) order.push(k); });
    } else {
      order = this.legacyOrder.filter(function (k) { return readings[k]; });
      keys.forEach(function (k) { if (order.indexOf(k) === -1) order.push(k); });
    }

    var snap = {
      capturedAt: diag.capturedAt || (cfg.personalizedSnapshot && cfg.personalizedSnapshot.capturedAt),
      timeZone: diag.timeZone || (cfg.personalizedSnapshot && cfg.personalizedSnapshot.timeZone)
    };
    var capture = resolveCapture(snap, cfg.prospect || {});

    return { diag: diag, readings: readings, order: order, capture: capture, cfg: cfg };
  };

  GaugeBank.prototype.render = function (cfg) {
    var self = this;
    var grid = el('gauge-grid');
    if (!grid) return;

    var src = this.resolveSource(cfg || {});
    var views = [];

    src.order.forEach(function (key) {
      views.push(self.normalize(key, src.readings[key], src.cfg, src.capture));
    });

    this.current = { views: views, capture: src.capture, diag: src.diag, cfg: src.cfg };
    grid.innerHTML = '';

    if (!views.length) {
      var emptyTitle = tokenize(src.diag.emptyTitle || 'Readings are being prepared', src.cfg);
      var emptyCopy = tokenize(src.diag.emptyCopy || 'Research for this firm is still being compiled. Nothing here is estimated or borrowed from another prospect.', src.cfg);
      var empty = document.createElement('div');
      empty.className = 'skeleton gauge-empty';
      empty.textContent = emptyTitle + ' — ' + emptyCopy;
      grid.appendChild(empty);
      this.renderProvenance(null);
      return;
    }

    views.forEach(function (view) {
      grid.appendChild(self.buildCard(view));
    });

    this.renderProvenance(src);

    /* Ease out sweep once the slabs are painted */
    requestAnimationFrame(function () {
      setTimeout(function () {
        var arcs = grid.querySelectorAll('.gauge-progress');
        Array.prototype.forEach.call(arcs, function (arc) {
          arc.style.strokeDashoffset = arc.getAttribute('data-offset');
        });
      }, 90);
    });
  };

  GaugeBank.prototype.buildCard = function (view) {
    var self = this;
    var radius = 60;
    var circumference = 2 * Math.PI * radius;
    var ratio = (view.ratio === null) ? 0 : view.ratio;
    var offset = circumference * (1 - ratio);

    var card = document.createElement('div');
    card.className = 'gauge-card glass' + (view.hasScore ? '' : ' is-pending');
    card.setAttribute('role', 'button');
    card.setAttribute('tabindex', '0');
    card.setAttribute('data-reading', view.key);
    card.setAttribute('aria-label', view.ariaLabel);

    var metaBits = [];
    if (view.capturedDisplay) metaBits.push('Measured ' + view.capturedDisplay);
    if (view.sample) metaBits.push(view.sample);
    if (view.confidence) metaBits.push(view.confidence);
    var metaHtml = metaBits.length
      ? '<div class="gauge-research">' + escapeHtml(metaBits.join(' · ')) + '</div>'
      : '';

    var benchHtml = view.benchLine
      ? '<div class="gauge-bench">' + escapeHtml(view.benchLine) + '</div>'
      : '';
    var varHtml = view.varianceText
      ? '<div class="gauge-var">' + escapeHtml(view.varianceText) + '</div>'
      : '';

    card.innerHTML =
      '<div class="gauge-head">' +
        '<span class="gauge-symbol">' + escapeHtml(view.symbol) + '</span>' +
        '<span class="gauge-state">' + escapeHtml(view.status) + '</span>' +
      '</div>' +
      '<div class="gauge-meter">' +
        '<svg class="gauge-svg" viewBox="0 0 140 140" aria-hidden="true">' +
          '<circle class="gauge-track" cx="70" cy="70" r="' + radius + '"></circle>' +
          '<circle class="gauge-progress" cx="70" cy="70" r="' + radius + '" stroke="' + escapeHtml(view.color) + '" ' +
            'stroke-dasharray="' + circumference + '" stroke-dashoffset="' + circumference + '" ' +
            'data-offset="' + offset + '"></circle>' +
        '</svg>' +
        '<div class="gauge-core">' +
          '<span class="gauge-score">' + escapeHtml(view.scoreDisplay) + '</span>' +
          '<span class="gauge-unit">' + escapeHtml(view.unit || '—') + '</span>' +
        '</div>' +
      '</div>' +
      '<h4 class="gauge-title">' + escapeHtml(view.title) + '</h4>' +
      benchHtml + varHtml + metaHtml +
      '<div class="gauge-hint">VIEW FULL BREAKDOWN &rsaquo;</div>';

    card.addEventListener('click', function () { self.autopsy(view); });
    card.addEventListener('keydown', function (e) {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        self.autopsy(view);
      }
    });

    return card;
  };

  /* Provenance strip: the date, the research ID, and the source count shared
     by every reading, so accuracy is auditable at a glance. */
  GaugeBank.prototype.renderProvenance = function (src) {
    var node = el('gauge-provenance');
    if (!node) return;

    if (!src) {
      node.innerHTML = '';
      node.classList.add('is-hidden');
      return;
    }

    var cfg = src.cfg || {};
    var diag = src.diag || {};
    var bits = [];

    if (src.capture) bits.push('Findings as of ' + src.capture.display);
    var researchId = diag.researchId ? tokenize(String(diag.researchId), cfg) : '';
    if (researchId) bits.push('Research ' + researchId);
    if (diag.sourceCount) bits.push(tokenize(String(diag.sourceCount), cfg));
    else {
      var total = 0;
      (this.current.views || []).forEach(function (v) { total += (v.sources || []).length; });
      if (total) bits.push(total + (total === 1 ? ' cited source' : ' cited sources'));
    }
    if (diag.methodologyNote) bits.push(tokenize(String(diag.methodologyNote), cfg));

    if (!bits.length) {
      node.innerHTML = '';
      node.classList.add('is-hidden');
      return;
    }

    node.classList.remove('is-hidden');
    node.innerHTML = '<span class="provenance-dot" aria-hidden="true"></span><span>' +
      escapeHtml(bits.join('  ·  ')) + '</span>';
    if (src.capture) node.setAttribute('data-captured-iso', src.capture.iso);
  };

  GaugeBank.prototype.autopsy = function (view) {
    var modal = el('metric-modal');
    if (!modal || !view) return;

    var cfg = (this.current && this.current.cfg) || {};
    var scoreLine = view.hasScore
      ? view.scoreDisplay + (view.unit ? view.unit : '')
      : 'Awaiting research';
    var benchLine = view.benchLine || 'Benchmark pending';
    if (view.varianceText) benchLine += '  ·  ' + view.varianceText;

    el('metric-symbol').textContent = view.symbol;
    el('metric-title').textContent = view.title;
    el('metric-score').textContent = scoreLine;
    el('metric-bench').textContent = benchLine;
    el('metric-formula').textContent = view.formula || 'Methodology recorded with the research.';
    el('metric-desc').textContent = view.description || '';
    el('metric-implication').textContent = view.implication || '';

    /* Calculation inputs: the actual numbers behind the score. */
    var inputsWrap = el('metric-inputs-wrap');
    var inputsList = el('metric-inputs');
    var hasInputs = !!(view.inputs && (
      (Array.isArray(view.inputs) && view.inputs.length) ||
      (!Array.isArray(view.inputs) && Object.keys(view.inputs).length)
    ));
    if (inputsWrap) inputsWrap.classList.toggle('is-hidden', !hasInputs);
    if (inputsList && hasInputs) {
      inputsList.innerHTML = '';
      var rows = Array.isArray(view.inputs)
        ? view.inputs
        : Object.keys(view.inputs).map(function (k) { return { label: k, value: view.inputs[k] }; });
      rows.forEach(function (row) {
        var label = tokenize(String(row.label !== undefined ? row.label : ''), cfg);
        var value = tokenize(String(row.value !== undefined ? row.value : ''), cfg);
        var li = document.createElement('li');
        li.className = 'metric-input-row';
        var k = document.createElement('span');
        k.className = 'metric-input-k';
        k.textContent = label;
        var v = document.createElement('span');
        v.className = 'metric-input-v';
        v.textContent = value;
        li.appendChild(k);
        li.appendChild(v);
        inputsList.appendChild(li);
      });
    }

    /* Research trail: when, how much, how sure, and from where. */
    var researchWrap = el('metric-research-wrap');
    var trail = [];
    if (view.capturedDisplay) trail.push('Measured ' + view.capturedDisplay);
    if (view.sample) trail.push(view.sample);
    if (view.confidence) trail.push(view.confidence);
    if (view.researchId) trail.push('Research ' + view.researchId);
    var trailNode = el('metric-research');
    if (trailNode) trailNode.textContent = trail.join('  ·  ');

    var methodNode = el('metric-method');
    var methodWrap = el('metric-method-wrap');
    if (methodWrap) methodWrap.classList.toggle('is-hidden', !view.method);
    if (methodNode) methodNode.textContent = view.method || '';

    var sourcesWrap = el('metric-sources-wrap');
    var sourcesList = el('metric-sources');
    if (sourcesWrap) sourcesWrap.classList.toggle('is-hidden', !(view.sources && view.sources.length));
    if (sourcesList) {
      sourcesList.innerHTML = '';
      (view.sources || []).forEach(function (s) {
        var li = document.createElement('li');
        li.textContent = s;
        sourcesList.appendChild(li);
      });
    }
    if (researchWrap) {
      var showResearch = trail.length || view.method || (view.sources && view.sources.length);
      researchWrap.classList.toggle('is-hidden', !showResearch);
    }

    function close() {
      modal.classList.add('is-hidden');
      document.removeEventListener('keydown', onKey);
    }

    function onKey(e) {
      if (e.key === 'Escape') close();
    }

    var closeBtn = el('metric-close');
    var actionBtn = el('metric-action');

    if (closeBtn) closeBtn.onclick = close;
    if (actionBtn) {
      actionBtn.onclick = function () {
        close();
        if (IIIP.dispatcher) IIIP.dispatcher.trigger('ENGAGEMENT_MODAL');
      };
    }

    modal.onclick = function (e) { if (e.target === modal) close(); };
    document.addEventListener('keydown', onKey);
    modal.classList.remove('is-hidden');
  };

  /* ======================================================================
     MODULE 5: LIGHTBOX
     ====================================================================== */
  function Lightbox() {
    var self = this;

    this.items = [];
    this.index = 0;
    this.zoom = 1;

    this.modal = el('lightbox-modal');
    this.img = el('lightbox-img');
    this.tag = el('lightbox-tag');
    this.title = el('lightbox-title');
    this.deep = el('lightbox-deepdive');
    this.metrics = el('lightbox-metrics');
    this.count = el('lightbox-count');
    this.zoomOut = el('lightbox-zoom-readout');

    var bind = function (id, handler) {
      var node = el(id);
      if (node) node.addEventListener('click', handler);
    };

    bind('lightbox-close', function () { self.close(); });
    bind('lightbox-prev', function () { self.step(-1); });
    bind('lightbox-next', function () { self.step(1); });
    bind('lightbox-zin', function () { self.setZoom(self.zoom + 0.25); });
    bind('lightbox-zout', function () { self.setZoom(self.zoom - 0.25); });
    bind('lightbox-zreset', function () { self.setZoom(1); });

    if (this.modal) {
      this.modal.addEventListener('click', function (e) {
        if (e.target === self.modal) self.close();
      });
    }

    document.addEventListener('keydown', function (e) {
      if (!self.modal || self.modal.classList.contains('is-hidden')) return;
      if (e.key === 'Escape') self.close();
      if (e.key === 'ArrowLeft') self.step(-1);
      if (e.key === 'ArrowRight') self.step(1);
      if (e.key === '+' || e.key === '=') self.setZoom(self.zoom + 0.25);
      if (e.key === '-' || e.key === '_') self.setZoom(self.zoom - 0.25);
    });
  }

  Lightbox.prototype.setItems = function (items) {
    this.items = items || [];
    if (this.index >= this.items.length) this.index = 0;
  };

  /* Opens one standalone asset, used by the personalized snapshot stage.
     The grid collection is parked and restored the moment the viewer closes. */
  Lightbox.prototype.openSingle = function (item) {
    if (!this.modal || !item) return;
    this.parked = this.items;
    this.items = [item];
    this.index = 0;
    this.setZoom(1);
    this.paint();
    this.modal.classList.remove('is-hidden');
  };

  Lightbox.prototype.open = function (index) {
    if (!this.modal || !this.items.length) return;
    this.index = Math.max(0, Math.min(index, this.items.length - 1));
    this.setZoom(1);
    this.paint();
    this.modal.classList.remove('is-hidden');
  };

  Lightbox.prototype.close = function () {
    if (this.modal) this.modal.classList.add('is-hidden');
    this.setZoom(1);
    if (this.parked) {
      this.items = this.parked;
      this.parked = null;
      this.index = 0;
    }
  };

  Lightbox.prototype.step = function (delta) {
    if (!this.items.length) return;
    this.index = (this.index + delta + this.items.length) % this.items.length;
    this.setZoom(1);
    this.paint();
  };

  Lightbox.prototype.setZoom = function (value) {
    this.zoom = Math.max(0.5, Math.min(value, 3));
    if (this.img) this.img.style.transform = 'scale(' + this.zoom + ')';
    if (this.zoomOut) this.zoomOut.textContent = Math.round(this.zoom * 100) + '%';
  };

  Lightbox.prototype.paint = function () {
    var item = this.items[this.index];
    if (!item) return;

    if (this.img) {
      this.img.src = item.imageUrl || '';
      this.img.alt = item.imageAlt || (item.title ? item.title + ', expanded detail view.' : 'Expanded panel view.');
    }
    if (this.tag) this.tag.textContent = item.tag || 'INDUSTRY FINDING';
    if (this.title) this.title.textContent = item.title || '';
    if (this.deep) this.deep.textContent = item.deepDive || item.description || '';
    if (this.count) this.count.textContent = (this.index + 1) + ' / ' + this.items.length;

    if (this.metrics) {
      this.metrics.innerHTML = '';
      if (Array.isArray(item.metrics)) {
        item.metrics.forEach(function (m) {
          var cell = document.createElement('div');
          cell.className = 'metric-well';
          cell.innerHTML =
            '<span class="metric-k">' + escapeHtml(m.label) + '</span>' +
            '<span class="metric-v">' + escapeHtml(m.value) +
            '<span class="metric-delta">' + escapeHtml(m.delta) + '</span></span>';
          this.metrics.appendChild(cell);
        }, this);
      }
    }
  };

  /* ======================================================================
     MODULE 6: DISPATCHER
     ====================================================================== */
  function Dispatcher() {
    var self = this;
    this.config = {};

    document.addEventListener('click', function (e) {
      var trigger = e.target.closest ? e.target.closest('[data-action]') : null;
      if (!trigger) return;
      self.trigger(trigger.getAttribute('data-action'), trigger);
    });
  }

  Dispatcher.prototype.setConfig = function (config) {
    this.config = config || {};
  };

  Dispatcher.prototype.trigger = function (action, triggerEl) {
    var modal = el('action-modal');
    if (!modal) return;

    var tag = el('action-tag');
    var title = el('action-title');
    var body = el('action-body');
    var confirm = el('action-confirm');
    var closeBtn = el('action-close');

    var prospect = this.config.prospect || {};
    var directUrl = triggerEl && triggerEl.getAttribute('data-url');

    if (directUrl && action === 'OPEN_URL') {
      window.open(directUrl, '_blank', 'noopener,noreferrer');
      return;
    }

    function close() { modal.classList.add('is-hidden'); }

    if (closeBtn) closeBtn.onclick = close;
    modal.onclick = function (e) { if (e.target === modal) close(); };

    if (action === 'DOWNLOAD_DOSSIER') {
      if (self && typeof self.downloadDossier === 'function') {
        self.downloadDossier();
      } else if (window.IIIPEngine && typeof window.IIIPEngine.downloadDossier === 'function') {
        window.IIIPEngine.downloadDossier();
      } else {
        window.print();
      }
      return;
    }

    if (action === 'ENGAGEMENT_MODAL') {
      tag.textContent = 'Stage One';
      title.textContent = 'Begin Stage One';
      var firmName = prospect.companyName || 'your firm';
      var principalName = prospect.executiveName || 'your principal';
      var emailSub = encodeURIComponent('Authorize Stage One — ' + firmName);
      var emailBody = encodeURIComponent('Hi Kareem,\n\nWe are ready to authorize Stage One for ' + firmName + '.\n\nPrincipal: ' + principalName + '\nTerritory: ' + (prospect.territory || 'Primary Regional Corridor') + '\n\nPlease initiate the onboarding protocol.\n\nBest regards,\n' + principalName);
      var publicContactUrl = (directUrl || 'https://mtmediaai.com/contact') + '?intent=authorize-stage-one&firm=' + encodeURIComponent(firmName);

      body.innerHTML =
        '<p class="dialog-text" style="margin-bottom:1rem; color:var(--chrome-100);">We will begin quietly assembling the machine readable foundation for <strong>' +
          escapeHtml(firmName) + '</strong>, under the direction of <strong>' +
          escapeHtml(principalName) + '</strong>. Nothing about your website, your daily routine, or your existing partners needs to change.</p>' +
        '<div class="dialog-field"><div class="dialog-label">Standing available to you</div>' +
          '<code class="dialog-code onyx-well">' + escapeHtml(prospect.targetValuationVector || 'First Choice Authority') + '</code></div>' +
        '<div class="dialog-field"><div class="dialog-label">Your point of contact</div>' +
          '<code class="dialog-code onyx-well">Kareem Daniel, Principal AI Systems Architect</code></div>' +
        '<p class="dialog-flag">Onboarding begins within one business day. You will receive a short written summary before any work starts, so you always know exactly what is happening.</p>' +
        '<div style="margin-top:0.85rem; display:flex; gap:0.6rem; flex-wrap:wrap;">' +
          '<a href="mailto:kareem@mtmediaai.com?subject=' + emailSub + '&body=' + emailBody + '" class="btn btn-rim" style="font-size:0.75rem; padding:0.45rem 0.85rem; text-decoration:none;">Direct Email Authorization</a>' +
        '</div>';

      confirm.textContent = 'Proceed to Sovereign Onboarding →';
      confirm.onclick = function () {
        close();
        window.open(publicContactUrl, '_blank', 'noopener,noreferrer');
      };
      modal.classList.remove('is-hidden');
      return;
    }

    if (action === 'LOCK_REFUSAL') {
      tag.textContent = 'Reservation';
      title.textContent = 'Your Window Is Reserved';
      var resCode = 'MTM-' + Math.random().toString(36).substring(2, 10).toUpperCase();
      var territoryName = prospect.territory || 'Primary Regional Corridor';
      var ledgerUrl = (directUrl || 'https://mtmediaai.com/territory-ledger') + '?ref=' + encodeURIComponent(resCode) + '&territory=' + encodeURIComponent(territoryName);

      body.innerHTML =
        '<p class="dialog-text" style="margin-bottom:1rem; color:var(--chrome-100);">The 14 day priority window is now held for <strong>' +
          escapeHtml(prospect.companyName || 'your firm') + '</strong> across <strong>' +
          escapeHtml(territoryName) + '</strong>. We will not extend the same reservation to a competing firm in your district while it remains open.</p>' +
        '<div class="dialog-field"><div class="dialog-label">Reservation reference</div>' +
          '<code class="dialog-code onyx-well">' + resCode + '</code></div>' +
        '<p class="dialog-flag">There is no obligation attached. Review the material at your leisure, and if the timing is not right, the window simply closes with no further contact.</p>';

      confirm.textContent = 'Verify on Public Territory Ledger →';
      confirm.onclick = function () {
        close();
        window.open(ledgerUrl, '_blank', 'noopener,noreferrer');
      };
      modal.classList.remove('is-hidden');
      return;
    }

    if (action === 'FACTORY_COMMS') {
      tag.textContent = 'Direct Line';
      title.textContent = 'Send Us a Note';
      var firmForComms = prospect.companyName || 'your office';
      body.innerHTML =
        '<p class="dialog-text" style="margin-bottom:1rem; color:var(--chrome-100);">Your question goes straight to The Architect and our systems team on behalf of <strong>' +
          escapeHtml(firmForComms) + '</strong>. There is no sales follow up attached to this message.</p>' +
        '<div class="dialog-field"><div class="dialog-label">Your question or request</div>' +
          '<textarea class="dialog-input" id="factory-comms-textarea" placeholder="Ask us anything about this review or your territory findings."></textarea></div>';

      confirm.textContent = 'Send via Direct Uplink →';
      confirm.onclick = function () {
        var textarea = el('factory-comms-textarea') || modal.querySelector('textarea');
        var note = textarea ? textarea.value.trim() : '';
        close();
        if (note) {
          var mailtoUrl = 'mailto:kareem@mtmediaai.com?subject=' +
            encodeURIComponent('IIIP Review Inquiry — ' + firmForComms) +
            '&body=' + encodeURIComponent(note + '\n\n— Submitted regarding AI Visibility Review for ' + (prospect.executiveName || 'Principal'));
          window.location.href = mailtoUrl;
        } else {
          window.open('https://mtmediaai.com/contact?intent=iiip-review-inquiry&firm=' + encodeURIComponent(firmForComms), '_blank', 'noopener,noreferrer');
        }
      };
      modal.classList.remove('is-hidden');
      return;
    }
  };

  /* ======================================================================
     MODULE 7: ARCHITECT HUD (invisible dual ingestion)
     Summoned only by Ctrl+Shift+U, Cmd+Shift+U, or ?mode=architect-gate
     ====================================================================== */
  function ArchitectHUD(engine) {
    var self = this;

    this.engine = engine;
    this.veil = el('architect-hud');
    if (!this.veil) return;

    this.log = el('hud-log');
    this.slotSelect = el('hud-slot-select');
    this.geminiInput = el('hud-gemini-input');

    this.bindHotkey();
    this.bindZone('hud-dz-snapshot', 'hud-file-snapshot', function (file, zone) { self.ingestSnapshot(file, zone); });
    this.bindZone('hud-dz-image', 'hud-file-image', function (file, zone) { self.ingestImage(file, zone); });
    this.bindZone('hud-dz-audio', 'hud-file-audio', function (file, zone) { self.ingestAudio(file, zone); });
    this.bindZone('hud-dz-json', 'hud-file-json', function (file, zone) { self.ingestJson(file, zone); });
    this.bindGemini();
    this.bindExport();
    this.checkGate();
    this.restore();
  }

  ArchitectHUD.prototype.say = function (message, isError) {
    if (!this.log) return;
    this.log.textContent = message;
    this.log.classList.toggle('is-error', !!isError);
  };

  ArchitectHUD.prototype.open = function () {
    if (this.veil) this.veil.classList.remove('is-hidden');
    this.say('HUD armed. Awaiting ingestion.');
  };

  ArchitectHUD.prototype.close = function () {
    if (this.veil) this.veil.classList.add('is-hidden');
  };

  ArchitectHUD.prototype.toggle = function () {
    if (!this.veil) return;
    if (this.veil.classList.contains('is-hidden')) this.open();
    else this.close();
  };

  ArchitectHUD.prototype.bindHotkey = function () {
    var self = this;

    document.addEventListener('keydown', function (e) {
      var combo = (e.ctrlKey || e.metaKey) && e.shiftKey && (e.key === 'U' || e.key === 'u');
      if (combo) {
        e.preventDefault();
        self.toggle();
        return;
      }
      if (e.key === 'Escape' && self.veil && !self.veil.classList.contains('is-hidden')) {
        self.close();
      }
    });

    var closeBtn = el('hud-close');
    if (closeBtn) closeBtn.addEventListener('click', function () { self.close(); });

    if (this.veil) {
      this.veil.addEventListener('click', function (e) {
        if (e.target === self.veil) self.close();
      });
    }
  };

  ArchitectHUD.prototype.checkGate = function () {
    try {
      var params = new URLSearchParams(window.location.search);
      if (params.get('mode') === 'architect-gate') this.open();
    } catch (e) { /* older engine, ignore */ }
  };

  ArchitectHUD.prototype.bindZone = function (zoneId, inputId, handler) {
    var zone = el(zoneId);
    var input = el(inputId);
    if (!zone || !input) return;

    input.addEventListener('change', function (e) {
      var file = e.target.files && e.target.files[0];
      if (file) handler(file, zone);
    });

    ['dragenter', 'dragover'].forEach(function (evt) {
      zone.addEventListener(evt, function (e) {
        e.preventDefault();
        e.stopPropagation();
        zone.classList.add('is-dragover');
      });
    });

    ['dragleave', 'dragend'].forEach(function (evt) {
      zone.addEventListener(evt, function (e) {
        e.preventDefault();
        e.stopPropagation();
        zone.classList.remove('is-dragover');
      });
    });

    zone.addEventListener('drop', function (e) {
      e.preventDefault();
      e.stopPropagation();
      zone.classList.remove('is-dragover');
      var file = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0];
      if (file) handler(file, zone);
    });

    zone.addEventListener('keydown', function (e) {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        input.click();
      }
    });
  };

  ArchitectHUD.prototype.flash = function (zone) {
    if (!zone) return;
    zone.classList.add('is-success');
    setTimeout(function () { zone.classList.remove('is-success'); }, 1700);
  };

  /* Personalized 16:9 AI Visibility Snapshot ingestion */
  ArchitectHUD.prototype.ingestSnapshot = function (file, zone) {
    if (!file.type || file.type.indexOf('image/') !== 0) {
      this.say('Rejected: not a supported image type.', true);
      return;
    }

    var objectUrl = URL.createObjectURL(file);
    var ok = this.engine.setSnapshotImage(objectUrl, file.name);

    if (ok) {
      this.flash(zone);
      this.say('Personalized snapshot bound to "' + file.name + '". Download and share are live.');
    } else {
      this.say('Hydrate a configuration before binding the snapshot.', true);
    }
  };

  ArchitectHUD.prototype.ingestImage = function (file, zone) {
    if (!file.type || file.type.indexOf('image/') !== 0) {
      this.say('Rejected: not a supported image type.', true);
      return;
    }

    var slot = this.slotSelect ? this.slotSelect.value : '1';
    var objectUrl = URL.createObjectURL(file);
    var ok = this.engine.setBentoImage(objectUrl, slot);

    if (ok) {
      this.flash(zone);
      this.say('Evergreen panel ' + slot + ' bound to "' + file.name + '".');
    } else {
      this.say('No panels available for injection.', true);
    }
  };

  ArchitectHUD.prototype.ingestAudio = function (file, zone) {
    var validExt = /\.(mp3|wav|m4a|ogg)$/i.test(file.name);
    if ((!file.type || file.type.indexOf('audio/') !== 0) && !validExt) {
      this.say('Rejected: not a supported audio type.', true);
      return;
    }

    var objectUrl = URL.createObjectURL(file);
    if (IIIP.deck) IIIP.deck.setSource(objectUrl);

    this.flash(zone);
    this.say('Playback deck source bound to "' + file.name + '".');
  };

  ArchitectHUD.prototype.ingestJson = function (file, zone) {
    var self = this;
    var reader = new FileReader();

    reader.onload = function (e) {
      try {
        var parsed = JSON.parse(e.target.result);
        self.engine.init(parsed);
        self.flash(zone);
        self.say('Configuration "' + file.name + '" hydrated across all components.');

        var url = parsed.ignitionHub && parsed.ignitionHub.geminiNotebookUrl;
        if (self.geminiInput && url) self.geminiInput.value = url;
      } catch (err) {
        self.say('JSON parse failure: ' + err.message, true);
      }
    };

    reader.onerror = function () {
      self.say('File read failure.', true);
    };

    reader.readAsText(file);
  };

  ArchitectHUD.prototype.bindGemini = function () {
    var self = this;
    var btn = el('hud-gemini-bind');
    if (!btn) return;

    btn.addEventListener('click', function () {
      var url = self.geminiInput ? self.geminiInput.value.trim() : '';
      if (!url) {
        self.say('Paste the notebook share link first.', true);
        return;
      }

      var result = self.engine.setGeminiUrl(url);
      if (!result) {
        self.say('Rejected: that is not a valid https link.', true);
        return;
      }

      try { sessionStorage.setItem(SESSION_GEMINI_KEY, url); } catch (e) { /* noop */ }

      if (result === 'notebook') {
        self.say('Notebook link bound. Confirm it is shared as "Anyone with a link" before delivery.');
      } else {
        self.say('Link bound, but it is not a notebook.google.com address. Double check it.');
      }
    });
  };

  ArchitectHUD.prototype.restore = function () {
    try {
      var cached = sessionStorage.getItem(SESSION_GEMINI_KEY);
      if (cached && this.geminiInput) this.geminiInput.value = cached;
    } catch (e) { /* noop */ }
  };

  ArchitectHUD.prototype.bindExport = function () {
    var self = this;
    var btn = el('hud-export');
    if (!btn) return;

    btn.addEventListener('click', function () {
      var payload = JSON.stringify(self.engine.config || {}, null, 2);
      var blob = new Blob([payload], { type: 'application/json' });
      var url = URL.createObjectURL(blob);
      var anchor = document.createElement('a');

      anchor.href = url;
      anchor.download = 'iiip-config.json';
      document.body.appendChild(anchor);
      anchor.click();
      document.body.removeChild(anchor);
      URL.revokeObjectURL(url);

      self.say('Configuration exported to local downloads.');
    });
  };

  /* ======================================================================
     BOOTSTRAP
     ====================================================================== */
  window.IIIPEngine = new Engine();
  window.IIIP_RUNTIME = IIIP;

  document.addEventListener('DOMContentLoaded', function () {
    IIIP.hud = new ArchitectHUD(window.IIIPEngine);
    window.IIIPHud = IIIP.hud;
  });

})(window, document);
