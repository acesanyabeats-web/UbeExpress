(function () {
  'use strict';

  var SUPABASE_URL = 'https://ousaticrzizhddqfljwl.supabase.co';
  var SUPABASE_ANON_KEY = 'sb_publishable_cSTfoSAbaVbutWAxxA6Zgg_gEkmTG8H';

  var GLASS_OPTIONS = ['coupe', 'martini', 'rocks', 'highball', 'collins', 'copper_mug', 'wine', 'shot'];
  var EQUIPMENT_OPTIONS = ['shaker', 'jigger', 'strainer', 'muddler', 'bar_spoon', 'blender', 'glass'];
  var UNIT_OPTIONS = ['oz', 'ml', 'g', 'each', 'dash', 'barspoon', 'splash', 'rinse', 'whole', 'wedge', 'leaf', 'sprig', 'scoop', 'to taste'];
  var OZ_TO_ML = 29.5735;

  // Fruit Prep / Sweets Garnish Stock classification. Fresh fruit/herbs + the
  // 2 house-made batch items need daily portioning; candy/novelty/dried/tinned
  // garnish consumables need stock replenishment. Branded bottled syrups,
  // purees, cordials, spirits, dairy, sorbet/gelato, sodas and bottled juices
  // are deliberately excluded from both — they're poured to spec, not prepped
  // or restocked as garnish, and are out of scope for this feature.
  var FRUIT_SYRUP_ITEMS = [
    'lemon', 'lime', 'lime juice - fresh', 'oranges', 'orange zest', 'cucumber',
    'strawberries', 'raspberries', 'blackberry', 'pineapple', 'passion fruit',
    'lychee', 'grapefruit pink', 'cherries', 'birds eye chillies', 'peach',
    'pomegranate seeds', 'mint - fresh', 'mint', 'homemade lemonade',
    'homemade raspberry lemonade - batch'
  ];
  var SWEETS_GARNISH_ITEMS = [
    'popping candy - wizz fizz', 'popping balls - lychee', 'popping balls - passionfruit',
    'popping balls - raspberry', 'popping balls - strawberry', 'popping balls - blueberry',
    'sweetzone candy floss', 'vimto chew bar', 'vimto chew bon bon', 'skittles',
    'sprinkles (hundreds&thousands)', 'jaffa cakes', 'strawberry laces', 'cherry pencils',
    'jacks pencil sweet', 'chocolate digestives', 'giant marshmallows', 'percy pigs',
    'tuck shop foam banana', 'edible glitter', 'drip icing - blue',
    'freeze dried raspberries - new', 'dried dragonfruit', 'dried lime slices',
    'dried orange slices', 'glace cherries', 'tinned lychee', 'peach hearts',
    'chai seeds', 'coconut shaved', 'coconut dessicated', 'birthday tassel stick',
    'mini disco ball', 'mini cherry blossom tree', 'yellow bathtub ducks',
    'mermaid tails', 'ping pong balls', 'rocket lollie', 'cocktail umbrellas',
    '7.75" red/white striped paper straw', '7.75" green/white striped paper straw',
    'food colouring - green', 'chocolate chip cookie', 'crumbled shortbread'
  ];
  // Butterfly Pea (flavourless natural blue colour extract, ~0.05-0.5g/drop
  // doses) deliberately left uncategorized: it isn't fresh produce needing
  // daily portioning, and it isn't a "sweets" garnish either — a genuine
  // classification gap, flagged rather than forced into either list.
  function ingredientCategory(name) {
    var n = String(name || '').toLowerCase();
    if (FRUIT_SYRUP_ITEMS.indexOf(n) !== -1) return 'fruit_syrup';
    if (SWEETS_GARNISH_ITEMS.indexOf(n) !== -1) return 'sweets_garnish';
    return null;
  }

  // Prep-label shelf life. A real, clearly-flagged assumption, not this
  // bar's own confirmed practice: 24h is the standard conservative shelf
  // life for cut fresh fruit/herbs/juice kept refrigerated; the 2 house-made
  // batches get longer (72h) as a chilled diluted syrup/cordial-style mix.
  // Adjust PREP_SHELF_LIFE_HOURS/LONG_SHELF_LIFE_ITEMS here if actual
  // practice differs.
  var LONG_SHELF_LIFE_ITEMS = ['homemade lemonade', 'homemade raspberry lemonade - batch'];
  var PREP_SHELF_LIFE_HOURS = 24;
  var PREP_SHELF_LIFE_HOURS_LONG = 72;
  function shelfLifeHours(name) {
    return LONG_SHELF_LIFE_ITEMS.indexOf(String(name).toLowerCase()) !== -1 ?
      PREP_SHELF_LIFE_HOURS_LONG : PREP_SHELF_LIFE_HOURS;
  }
  function fmtLabelDate(d) {
    return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) +
      ' ' + d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
  }

  var state = {
    role: null,          // 'staff' | 'admin'
    cocktails: [],
    ingredients: {},     // cocktail_id -> [ingredient rows]
    ingredientPhotos: {}, // lowercase ingredient name -> photo_url
    seen: readSeen(),
    backTarget: null,    // fn the nav-back-btn calls; set by setHeader
    menuTab: 'cocktail'  // 'cocktail' | 'mocktail' — which sub-list the Cocktail Spec menu shows
  };

  // ---------- storage helpers ----------
  function readSeen() {
    try { return JSON.parse(localStorage.getItem('bar_seen_cocktails') || '[]'); }
    catch (e) { return []; }
  }
  function markSeen(id) {
    if (state.seen.indexOf(id) !== -1) return;
    state.seen.push(id);
    try { localStorage.setItem('bar_seen_cocktails', JSON.stringify(state.seen)); } catch (e) {}
  }

  // ---------- icon helper ----------
  function iconSvg(name, cls) {
    return '<svg class="' + (cls || '') + '"><use href="#icon-' + name + '"></use></svg>';
  }

  // Shared by Build Mode and the admin edit form's step-photo frames, so both
  // show the exact same icon (and, once set, the exact same cropped photo)
  // for a given step — a step row's own frame in the edit form is meant to
  // be a true preview of what Build Mode will actually show.
  function iconForStep(glass, s) {
    if (s.equipment === 'glass') return glass ? 'glass_' + glass : 'glass_rocks';
    if (EQUIPMENT_OPTIONS.indexOf(s.equipment) !== -1) return s.equipment;
    return glass ? 'glass_' + glass : 'glass_rocks';
  }
  function stepMediaHtml(glass, s) {
    // frame_height is a per-step, admin-set override (see wireFrameResizeHandle
    // below) — falls back to the CSS default (150px) when never customized.
    // object-fit:contain (see style.css) means no height ever crops the photo;
    // resizing only changes how much of the available space it fills.
    return s.photo_url
      ? '<img class="equip-icon is-photo" style="height:' + (s.frame_height || 150) + 'px" src="' + escapeHtml(s.photo_url) + '">'
      : iconSvg(iconForStep(glass, s), 'equip-icon');
  }
  function frameResizeHandleHtml() {
    return '<div class="frame-resize-handle" title="Drag to resize"></div>';
  }
  // Shared drag-to-resize-height logic for a step's photo frame, used by both
  // the admin edit form's step-frame grid and Build Mode's live step view —
  // one mechanism, two places it's wired in, per Alex's own "overview page
  // too" ask. Only changes the <img>'s own height (never a transform:scale on
  // its container), so sibling text below only shifts position in normal
  // document flow — it never resizes itself.
  function wireFrameResizeHandle(handle, imgEl, onCommit) {
    handle.addEventListener('pointerdown', function (ev) {
      ev.preventDefault();
      ev.stopPropagation();
      handle.setPointerCapture(ev.pointerId);
      var startY = ev.clientY;
      var startH = imgEl.getBoundingClientRect().height;
      var moved = false;
      function onMove(mv) {
        var dy = mv.clientY - startY;
        if (Math.abs(dy) > 3) moved = true;
        var newH = Math.max(60, Math.min(500, Math.round(startH + dy)));
        imgEl.style.height = newH + 'px';
      }
      function onUp(up) {
        handle.releasePointerCapture(up.pointerId);
        handle.removeEventListener('pointermove', onMove);
        handle.removeEventListener('pointerup', onUp);
        if (moved) onCommit(parseInt(imgEl.style.height, 10));
      }
      handle.addEventListener('pointermove', onMove);
      handle.addEventListener('pointerup', onUp);
    });
  }

  // ---------- Supabase reads ----------
  function sbSelect(table, query) {
    return fetch(SUPABASE_URL + '/rest/v1/' + table + '?' + query, {
      headers: { apikey: SUPABASE_ANON_KEY, Authorization: 'Bearer ' + SUPABASE_ANON_KEY }
    }).then(function (r) { if (!r.ok) throw new Error('Supabase read failed: ' + r.status); return r.json(); });
  }

  function loadAllData() {
    return Promise.all([
      sbSelect('cocktails', 'select=*&order=name.asc'),
      sbSelect('cocktail_ingredients', 'select=*&order=sort_order.asc'),
      sbSelect('ingredient_photos', 'select=*')
    ]).then(function (results) {
      state.cocktails = results[0];
      state.ingredients = {};
      results[1].forEach(function (row) {
        if (!state.ingredients[row.cocktail_id]) state.ingredients[row.cocktail_id] = [];
        state.ingredients[row.cocktail_id].push(row);
      });
      state.ingredientPhotos = {};
      results[2].forEach(function (row) {
        state.ingredientPhotos[String(row.name || '').toLowerCase()] = { photo_url: row.photo_url, is_stock: !!row.is_stock };
      });
    });
  }

  // ---------- photo capture/upload helpers ----------
  // Resizes any drawable source (an <img> or a <canvas>, e.g. one produced by
  // the crop modal below) to maxDim on its longest side and returns base64 JPEG.
  function resizeSourceToBase64(source, srcW, srcH, maxDim, cb) {
    var w = srcW, h = srcH;
    if (w > h && w > maxDim) { h = Math.round(h * maxDim / w); w = maxDim; }
    else if (h > maxDim) { w = Math.round(w * maxDim / h); h = maxDim; }
    var canvas = document.createElement('canvas');
    canvas.width = w; canvas.height = h;
    canvas.getContext('2d').drawImage(source, 0, 0, w, h);
    var dataUrl = canvas.toDataURL('image/jpeg', 0.82);
    cb(dataUrl.split(',')[1]);
  }

  function compressImageFile(file, maxDim, cb) {
    var reader = new FileReader();
    reader.onload = function (e) {
      var img = new Image();
      img.onload = function () { resizeSourceToBase64(img, img.width, img.height, maxDim, cb); };
      img.src = e.target.result;
    };
    reader.readAsDataURL(file);
  }

  // Full-screen crop tool: shows the picked photo with a draggable/resizable
  // crop box (corner handles + drag-to-move), so a screenshot's status bar/UI
  // chrome (or anything else unwanted) can be cropped out before it's saved as
  // a step/ingredient/finished-drink photo. "Use full photo" skips cropping
  // entirely for a photo that's already framed correctly (e.g. a straight
  // camera shot). Works from any admin device — phone or desktop.
  function showCropModal(file, onDone, onCancel) {
    var reader = new FileReader();
    reader.onload = function (e) {
      var overlay = document.createElement('div');
      overlay.id = 'crop-modal-overlay';
      overlay.innerHTML =
        '<div class="crop-stage">' +
          '<img class="crop-img" src="' + e.target.result + '">' +
          '<div class="crop-box">' +
            '<div class="crop-handle tl" data-mode="tl"></div>' +
            '<div class="crop-handle tr" data-mode="tr"></div>' +
            '<div class="crop-handle bl" data-mode="bl"></div>' +
            '<div class="crop-handle br" data-mode="br"></div>' +
          '</div>' +
        '</div>' +
        '<p class="crop-hint">Drag the corners to crop out anything you don\'t want in the photo (e.g. a screenshot\'s status bar).</p>' +
        '<div class="crop-actions">' +
          '<button type="button" class="btn btn-secondary crop-cancel-btn">Cancel</button>' +
          '<button type="button" class="btn btn-secondary crop-skip-btn">Use Full Photo</button>' +
          '<button type="button" class="btn btn-primary crop-use-btn">Crop &amp; Use</button>' +
        '</div>';
      document.body.appendChild(overlay);

      var img = overlay.querySelector('.crop-img');
      var stage = overlay.querySelector('.crop-stage');
      var box = overlay.querySelector('.crop-box');

      function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }

      function initBox() {
        var w = stage.clientWidth, h = stage.clientHeight;
        var bw = w * 0.86, bh = h * 0.86;
        box.style.width = bw + 'px';
        box.style.height = bh + 'px';
        box.style.left = ((w - bw) / 2) + 'px';
        box.style.top = ((h - bh) / 2) + 'px';
      }
      if (img.complete && img.naturalWidth) initBox(); else img.onload = initBox;

      var MIN = 32;
      function wireDrag(el, mode) {
        el.addEventListener('pointerdown', function (ev) {
          ev.preventDefault();
          ev.stopPropagation();
          el.setPointerCapture(ev.pointerId);
          var startX = ev.clientX, startY = ev.clientY;
          var startLeft = box.offsetLeft, startTop = box.offsetTop;
          var startW = box.offsetWidth, startH = box.offsetHeight;
          var stageW = stage.clientWidth, stageH = stage.clientHeight;

          function onMove(mv) {
            var dx = mv.clientX - startX, dy = mv.clientY - startY;
            if (mode === 'move') {
              box.style.left = clamp(startLeft + dx, 0, stageW - startW) + 'px';
              box.style.top = clamp(startTop + dy, 0, stageH - startH) + 'px';
              return;
            }
            var nl = startLeft, nt = startTop, nw = startW, nh = startH;
            if (mode.indexOf('l') !== -1) { nl = clamp(startLeft + dx, 0, startLeft + startW - MIN); nw = startLeft + startW - nl; }
            if (mode.indexOf('r') !== -1) { nw = clamp(startW + dx, MIN, stageW - startLeft); }
            if (mode.indexOf('t') !== -1) { nt = clamp(startTop + dy, 0, startTop + startH - MIN); nh = startTop + startH - nt; }
            if (mode.indexOf('b') !== -1) { nh = clamp(startH + dy, MIN, stageH - startTop); }
            box.style.left = nl + 'px'; box.style.top = nt + 'px';
            box.style.width = nw + 'px'; box.style.height = nh + 'px';
          }
          function onUp(up) {
            el.releasePointerCapture(up.pointerId);
            el.removeEventListener('pointermove', onMove);
            el.removeEventListener('pointerup', onUp);
          }
          el.addEventListener('pointermove', onMove);
          el.addEventListener('pointerup', onUp);
        });
      }
      wireDrag(box, 'move');
      Array.prototype.forEach.call(overlay.querySelectorAll('.crop-handle'), function (h) {
        wireDrag(h, h.getAttribute('data-mode'));
      });

      function cleanup() { overlay.remove(); }

      overlay.querySelector('.crop-cancel-btn').addEventListener('click', function () {
        cleanup();
        if (onCancel) onCancel();
      });
      overlay.querySelector('.crop-skip-btn').addEventListener('click', function () {
        resizeSourceToBase64(img, img.naturalWidth, img.naturalHeight, 1280, function (b64) {
          cleanup();
          onDone(b64);
        });
      });
      overlay.querySelector('.crop-use-btn').addEventListener('click', function () {
        // stage is sized exactly to the rendered <img> (see CSS), so the crop
        // box's own offset/size IS the crop rect in on-screen pixels — scale
        // straight to the image's natural (full-resolution) pixel coords.
        var scaleX = img.naturalWidth / stage.clientWidth;
        var scaleY = img.naturalHeight / stage.clientHeight;
        var sx = clamp(box.offsetLeft * scaleX, 0, img.naturalWidth);
        var sy = clamp(box.offsetTop * scaleY, 0, img.naturalHeight);
        var sw = Math.min(box.offsetWidth * scaleX, img.naturalWidth - sx);
        var sh = Math.min(box.offsetHeight * scaleY, img.naturalHeight - sy);
        var canvas = document.createElement('canvas');
        canvas.width = sw; canvas.height = sh;
        canvas.getContext('2d').drawImage(img, sx, sy, sw, sh, 0, 0, sw, sh);
        resizeSourceToBase64(canvas, sw, sh, 1280, function (b64) {
          cleanup();
          onDone(b64);
        });
      });
    };
    reader.readAsDataURL(file);
  }

  // source: 'camera' forces the device camera via the capture hint; 'library'
  // omits it, so the OS shows its normal photo/file picker instead (needed to
  // pick an already-downloaded image — e.g. a colleague's screenshot saved
  // from a shared album — rather than being pushed straight into the camera).
  function pickPhotoAndUpload(source, onDone, onCancel) {
    var input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    if (source === 'camera') input.capture = 'environment';
    input.style.display = 'none';
    document.body.appendChild(input);
    var settled = false;
    function fireCancel() { if (!settled) { settled = true; if (onCancel) onCancel(); } }
    input.addEventListener('cancel', fireCancel);
    input.addEventListener('change', function () {
      var file = input.files[0];
      if (input.parentNode) input.parentNode.removeChild(input);
      if (!file) { fireCancel(); return; }
      showCropModal(file, function (base64) { settled = true; onDone(base64); }, fireCancel);
    });
    input.click();
  }

  // Small action-sheet shown whenever any of the 3 admin photo buttons
  // (ingredient/step/finished-drink) is tapped: Take Photo / Choose from
  // Library, plus Remove Photo when one is already set (so a photo can be
  // inserted, swapped for a different one, or cleared, all from one button).
  function showPhotoActionMenu(hasExisting, cb) {
    var overlay = document.createElement('div');
    overlay.id = 'photo-menu-overlay';
    overlay.innerHTML =
      '<div class="photo-menu">' +
        '<button type="button" class="photo-menu-item" data-action="camera">' + iconSvg('camera') + ' Take Photo</button>' +
        '<button type="button" class="photo-menu-item" data-action="library">🖼️ Choose from Library</button>' +
        (hasExisting ? '<button type="button" class="photo-menu-item photo-menu-danger" data-action="remove">🗑️ Remove Photo</button>' : '') +
        '<button type="button" class="photo-menu-item photo-menu-cancel" data-action="cancel">Cancel</button>' +
      '</div>';
    document.body.appendChild(overlay);
    function close(action) {
      overlay.remove();
      cb(action === 'cancel' ? null : action);
    }
    overlay.addEventListener('click', function (e) {
      if (e.target === overlay) { close('cancel'); return; }
      var btn = e.target.closest('[data-action]');
      if (btn) close(btn.getAttribute('data-action'));
    });
  }

  // Shared entry point for all 3 admin photo buttons. onDone(base64, isRemoval):
  // isRemoval=true means the user chose "Remove Photo" (base64 is null) —
  // callers branch to apiRemovePhoto instead of apiUploadPhoto.
  function choosePhotoAndUpload(hasExisting, onDone, onCancel) {
    showPhotoActionMenu(hasExisting, function (action) {
      if (!action) { if (onCancel) onCancel(); return; }
      if (action === 'remove') { onDone(null, true); return; }
      pickPhotoAndUpload(action, function (base64) { onDone(base64, false); }, onCancel);
    });
  }

  function apiUploadPhoto(imageBase64, target, extra) {
    var payload = { image_base64: imageBase64, content_type: 'image/jpeg', target: target };
    extra = extra || {};
    for (var k in extra) { if (extra.hasOwnProperty(k)) payload[k] = extra[k]; }
    return fetch('/api/write', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-bar-secret': localStorage.getItem('bar_admin_secret') || '' },
      body: JSON.stringify({ action: 'upload_photo', payload: payload })
    }).then(function (r) {
      if (!r.ok) return r.json().then(function (j) { throw new Error(j.error || ('upload failed: ' + r.status)); });
      return r.json();
    });
  }

  function apiRemovePhoto(target, extra) {
    var payload = { target: target };
    extra = extra || {};
    for (var k in extra) { if (extra.hasOwnProperty(k)) payload[k] = extra[k]; }
    return fetch('/api/write', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-bar-secret': localStorage.getItem('bar_admin_secret') || '' },
      body: JSON.stringify({ action: 'remove_photo', payload: payload })
    }).then(function (r) {
      if (!r.ok) return r.json().then(function (j) { throw new Error(j.error || ('remove failed: ' + r.status)); });
      return r.json();
    });
  }

  function apiUpdateStepFrameHeight(cocktailId, stepIndex, frameHeight) {
    return fetch('/api/write', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-bar-secret': localStorage.getItem('bar_admin_secret') || '' },
      body: JSON.stringify({ action: 'update_step_frame_height', payload: { cocktail_id: cocktailId, step_index: stepIndex, frame_height: frameHeight } })
    }).then(function (r) {
      if (!r.ok) return r.json().then(function (j) { throw new Error(j.error || ('resize save failed: ' + r.status)); });
      return r.json();
    });
  }

  // Opens the OS's native multi-select file picker (no camera option, no
  // crop step — bulk-added photos are used as-is, same reasoning as "Use
  // Full Photo": reviewing/cropping N images one at a time defeats the
  // point of a bulk add; any individual frame can still be tapped afterward
  // to crop or replace just that one). Used by the edit form's "Add
  // Multiple" button to fill several step frames in one picker session.
  function pickMultiplePhotos(onFiles) {
    var input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    input.multiple = true;
    input.style.display = 'none';
    document.body.appendChild(input);
    input.addEventListener('change', function () {
      var files = Array.prototype.slice.call(input.files || []);
      if (input.parentNode) input.parentNode.removeChild(input);
      if (files.length) onFiles(files);
    });
    input.click();
  }

  function apiFetchStockPhoto(ingredientName) {
    return fetch('/api/write', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-bar-secret': localStorage.getItem('bar_admin_secret') || '' },
      body: JSON.stringify({ action: 'fetch_stock_photo', payload: { ingredient_name: ingredientName } })
    }).then(function (r) {
      if (!r.ok) return r.json().then(function (j) { throw new Error(j.error || ('search failed: ' + r.status)); });
      return r.json();
    });
  }

  function showPhotoModal(url) {
    var overlay = document.createElement('div');
    overlay.id = 'photo-modal-overlay';
    overlay.innerHTML = '<button class="close-btn">&times;</button><img src="' + escapeHtml(url) + '">';
    overlay.addEventListener('click', function (e) {
      if (e.target === overlay || e.target.classList.contains('close-btn')) overlay.remove();
    });
    document.body.appendChild(overlay);
  }

  // ---------- admin write API ----------
  function apiWrite(action, payload) {
    return fetch('/api/write', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-bar-secret': localStorage.getItem('bar_admin_secret') || '' },
      body: JSON.stringify({ action: action, payload: payload })
    }).then(function (r) {
      if (!r.ok) return r.json().then(function (j) { throw new Error(j.error || ('write failed: ' + r.status)); });
      return r.json();
    });
  }

  // ---------- auth ----------
  function tryLogin(password) {
    return fetch('/api/auth', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password: password })
    }).then(function (r) {
      if (!r.ok) throw new Error('Wrong password');
      return r.json();
    });
  }

  function boot() {
    var role = localStorage.getItem('bar_role');
    if (role) {
      state.role = role;
      showApp();
    } else {
      document.getElementById('login-btn').addEventListener('click', doLogin);
      document.getElementById('login-pw').addEventListener('keydown', function (e) {
        if (e.key === 'Enter') doLogin();
      });
    }
  }

  function doLogin() {
    var pw = document.getElementById('login-pw').value;
    var errEl = document.getElementById('login-error');
    errEl.hidden = true;
    tryLogin(pw).then(function (res) {
      state.role = res.role;
      localStorage.setItem('bar_role', res.role);
      if (res.role === 'admin' && res.secret) localStorage.setItem('bar_admin_secret', res.secret);
      showApp();
    }).catch(function () {
      errEl.textContent = 'Wrong password — try again.';
      errEl.hidden = false;
    });
  }

  function showApp() {
    document.getElementById('login-screen').hidden = true;
    var app = document.getElementById('app');
    app.hidden = false;
    document.getElementById('admin-btn').hidden = (state.role !== 'admin');
    document.getElementById('admin-btn').textContent = '+';
    document.getElementById('admin-btn').addEventListener('click', function () { openAdminEditor(null); });
    document.getElementById('nav-back-btn').addEventListener('click', function () { state.backTarget(); });
    loadAllData().then(renderMenu).catch(function (e) {
      document.getElementById('app-main').innerHTML = '<p>Could not load cocktails: ' + escapeHtml(e.message) + '</p>';
    });
  }

  function goToMenu() {
    renderMenu();
  }

  // title/showBack as before; backFn is what the nav-back-btn calls when
  // shown (defaults to returning to the Cocktail Spec menu, matching every
  // existing call site's prior behaviour — only Home-level screens need to
  // pass a different target).
  function setHeader(title, showBack, backFn) {
    document.getElementById('app-title').textContent = title;
    document.getElementById('nav-back-btn').hidden = !showBack;
    state.backTarget = backFn || goToMenu;
  }

  function escapeHtml(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  // ---------- HOME ----------
  function renderHome() {
    setHeader('🍸 Ube Express', false);
    var main = document.getElementById('app-main');
    main.innerHTML =
      '<div class="home-card" id="home-cocktail-spec">' +
        '<div class="home-card-emoji">🍸</div>' +
        '<div class="home-card-text"><h3>Cocktail Spec</h3><p>Browse the full menu, ingredients and build steps</p></div>' +
      '</div>' +
      '<div class="home-card" id="home-fruit-prep">' +
        '<div class="home-card-emoji">🍋</div>' +
        '<div class="home-card-text"><h3>Fruit Prep</h3><p>Fruit &amp; syrups to portion, sweets garnish stock to replenish</p></div>' +
      '</div>';
    document.getElementById('home-cocktail-spec').addEventListener('click', renderMenu);
    document.getElementById('home-fruit-prep').addEventListener('click', renderFruitPrep);
  }

  // ---------- MENU VIEW ----------
  // Cocktails sharing a variant_group (e.g. "Double Dutch") collapse into one
  // menu row; picking it opens a flavour picker before the normal detail view.
  // `tab` filters to just the alcoholic or non-alcoholic list (see
  // state.menuTab / cocktails.is_mocktail); the returned list is always
  // sorted A-Z by whatever label the row actually shows.
  function computeMenuDisplayList(tab) {
    var seenGroups = {};
    var list = [];
    state.cocktails.forEach(function (c) {
      var isMocktail = !!c.is_mocktail;
      if (tab === 'mocktail' && !isMocktail) return;
      if (tab === 'cocktail' && isMocktail) return;
      if (c.variant_group) {
        if (seenGroups[c.variant_group]) return;
        seenGroups[c.variant_group] = true;
        list.push({
          isGroup: true,
          variant_group: c.variant_group,
          glass: c.glass,
          members: state.cocktails.filter(function (x) { return x.variant_group === c.variant_group && !!x.is_mocktail === isMocktail; })
        });
      } else {
        list.push(c);
      }
    });
    list.sort(function (a, b) {
      var an = (a.isGroup ? a.variant_group : a.name).toLowerCase();
      var bn = (b.isGroup ? b.variant_group : b.name).toLowerCase();
      return an < bn ? -1 : (an > bn ? 1 : 0);
    });
    return list;
  }

  function renderMenu() {
    setHeader('🍸 Cocktail Spec', true, renderHome);
    var main = document.getElementById('app-main');
    var tab = state.menuTab || 'cocktail';
    var displayList = computeMenuDisplayList(tab);
    var html = '<div class="menu-tabs">' +
      '<button type="button" class="menu-tab' + (tab === 'cocktail' ? ' active' : '') + '" id="tab-cocktail">🍸 Cocktails</button>' +
      '<button type="button" class="menu-tab' + (tab === 'mocktail' ? ' active' : '') + '" id="tab-mocktail">🧃 Mocktails</button>' +
      '</div>';
    html += '<input type="text" id="menu-search" placeholder="Search ' + (tab === 'mocktail' ? 'mocktails' : 'cocktails') + '...">';

    html += '<div id="full-list">' + displayList.map(cocktailRowHtml).join('') + '</div>';
    if (!displayList.length) html += '<p style="color:var(--muted)">No ' + (tab === 'mocktail' ? 'mocktails' : 'cocktails') + ' yet' + (state.role === 'admin' ? ' — tap + to add one.' : '.') + '</p>';

    main.innerHTML = html;

    document.getElementById('tab-cocktail').addEventListener('click', function () {
      if (state.menuTab === 'cocktail') return;
      state.menuTab = 'cocktail';
      renderMenu();
    });
    document.getElementById('tab-mocktail').addEventListener('click', function () {
      if (state.menuTab === 'mocktail') return;
      state.menuTab = 'mocktail';
      renderMenu();
    });

    Array.prototype.forEach.call(main.querySelectorAll('.cocktail-row'), function (row) {
      row.addEventListener('click', function () {
        var groupName = row.getAttribute('data-group');
        if (groupName) { openVariantPicker(groupName); return; }
        openDetail(row.getAttribute('data-id'));
      });
    });
    document.getElementById('menu-search').addEventListener('input', function (e) {
      filterMenu(e.target.value.trim().toLowerCase());
    });
  }

  function cocktailRowHtml(item) {
    if (item.isGroup) {
      var anyNew = item.members.some(function (m) { return state.seen.indexOf(m.id) === -1; });
      return '<div class="cocktail-row" data-group="' + escapeHtml(item.variant_group) + '" data-name="' + escapeHtml(item.variant_group.toLowerCase()) + '">' +
        iconSvg(item.glass ? 'glass_' + item.glass : 'glass_rocks', 'glass-icon') +
        '<div class="name">' + escapeHtml(item.variant_group) + '<span class="variant-count">' + item.members.length + ' flavours</span></div>' +
        (anyNew ? '<span class="new-badge">New</span>' : '') +
        '</div>';
    }
    var isNew = state.seen.indexOf(item.id) === -1;
    return '<div class="cocktail-row" data-id="' + item.id + '" data-name="' + escapeHtml(item.name.toLowerCase()) + '">' +
      iconSvg(item.glass ? 'glass_' + item.glass : 'glass_rocks', 'glass-icon') +
      '<div class="name">' + escapeHtml(item.name) + '</div>' +
      (isNew ? '<span class="new-badge">New</span>' : '') +
      '</div>';
  }

  function openVariantPicker(groupName) {
    var members = state.cocktails.filter(function (c) { return c.variant_group === groupName; })
      .slice()
      .sort(function (a, b) {
        var an = (a.variant_label || a.name).toLowerCase();
        var bn = (b.variant_label || b.name).toLowerCase();
        return an < bn ? -1 : (an > bn ? 1 : 0);
      });
    setHeader(groupName, true, renderMenu);
    var main = document.getElementById('app-main');
    var html = '<div class="section-label">Choose a flavour</div>' +
      members.map(function (c) {
        var isNew = state.seen.indexOf(c.id) === -1;
        return '<div class="cocktail-row" data-id="' + c.id + '">' +
          iconSvg(c.glass ? 'glass_' + c.glass : 'glass_rocks', 'glass-icon') +
          '<div class="name">' + escapeHtml(c.variant_label || c.name) + '</div>' +
          (isNew ? '<span class="new-badge">New</span>' : '') +
          '</div>';
      }).join('');
    main.innerHTML = html;
    Array.prototype.forEach.call(main.querySelectorAll('.cocktail-row'), function (row) {
      row.addEventListener('click', function () { openDetail(row.getAttribute('data-id')); });
    });
  }

  function filterMenu(q) {
    Array.prototype.forEach.call(document.querySelectorAll('.cocktail-row'), function (row) {
      var name = row.getAttribute('data-name') || '';
      row.style.display = (!q || name.indexOf(q) !== -1) ? '' : 'none';
    });
  }

  // ---------- FRUIT PREP ----------
  // Distinct fruit/syrup and sweets-garnish ingredient names actually used
  // across the live menu right now (so this stays in sync as cocktails are
  // added/removed, with no separate list to hand-maintain).
  function computePrepLists() {
    var seen = {};
    var fruitSyrup = [];
    var sweetsGarnish = [];
    Object.keys(state.ingredients).forEach(function (cocktailId) {
      state.ingredients[cocktailId].forEach(function (ing) {
        var key = String(ing.name || '').toLowerCase();
        if (seen[key]) return;
        var cat = ingredientCategory(key);
        if (!cat) return;
        seen[key] = true;
        (cat === 'fruit_syrup' ? fruitSyrup : sweetsGarnish).push(ing.name);
      });
    });
    fruitSyrup.sort(function (a, b) { return a.localeCompare(b); });
    sweetsGarnish.sort(function (a, b) { return a.localeCompare(b); });
    return { fruitSyrup: fruitSyrup, sweetsGarnish: sweetsGarnish };
  }

  function fetchPrepCheckState() {
    return sbSelect('prep_checklist_state', 'select=item_name,checked');
  }

  // Direct anon-key write, deliberately bypassing the admin-secret-gated
  // /api/write proxy: any logged-in staff member should be able to tick a
  // prep item off, not just admin (see the migration's own RLS comment).
  function setPrepChecked(itemName, category, checked) {
    return fetch(SUPABASE_URL + '/rest/v1/prep_checklist_state?on_conflict=item_name', {
      method: 'POST',
      headers: {
        apikey: SUPABASE_ANON_KEY,
        Authorization: 'Bearer ' + SUPABASE_ANON_KEY,
        'Content-Type': 'application/json',
        Prefer: 'resolution=merge-duplicates'
      },
      body: JSON.stringify({
        item_name: itemName,
        category: category,
        checked: checked,
        checked_at: checked ? new Date().toISOString() : null,
        updated_at: new Date().toISOString()
      })
    }).then(function (r) { if (!r.ok) throw new Error('Save failed: ' + r.status); });
  }

  function resetPrepChecklist() {
    return fetch(SUPABASE_URL + '/rest/v1/prep_checklist_state?item_name=not.is.null', {
      method: 'DELETE',
      headers: { apikey: SUPABASE_ANON_KEY, Authorization: 'Bearer ' + SUPABASE_ANON_KEY }
    }).then(function (r) { if (!r.ok) throw new Error('Reset failed: ' + r.status); });
  }

  function prepRowHtml(name, checked) {
    var key = String(name).toLowerCase().replace(/"/g, '&quot;');
    return '<label class="prep-row' + (checked ? ' checked' : '') + '" data-item="' + escapeHtml(name) + '">' +
      '<input type="checkbox"' + (checked ? ' checked' : '') + '>' +
      '<span>' + escapeHtml(name) + '</span>' +
      '</label>';
  }

  function renderFruitPrep() {
    setHeader('🍋 Fruit Prep', true, renderHome);
    var main = document.getElementById('app-main');
    main.innerHTML = '<p style="color:var(--muted)">Loading…</p>';
    var lists = computePrepLists();

    fetchPrepCheckState().then(function (rows) {
      var checkedMap = {};
      rows.forEach(function (r) { checkedMap[String(r.item_name).toLowerCase()] = !!r.checked; });

      var html = '<div style="display:flex;gap:10px;margin-bottom:18px;">' +
        '<button id="prep-reset-btn" class="btn btn-secondary" style="flex:1;">🔄 Reset for new day</button>' +
        '<button id="prep-labels-btn" class="btn btn-primary" style="flex:1;">🏷 Label List</button>' +
        '</div>';

      html += '<div class="section-label">🍓 Fruit &amp; Syrups to Portion</div>';
      html += '<div class="prep-list">' + (lists.fruitSyrup.length ?
        lists.fruitSyrup.map(function (n) { return prepRowHtml(n, checkedMap[n.toLowerCase()]); }).join('') :
        '<p style="color:var(--muted)">Nothing on the menu needs this right now.</p>') + '</div>';

      html += '<div class="section-label">🍬 Sweets Garnish Stock to Replenish</div>';
      html += '<div class="prep-list">' + (lists.sweetsGarnish.length ?
        lists.sweetsGarnish.map(function (n) { return prepRowHtml(n, checkedMap[n.toLowerCase()]); }).join('') :
        '<p style="color:var(--muted)">Nothing on the menu needs this right now.</p>') + '</div>';

      main.innerHTML = html;

      Array.prototype.forEach.call(main.querySelectorAll('.prep-row'), function (row) {
        var checkbox = row.querySelector('input');
        checkbox.addEventListener('change', function () {
          var name = row.getAttribute('data-item');
          var cat = ingredientCategory(name);
          row.classList.toggle('checked', checkbox.checked);
          // keep the closure's own checkedMap in sync so the Label List
          // button (which reads it without a fresh fetch) reflects this
          // tick immediately, not just after a full page reload
          checkedMap[name.toLowerCase()] = checkbox.checked;
          setPrepChecked(name, cat, checkbox.checked).catch(function (e) {
            checkbox.checked = !checkbox.checked;
            row.classList.toggle('checked', checkbox.checked);
            checkedMap[name.toLowerCase()] = checkbox.checked;
            alert('Could not save: ' + e.message);
          });
        });
      });

      wireArmConfirm(document.getElementById('prep-reset-btn'), 'Tap again to reset', function () {
        resetPrepChecklist().then(renderFruitPrep).catch(function (e) { alert('Reset failed: ' + e.message); });
      });

      document.getElementById('prep-labels-btn').addEventListener('click', function () {
        var stillToDo = lists.fruitSyrup.filter(function (n) { return !checkedMap[n.toLowerCase()]; });
        renderLabelList(stillToDo);
      });
    }).catch(function (e) {
      main.innerHTML = '<p>Could not load the prep list: ' + escapeHtml(e.message) + '</p>';
    });
  }

  // Compiled from whatever's currently still unchecked in Fruit & Syrups —
  // never a separately hand-maintained list, so ticking an item off on the
  // checklist automatically drops it here next time this is opened. Sweets
  // Garnish Stock is deliberately excluded: those are restocked from sealed
  // packaging with its own long shelf life, not daily-prepped into a
  // container that needs a food-safety date label the way cut fruit does.
  function renderLabelList(items) {
    setHeader('🏷 Prep Labels', true, renderFruitPrep);
    var main = document.getElementById('app-main');
    var now = new Date();

    if (!items.length) {
      main.innerHTML = '<p style="color:var(--muted)">Nothing left to prep — every fruit/syrup item is already ticked off.</p>' +
        '<button id="labels-back-btn" class="btn btn-secondary">← Back to Fruit Prep</button>';
      document.getElementById('labels-back-btn').addEventListener('click', renderFruitPrep);
      return;
    }

    var html = '<p id="labels-note" style="color:var(--muted);margin-bottom:14px;">' + items.length + ' item' + (items.length === 1 ? '' : 's') +
      ' still need prepping today. Prepped/use-by times below assume prep happens now — a real, flagged assumption, not a confirmed shelf life for this bar; adjust in the code if your actual practice differs.</p>';
    html += '<button id="labels-print-btn" class="btn btn-primary" style="margin-bottom:18px;">🖨 Print Labels</button>';
    html += '<div id="label-grid" class="label-grid">' + items.map(function (name) {
      var useBy = new Date(now.getTime() + shelfLifeHours(name) * 3600 * 1000);
      return '<div class="label-card">' +
        '<div class="label-name">' + escapeHtml(name) + '</div>' +
        '<div class="label-date">Prepped: ' + fmtLabelDate(now) + '</div>' +
        '<div class="label-date">Use by: ' + fmtLabelDate(useBy) + '</div>' +
        '</div>';
    }).join('') + '</div>';

    main.innerHTML = html;
    document.getElementById('labels-print-btn').addEventListener('click', function () { window.print(); });
  }

  // ---------- DETAIL VIEW ----------
  function openDetail(id) {
    var c = state.cocktails.filter(function (x) { return x.id === id; })[0];
    if (!c) return;
    markSeen(id);
    setHeader(c.name, true);
    var ings = state.ingredients[id] || [];
    var main = document.getElementById('app-main');

    var html = '<div class="detail-hero">' +
      iconSvg(c.glass ? 'glass_' + c.glass : 'glass_rocks', 'glass-icon') +
      '<h1>' + escapeHtml(c.name) + '</h1>' +
      '<div class="meta">' + escapeHtml(c.build_method || '') + (c.garnish ? ' &middot; garnish: ' + escapeHtml(c.garnish) : '') + '</div>' +
      '</div>';

    if (c.photo_url || state.role === 'admin') {
      html += '<div class="finished-photo-wrap">' +
        (c.photo_url ? '<img class="finished-photo" src="' + escapeHtml(c.photo_url) + '">' : '<div class="finished-photo-placeholder">No finished photo yet</div>') +
        (state.role === 'admin' ? '<button type="button" id="cocktail-photo-btn" class="photo-btn finished-photo-btn' + (c.photo_url ? ' has-photo' : '') + '" title="Photo of the finished, garnished drink">' + iconSvg('camera') + '</button>' : '') +
        '</div>';
    }

    var steps = Array.isArray(c.method_steps) ? c.method_steps : [];
    var splitAcrossSteps = {};
    steps.forEach(function (s) {
      var amts = s.ingredient_amounts || {};
      Object.keys(amts).forEach(function (k) { splitAcrossSteps[k] = true; });
    });

    html += '<div class="section-label">Ingredients</div><ul class="ingredient-list">' +
      ings.map(function (i) {
        var photo = state.ingredientPhotos[String(i.name || '').toLowerCase()];
        var nameHtml = photo && photo.photo_url ?
          '<button type="button" class="name-btn has-photo" data-view-photo="' + escapeHtml(photo.photo_url) + '">' + escapeHtml(i.name) +
            (photo.is_stock ? ' <span class="total-tag">stock photo</span>' : '') + '</button>' :
          '<span>' + escapeHtml(i.name) + '</span>';
        var isSplit = splitAcrossSteps[String(i.name || '').toLowerCase()];
        return '<li>' + nameHtml + '<span class="amt">' + escapeHtml(fmtAmtUnit(i.amount, i.unit)) +
          (isSplit ? ' <span class="total-tag">total</span>' : '') + '</span></li>';
      }).join('') + '</ul>';

    if (steps.length) {
      html += '<div class="section-label">Method</div><ol class="method-list">' +
        steps.map(function (s) { return '<li>' + escapeHtml(s.instruction || ''); }).join('') + '</ol>';
    }

    html += '<div class="action-row">';
    if (steps.length) html += '<button id="start-build-btn" class="btn btn-primary">▶ Start Build</button>';
    if (c.batchable) html += '<button id="batch-calc-btn" class="btn btn-secondary">🧪 Batch Calculator</button>';
    if (state.role === 'admin') {
      html += '<button id="edit-cocktail-btn" class="btn btn-secondary">✏️ Edit</button>';
      html += '<button id="delete-cocktail-btn" class="btn btn-danger">🗑 Delete</button>';
    }
    html += '</div>';

    main.innerHTML = html;

    Array.prototype.forEach.call(main.querySelectorAll('[data-view-photo]'), function (btn) {
      btn.addEventListener('click', function () { showPhotoModal(btn.getAttribute('data-view-photo')); });
    });

    var cocktailPhotoBtn = document.getElementById('cocktail-photo-btn');
    if (cocktailPhotoBtn) cocktailPhotoBtn.addEventListener('click', function () {
      choosePhotoAndUpload(!!c.photo_url, function (base64, isRemoval) {
        cocktailPhotoBtn.classList.add('uploading');
        var req = isRemoval ? apiRemovePhoto('cocktail', { cocktail_id: c.id }) : apiUploadPhoto(base64, 'cocktail', { cocktail_id: c.id });
        req.then(function (res) {
          c.photo_url = isRemoval ? null : res.photo_url;
          return loadAllData();
        }).then(function () { openDetail(id); }).catch(function (e) {
          cocktailPhotoBtn.classList.remove('uploading');
          alert((isRemoval ? 'Remove' : 'Photo upload') + ' failed: ' + e.message);
        });
      }, function () {});
    });

    var startBtn = document.getElementById('start-build-btn');
    if (startBtn) startBtn.addEventListener('click', function () { openBuildMode(c, ings); });
    var batchBtn = document.getElementById('batch-calc-btn');
    if (batchBtn) batchBtn.addEventListener('click', function () { openBatchCalc(c, ings); });
    var editBtn = document.getElementById('edit-cocktail-btn');
    if (editBtn) editBtn.addEventListener('click', function () { openAdminEditor(c); });
    var delBtn = document.getElementById('delete-cocktail-btn');
    if (delBtn) wireArmConfirm(delBtn, 'Delete?', function () {
      apiWrite('delete_cocktail', { id: c.id }).then(function () {
        return loadAllData();
      }).then(goToMenu).catch(function (e) { alert(e.message); });
    });
  }

  function fmtAmt(n) {
    if (n == null) return '';
    var num = Number(n);
    return (Math.round(num * 100) / 100).toString();
  }

  // amount+unit display, e.g. "50 ml", "1 scoop", or a unit-only label like "to taste"
  // when there's no fixed amount to show (never a stray leading space either way)
  function fmtAmtUnit(amount, unit) {
    var amt = fmtAmt(amount);
    unit = unit || '';
    if (amt && unit) return amt + ' ' + unit;
    return amt || unit;
  }

  // two-click arm/confirm delete pattern, matching the project's standard convention
  function wireArmConfirm(btn, armedLabel, onConfirm) {
    var idleLabel = btn.textContent;
    var armed = false;
    btn.addEventListener('click', function () {
      if (!armed) {
        armed = true;
        btn.textContent = armedLabel;
        setTimeout(function () { armed = false; btn.textContent = idleLabel; }, 3000);
      } else {
        onConfirm();
      }
    });
  }

  // ---------- LIVE BUILD MODE ----------
  function openBuildMode(c, ings) {
    var steps = Array.isArray(c.method_steps) ? c.method_steps : [];
    if (!steps.length) return;
    var idx = 0;
    var overlay = document.createElement('div');
    overlay.id = 'build-overlay';
    document.body.appendChild(overlay);

    var ingByName = {};
    (ings || []).forEach(function (i) { ingByName[String(i.name || '').toLowerCase()] = i; });

    function ingredientRowHtml(name, overrideAmt) {
      var match = ingByName[String(name).toLowerCase()];
      var amtVal = overrideAmt != null ? overrideAmt : (match ? match.amount : null);
      var unit = match ? match.unit : '';
      var amtLabel = fmtAmtUnit(amtVal, unit);
      var photo = state.ingredientPhotos[String(name).toLowerCase()];
      return '<li' + (photo && photo.photo_url ? ' class="clickable" data-ing-view="' + escapeHtml(photo.photo_url) + '"' : '') + '>' +
        '<span class="ing-name">' + escapeHtml(name) + '</span>' +
        (amtLabel ? '<span class="ing-amt">' + escapeHtml(amtLabel) + '</span>' : '') + '</li>';
    }

    function render() {
      var s = steps[idx];
      var dots = steps.map(function (_, i) { return '<div class="dot' + (i <= idx ? ' done' : '') + '"></div>'; }).join('');
      var names = s.ingredient_names || [];
      var overrideAmts = s.ingredient_amounts || {};
      var ingList = names.length ? '<ul class="step-ingredient-list">' + names.map(function (n) {
        return ingredientRowHtml(n, overrideAmts[String(n).toLowerCase()]);
      }).join('') + '</ul>' : '';
      var mediaHtml = stepMediaHtml(c.glass, s);
      overlay.innerHTML =
        '<div class="build-progress">' + dots + '</div>' +
        '<div class="build-step">' +
        '<div class="step-label">Step ' + (idx + 1) + ' of ' + steps.length + '</div>' +
        '<div class="step-media-row">' + mediaHtml + (s.photo_url ? frameResizeHandleHtml() : '') + '<img id="step-ing-preview" class="step-ing-photo" hidden></div>' +
        ingList +
        '<div class="instruction">' + escapeHtml(s.instruction || '') + '</div>' +
        '</div>' +
        '<div class="build-nav">' +
        (idx > 0 ? '<button id="build-back" class="btn btn-secondary">← Back</button>' : '<button id="build-close" class="btn btn-secondary">✕ Close</button>') +
        (idx < steps.length - 1 ? '<button id="build-next" class="btn btn-primary">Next →</button>' : '<button id="build-done" class="btn btn-primary">✅ Done</button>') +
        '</div>';

      var resizeHandle = overlay.querySelector('.step-media-row .frame-resize-handle');
      if (resizeHandle) {
        var buildImg = overlay.querySelector('.step-media-row img.equip-icon');
        wireFrameResizeHandle(resizeHandle, buildImg, function (newHeight) {
          s.frame_height = newHeight;
          apiUpdateStepFrameHeight(c.id, idx, newHeight).catch(function (e) {
            alert('Could not save the new frame size: ' + e.message);
          });
        });
      }

      var backBtn = document.getElementById('build-back');
      if (backBtn) backBtn.addEventListener('click', function () { idx--; render(); });
      var closeBtn = document.getElementById('build-close');
      if (closeBtn) closeBtn.addEventListener('click', close);
      var nextBtn = document.getElementById('build-next');
      if (nextBtn) nextBtn.addEventListener('click', function () { idx++; render(); });
      var doneBtn = document.getElementById('build-done');
      if (doneBtn) doneBtn.addEventListener('click', close);

      var preview = document.getElementById('step-ing-preview');
      Array.prototype.forEach.call(overlay.querySelectorAll('[data-ing-view]'), function (li) {
        li.addEventListener('click', function () {
          var url = li.getAttribute('data-ing-view');
          var alreadyActive = li.classList.contains('active');
          var wasVisible = !preview.hidden;
          Array.prototype.forEach.call(overlay.querySelectorAll('.step-ingredient-list li.active'), function (o) { o.classList.remove('active'); });
          if (alreadyActive) {
            preview.classList.remove('visible');
            setTimeout(function () { preview.hidden = true; preview.removeAttribute('src'); }, 200);
          } else if (wasVisible) {
            // crossfade: fade the old photo out, swap the src underneath, fade the new one in
            preview.classList.remove('visible');
            setTimeout(function () {
              preview.src = url;
              preview.classList.add('visible');
            }, 200);
            li.classList.add('active');
          } else {
            preview.src = url;
            preview.hidden = false;
            void preview.offsetWidth; // force reflow so the fade-in transition actually runs
            preview.classList.add('visible');
            li.classList.add('active');
          }
        });
      });
    }

    function close() { overlay.remove(); }
    render();
  }

  // ---------- BATCH CALCULATOR ----------
  function toMl(amount, unit) {
    if (unit === 'ml') return amount;
    if (unit === 'oz') return amount * OZ_TO_ML;
    return 0; // dash/barspoon/etc don't count toward base liquid volume
  }

  function openBatchCalc(c, ings) {
    var baseMl = ings.reduce(function (sum, i) { return sum + toMl(Number(i.amount) || 0, i.unit); }, 0);
    setHeader(c.name + ' — Batch', true);
    var main = document.getElementById('app-main');
    var defaultTarget = c.batch_target_ml || 750;

    function renderResult(targetMl) {
      if (baseMl <= 0) return '<p style="color:var(--muted)">No oz/ml ingredients found to scale from.</p>';
      var mult = targetMl / baseMl;
      return '<ul class="ingredient-list">' + ings.map(function (i) {
        var scaled = (Number(i.amount) || 0) * mult;
        return '<li><span>' + escapeHtml(i.name) + '</span><span class="amt">' + escapeHtml(fmtAmtUnit(scaled, i.unit)) + '</span></li>';
      }).join('') + '</ul><p style="color:var(--muted)">Base single-serve liquid volume: ' + fmtAmt(baseMl) + ' ml. Scaled to ' + fmtAmt(targetMl) + ' ml (&times;' + fmtAmt(mult) + ').</p>';
    }

    main.innerHTML =
      '<div class="batch-input-row">' +
      '<div class="field-group"><label>Target bottle size (ml)</label><input type="number" id="batch-target" value="' + defaultTarget + '"></div>' +
      '<button id="batch-go" class="btn btn-primary" style="width:auto;padding:14px 20px;">Calc</button>' +
      '</div><div id="batch-result">' + renderResult(defaultTarget) + '</div>';

    document.getElementById('batch-go').addEventListener('click', function () {
      var t = Number(document.getElementById('batch-target').value) || defaultTarget;
      document.getElementById('batch-result').innerHTML = renderResult(t);
    });
  }

  // ---------- ADMIN EDITOR ----------
  function openAdminEditor(existing) {
    setHeader(existing ? 'Edit Cocktail' : 'New Cocktail', true);
    var main = document.getElementById('app-main');
    var ingredients = existing ? (state.ingredients[existing.id] || []).map(function (i) {
      return { name: i.name, amount: i.amount, unit: i.unit };
    }) : [{ name: '', amount: '', unit: 'oz' }];
    var steps = existing && Array.isArray(existing.method_steps) ? existing.method_steps.map(function (s) {
      var overrideAmts = s.ingredient_amounts || {};
      var namesOut = (s.ingredient_names || []).map(function (n) {
        var a = overrideAmts[String(n).toLowerCase()];
        return a != null ? n + ':' + a : n;
      });
      return { instruction: s.instruction || '', equipment: s.equipment || 'shaker', ingredient_names: namesOut.join(', '), photo_url: s.photo_url || '' };
    }) : [{ instruction: '', equipment: 'shaker', ingredient_names: '', photo_url: '' }];

    function ingRowHtml(ing, idx) {
      var photoRow = ing.name && state.ingredientPhotos[String(ing.name).toLowerCase()];
      var hasPhoto = !!(photoRow && photoRow.photo_url);
      var isStock = !!(photoRow && photoRow.is_stock);
      return '<div class="repeat-row" data-idx="' + idx + '">' +
        '<input type="text" class="ing-name" placeholder="Name" value="' + escapeHtml(ing.name) + '">' +
        '<input type="number" step="0.1" class="ing-amount" placeholder="Amt" value="' + escapeHtml(ing.amount) + '">' +
        '<select class="ing-unit">' + UNIT_OPTIONS.map(function (u) { return '<option value="' + u + '"' + (u === ing.unit ? ' selected' : '') + '>' + u + '</option>'; }).join('') + '</select>' +
        '<button type="button" class="photo-btn' + (hasPhoto && !isStock ? ' has-photo' : '') + (hasPhoto && isStock ? ' is-stock' : '') + '" data-ing-search="1" title="Find a stock photo">' + iconSvg('search') + '</button>' +
        '<button type="button" class="photo-btn' + (hasPhoto ? ' has-photo' : '') + '" data-ing-photo="1" title="Photo for new starters">' + iconSvg('camera') + '</button>' +
        '<button class="remove-btn" data-remove-ing="' + idx + '">✕</button>' +
        '</div>';
    }
    function stepRowHtml(s, idx) {
      return '<div class="repeat-row" data-idx="' + idx + '" data-photo-url="' + escapeHtml(s.photo_url || '') + '" style="flex-direction:column;align-items:stretch;">' +
        '<div style="display:flex;gap:8px;">' +
        '<select class="step-equipment" style="flex:1;">' + EQUIPMENT_OPTIONS.map(function (e) { return '<option value="' + e + '"' + (e === s.equipment ? ' selected' : '') + '>' + e.replace('_', ' ') + '</option>'; }).join('') + '</select>' +
        '<button class="remove-btn" data-remove-step="' + idx + '">✕</button>' +
        '</div>' +
        '<input type="text" class="step-instruction" placeholder="Instruction (e.g. Shake hard for 12 seconds)" value="' + escapeHtml(s.instruction) + '" style="margin-top:6px;">' +
        '<input type="text" class="step-ingredients" placeholder="Ingredients this step (comma-separated; add :amount to override, e.g. Raspberries:2)" value="' + escapeHtml(s.ingredient_names) + '" style="margin-top:6px;">' +
        '</div>';
    }

    main.innerHTML =
      '<div class="field-group"><label>Name</label><input type="text" id="f-name" value="' + escapeHtml(existing ? existing.name : '') + '"></div>' +
      '<div class="field-group"><label>Glass</label><select id="f-glass">' + GLASS_OPTIONS.map(function (g) { return '<option value="' + g + '"' + (existing && existing.glass === g ? ' selected' : '') + '>' + g.replace('_', ' ') + '</option>'; }).join('') + '</select></div>' +
      '<div class="field-group"><label>Build method</label><input type="text" id="f-build-method" placeholder="shaken / stirred / built / blended" value="' + escapeHtml(existing ? existing.build_method : '') + '"></div>' +
      '<div class="field-group"><label>Garnish</label><input type="text" id="f-garnish" value="' + escapeHtml(existing ? existing.garnish : '') + '"></div>' +

      '<div class="toggle-row"><label>Mocktail (no alcohol)</label><input type="checkbox" id="f-is-mocktail"' + (existing && existing.is_mocktail ? ' checked' : '') + '></div>' +

      '<div class="section-label">Flavour family (optional)</div>' +
      '<div class="batch-input-row"><div class="field-group"><label>Group name</label><input type="text" id="f-variant-group" placeholder="e.g. Double Dutch" value="' + escapeHtml(existing && existing.variant_group ? existing.variant_group : '') + '"></div>' +
      '<div class="field-group"><label>This flavour</label><input type="text" id="f-variant-label" placeholder="e.g. Strawberry" value="' + escapeHtml(existing && existing.variant_label ? existing.variant_label : '') + '"></div></div>' +
      '<p style="color:var(--muted);font-size:0.85rem;margin-top:-10px;">Cocktails sharing the same group name collapse into one menu row with a flavour picker (like Double Dutch). Leave both blank for a standalone cocktail.</p>' +

      '<div class="section-label">Ingredients</div>' +
      '<div id="ing-rows">' + ingredients.map(ingRowHtml).join('') + '</div>' +
      '<button id="add-ing-btn" class="add-row-btn">+ Add ingredient</button>' +

      '<div class="section-label-row"><div class="section-label">Method steps</div>' +
      (existing ? '<button type="button" id="bulk-photo-btn" class="btn btn-secondary step-photos-btn">📦 Add Multiple</button>' : '') +
      '</div>' +
      '<div id="step-frames"></div>' +
      '<div id="step-rows">' + steps.map(function (s, idx) { return stepRowHtml(s, idx); }).join('') + '</div>' +
      '<button id="add-step-btn" class="add-row-btn">+ Add step</button>' +

      '<div class="toggle-row"><label>Batchable (pre-batched bottle)</label><input type="checkbox" id="f-batchable"' + (existing && existing.batchable ? ' checked' : '') + '></div>' +
      '<div class="field-group" id="batch-target-group" style="' + (existing && existing.batchable ? '' : 'display:none;') + '"><label>Default batch target (ml)</label><input type="number" id="f-batch-target" value="' + (existing && existing.batch_target_ml ? existing.batch_target_ml : 750) + '"></div>' +

      '<button id="save-cocktail-btn" class="btn btn-primary" style="margin-top:10px;">Save</button>';

    document.getElementById('add-ing-btn').addEventListener('click', function () {
      document.getElementById('ing-rows').insertAdjacentHTML('beforeend', ingRowHtml({ name: '', amount: '', unit: 'oz' }, Date.now()));
      wireRemoveButtons();
      wirePhotoButtons();
    });
    document.getElementById('add-step-btn').addEventListener('click', function () {
      document.getElementById('step-rows').insertAdjacentHTML('beforeend', stepRowHtml({ instruction: '', equipment: 'shaker', ingredient_names: '' }, Date.now()));
      wireRemoveButtons();
    });

    // Keeps a step ROW's own data-photo-url attribute (the Save button below
    // reads this, per row, to build its method_steps payload) in sync with a
    // frame change — otherwise a later Save would silently overwrite
    // method_steps with the row's stale attribute value and wipe out a photo
    // just set via a frame (frames write straight to Supabase, bypassing Save).
    function syncStepRowAttr(i, url) {
      var row = document.querySelectorAll('#step-rows .repeat-row')[i];
      if (row) row.setAttribute('data-photo-url', url || '');
    }

    // The frame strip only applies to steps as already SAVED in Supabase
    // (this same `steps` array, sourced from existing.method_steps above) —
    // a step added via "+ Add step" and not yet saved has no frame, same
    // precondition the old per-row button always had.
    function renderStepFrames() {
      var framesEl = document.getElementById('step-frames');
      if (!existing) {
        framesEl.innerHTML = '<p style="color:var(--muted);font-size:0.85rem;">Save this cocktail first, then reopen Edit to add step photos.</p>';
        return;
      }
      // A plain div (not <button>) — a has-photo frame nests a real
      // resize-handle div inside it, and nested interactive elements inside
      // a <button> are invalid HTML. role/tabindex keep it click-reachable.
      framesEl.innerHTML = '<div class="step-frame-grid">' +
        steps.map(function (s, i) {
          return '<div class="step-frame' + (s.photo_url ? ' has-photo' : '') + '" data-frame-idx="' + i + '" role="button" tabindex="0">' +
            stepMediaHtml(existing.glass, s) +
            (s.photo_url ? frameResizeHandleHtml() : '') +
            '<span class="step-frame-label">Step ' + (i + 1) + '</span>' +
          '</div>';
        }).join('') +
        '</div>';

      Array.prototype.forEach.call(framesEl.querySelectorAll('[data-frame-idx]'), function (frameEl) {
        frameEl.addEventListener('click', function () {
          // Suppress the click a resize drag's own pointerup would otherwise
          // also trigger on this same element (see wireFrameResizeHandle).
          if (frameEl.dataset.justResized) { delete frameEl.dataset.justResized; return; }
          var i = parseInt(frameEl.getAttribute('data-frame-idx'), 10);
          choosePhotoAndUpload(!!steps[i].photo_url, function (base64, isRemoval) {
            frameEl.classList.add('uploading');
            var req = isRemoval
              ? apiRemovePhoto('step', { cocktail_id: existing.id, step_index: i })
              : apiUploadPhoto(base64, 'step', { cocktail_id: existing.id, step_index: i });
            req.then(function (res) {
              steps[i].photo_url = isRemoval ? '' : res.photo_url;
              syncStepRowAttr(i, steps[i].photo_url);
              renderStepFrames();
              loadAllData().catch(function (e) { console.warn('Background refresh after step photo change failed:', e.message); });
            }).catch(function (e) {
              frameEl.classList.remove('uploading');
              alert((isRemoval ? 'Remove' : 'Photo upload') + ' failed: ' + e.message);
            });
          }, function () { /* cancelled, nothing to undo */ });
        });

        var handle = frameEl.querySelector('.frame-resize-handle');
        if (handle) {
          var img = frameEl.querySelector('img.equip-icon');
          wireFrameResizeHandle(handle, img, function (newHeight) {
            frameEl.dataset.justResized = '1';
            var i = parseInt(frameEl.getAttribute('data-frame-idx'), 10);
            steps[i].frame_height = newHeight;
            apiUpdateStepFrameHeight(existing.id, i, newHeight).catch(function (e) {
              alert('Could not save the new frame size: ' + e.message);
            });
          });
        }
      });
    }
    renderStepFrames();

    // Live-update an empty frame's icon if the admin changes that step's
    // equipment dropdown before saving (cosmetic only — a frame that already
    // has a photo is unaffected, since the photo always takes visual
    // priority over the equipment icon, same as Build Mode).
    Array.prototype.forEach.call(document.querySelectorAll('#step-rows .repeat-row'), function (row, i) {
      var eqSelect = row.querySelector('.step-equipment');
      if (eqSelect && steps[i]) {
        eqSelect.addEventListener('change', function () {
          steps[i].equipment = eqSelect.value;
          renderStepFrames();
        });
      }
    });

    var bulkPhotoBtn = document.getElementById('bulk-photo-btn');
    if (bulkPhotoBtn) bulkPhotoBtn.addEventListener('click', function () {
      var emptyIdx = [];
      steps.forEach(function (s, i) { if (!s.photo_url) emptyIdx.push(i); });
      if (!emptyIdx.length) { alert('Every step already has a photo — tap a frame to replace one.'); return; }
      pickMultiplePhotos(function (files) {
        var targets = emptyIdx.slice(0, files.length);
        bulkPhotoBtn.classList.add('uploading');
        // Sequential, not parallel: api/write.js's step-photo write is a
        // read-whole-array/mutate-one-index/write-whole-array-back PATCH —
        // two of those in flight at once for the SAME cocktail would race,
        // and whichever finishes last would silently erase the other's step.
        var chain = Promise.resolve();
        targets.forEach(function (stepIdx, j) {
          chain = chain.then(function () {
            return new Promise(function (resolve, reject) {
              compressImageFile(files[j], 1280, function (base64) {
                apiUploadPhoto(base64, 'step', { cocktail_id: existing.id, step_index: stepIdx }).then(function (res) {
                  steps[stepIdx].photo_url = res.photo_url;
                  syncStepRowAttr(stepIdx, res.photo_url);
                  renderStepFrames();
                  resolve();
                }).catch(reject);
              });
            });
          });
        });
        chain.then(function () {
          bulkPhotoBtn.classList.remove('uploading');
          var extra = files.length - targets.length;
          if (extra > 0) {
            alert('Added ' + targets.length + ' photo' + (targets.length === 1 ? '' : 's') + ' — ' + extra +
              ' extra photo' + (extra === 1 ? ' was' : 's were') + ' not used (only ' + targets.length +
              ' empty step' + (targets.length === 1 ? '' : 's') + ' available).');
          }
          return loadAllData();
        }).catch(function (e) {
          bulkPhotoBtn.classList.remove('uploading');
          alert('Bulk photo add failed partway through: ' + e.message);
        });
      });
    });

    document.getElementById('f-batchable').addEventListener('change', function (e) {
      document.getElementById('batch-target-group').style.display = e.target.checked ? '' : 'none';
    });
    wireRemoveButtons();
    wirePhotoButtons();

    function wireRemoveButtons() {
      Array.prototype.forEach.call(main.querySelectorAll('[data-remove-ing]'), function (btn) {
        btn.onclick = function () { btn.closest('.repeat-row').remove(); };
      });
      Array.prototype.forEach.call(main.querySelectorAll('[data-remove-step]'), function (btn) {
        btn.onclick = function () { btn.closest('.repeat-row').remove(); };
      });
    }

    function wirePhotoButtons() {
      Array.prototype.forEach.call(main.querySelectorAll('[data-ing-photo]'), function (btn) {
        btn.onclick = function () {
          var row = btn.closest('.repeat-row');
          var name = row.querySelector('.ing-name').value.trim();
          if (!name) { alert('Enter the ingredient name first.'); return; }
          var existingPhoto = state.ingredientPhotos[name.toLowerCase()];
          choosePhotoAndUpload(!!(existingPhoto && existingPhoto.photo_url), function (base64, isRemoval) {
            btn.classList.add('uploading');
            var req = isRemoval
              ? apiRemovePhoto('ingredient', { ingredient_name: name })
              : apiUploadPhoto(base64, 'ingredient', { ingredient_name: name });
            req.then(function (res) {
              btn.classList.remove('uploading');
              var searchBtn = row.querySelector('[data-ing-search]');
              if (isRemoval) {
                delete state.ingredientPhotos[name.toLowerCase()];
                btn.classList.remove('has-photo');
                if (searchBtn) searchBtn.classList.remove('has-photo');
              } else {
                state.ingredientPhotos[name.toLowerCase()] = { photo_url: res.photo_url, is_stock: false };
                btn.classList.add('has-photo');
                if (searchBtn) { searchBtn.classList.add('has-photo'); searchBtn.classList.remove('is-stock'); }
              }
            }).catch(function (e) {
              btn.classList.remove('uploading');
              alert((isRemoval ? 'Remove' : 'Photo upload') + ' failed: ' + e.message);
            });
          }, function () {});
        };
      });
      Array.prototype.forEach.call(main.querySelectorAll('[data-ing-search]'), function (btn) {
        btn.onclick = function () {
          var row = btn.closest('.repeat-row');
          var name = row.querySelector('.ing-name').value.trim();
          if (!name) { alert('Enter the ingredient name first.'); return; }
          btn.classList.add('uploading');
          apiFetchStockPhoto(name).then(function (res) {
            btn.classList.remove('uploading');
            if (!res.found) {
              alert('No stock photo found for "' + name + '" — try the camera instead.');
              return;
            }
            state.ingredientPhotos[name.toLowerCase()] = { photo_url: res.photo_url, is_stock: true };
            btn.classList.remove('has-photo');
            btn.classList.add('is-stock');
            var cameraBtn = row.querySelector('[data-ing-photo]');
            if (cameraBtn) cameraBtn.classList.add('has-photo');
          }).catch(function (e) {
            btn.classList.remove('uploading');
            alert('Stock photo search failed: ' + e.message);
          });
        };
      });
    }

    document.getElementById('save-cocktail-btn').addEventListener('click', function () {
      var ingRows = Array.prototype.map.call(document.querySelectorAll('#ing-rows .repeat-row'), function (row) {
        return {
          name: row.querySelector('.ing-name').value.trim(),
          amount: parseFloat(row.querySelector('.ing-amount').value) || 0,
          unit: row.querySelector('.ing-unit').value
        };
      }).filter(function (i) { return i.name; });

      var stepRowsOut = Array.prototype.map.call(document.querySelectorAll('#step-rows .repeat-row'), function (row) {
        var namesRaw = row.querySelector('.step-ingredients').value.trim();
        var names = [];
        var amounts = {};
        if (namesRaw) {
          namesRaw.split(',').forEach(function (part) {
            part = part.trim();
            if (!part) return;
            var colonIdx = part.lastIndexOf(':');
            if (colonIdx > -1) {
              var nm = part.slice(0, colonIdx).trim();
              var amtVal = parseFloat(part.slice(colonIdx + 1));
              if (nm && !isNaN(amtVal)) {
                names.push(nm);
                amounts[nm.toLowerCase()] = amtVal;
                return;
              }
            }
            names.push(part);
          });
        }
        var stepOut = {
          instruction: row.querySelector('.step-instruction').value.trim(),
          equipment: row.querySelector('.step-equipment').value,
          ingredient_names: names
        };
        if (Object.keys(amounts).length) stepOut.ingredient_amounts = amounts;
        var existingPhotoUrl = row.getAttribute('data-photo-url');
        if (existingPhotoUrl) stepOut.photo_url = existingPhotoUrl;
        return stepOut;
      }).filter(function (s) { return s.instruction; });

      var payload = {
        id: existing ? existing.id : undefined,
        name: document.getElementById('f-name').value.trim(),
        glass: document.getElementById('f-glass').value,
        build_method: document.getElementById('f-build-method').value.trim(),
        garnish: document.getElementById('f-garnish').value.trim(),
        is_mocktail: document.getElementById('f-is-mocktail').checked,
        variant_group: document.getElementById('f-variant-group').value.trim() || null,
        variant_label: document.getElementById('f-variant-label').value.trim() || null,
        method_steps: stepRowsOut,
        batchable: document.getElementById('f-batchable').checked,
        batch_target_ml: document.getElementById('f-batchable').checked ? (parseInt(document.getElementById('f-batch-target').value, 10) || 750) : null,
        ingredients: ingRows
      };
      if (!payload.name) { alert('Name is required.'); return; }

      apiWrite(existing ? 'update_cocktail' : 'create_cocktail', payload).then(function () {
        return loadAllData();
      }).then(goToMenu).catch(function (e) { alert('Save failed: ' + e.message); });
    });
  }

  // Element.closest polyfill guard (older WebViews on bar tablets)
  if (!Element.prototype.closest) {
    Element.prototype.closest = function (selector) {
      var el = this;
      while (el) { if (el.matches && el.matches(selector)) return el; el = el.parentElement; }
      return null;
    };
  }

  document.addEventListener('DOMContentLoaded', boot);
})();
