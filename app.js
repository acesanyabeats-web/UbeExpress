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

  // Shelf life lives per ingredient (ingredient_photos.shelf_life_hours),
  // seeded from the bar's own printed labels and editable in the Ingredients
  // table. Unknown = null — never a guessed default.
  function shelfLifeHours(name) {
    var p = state.ingredientPhotos[String(name || '').toLowerCase()];
    var h = p && p.shelf_life_hours != null ? Number(p.shelf_life_hours) : null;
    return h > 0 ? h : null;
  }
  // Expiry rule (Alex): expiry = last label time + shelf life. An item must
  // be thrown out at close on the day BEFORE its expiry day, so tonight's
  // throw-out list is everything expiring tomorrow or already overdue.
  function startOfDay(d) { var x = new Date(d); x.setHours(0, 0, 0, 0); return x; }
  function expiryInfo(name) {
    var prep = state.prep[String(name || '').toLowerCase()];
    var labelAt = prep && prep.label_at ? new Date(prep.label_at) : null;
    var hours = shelfLifeHours(name);
    if (!labelAt || !hours) return { labelAt: labelAt, hours: hours, expiresAt: null, throwOutDay: null, status: labelAt ? 'no_shelf_life' : 'no_label' };
    var expiresAt = new Date(labelAt.getTime() + hours * 3600 * 1000);
    var throwOutDay = new Date(startOfDay(expiresAt).getTime() - 24 * 3600 * 1000);
    var now = new Date();
    var status = now >= expiresAt ? 'expired' : (startOfDay(now) >= throwOutDay ? 'throw_tonight' : 'ok');
    return { labelAt: labelAt, hours: hours, expiresAt: expiresAt, throwOutDay: throwOutDay, status: status };
  }
  function fmtShelfLife(hours) {
    if (!hours) return 'not set';
    var d = hours / 24;
    return Math.abs(d - Math.round(d)) < 1e-9 ? Math.round(d) + ' day' + (Math.round(d) === 1 ? '' : 's') : hours + ' hours';
  }
  function fmtDay(d) { return d.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' }); }
  function fmtLabelDate(d) {
    return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) +
      ' ' + d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
  }

  var state = {
    role: null,          // 'staff' | 'admin'
    cocktails: [],
    ingredients: {},     // cocktail_id -> [ingredient rows]
    ingredientPhotos: {}, // lowercase ingredient name -> photo_url
    photoSubmissions: [], // pending staff step-photo candidates (admin reviews)
    prep: {},             // lowercase prep item -> prep_checklist_state row (checked, checked_at, label_at)
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
  function stepMediaHtml(glass, s, opts) {
    // opts (optional): { cls, defaultHeight } — lets a non-step frame (the
    // cocktail overview's finished-drink photo) reuse this exact markup with
    // its own width class and default height.
    opts = opts || {};
    var extra = opts.cls ? ' ' + opts.cls : '';
    // frame_height is a per-step, admin-set override (see wireFrameResizeHandle
    // below) — falls back to the CSS default (150px) when never customized.
    // object-fit:contain (see style.css) means no height ever crops the photo;
    // resizing only changes how much of the available space it fills.
    return s.photo_url
      ? '<img class="equip-icon is-photo' + extra + '" style="height:' + (s.frame_height || opts.defaultHeight || 150) + 'px" src="' + escapeHtml(s.photo_url) + '">'
      : iconSvg(opts.fallbackIcon || iconForStep(glass, s), 'equip-icon' + extra);
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

  // The Frame Editor — a single, reusable wrapper around ANY step's visual
  // media, photo or the fallback equipment/glass icon alike. Tapping a
  // frame, in both the admin edit form's step-frame grid and Build Mode's
  // live step view, opens this instead of jumping straight to the photo
  // picker — resizing and "change/remove the photo" both live inside it as
  // real, distinct actions. Deliberately a plain, persistence-agnostic UI:
  // the caller supplies onPhotoChanged/onResized and does the actual
  // Supabase write + re-render, so this same wrapper can be reused by any
  // future frame-level control without the editor itself needing to know
  // which screen opened it or how that screen persists state.
  //   s             — the step object (read live; caller owns its identity)
  //   glass         — the cocktail's glass, for the icon fallback
  //   onPhotoChanged(base64, isRemoval, cb) — caller uploads/removes, then
  //                   calls cb(newPhotoUrlOrEmptyString) once done
  //   onResized(newHeightPx) — caller persists the new frame height
  function openFrameEditor(s, glass, onPhotoChanged, onResized, opts) {
    var overlay = document.createElement('div');
    overlay.id = 'frame-editor-overlay';
    document.body.appendChild(overlay);

    function render() {
      overlay.innerHTML =
        '<div class="frame-editor-header"><h3>Frame Editor</h3><button type="button" class="btn btn-secondary frame-editor-done-btn">Done</button></div>' +
        '<div class="frame-editor-canvas">' + stepMediaHtml(glass, s, opts) + '</div>' +
        (s.photo_url ? frameResizeHandleHtml() : '') +
        '<div class="frame-editor-actions">' +
          '<button type="button" class="btn btn-primary frame-editor-change-btn">' + (s.photo_url ? '📷 Change Photo' : '📷 Add Photo') + '</button>' +
        '</div>';

      overlay.querySelector('.frame-editor-done-btn').addEventListener('click', function () {
        overlay.remove();
        if (opts && opts.onClose) opts.onClose();
      });

      overlay.querySelector('.frame-editor-change-btn').addEventListener('click', function () {
        choosePhotoAndUpload(!!s.photo_url, function (base64, isRemoval) {
          onPhotoChanged(base64, isRemoval, function (newPhotoUrl) {
            s.photo_url = newPhotoUrl || '';
            render();
          });
        }, function () { /* cancelled, nothing to undo */ });
      });

      var handle = overlay.querySelector('.frame-resize-handle');
      if (handle) {
        var img = overlay.querySelector('.frame-editor-canvas img.equip-icon');
        wireFrameResizeHandle(handle, img, function (newHeight) {
          s.frame_height = newHeight;
          onResized(newHeight);
        });
      }
    }

    render();
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
      sbSelect('ingredient_photos', 'select=*'),
      sbSelect('photo_submissions', 'select=*&status=eq.pending&order=created_at.asc').catch(function () { return []; }),
      sbSelect('prep_checklist_state', 'select=*').catch(function () { return []; })
    ]).then(function (results) {
      setPrepState(results[4] || []);
      state.photoSubmissions = results[3] || [];
      state.cocktails = results[0];
      state.ingredients = {};
      results[1].forEach(function (row) {
        if (!state.ingredients[row.cocktail_id]) state.ingredients[row.cocktail_id] = [];
        state.ingredients[row.cocktail_id].push(row);
      });
      state.ingredientPhotos = {};
      results[2].forEach(function (row) {
        state.ingredientPhotos[String(row.name || '').toLowerCase()] = { name: row.name, photo_url: row.photo_url, frame_height: row.frame_height, category: row.category || '', shelf_life_hours: row.shelf_life_hours };
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

  function apiUpdateCocktailFrameHeight(cocktailId, frameHeight) {
    return fetch('/api/write', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-bar-secret': localStorage.getItem('bar_admin_secret') || '' },
      body: JSON.stringify({ action: 'update_cocktail_frame_height', payload: { cocktail_id: cocktailId, frame_height: frameHeight } })
    }).then(function (r) {
      if (!r.ok) return r.json().then(function (j) { throw new Error(j.error || ('resize save failed: ' + r.status)); });
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

  function apiUpdateIngredientFrameHeight(ingredientName, frameHeight) {
    return apiWrite('update_ingredient_frame_height', { ingredient_name: ingredientName, frame_height: frameHeight });
  }
  var INGREDIENT_FRAME_DEFAULT_H = 200;
  function ingredientFrameHtml(name) {
    var p = state.ingredientPhotos[String(name).toLowerCase()];
    return stepMediaHtml(null, { photo_url: p ? p.photo_url : '', frame_height: p && p.frame_height },
      { cls: 'ingredient-frame', defaultHeight: INGREDIENT_FRAME_DEFAULT_H, fallbackIcon: 'camera' });
  }
  // Staff view of an ingredient photo: the same frame (no crop, saved height)
  // inside the existing tap-to-view modal.
  function showIngredientPhoto(name) {
    var overlay = document.createElement('div');
    overlay.id = 'photo-modal-overlay';
    overlay.innerHTML = '<button class="close-btn">&times;</button><div class="ingredient-modal-frame">' + ingredientFrameHtml(name) + '<div class="ingredient-modal-name">' + escapeHtml(name) + '</div></div>';
    overlay.addEventListener('click', function (e) {
      if (e.target === overlay || e.target.classList.contains('close-btn')) overlay.remove();
    });
    document.body.appendChild(overlay);
  }
  // Admin: every ingredient photo opens the shared Frame Editor — resize,
  // change/remove. onClose(changed).
  function openIngredientFrameEditor(name, onClose) {
    var key = String(name).toLowerCase();
    var existing = state.ingredientPhotos[key];
    var frame = { photo_url: existing ? existing.photo_url : '', frame_height: existing && existing.frame_height };
    var changed = false;
    openFrameEditor(frame, null, function (base64, isRemoval, cb) {
      var req = isRemoval ? apiRemovePhoto('ingredient', { ingredient_name: (existing && existing.name) || name })
                          : apiUploadPhoto(base64, 'ingredient', { ingredient_name: (existing && existing.name) || name });
      req.then(function (res) {
        changed = true;
        if (isRemoval) { if (existing) { existing.photo_url = null; existing.frame_height = null; } cb(''); }
        else {
          existing = { name: (existing && existing.name) || name, photo_url: res.photo_url, frame_height: frame.frame_height, category: existing ? existing.category : '' };
          state.ingredientPhotos[key] = existing;
          cb(res.photo_url);
        }
      }).catch(function (e) { alert((isRemoval ? 'Remove' : 'Photo upload') + ' failed: ' + e.message); });
    }, function (newHeight) {
      if (!existing || !existing.photo_url) return;
      existing.frame_height = newHeight;
      changed = true;
      apiUpdateIngredientFrameHeight(existing.name || name, newHeight).catch(function (e) { alert('Resize save failed: ' + e.message); });
    }, {
      cls: 'ingredient-frame',
      defaultHeight: INGREDIENT_FRAME_DEFAULT_H,
      fallbackIcon: 'camera',
      onClose: function () { if (onClose) onClose(changed); }
    });
  }
  function allIngredientNames() {
    var seen = {}, out = [];
    Object.keys(state.ingredients).forEach(function (cid) {
      state.ingredients[cid].forEach(function (i) {
        var n = String(i.name || '').trim();
        if (n && !seen[n.toLowerCase()]) { seen[n.toLowerCase()] = true; out.push(n); }
      });
    });
    return out.sort(function (a, b) { return a.localeCompare(b); });
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
      if (res.submit_token) localStorage.setItem('bar_submit_token', res.submit_token);
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
    document.getElementById('app-main').classList.remove('is-home');
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
  // ---------- Ingredients table (admin) ----------
  // Every ingredient used in any drink, grouped by type. Types sort A-Z, and
  // ingredients sort A-Z within each type. Each row is editable: rename it
  // (updates every drink that uses it), change its type, or tap its photo
  // frame to open the Frame Editor.
  var UNTYPED = 'No type yet';
  function ingredientUsage() {
    var counts = {};
    Object.keys(state.ingredients).forEach(function (cid) {
      var seen = {};
      state.ingredients[cid].forEach(function (i) {
        var k = String(i.name || '').trim().toLowerCase();
        if (k && !seen[k]) { seen[k] = true; counts[k] = (counts[k] || 0) + 1; }
      });
    });
    return counts;
  }
  function ingredientTypes() {
    var set = {};
    Object.keys(state.ingredientPhotos).forEach(function (k) {
      var cat = state.ingredientPhotos[k].category;
      if (cat) set[cat] = true;
    });
    return Object.keys(set).sort(function (a, b) { return a.localeCompare(b, undefined, { sensitivity: 'base' }); });
  }
  function apiUpdateIngredient(name, changes) {
    var payload = { name: name };
    for (var k in changes) if (changes.hasOwnProperty(k)) payload[k] = changes[k];
    return apiWrite('update_ingredient', payload);
  }
  var openIngDetails = {}; // lowercase name -> true while its roll-down is open
  function drinksUsing(name) {
    var key = String(name).toLowerCase();
    return state.cocktails.filter(function (c) {
      return (state.ingredients[c.id] || []).some(function (i) { return String(i.name || '').toLowerCase() === key; });
    }).sort(function (a, b) { return a.name.localeCompare(b.name); });
  }
  function joinList(arr) {
    if (arr.length <= 1) return arr.join('');
    return arr.slice(0, -1).join(', ') + ' and ' + arr[arr.length - 1];
  }
  function usedInSentence(name) {
    var drinks = drinksUsing(name);
    if (!drinks.length) return 'Not used in any cocktail or mocktail right now.';
    var cocktails = drinks.filter(function (c) { return !c.is_mocktail; }).map(function (c) { return c.name; });
    var mocktails = drinks.filter(function (c) { return !!c.is_mocktail; }).map(function (c) { return c.name; });
    var parts = [];
    if (cocktails.length) parts.push('the cocktail' + (cocktails.length > 1 ? 's ' : ' ') + joinList(cocktails));
    if (mocktails.length) parts.push('the mocktail' + (mocktails.length > 1 ? 's ' : ' ') + joinList(mocktails));
    return 'Used in ' + parts.join(', and in ') + '.';
  }
  function toLocalInputValue(d) {
    var pad = function (n) { return (n < 10 ? '0' : '') + n; };
    return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()) + 'T' + pad(d.getHours()) + ':' + pad(d.getMinutes());
  }
  function ingredientDetailsHtml(name) {
    var info = expiryInfo(name);
    var days = info.hours ? +(info.hours / 24).toFixed(2) : '';
    var expiryText = info.expiresAt
      ? 'Out of date ' + fmtLabelDate(info.expiresAt) + ' · throw out at close on ' + fmtDay(info.throwOutDay)
      : (info.status === 'no_shelf_life' ? 'Set a shelf life to work out the expiry.' : 'No label recorded yet.');
    var others = allIngredientNames().filter(function (n) { return n.toLowerCase() !== name.toLowerCase(); });
    var listId = 'swap-list-' + Math.random().toString(36).slice(2);
    return '<div class="ing-details">' +
      '<p class="ing-details-used">' + escapeHtml(usedInSentence(name)) + '</p>' +
      '<div class="ing-details-grid">' +
        '<label>Shelf life (days)<input type="number" min="0" step="0.5" class="ing-shelf-input" value="' + days + '" placeholder="not set"></label>' +
        '<label>Most recent label<input type="datetime-local" class="ing-label-input" value="' + (info.labelAt ? toLocalInputValue(info.labelAt) : '') + '"></label>' +
      '</div>' +
      '<div class="ing-details-expiry">' + expiryBadgeHtml(name) + ' <span>' + escapeHtml(expiryText) + '</span></div>' +
      '<div class="ing-swap">' +
        '<input type="text" class="ing-swap-input" list="' + listId + '" placeholder="Swap for… (e.g. Duppy Share)">' +
        '<datalist id="' + listId + '">' + others.map(function (n) { return '<option value="' + escapeHtml(n) + '">'; }).join('') + '</datalist>' +
        '<button type="button" class="btn btn-secondary ing-swap-btn">🔁 Swap</button>' +
      '</div>' +
    '</div>';
  }
  function renderIngredientsTable() {
    setHeader('🧾 Ingredients', true, renderHome);
    var main = document.getElementById('app-main');
    var usage = ingredientUsage();
    var filterEl = document.getElementById('ing-table-filter');
    var filter = filterEl ? filterEl.value.trim().toLowerCase() : '';
    var scrollY = window.scrollY;

    var names = allIngredientNames();
    // Also list typed rows that no drink uses right now, so nothing vanishes.
    Object.keys(state.ingredientPhotos).forEach(function (k) {
      if (!usage[k]) names.push(state.ingredientPhotos[k].name);
    });
    var groups = {};
    names.forEach(function (n) {
      var p = state.ingredientPhotos[n.toLowerCase()];
      var type = (p && p.category) || UNTYPED;
      (groups[type] = groups[type] || []).push(n);
    });
    var byName = function (a, b) { return a.localeCompare(b, undefined, { sensitivity: 'base', numeric: true }); };
    var types = ingredientTypes();
    var typeOptions = function (current) {
      return (current ? '' : '<option value="" selected>— choose type —</option>') +
        types.map(function (t) { return '<option value="' + escapeHtml(t) + '"' + (t === current ? ' selected' : '') + '>' + escapeHtml(t) + '</option>'; }).join('') +
        '<option value="__new__">➕ New type…</option>';
    };

    var withPhoto = names.filter(function (n) { var p = state.ingredientPhotos[n.toLowerCase()]; return p && p.photo_url; }).length;
    var html = '<div class="ing-table-intro">' + names.length + ' ingredients · ' + withPhoto + ' with a photo. Tap a frame to add or change its photo; edit a name or type to change it everywhere.</div>' +
      '<input type="search" id="ing-table-filter" placeholder="Filter ingredients…" value="' + escapeHtml(filter) + '">';
    Object.keys(groups).sort(byName).forEach(function (type) {
      var rows = groups[type].sort(byName).filter(function (n) { return !filter || n.toLowerCase().indexOf(filter) !== -1 || type.toLowerCase().indexOf(filter) !== -1; });
      if (!rows.length) return;
      html += '<h3 class="ing-group-title">' + escapeHtml(type) + ' <span class="ing-group-count">' + rows.length + '</span></h3>' +
        '<table class="ing-table"><thead><tr><th>Ingredient</th><th>Photo</th><th>Type</th></tr></thead><tbody>' +
        rows.map(function (n) {
          var p = state.ingredientPhotos[n.toLowerCase()];
          var used = usage[n.toLowerCase()] || 0;
          return '<tr data-ing="' + escapeHtml(n) + '">' +
            '<td class="ing-cell-name"><input type="text" class="ing-name-input" aria-label="Ingredient name" value="' + escapeHtml(n) + '">' +
              '<button type="button" class="ing-used ing-used-toggle" aria-expanded="' + (openIngDetails[n.toLowerCase()] ? 'true' : 'false') + '">' +
                (openIngDetails[n.toLowerCase()] ? '▾ ' : '▸ ') + (used ? 'in ' + used + ' drink' + (used > 1 ? 's' : '') : 'not in any drink') + '</button>' +
              expiryBadgeHtml(n) + '</td>' +
            '<td class="ing-cell-photo"><button type="button" class="ing-frame-btn" aria-label="Photo for ' + escapeHtml(n) + '">' + ingredientTableFrameHtml(n) + '</button></td>' +
            '<td class="ing-cell-type"><select class="ing-type-select" aria-label="Type">' + typeOptions(p && p.category) + '</select></td>' +
          '</tr>' +
          (openIngDetails[n.toLowerCase()] ? '<tr class="ing-details-row" data-ing-details="' + escapeHtml(n) + '"><td colspan="3">' + ingredientDetailsHtml(n) + '</td></tr>' : '');
        }).join('') + '</tbody></table>';
    });
    main.innerHTML = html;
    window.scrollTo(0, scrollY);

    var f = document.getElementById('ing-table-filter');
    f.addEventListener('input', function () {
      var pos = f.selectionStart;
      renderIngredientsTable();
      var nf = document.getElementById('ing-table-filter');
      nf.focus(); nf.setSelectionRange(pos, pos);
    });

    Array.prototype.forEach.call(main.querySelectorAll('tr[data-ing]'), function (tr) {
      var name = tr.getAttribute('data-ing');
      tr.querySelector('.ing-frame-btn').addEventListener('click', function () {
        openIngredientFrameEditor(name, function (changed) { if (changed) renderIngredientsTable(); });
      });
      tr.querySelector('.ing-used-toggle').addEventListener('click', function () {
        var k = name.toLowerCase();
        if (openIngDetails[k]) delete openIngDetails[k]; else openIngDetails[k] = true;
        renderIngredientsTable();
      });
      var details = tr.nextElementSibling && tr.nextElementSibling.classList.contains('ing-details-row') ? tr.nextElementSibling : null;
      if (details) wireIngredientDetails(details, name);
      var sel = tr.querySelector('.ing-type-select');
      sel.addEventListener('change', function () {
        var p = state.ingredientPhotos[name.toLowerCase()];
        var prev = (p && p.category) || '';
        var type = sel.value;
        if (type === '__new__') {
          type = (prompt('New type name (e.g. "Bitters"):') || '').trim();
          if (!type) { sel.value = prev; return; }
        }
        sel.disabled = true;
        apiUpdateIngredient(name, { category: type }).then(function () {
          if (p) p.category = type;
          else state.ingredientPhotos[name.toLowerCase()] = { name: name, photo_url: null, frame_height: null, category: type };
          renderIngredientsTable();
        }).catch(function (e) { alert('Could not change the type: ' + e.message); sel.disabled = false; sel.value = prev; });
      });
      var input = tr.querySelector('.ing-name-input');
      function commitRename() {
        var newName = input.value.trim().replace(/\s+/g, ' ');
        if (!newName) { input.value = name; return; }
        if (newName === name) return;
        var used = usage[name.toLowerCase()] || 0;
        var inDrinks = used ? (used > 1 ? ' in all ' + used + ' drinks' : ' in the 1 drink that uses it') : '';
        // Renaming onto another ingredient's name = merging the two (e.g. a
        // "- VAT PACK" duplicate into the main one).
        var target = newName.toLowerCase() !== name.toLowerCase() && allIngredientNames().concat(Object.keys(state.ingredientPhotos).map(function (k) { return state.ingredientPhotos[k].name; }))
          .filter(function (n) { return n && n.toLowerCase() === newName.toLowerCase(); })[0];
        if (target) {
          if (!confirm('"' + target + '" already exists. Merge "' + name + '" into it?\n\nEvery drink using "' + name + '" will use "' + target + '" instead' + (used ? ' (' + used + ' drink' + (used > 1 ? 's' : '') + ')' : '') + ', and "' + name + '" leaves the list.')) { input.value = name; return; }
          input.disabled = true;
          apiWrite('swap_ingredient', { name: name, replacement: target }).then(function () {
            return loadAllData();
          }).then(renderIngredientsTable).catch(function (e) {
            alert('Could not merge: ' + e.message);
            input.disabled = false; input.value = name;
          });
          return;
        }
        if (!confirm('Rename "' + name + '" to "' + newName + '"' + (inDrinks ? inDrinks + ' (ingredients and build steps)' : '') + '?')) { input.value = name; return; }
        input.disabled = true;
        apiUpdateIngredient(name, { new_name: newName }).then(function () {
          return loadAllData();
        }).then(renderIngredientsTable).catch(function (e) {
          alert('Could not rename: ' + e.message);
          input.disabled = false; input.value = name;
        });
      }
      input.addEventListener('keydown', function (e) { if (e.key === 'Enter') input.blur(); if (e.key === 'Escape') { input.value = name; input.blur(); } });
      input.addEventListener('change', commitRename);
    });
  }
  function wireIngredientDetails(row, name) {
    var shelf = row.querySelector('.ing-shelf-input');
    shelf.addEventListener('change', function () {
      var v = shelf.value.trim();
      var hours = v === '' ? null : Math.round(parseFloat(v) * 24 * 100) / 100;
      if (v !== '' && !(hours > 0)) { alert('Enter a shelf life in days, e.g. 3'); return; }
      shelf.disabled = true;
      apiUpdateIngredient(name, { shelf_life_hours: hours }).then(function () {
        var key = name.toLowerCase();
        var p = state.ingredientPhotos[key];
        if (p) p.shelf_life_hours = hours;
        else state.ingredientPhotos[key] = { name: name, photo_url: null, frame_height: null, category: '', shelf_life_hours: hours };
        renderIngredientsTable();
      }).catch(function (e) { shelf.disabled = false; alert('Could not save the shelf life: ' + e.message); });
    });
    var label = row.querySelector('.ing-label-input');
    label.addEventListener('change', function () {
      var iso = label.value ? new Date(label.value).toISOString() : null;
      label.disabled = true;
      setLabelTime(name, iso).then(renderIngredientsTable).catch(function (e) { label.disabled = false; alert('Could not save the label time: ' + e.message); });
    });
    var swapBtn = row.querySelector('.ing-swap-btn');
    swapBtn.addEventListener('click', function () {
      var to = row.querySelector('.ing-swap-input').value.trim();
      if (!to) { alert('Type or pick the ingredient to swap in.'); return; }
      var n = drinksUsing(name).length;
      if (!confirm('Permanently swap "' + name + '" for "' + to + '" in ' + (n === 1 ? 'the 1 drink that uses it' : 'all ' + n + ' drinks') + '? "' + name + '" will be removed from the list.')) return;
      swapBtn.disabled = true;
      apiWrite('swap_ingredient', { name: name, replacement: to }).then(function (res) {
        delete openIngDetails[name.toLowerCase()];
        openIngDetails[String(res.replacement || to).toLowerCase()] = true;
        return loadAllData();
      }).then(renderIngredientsTable).catch(function (e) {
        swapBtn.disabled = false;
        alert('Could not swap: ' + e.message);
      });
    });
  }
  function ingredientTableFrameHtml(name) {
    var p = state.ingredientPhotos[String(name).toLowerCase()];
    return stepMediaHtml(null, { photo_url: p ? p.photo_url : '' }, { cls: 'table-frame', defaultHeight: 64, fallbackIcon: 'camera' });
  }

  // ---------- Staff step-photo candidates ----------
  // Staff can't edit any photo. In Build Mode they can take/choose a photo for
  // a step; it's stored as a CANDIDATE (photo_submissions, status pending)
  // and never touches the live recipe until an admin compares it with the
  // current photo and accepts it.
  function pendingSubmissionsFor(cocktailId, stepIndex) {
    return (state.photoSubmissions || []).filter(function (p) {
      return p.cocktail_id === cocktailId && (stepIndex == null || p.step_index === stepIndex);
    });
  }
  function ensureSubmitToken() {
    var tok = localStorage.getItem('bar_submit_token');
    if (tok) return Promise.resolve(tok);
    // Logged in before this feature existed: ask for the password once.
    var pw = prompt('Enter the bar password once to send photos:');
    if (!pw) return Promise.reject(new Error('cancelled'));
    return tryLogin(pw).then(function (res) {
      if (!res.submit_token) throw new Error('No submit permission');
      localStorage.setItem('bar_submit_token', res.submit_token);
      return res.submit_token;
    });
  }
  function apiSubmitCandidate(c, stepIndex, base64, name) {
    return ensureSubmitToken().then(function (tok) {
      return fetch('/api/write', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-bar-staff': tok, 'x-bar-secret': localStorage.getItem('bar_admin_secret') || '' },
        body: JSON.stringify({ action: 'submit_photo_candidate', payload: { cocktail_id: c.id, step_index: stepIndex, image_base64: base64, content_type: 'image/jpeg', submitted_by: name } })
      });
    }).then(function (r) {
      if (!r.ok) return r.json().then(function (j) { throw new Error(j.error || ('send failed: ' + r.status)); });
      return r.json();
    });
  }
  function suggestStepPhoto(c, stepIndex) {
    pickPhotoAndUploadFromMenu(function (base64) {
      var sheet = document.createElement('div');
      sheet.id = 'candidate-sheet-overlay';
      var savedName = '';
      try { savedName = localStorage.getItem('bar_staff_name') || ''; } catch (e) {}
      sheet.innerHTML =
        '<div class="candidate-sheet">' +
          '<h3>Send for review</h3>' +
          '<p class="candidate-sheet-sub">' + escapeHtml(c.name) + ' — step ' + (stepIndex + 1) + '. An admin compares it with the current photo before anything changes.</p>' +
          '<img class="equip-icon is-photo candidate-preview" src="data:image/jpeg;base64,' + base64 + '">' +
          '<label for="candidate-name">Your name (optional)</label>' +
          '<input type="text" id="candidate-name" maxlength="60" value="' + escapeHtml(savedName) + '" placeholder="e.g. Sam">' +
          '<div class="candidate-sheet-actions">' +
            '<button type="button" class="btn btn-secondary" id="candidate-cancel">Cancel</button>' +
            '<button type="button" class="btn btn-primary" id="candidate-send">Send photo</button>' +
          '</div>' +
        '</div>';
      document.body.appendChild(sheet);
      sheet.querySelector('#candidate-cancel').addEventListener('click', function () { sheet.remove(); });
      var sendBtn = sheet.querySelector('#candidate-send');
      sendBtn.addEventListener('click', function () {
        var name = sheet.querySelector('#candidate-name').value.trim();
        try { localStorage.setItem('bar_staff_name', name); } catch (e) {}
        sendBtn.disabled = true;
        sendBtn.textContent = 'Sending…';
        apiSubmitCandidate(c, stepIndex, base64, name).then(function () {
          sheet.remove();
          alert('Thanks — your photo was sent for review.');
        }).catch(function (e) {
          sendBtn.disabled = false;
          sendBtn.textContent = 'Send photo';
          if (e.message !== 'cancelled') alert('Could not send the photo: ' + e.message);
        });
      });
    });
  }
  // Take/choose (+ crop) only — no "remove" option for staff.
  function pickPhotoAndUploadFromMenu(onPicked) {
    choosePhotoAndUpload(false, function (base64, isRemoval) { if (!isRemoval && base64) onPicked(base64); }, function () {});
  }
  function apiReviewSubmission(id, decision) {
    return apiWrite('review_photo_submission', { id: id, decision: decision });
  }
  // Admin comparison screen: current step photo vs each staff candidate,
  // side by side in the same no-crop frames. filter: {cocktailId, stepIndex}
  // or null for everything waiting. onClose(changed).
  function openPhotoReview(filter, onClose) {
    var overlay = document.createElement('div');
    overlay.id = 'photo-review-overlay';
    document.body.appendChild(overlay);
    var changed = false;
    function close() { overlay.remove(); if (onClose) onClose(changed); }
    function render() {
      var list = filter ? pendingSubmissionsFor(filter.cocktailId, filter.stepIndex) : (state.photoSubmissions || []);
      var html = '<div class="frame-editor-header"><h3>Staff photo candidates</h3><button type="button" class="btn btn-secondary" id="review-done">Done</button></div>';
      if (!list.length) html += '<p class="review-empty">Nothing waiting for review.</p>';
      html += list.map(function (p) {
        var c = state.cocktails.filter(function (x) { return x.id === p.cocktail_id; })[0];
        var steps = (c && c.method_steps) || [];
        var step = steps[p.step_index];
        var moved = !step || (p.step_instruction && (step.instruction || '') !== p.step_instruction);
        var current = step && step.photo_url
          ? stepMediaHtml(c.glass, { photo_url: step.photo_url }, { cls: 'review-frame', defaultHeight: 180 })
          : '<div class="review-none">No photo yet</div>';
        var when = new Date(p.created_at);
        return '<div class="review-card" data-sub="' + p.id + '">' +
          '<div class="review-title">' + escapeHtml(c ? c.name : 'Deleted cocktail') + ' — step ' + (p.step_index + 1) + '</div>' +
          '<div class="review-instruction">' + escapeHtml(p.step_instruction || '') + '</div>' +
          (moved ? '<div class="review-warn">⚠️ This step has changed since the photo was sent (steps merged or reworded) — check it still matches before accepting.</div>' : '') +
          '<div class="review-compare">' +
            '<figure><figcaption>Current</figcaption>' + current + '</figure>' +
            '<figure><figcaption>Candidate</figcaption>' + stepMediaHtml(null, { photo_url: p.photo_url }, { cls: 'review-frame', defaultHeight: 180 }) + '</figure>' +
          '</div>' +
          '<div class="review-meta">From ' + escapeHtml(p.submitted_by || 'staff (no name)') + ' · ' + escapeHtml(when.toLocaleString()) + '</div>' +
          '<div class="review-actions">' +
            '<button type="button" class="btn btn-secondary" data-decide="reject">✕ Keep current</button>' +
            '<button type="button" class="btn btn-primary" data-decide="accept"' + (step ? '' : ' disabled') + '>✓ Use candidate</button>' +
          '</div>' +
        '</div>';
      }).join('');
      overlay.innerHTML = html;
      overlay.querySelector('#review-done').addEventListener('click', close);
      Array.prototype.forEach.call(overlay.querySelectorAll('[data-decide]'), function (btn) {
        btn.addEventListener('click', function () {
          var card = btn.closest('.review-card');
          var id = card.getAttribute('data-sub');
          var decision = btn.getAttribute('data-decide');
          Array.prototype.forEach.call(card.querySelectorAll('button'), function (b) { b.disabled = true; });
          apiReviewSubmission(id, decision).then(function () {
            changed = true;
            return loadAllData();
          }).then(render).catch(function (e) {
            alert('Could not save that decision: ' + e.message);
            render();
          });
        });
      });
    }
    render();
  }

  // ---------- Data Integrity Report (admin) ----------
  // Renders data_integrity_report.md (served as a static file next to the
  // app) so the latest committed version is always what's shown. Small
  // built-in Markdown renderer — headings, paragraphs, lists, tables, rules,
  // code, bold/italic, links — enough for this report, no library needed.
  function mdInline(s) {
    return escapeHtml(s)
      .replace(/`([^`]+)`/g, '<code>$1</code>')
      .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
      .replace(/(^|[^*\w])\*([^*\s][^*]*)\*/g, '$1<em>$2</em>')
      .replace(/\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>');
  }
  function renderMarkdown(md) {
    var lines = md.replace(/\r/g, '').split('\n');
    var out = [], i = 0;
    function isBlockStart(l) { return /^(#{1,6} |\s*[-*] |\s*\d+\. |\||```|---\s*$|> )/.test(l); }
    while (i < lines.length) {
      var l = lines[i];
      if (!l.trim()) { i++; continue; }
      var h = l.match(/^(#{1,6}) (.*)/);
      if (h) { out.push('<h' + h[1].length + '>' + mdInline(h[2]) + '</h' + h[1].length + '>'); i++; continue; }
      if (/^---\s*$/.test(l)) { out.push('<hr>'); i++; continue; }
      if (/^```/.test(l)) {
        var code = []; i++;
        while (i < lines.length && !/^```/.test(lines[i])) code.push(lines[i++]);
        i++; out.push('<pre><code>' + escapeHtml(code.join('\n')) + '</code></pre>'); continue;
      }
      if (/^\|/.test(l)) {
        var rows = [];
        while (i < lines.length && /^\|/.test(lines[i])) rows.push(lines[i++]);
        var cells = function (r) { return r.replace(/^\||\|\s*$/g, '').split('|').map(function (c) { return c.trim(); }); };
        var body = rows.filter(function (r, k) { return !(k === 1 && /^\|[\s:|-]+\|?\s*$/.test(r)); });
        out.push('<div class="report-table-wrap"><table><thead><tr>' + cells(body[0]).map(function (c) { return '<th>' + mdInline(c) + '</th>'; }).join('') +
          '</tr></thead><tbody>' + body.slice(1).map(function (r) {
            return '<tr>' + cells(r).map(function (c) { return '<td>' + mdInline(c) + '</td>'; }).join('') + '</tr>';
          }).join('') + '</tbody></table></div>');
        continue;
      }
      if (/^> /.test(l)) {
        var q = [];
        while (i < lines.length && /^> ?/.test(lines[i]) && lines[i].trim()) q.push(lines[i++].replace(/^> ?/, ''));
        out.push('<blockquote>' + mdInline(q.join(' ')) + '</blockquote>'); continue;
      }
      var listM = l.match(/^\s*([-*]|\d+\.) /);
      if (listM) {
        var ordered = /\d/.test(listM[1]), items = [];
        while (i < lines.length && lines[i].trim()) {
          if (/^\s*([-*]|\d+\.) /.test(lines[i])) items.push(lines[i].replace(/^\s*([-*]|\d+\.) /, ''));
          else if (items.length) items[items.length - 1] += ' ' + lines[i].trim();
          i++;
          // a blank line followed by another item continues the same list
          if (i < lines.length && !lines[i].trim() && i + 1 < lines.length && /^\s*([-*]|\d+\.) /.test(lines[i + 1])) i++;
        }
        var tag = ordered ? 'ol' : 'ul';
        out.push('<' + tag + '>' + items.map(function (it) { return '<li>' + mdInline(it) + '</li>'; }).join('') + '</' + tag + '>');
        continue;
      }
      var para = [];
      while (i < lines.length && lines[i].trim() && !(para.length && isBlockStart(lines[i]))) para.push(lines[i++]);
      out.push('<p>' + mdInline(para.join(' ')) + '</p>');
    }
    return out.join('\n');
  }
  function renderReport() {
    setHeader('📋 Data Integrity Report', true, renderHome);
    var main = document.getElementById('app-main');
    main.innerHTML = '<p class="report-loading">Loading report…</p>';
    fetch('/data_integrity_report.md?t=' + Date.now(), { cache: 'no-store' }).then(function (r) {
      if (!r.ok) throw new Error('could not load the report (' + r.status + ')');
      return r.text();
    }).then(function (md) {
      main.innerHTML = '<article class="report-md">' + renderMarkdown(md) + '</article>';
    }).catch(function (e) {
      main.innerHTML = '<p>' + escapeHtml(e.message) + '</p>';
    });
  }

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
      '</div>' +
      (state.role === 'admin' ?
        '<div class="home-card' + (state.photoSubmissions.length ? ' has-pending' : '') + '" id="home-candidates">' +
          '<div class="home-card-emoji">📸</div>' +
          '<div class="home-card-text"><h3>Staff Photo Candidates' + (state.photoSubmissions.length ? ' <span class="pending-count">' + state.photoSubmissions.length + '</span>' : '') + '</h3><p>Compare photos sent from the bar with the current ones</p></div>' +
        '</div>' +
        '<div class="home-card" id="home-report">' +
          '<div class="home-card-emoji">📋</div>' +
          '<div class="home-card-text"><h3>Data Integrity Report</h3><p>Every inconsistency found so far — resolved and still open</p></div>' +
        '</div>' +
        '<div class="home-card" id="home-ingredients">' +
          '<div class="home-card-emoji">🧾</div>' +
          '<div class="home-card-text"><h3>Ingredients</h3><p>Every ingredient by type — add photos, rename, regroup</p></div>' +
        '</div>' : '') +
      // Log out is pushed to the very bottom of the screen (margin-top:auto
      // inside the full-height .is-home column — see style.css).
      '<button type="button" id="logout-btn" class="btn btn-secondary logout-btn">Log out</button>';
    main.classList.add('is-home');
    document.getElementById('home-cocktail-spec').addEventListener('click', renderMenu);
    document.getElementById('home-fruit-prep').addEventListener('click', renderFruitPrep);
    var candCard = document.getElementById('home-candidates');
    if (candCard) candCard.addEventListener('click', function () {
      loadAllData().then(function () { openPhotoReview(null, function () { renderHome(); }); });
    });
    var reportCard = document.getElementById('home-report');
    if (reportCard) reportCard.addEventListener('click', renderReport);
    var ingCard = document.getElementById('home-ingredients');
    if (ingCard) ingCard.addEventListener('click', renderIngredientsTable);
    document.getElementById('logout-btn').addEventListener('click', function () {
      if (!confirm('Log out of Ube Express?')) return;
      localStorage.removeItem('bar_role');
      localStorage.removeItem('bar_admin_secret');
      localStorage.removeItem('bar_submit_token');
      location.reload();
    });
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

  function setPrepState(rows) {
    state.prep = {};
    rows.forEach(function (r) { state.prep[String(r.item_name).toLowerCase()] = r; });
  }
  function fetchPrepCheckState() {
    return sbSelect('prep_checklist_state', 'select=*').then(function (rows) { setPrepState(rows); return rows; });
  }

  // Direct anon-key writes, deliberately bypassing the admin-secret-gated
  // /api/write proxy: any logged-in staff member ticks prep, records labels
  // and throws things out — not just admin (see the table's RLS policy).
  function prepUpsert(rows) {
    return fetch(SUPABASE_URL + '/rest/v1/prep_checklist_state?on_conflict=item_name', {
      method: 'POST',
      headers: {
        apikey: SUPABASE_ANON_KEY,
        Authorization: 'Bearer ' + SUPABASE_ANON_KEY,
        'Content-Type': 'application/json',
        Prefer: 'resolution=merge-duplicates,return=representation'
      },
      body: JSON.stringify(rows)
    }).then(function (r) {
      if (!r.ok) throw new Error('Save failed: ' + r.status);
      return r.json();
    }).then(function (saved) {
      saved.forEach(function (row) { state.prep[String(row.item_name).toLowerCase()] = row; });
      return saved;
    });
  }
  function prepRowName(name) {
    var existing = state.prep[String(name).toLowerCase()];
    return existing ? existing.item_name : name;
  }
  function setPrepChecked(itemName, category, checked) {
    return prepUpsert([{
      item_name: prepRowName(itemName),
      category: category,
      checked: checked,
      checked_at: checked ? new Date().toISOString() : null,
      updated_at: new Date().toISOString()
    }]);
  }
  // Label List "Done": the label time for everything on the list is now.
  function recordLabels(names) {
    var now = new Date().toISOString();
    return prepUpsert(names.map(function (n) {
      var ex = state.prep[n.toLowerCase()] || {};
      return { item_name: prepRowName(n), category: ex.category || ingredientCategory(n), checked: true, checked_at: ex.checked_at || now, label_at: now, updated_at: now };
    }));
  }
  // Closer throws it out: it drops back to unticked (so the next opener sees
  // it needs prepping) and its label is cleared.
  function markThrownOut(name) {
    return prepUpsert([{ item_name: prepRowName(name), category: ingredientCategory(name), checked: false, checked_at: null, label_at: null, updated_at: new Date().toISOString() }]);
  }
  // Set/correct an item's label time by hand (Ingredients table).
  function setLabelTime(name, iso) {
    var ex = state.prep[String(name).toLowerCase()] || {};
    return prepUpsert([{ item_name: prepRowName(name), category: ex.category || ingredientCategory(name), checked: iso ? true : !!ex.checked, checked_at: ex.checked_at || (iso ? iso : null), label_at: iso, updated_at: new Date().toISOString() }]);
  }

  // Unticks everything but keeps each item's label time, so expiry tracking
  // survives a reset.
  function resetPrepChecklist() {
    return fetch(SUPABASE_URL + '/rest/v1/prep_checklist_state?item_name=not.is.null', {
      method: 'PATCH',
      headers: { apikey: SUPABASE_ANON_KEY, Authorization: 'Bearer ' + SUPABASE_ANON_KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify({ checked: false, checked_at: null, updated_at: new Date().toISOString() })
    }).then(function (r) { if (!r.ok) throw new Error('Reset failed: ' + r.status); });
  }

  // Ticked items whose label hasn't been recorded since they were ticked.
  function labelQueue(lists) {
    return lists.fruitSyrup.concat(lists.sweetsGarnish).filter(function (n) {
      var p = state.prep[n.toLowerCase()];
      if (!p || !p.checked) return false;
      return !p.label_at || (p.checked_at && new Date(p.label_at) < new Date(p.checked_at));
    }).sort(function (a, b) { return a.localeCompare(b); });
  }
  // Everything labelled whose expiry falls tomorrow or earlier.
  function throwOutList() {
    return Object.keys(state.prep).map(function (k) { return state.prep[k].item_name; })
      .map(function (n) { return { name: n, info: expiryInfo(n) }; })
      .filter(function (x) { return x.info.status === 'throw_tonight' || x.info.status === 'expired'; })
      .sort(function (a, b) { return a.info.expiresAt - b.info.expiresAt; });
  }
  function expiryBadgeHtml(name) {
    var info = expiryInfo(name);
    if (info.status === 'expired') return '<span class="exp-badge exp-expired">Out of date</span>';
    if (info.status === 'throw_tonight') return '<span class="exp-badge exp-tonight">Throw out tonight</span>';
    if (info.status === 'ok') return '<span class="exp-badge exp-ok">Good until ' + escapeHtml(fmtDay(info.throwOutDay)) + '</span>';
    return '';
  }

  function prepRowHtml(name, checked) {
    var p = state.prep[String(name).toLowerCase()];
    var waitingLabel = checked && p && (!p.label_at || (p.checked_at && new Date(p.label_at) < new Date(p.checked_at)));
    return '<label class="prep-row' + (checked ? ' checked' : '') + '" data-item="' + escapeHtml(name) + '">' +
      '<input type="checkbox"' + (checked ? ' checked' : '') + '>' +
      '<span>' + escapeHtml(name) + '</span>' +
      (waitingLabel ? '<span class="exp-badge exp-label">Needs label</span>' : (checked ? expiryBadgeHtml(name) : '')) +
      '</label>';
  }

  function renderFruitPrep() {
    setHeader('🍋 Fruit Prep', true, renderHome);
    var main = document.getElementById('app-main');
    main.innerHTML = '<p style="color:var(--muted)">Loading…</p>';
    var lists = computePrepLists();

    fetchPrepCheckState().then(function () {
      var isChecked = function (n) { var p = state.prep[n.toLowerCase()]; return !!(p && p.checked); };
      var queue = labelQueue(lists);
      var toss = throwOutList();

      var html = '';
      // Closers: what has to go in the bin tonight.
      html += '<div class="section-label">🗑 Throw Out Tonight</div>';
      html += toss.length
        ? '<div class="toss-list">' + toss.map(function (x) {
            return '<div class="toss-row" data-item="' + escapeHtml(x.name) + '">' +
              '<div class="toss-text"><div class="toss-name">' + escapeHtml(x.name) + '</div>' +
              '<div class="toss-meta">' + (x.info.status === 'expired' ? 'Out of date since ' : 'Out of date ') + escapeHtml(fmtLabelDate(x.info.expiresAt)) +
              ' · labelled ' + escapeHtml(fmtLabelDate(x.info.labelAt)) + '</div></div>' +
              '<button type="button" class="btn btn-danger toss-btn">Thrown out</button>' +
            '</div>';
          }).join('') + '</div>'
        : '<p class="toss-empty">Nothing to throw out tonight.</p>';

      html += '<div style="display:flex;gap:10px;margin:18px 0;">' +
        '<button id="prep-reset-btn" class="btn btn-secondary" style="flex:1;">🔄 Untick all</button>' +
        '<button id="prep-labels-btn" class="btn btn-primary" style="flex:1;">🏷 Label List' + (queue.length ? ' (' + queue.length + ')' : '') + '</button>' +
        '</div>';

      html += '<div class="section-label">🍓 Fruit &amp; Syrups to Portion</div>';
      html += '<div class="prep-list">' + (lists.fruitSyrup.length ?
        lists.fruitSyrup.map(function (n) { return prepRowHtml(n, isChecked(n)); }).join('') :
        '<p style="color:var(--muted)">Nothing on the menu needs this right now.</p>') + '</div>';

      html += '<div class="section-label">🍬 Sweets Garnish Stock to Replenish</div>';
      html += '<div class="prep-list">' + (lists.sweetsGarnish.length ?
        lists.sweetsGarnish.map(function (n) { return prepRowHtml(n, isChecked(n)); }).join('') :
        '<p style="color:var(--muted)">Nothing on the menu needs this right now.</p>') + '</div>';

      main.innerHTML = html;

      Array.prototype.forEach.call(main.querySelectorAll('.prep-row'), function (row) {
        var checkbox = row.querySelector('input');
        checkbox.addEventListener('change', function () {
          var name = row.getAttribute('data-item');
          checkbox.disabled = true;
          setPrepChecked(name, ingredientCategory(name), checkbox.checked).then(renderFruitPrep).catch(function (e) {
            checkbox.checked = !checkbox.checked;
            checkbox.disabled = false;
            alert('Could not save: ' + e.message);
          });
        });
      });

      Array.prototype.forEach.call(main.querySelectorAll('.toss-row'), function (row) {
        var btn = row.querySelector('.toss-btn');
        wireArmConfirm(btn, 'Tap to confirm', function () {
          markThrownOut(row.getAttribute('data-item')).then(renderFruitPrep).catch(function (e) { alert('Could not save: ' + e.message); });
        });
      });

      wireArmConfirm(document.getElementById('prep-reset-btn'), 'Tap again to untick all', function () {
        resetPrepChecklist().then(renderFruitPrep).catch(function (e) { alert('Reset failed: ' + e.message); });
      });

      document.getElementById('prep-labels-btn').addEventListener('click', function () {
        renderLabelList(labelQueue(lists));
      });
    }).catch(function (e) {
      main.innerHTML = '<p>Could not load the prep list: ' + escapeHtml(e.message) + '</p>';
    });
  }

  // Everything ticked off on Fruit Prep that still needs a label. Pressing
  // Done saves "now" as the label time for every item on the list — that
  // time + the ingredient's shelf life is what drives the throw-out list.
  function renderLabelList(items) {
    setHeader('🏷 Label List', true, renderFruitPrep);
    var main = document.getElementById('app-main');
    var now = new Date();

    if (!items.length) {
      main.innerHTML = '<p style="color:var(--muted)">No labels needed — tick items off on Fruit Prep as you prep them and they appear here.</p>' +
        '<button id="labels-back-btn" class="btn btn-secondary">← Back to Fruit Prep</button>';
      document.getElementById('labels-back-btn').addEventListener('click', renderFruitPrep);
      return;
    }

    var html = '<p id="labels-note" style="color:var(--muted);margin-bottom:14px;">' + items.length + ' item' + (items.length === 1 ? '' : 's') +
      ' to label. Print, label everything, then press <strong>Done</strong> — that saves today\'s label time for each one.</p>';
    html += '<div style="display:flex;gap:10px;margin-bottom:18px;">' +
      '<button id="labels-print-btn" class="btn btn-secondary" style="flex:1;">🖨 Print Labels</button>' +
      '<button id="labels-done-btn" class="btn btn-primary" style="flex:1;">✅ Done</button>' +
      '</div>';
    html += '<div id="label-grid" class="label-grid">' + items.map(function (name) {
      var hours = shelfLifeHours(name);
      var useBy = hours ? new Date(now.getTime() + hours * 3600 * 1000) : null;
      return '<div class="label-card">' +
        '<div class="label-name">' + escapeHtml(name) + '</div>' +
        '<div class="label-date">Prepped: ' + fmtLabelDate(now) + '</div>' +
        '<div class="label-date">Use by: ' + (useBy ? fmtLabelDate(useBy) : '<span class="no-print-warn">shelf life not set</span>') + '</div>' +
        '</div>';
    }).join('') + '</div>';

    main.innerHTML = html;
    document.getElementById('labels-print-btn').addEventListener('click', function () { window.print(); });
    var doneBtn = document.getElementById('labels-done-btn');
    doneBtn.addEventListener('click', function () {
      doneBtn.disabled = true;
      doneBtn.textContent = 'Saving…';
      recordLabels(items).then(renderFruitPrep).catch(function (e) {
        doneBtn.disabled = false;
        doneBtn.textContent = '✅ Done';
        alert('Could not save the label times: ' + e.message);
      });
    });
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

    // The finished-drink photo is wrapped in the same Frame Editor as every
    // step photo/icon: never cropped, vertically centred, admin taps it to
    // resize (height only) or change/remove the photo.
    var overviewFrame = { photo_url: c.photo_url || '', frame_height: c.photo_frame_height, equipment: 'glass' };
    var OVERVIEW_FRAME_OPTS = { cls: 'finished-frame', defaultHeight: 260 };
    if (c.photo_url || state.role === 'admin') {
      html += '<div class="finished-photo-wrap">' +
        (state.role === 'admin'
          ? '<button type="button" id="cocktail-photo-btn" class="step-media-btn finished-media-btn" title="Frame Editor: photo of the finished, garnished drink">' + stepMediaHtml(c.glass, overviewFrame, OVERVIEW_FRAME_OPTS) + '</button>' +
            (c.photo_url ? '' : '<div class="finished-photo-hint">Tap to add a finished photo</div>')
          : stepMediaHtml(c.glass, overviewFrame, OVERVIEW_FRAME_OPTS)) +
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
        var hasIngPhoto = !!(photo && photo.photo_url);
        var nameHtml = (hasIngPhoto || state.role === 'admin') ?
          '<button type="button" class="name-btn' + (hasIngPhoto ? ' has-photo' : '') + '" data-ing-frame="' + escapeHtml(i.name) + '">' + escapeHtml(i.name) +
            '</button>' :
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

    Array.prototype.forEach.call(main.querySelectorAll('[data-ing-frame]'), function (btn) {
      btn.addEventListener('click', function () {
        var ingName = btn.getAttribute('data-ing-frame');
        if (state.role === 'admin') openIngredientFrameEditor(ingName, function (changed) { if (changed) openDetail(id); });
        else showIngredientPhoto(ingName);
      });
    });

    var cocktailPhotoBtn = document.getElementById('cocktail-photo-btn');
    if (cocktailPhotoBtn) cocktailPhotoBtn.addEventListener('click', function () {
      var changed = false;
      openFrameEditor(overviewFrame, c.glass, function (base64, isRemoval, cb) {
        var req = isRemoval ? apiRemovePhoto('cocktail', { cocktail_id: c.id }) : apiUploadPhoto(base64, 'cocktail', { cocktail_id: c.id });
        req.then(function (res) {
          c.photo_url = isRemoval ? null : res.photo_url;
          changed = true;
          cb(c.photo_url);
        }).catch(function (e) {
          alert((isRemoval ? 'Remove' : 'Photo upload') + ' failed: ' + e.message);
        });
      }, function (newHeight) {
        c.photo_frame_height = newHeight;
        changed = true;
        apiUpdateCocktailFrameHeight(c.id, newHeight).catch(function (e) { alert('Resize save failed: ' + e.message); });
      }, {
        cls: OVERVIEW_FRAME_OPTS.cls,
        defaultHeight: OVERVIEW_FRAME_OPTS.defaultHeight,
        // Re-render the detail page once the editor closes so the overview
        // shows the new photo/height straight away.
        onClose: function () { if (changed) loadAllData().then(function () { openDetail(id); }); }
      });
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
      return '<li' + (photo && photo.photo_url ? ' class="clickable" data-ing-view="' + escapeHtml(photo.photo_url) + '" data-ing-h="' + (photo.frame_height || '') + '"' : '') + '>' +
        '<span class="ing-name">' + escapeHtml(name) + '</span>' +
        (amtLabel ? '<span class="ing-amt">' + escapeHtml(amtLabel) + '</span>' : '') + '</li>';
    }

    function bottomBlockHtml(st, i, isCurrent) {
      var names = st.ingredient_names || [];
      var overrideAmts = st.ingredient_amounts || {};
      var ingList = names.length ? '<ul class="step-ingredient-list">' + names.map(function (n) {
        return ingredientRowHtml(n, overrideAmts[String(n).toLowerCase()]);
      }).join('') + '</ul>' : '';
      return '<div class="build-bottom-block' + (isCurrent ? ' is-current' : '') + '"' + (isCurrent ? '' : ' aria-hidden="true"') + '>' +
        ingList +
        '<div class="instruction">' + escapeHtml(st.instruction || '') + '</div>' +
      '</div>';
    }

    function render() {
      var s = steps[idx];
      var dots = steps.map(function (_, i) { return '<div class="dot' + (i <= idx ? ' done' : '') + '"></div>'; }).join('');
      // Build Mode always fills one big fixed card (Alex's call): every step's
      // photo is the same size, never cropped (letterboxed), so nothing jumps.
      // Saved per-step frame heights still apply in the edit grid/overview.
      var mediaHtml = stepMediaHtml(c.glass, s, { cls: 'build-frame' });
      var labelExtra = '';
      if (state.role === 'admin') {
        var nCand = pendingSubmissionsFor(c.id, idx).length;
        if (nCand) labelExtra = '<button type="button" class="candidate-badge" id="step-candidates-btn">📸 ' + nCand + ' to compare</button>';
      } else {
        labelExtra = '<button type="button" class="suggest-photo-btn" id="step-suggest-btn">📷 Suggest a photo</button>';
      }
      // Anchored layout: progress bar + "Step X of Y" pinned at the top;
      // the ingredients + instruction block pinned just above the buttons;
      // the photo frame centred in the space between. Every step's bottom
      // block is stacked in the same grid cell (only the current one
      // visible), so that area is always as tall as this drink's tallest
      // step — its top edge never moves, so the frame's centre never moves.
      overlay.innerHTML =
        '<div class="build-progress">' + dots + '</div>' +
        '<div class="step-label-row"><span class="step-label">Step ' + (idx + 1) + ' of ' + steps.length + '</span>' + labelExtra + '</div>' +
        '<div class="build-stage">' +
          '<div class="step-media-row"><button type="button" class="step-media-btn" title="' + (state.role === 'admin' ? 'Frame Editor' : 'Suggest a photo for this step') + '">' + mediaHtml + '</button><img id="step-ing-preview" class="step-ing-photo" hidden></div>' +
        '</div>' +
        '<div class="build-bottom">' + steps.map(function (st, i) { return bottomBlockHtml(st, i, i === idx); }).join('') + '</div>' +
        '<div class="build-nav">' +
        (idx > 0 ? '<button id="build-back" class="btn btn-secondary">← Back</button>' : '<button id="build-close" class="btn btn-secondary">✕ Close</button>') +
        (idx < steps.length - 1 ? '<button id="build-next" class="btn btn-primary">Next →</button>' : '<button id="build-done" class="btn btn-primary">✅ Done</button>') +
        '</div>';

      var candBtn = document.getElementById('step-candidates-btn');
      if (candBtn) candBtn.addEventListener('click', function () {
        openPhotoReview({ cocktailId: c.id, stepIndex: idx }, function (changed) {
          if (!changed) { render(); return; }
          var fresh = state.cocktails.filter(function (x) { return x.id === c.id; })[0];
          if (fresh && fresh.method_steps && fresh.method_steps[idx]) s.photo_url = fresh.method_steps[idx].photo_url || '';
          render();
        });
      });
      function staffSuggest() { suggestStepPhoto(c, idx); }
      var suggestBtn = document.getElementById('step-suggest-btn');
      if (suggestBtn) suggestBtn.addEventListener('click', staffSuggest);
      overlay.querySelector('.step-media-btn').addEventListener('click', function () {
        // Staff never edit photos — tapping the frame offers a candidate instead.
        if (state.role !== 'admin') { staffSuggest(); return; }
        openFrameEditor(s, c.glass, function (base64, isRemoval, cb) {
          var req = isRemoval
            ? apiRemovePhoto('step', { cocktail_id: c.id, step_index: idx })
            : apiUploadPhoto(base64, 'step', { cocktail_id: c.id, step_index: idx });
          req.then(function (res) {
            var newUrl = isRemoval ? '' : res.photo_url;
            s.photo_url = newUrl;
            render();
            loadAllData().catch(function (e) { console.warn('Background refresh after step photo change failed:', e.message); });
            cb(newUrl);
          }).catch(function (e) {
            alert((isRemoval ? 'Remove' : 'Photo upload') + ' failed: ' + e.message);
          });
        }, function (newHeight) {
          apiUpdateStepFrameHeight(c.id, idx, newHeight).catch(function (e) {
            alert('Could not save the new frame size: ' + e.message);
          });
        });
      });

      var backBtn = document.getElementById('build-back');
      if (backBtn) backBtn.addEventListener('click', function () { idx--; render(); });
      var closeBtn = document.getElementById('build-close');
      if (closeBtn) closeBtn.addEventListener('click', close);
      var nextBtn = document.getElementById('build-next');
      if (nextBtn) nextBtn.addEventListener('click', function () { idx++; render(); });
      var doneBtn = document.getElementById('build-done');
      if (doneBtn) doneBtn.addEventListener('click', close);

      var preview = document.getElementById('step-ing-preview');
      Array.prototype.forEach.call(overlay.querySelectorAll('.build-bottom-block.is-current [data-ing-view]'), function (li) {
        li.addEventListener('click', function () {
          var url = li.getAttribute('data-ing-view');
          // Same no-crop frame as everywhere else; height follows the Frame
          // Editor's saved size, scaled to fit beside the step icon.
          var savedH = parseInt(li.getAttribute('data-ing-h'), 10) || INGREDIENT_FRAME_DEFAULT_H;
          preview.style.height = Math.round(Math.min(150, savedH * 0.55)) + 'px';
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
      return '<div class="repeat-row" data-idx="' + idx + '">' +
        '<input type="text" class="ing-name" placeholder="Name" value="' + escapeHtml(ing.name) + '">' +
        '<input type="number" step="0.1" class="ing-amount" placeholder="Amt" value="' + escapeHtml(ing.amount) + '">' +
        '<select class="ing-unit">' + UNIT_OPTIONS.map(function (u) { return '<option value="' + u + '"' + (u === ing.unit ? ' selected' : '') + '>' + u + '</option>'; }).join('') + '</select>' +
        '<button type="button" class="photo-btn' + (hasPhoto ? ' has-photo' : '') + '" data-ing-photo="1" title="Frame Editor: photo for new starters">' + iconSvg('camera') + '</button>' +
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
      // Every frame — photo or fallback icon alike — is just a plain clickable
      // card now; resizing and photo changes both live inside the Frame
      // Editor it opens, not bolted onto the card itself.
      framesEl.innerHTML = '<div class="step-frame-grid">' +
        steps.map(function (s, i) {
          return '<button type="button" class="step-frame' + (s.photo_url ? ' has-photo' : '') + '" data-frame-idx="' + i + '">' +
            stepMediaHtml(existing.glass, s) +
            '<span class="step-frame-label">Step ' + (i + 1) + '</span>' +
          '</button>';
        }).join('') +
        '</div>';

      Array.prototype.forEach.call(framesEl.querySelectorAll('[data-frame-idx]'), function (frameEl) {
        frameEl.addEventListener('click', function () {
          var i = parseInt(frameEl.getAttribute('data-frame-idx'), 10);
          openFrameEditor(steps[i], existing.glass, function (base64, isRemoval, cb) {
            frameEl.classList.add('uploading');
            var req = isRemoval
              ? apiRemovePhoto('step', { cocktail_id: existing.id, step_index: i })
              : apiUploadPhoto(base64, 'step', { cocktail_id: existing.id, step_index: i });
            req.then(function (res) {
              frameEl.classList.remove('uploading');
              var newUrl = isRemoval ? '' : res.photo_url;
              steps[i].photo_url = newUrl;
              syncStepRowAttr(i, newUrl);
              renderStepFrames();
              loadAllData().catch(function (e) { console.warn('Background refresh after step photo change failed:', e.message); });
              cb(newUrl);
            }).catch(function (e) {
              frameEl.classList.remove('uploading');
              alert((isRemoval ? 'Remove' : 'Photo upload') + ' failed: ' + e.message);
            });
          }, function (newHeight) {
            apiUpdateStepFrameHeight(existing.id, i, newHeight).then(function () {
              renderStepFrames();
            }).catch(function (e) {
              alert('Could not save the new frame size: ' + e.message);
            });
          });
        });
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
          openIngredientFrameEditor(name, function () {
            var p = state.ingredientPhotos[name.toLowerCase()];
            btn.classList.toggle('has-photo', !!(p && p.photo_url));
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
