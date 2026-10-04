(function () {
  'use strict';

  var SUPABASE_URL = 'https://ousaticrzizhddqfljwl.supabase.co';
  var SUPABASE_ANON_KEY = 'sb_publishable_cSTfoSAbaVbutWAxxA6Zgg_gEkmTG8H';

  var GLASS_OPTIONS = ['coupe', 'martini', 'rocks', 'highball', 'collins', 'copper_mug', 'wine', 'shot'];
  var EQUIPMENT_OPTIONS = ['shaker', 'jigger', 'strainer', 'muddler', 'bar_spoon', 'blender', 'glass'];
  var UNIT_OPTIONS = ['oz', 'ml', 'g', 'each', 'dash', 'barspoon', 'splash', 'rinse', 'whole', 'wedge', 'leaf', 'sprig', 'scoop', 'to taste'];
  var OZ_TO_ML = 29.5735;

  // Fruit Prep membership lives on each ingredient (ingredient_photos.
  // prep_group: 'fruit_syrup' = fresh fruit/herbs + house batches to portion,
  // 'sweets_garnish' = garnish stock to replenish, null = poured to spec, not
  // prepped). Stored per ingredient — not a hard-coded name list — so it
  // follows renames/swaps/merges and is editable in the Ingredients table.
  function ingredientCategory(name) {
    var p = state.ingredientPhotos[String(name || '').toLowerCase()];
    return (p && p.prep_group) || null;
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
  // Each prepped container is its own batch (prep_batches) with its own
  // label time. expiry = label time + the ingredient's shelf life.
  function batchInfo(name, b) {
    var labelAt = b && b.label_at ? new Date(b.label_at) : null;
    var hours = shelfLifeHours(name);
    if (!labelAt) return { labelAt: null, hours: hours, expiresAt: null, throwOutDay: null, status: 'no_label' };
    if (!hours) return { labelAt: labelAt, hours: null, expiresAt: null, throwOutDay: null, status: 'no_shelf_life' };
    var expiresAt = new Date(labelAt.getTime() + hours * 3600 * 1000);
    var throwOutDay = new Date(startOfDay(expiresAt).getTime() - 24 * 3600 * 1000);
    var now = new Date();
    var status = now >= expiresAt ? 'expired' : (startOfDay(now) >= throwOutDay ? 'throw_tonight' : 'ok');
    return { labelAt: labelAt, hours: hours, expiresAt: expiresAt, throwOutDay: throwOutDay, status: status };
  }
  function batchesFor(name) {
    var k = String(name || '').toLowerCase();
    return (state.batches || []).filter(function (b) { return String(b.item_name).toLowerCase() === k; });
  }
  function activeBatches(name) {
    return batchesFor(name).filter(function (b) { return !b.ended_at; })
      .sort(function (a, b) { return new Date(a.label_at || a.created_at) - new Date(b.label_at || b.created_at); });
  }
  // Item-level expiry = its OLDEST labelled container (the one that goes first).
  function expiryInfo(name) {
    var labelled = activeBatches(name).filter(function (b) { return b.label_at; });
    if (labelled.length) return batchInfo(name, labelled[0]);
    return { labelAt: null, hours: shelfLifeHours(name), expiresAt: null, throwOutDay: null, status: activeBatches(name).length ? 'no_label' : 'none' };
  }
  // Fruit Prep colour for one container.
  var BATCH_RANK = { black: 5, amber: 4, dark: 3, light: 2 };
  function batchColour(name, b) {
    var s = batchInfo(name, b).status;
    return s === 'expired' ? 'black' : s === 'throw_tonight' ? 'amber' : s === 'no_label' ? 'dark' : 'light';
  }
  var NEW_BADGE_DAYS = 3;
  // Whole-item colour (Alex's scheme): blue = out of stock; otherwise the
  // most urgent container (black > amber > dark green > light green); with
  // no containers: red (not at the station — reason says why). isNew = back in stock
  // recently (until 3 days after it first goes light green again).
  function itemStatus(name) {
    var flags = state.prep[String(name || '').toLowerCase()] || {};
    var all = batchesFor(name);
    var active = all.filter(function (b) { return !b.ended_at; });
    var restockedAt = flags.restocked_at ? new Date(flags.restocked_at) : null;
    var isNew = false;
    if (restockedAt && !flags.out_of_stock) {
      var since = all.filter(function (b) { return b.label_at && new Date(b.label_at) >= restockedAt; })
        .sort(function (a, b) { return new Date(a.label_at) - new Date(b.label_at); });
      isNew = !since.length || (Date.now() - new Date(since[0].label_at).getTime()) < NEW_BADGE_DAYS * 24 * 3600 * 1000;
    }
    if (flags.out_of_stock) return { colour: 'blue', isNew: false, active: active };
    if (active.length) {
      var worst = active.map(function (b) { return batchColour(name, b); })
        .sort(function (a, b) { return BATCH_RANK[b] - BATCH_RANK[a]; })[0];
      return { colour: worst, isNew: isNew, active: active };
    }
    var ended = all.filter(function (b) { return b.ended_at; }).sort(function (a, b) { return new Date(b.ended_at) - new Date(a.ended_at); });
    var lastThrown = ended[0] && ended[0].end_reason === 'thrown' && (!restockedAt || new Date(ended[0].ended_at) > restockedAt);
    // Red = not at the station, whatever the reason (thrown out, used up,
    // never prepped, just back in stock) — Alex merged the old plain state into red.
    var reason = lastThrown ? 'thrown' : (restockedAt && isNew) ? 'restocked' : 'empty';
    return { colour: 'red', reason: reason, isNew: isNew, active: active };
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
    prep: {},             // lowercase prep item -> prep_checklist_state row (out_of_stock / restocked_at flags)
    batches: [],          // prep_batches: one row per prepped container (label_at, ended_at, end_reason)
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
          (s.photo_url ? '<button type="button" class="btn btn-danger frame-editor-remove-btn">🗑 Remove Photo</button>' : '') +
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

      // Visible remove (was only reachable inside Change Photo's menu).
      var removeBtn = overlay.querySelector('.frame-editor-remove-btn');
      if (removeBtn) wireArmConfirm(removeBtn, 'Tap again to remove', function () {
        removeBtn.disabled = true;
        onPhotoChanged(null, true, function (newPhotoUrl) {
          s.photo_url = newPhotoUrl || '';
          render();
        });
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
      sbSelect('prep_checklist_state', 'select=*').catch(function () { return []; }),
      sbSelect('prep_batches', 'select=*&or=(ended_at.is.null,ended_at.gt.' + new Date(Date.now() - 30 * 24 * 3600 * 1000).toISOString() + ')').catch(function () { return []; }),
      sbSelect('menu_discrepancies', 'select=*&order=sort_order.asc,created_at.asc').catch(function () { return []; }),
      sbSelect('app_settings', 'select=*').catch(function () { return []; })
    ]).then(function (results) {
      state.discrepancies = results[6] || [];
      state.settings = {};
      (results[7] || []).forEach(function (r) { state.settings[r.key] = r.value; });
      setPrepState(results[4] || []);
      state.batches = results[5] || [];
      state.photoSubmissions = results[3] || [];
      state.cocktails = results[0];
      state.ingredients = {};
      results[1].forEach(function (row) {
        if (!state.ingredients[row.cocktail_id]) state.ingredients[row.cocktail_id] = [];
        state.ingredients[row.cocktail_id].push(row);
      });
      state.ingredientPhotos = {};
      results[2].forEach(function (row) {
        state.ingredientPhotos[String(row.name || '').toLowerCase()] = { name: row.name, photo_url: row.photo_url, frame_height: row.frame_height, category: row.category || '', shelf_life_hours: row.shelf_life_hours, prep_group: row.prep_group || null, label_name: row.label_name || '', no_label: !!row.no_label, label_ok: !!row.label_ok, label_should_print: row.label_should_print || '' };
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
    document.getElementById('nav-back-btn').addEventListener('click', navBack);
    document.getElementById('float-back-btn').addEventListener('click', navBack);
    navArmBackTrap();
    loadAllData().then(function () {
      var saved = navReadSaved();
      renderMenu();
      // Nothing to offer if they were just on the menu with no drink being built.
      var top = saved && saved.stack[saved.stack.length - 1];
      if (saved && (saved.build || !(top.name === 'menu' && !top.scroll))) navOfferResume(saved);
    }).catch(function (e) {
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
    document.getElementById('app-main').classList.remove('is-home', 'is-wide');
    document.getElementById('app-title').textContent = title;
    document.getElementById('nav-back-btn').hidden = !showBack;
    var fb = document.getElementById('float-back-btn');
    if (fb) { fb.hidden = !showBack; navFloatBackUpdate(); }
    state.backTarget = backFn || goToMenu;
    var top = nav.stack[nav.stack.length - 1];
    if (top) { top.title = title; navSave(); }
  }

  // ---------- Navigation memory ----------
  // Every screen the user opens is kept in a stack, so the header's Back
  // goes to whatever was actually on screen before, not a fixed parent.
  // The stack (plus scroll and Build Mode step) is saved to this phone, so
  // when the OS reloads the app after it's been in the background, it can
  // offer to put the user back exactly where they were.
  var NAV_KEY = 'ube_nav_v1';
  var NAV_RESUME_HOURS = 12;
  var nav = { stack: [], going: false };
  // Screens that only make sense as a step on the way somewhere: leaving
  // them forward drops them, so Back never lands in a half-filled form.
  var NAV_TRANSIENT = { editor: true, labels: true };
  function navSave() {
    try {
      localStorage.setItem(NAV_KEY, JSON.stringify({
        at: Date.now(), menuTab: state.menuTab || 'cocktail', build: state.navBuild || null,
        stack: nav.stack.map(function (e) { return { name: e.name, args: e.args, scroll: e.scroll || 0, title: e.title || '' }; })
      }));
    } catch (e) {}
  }
  function navArgsKey(e) { return e.name + '|' + JSON.stringify(e.args || []); }
  function navEnter(name, args) {
    var top = nav.stack[nav.stack.length - 1];
    if (top && !nav.going) top.scroll = window.scrollY;
    var entry = { name: name, args: args || [], scroll: 0 };
    if (name === 'home') { nav.stack = [entry]; return; }
    if (nav.going) { if (top && top.name === name) top.args = entry.args; return; }
    // Already open further back (e.g. returning to the drink after saving
    // an edit): go back to it rather than piling up a loop.
    for (var i = nav.stack.length - 1; i >= 0; i--) {
      if (navArgsKey(nav.stack[i]) === navArgsKey(entry)) { nav.stack.length = i + 1; return; }
    }
    if (top && top.name === name) { top.args = entry.args; return; } // filter/tab change on the same screen
    if (top && NAV_TRANSIENT[top.name]) nav.stack.pop();
    nav.stack.push(entry);
    navArmBackTrap();
    if (nav.stack.length > 30) nav.stack.splice(1, nav.stack.length - 30);
  }
  function navTrack(name, fn, toArgs) {
    return function () {
      navEnter(name, toArgs ? toArgs.apply(null, arguments) : Array.prototype.slice.call(arguments));
      var out = fn.apply(this, arguments);
      navSave();
      return out;
    };
  }
  function cocktailById(id) { return state.cocktails.filter(function (x) { return x.id === id; })[0] || null; }
  var NAV_ROUTES = {
    home: function () { renderHome(); },
    menu: function () { renderMenu(); },
    variant: function (g) { openVariantPicker(g); },
    detail: function (id) { openDetail(id); },
    fruitprep: function () { renderFruitPrep(); },
    labels: function () { renderLabelList(labelQueue()); },
    cheers: function (f) { renderCheersTrav(f); },
    cheersReport: function (f) { renderCheersTravReport(f); },
    ingredients: function () { renderIngredientsTable(); },
    report: function () { renderReport(); },
    batch: function (id) { var c = cocktailById(id); if (c) openBatchCalc(c, state.ingredients[id] || []); else renderMenu(); },
    editor: function (id) { openAdminEditor(id ? cocktailById(id) : null); }
  };
  function navOpen(entry) {
    var fn = NAV_ROUTES[entry.name] || NAV_ROUTES.menu;
    var y = entry.scroll || 0; // read first: re-entering the screen must not overwrite it
    nav.going = true;
    try { fn.apply(null, entry.args || []); } finally { nav.going = false; }
    entry.scroll = y;
    // Async screens (Fruit Prep, Label List) render after a fetch; retry the
    // scroll briefly so it lands once the content is tall enough.
    // Stops the instant the user touches/scrolls, so it never fights them.
    if (!y) return;
    var tries = 0, stopped = false;
    function stop() {
      stopped = true;
      window.removeEventListener('touchstart', stop);
      window.removeEventListener('wheel', stop);
    }
    window.addEventListener('touchstart', stop, { passive: true });
    window.addEventListener('wheel', stop, { passive: true });
    (function again() {
      if (stopped) return;
      window.scrollTo(0, y);
      if (Math.abs(window.scrollY - y) > 2 && ++tries < 15) setTimeout(again, 100); else stop();
    })();
  }
  function navBack() {
    var top = nav.stack[nav.stack.length - 1];
    if (top) top.scroll = window.scrollY;
    if (nav.stack.length <= 1) { state.backTarget(); return; }
    nav.stack.pop();
    navOpen(nav.stack[nav.stack.length - 1]);
    navSave();
  }
  // ---------- Phone back button / back gesture ----------
  // The app is one page, so the browser's own Back used to leave it. A spare
  // history entry is kept armed; when Back fires, the app handles it the
  // same way as on screen (close the top pop-up, step back in Build Mode, or
  // go to the previous screen), then re-arms. With nothing left to go back
  // to, it's not re-armed, so the next Back leaves the app as normal.
  var navTrapArmed = false;
  function navArmBackTrap() {
    if (navTrapArmed) return;
    try { history.pushState({ ubeTrap: true }, ''); navTrapArmed = true; } catch (e) {}
  }
  // Topmost pop-up first, with the control that closes it the normal way
  // (so each pop-up's own cleanup still runs).
  var NAV_OVERLAY_CLOSERS = [
    ['crop-modal-overlay', '.crop-cancel-btn'],
    ['photo-menu-overlay', '[data-action="cancel"]'],
    ['candidate-sheet-overlay', '#candidate-cancel'],
    ['prep-ask-overlay', '.prep-ask-cancel'],
    ['photo-modal-overlay', '.close-btn'],
    ['frame-editor-overlay', '.frame-editor-done-btn'],
    ['photo-review-overlay', '#review-done'],
    ['build-overlay', '#build-back, #build-close']
  ];
  function navSystemBack() {
    for (var i = 0; i < NAV_OVERLAY_CLOSERS.length; i++) {
      var ov = document.getElementById(NAV_OVERLAY_CLOSERS[i][0]);
      if (!ov) continue;
      var btn = ov.querySelector(NAV_OVERLAY_CLOSERS[i][1]);
      if (btn) btn.click(); else ov.remove();
      return true;
    }
    if (document.getElementById('resume-overlay')) return true; // make them choose
    if (!document.getElementById('nav-back-btn').hidden) { navBack(); return true; }
    return false;
  }
  window.addEventListener('popstate', function () {
    navTrapArmed = false;
    if (navSystemBack()) navArmBackTrap();
  });

  // Thumb-reach Back: once the page is scrolled down (deep in a list), a
  // Back button floats at the bottom so there's no reaching for the header.
  function navFloatBackUpdate() {
    var fb = document.getElementById('float-back-btn');
    if (fb) fb.classList.toggle('shown', !fb.hidden && window.scrollY > 240);
  }
  var navFloatTick = false;
  window.addEventListener('scroll', function () {
    if (navFloatTick) return;
    navFloatTick = true;
    requestAnimationFrame(function () { navFloatTick = false; navFloatBackUpdate(); });
  }, { passive: true });

  function navReadSaved() {
    try {
      var saved = JSON.parse(localStorage.getItem(NAV_KEY) || 'null');
      if (!saved || !saved.stack || !saved.stack.length) return null;
      if (Date.now() - saved.at > NAV_RESUME_HOURS * 3600 * 1000) return null;
      return saved;
    } catch (e) { return null; }
  }
  // Coming back after the OS reloaded the app: offer to carry on.
  function navOfferResume(saved) {
    var top = saved.stack[saved.stack.length - 1];
    var b = saved.build;
    var c = b && cocktailById(b.id);
    var where = c ? c.name + ' — Build Mode, step ' + (b.idx + 1) : (top.title || 'where you were');
    var sheet = document.createElement('div');
    sheet.id = 'resume-overlay';
    sheet.innerHTML = '<div class="resume-sheet">' +
      '<h3>Pick up where you left off?</h3>' +
      '<p class="resume-where">' + escapeHtml(where) + '</p>' +
      '<button type="button" class="btn btn-primary" id="resume-continue">Continue</button>' +
      '<button type="button" class="btn btn-secondary" id="resume-fresh">Start fresh</button></div>';
    document.body.appendChild(sheet);
    sheet.querySelector('#resume-continue').addEventListener('click', function () {
      sheet.remove();
      state.menuTab = saved.menuTab || state.menuTab;
      nav.stack = saved.stack.filter(function (e) { return NAV_ROUTES[e.name]; });
      if (!nav.stack.length) { renderMenu(); return; }
      navOpen(nav.stack[nav.stack.length - 1]);
      if (c) openBuildMode(c, state.ingredients[c.id] || [], b.idx);
      navSave();
    });
    sheet.querySelector('#resume-fresh').addEventListener('click', function () {
      sheet.remove();
      state.navBuild = null;
      nav.stack = [];
      renderMenu();
    });
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
        '<label>On Fruit Prep<select class="ing-prep-select">' +
          [['', 'Not on Fruit Prep'], ['fruit_syrup', '🍓 Fruit & Syrups to portion'], ['sweets_garnish', '🍬 Sweets & garnish stock']].map(function (o) {
            return '<option value="' + o[0] + '"' + ((ingredientCategory(name) || '') === o[0] ? ' selected' : '') + '>' + o[1] + '</option>';
          }).join('') + '</select></label>' +
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
    document.getElementById('app-main').classList.add('is-wide');
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
      // The Last label column only appears in groups that hold Fruit Prep
      // items — spirits etc. never get labels, so their names keep the room.
      var showLabelCol = rows.some(function (n) { return !!ingredientCategory(n) || activeBatches(n).length > 0; });
      html += '<h3 class="ing-group-title">' + escapeHtml(type) + ' <span class="ing-group-count">' + rows.length + '</span></h3>' +
        (showLabelCol ? '<div class="ing-table-scroll">' : '') +
        '<table class="ing-table' + (showLabelCol ? ' has-label-col' : '') + '"><thead><tr><th>Ingredient</th><th>Photo</th><th>Type</th>' +
          (showLabelCol ? '<th>Last label</th><th>Label needed</th><th>Right name</th><th>Name on label machine</th>' : '') + '</tr></thead><tbody>' +
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
            (showLabelCol ? '<td class="ing-cell-label">' + lastLabelCellHtml(n) + '</td>' + labelCellsHtml(n) : '') +
          '</tr>' +
          (openIngDetails[n.toLowerCase()] ? '<tr class="ing-details-row" data-ing-details="' + escapeHtml(n) + '"><td colspan="' + (showLabelCol ? 7 : 3) + '">' + ingredientDetailsHtml(n) + '</td></tr>' : '');
        }).join('') + '</tbody></table>' + (showLabelCol ? '</div>' : '');
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
      wireLabelCells(tr, name);
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
    var prepSel = row.querySelector('.ing-prep-select');
    prepSel.addEventListener('change', function () {
      var g = prepSel.value || null;
      prepSel.disabled = true;
      apiUpdateIngredient(name, { prep_group: g }).then(function () {
        var key = name.toLowerCase();
        if (state.ingredientPhotos[key]) state.ingredientPhotos[key].prep_group = g;
        else state.ingredientPhotos[key] = { name: name, photo_url: null, frame_height: null, category: '', shelf_life_hours: null, prep_group: g };
        renderIngredientsTable();
      }).catch(function (e) { prepSel.disabled = false; alert('Could not save: ' + e.message); });
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
  // Label-machine mapping. "Right name" = the label machine prints this
  // ingredient's own name, or a different name that makes sense (e.g. Mint
  // Sprigs share the Mint Leaves label — admin marks it right). A wrong one
  // gets a "Thank you Trav" (Alex's running joke) so everyone sees the system
  // still needs fixing.
  function labelMapping(name) {
    var p = state.ingredientPhotos[String(name).toLowerCase()] || {};
    var machine = (p.label_name || '').trim();
    if (machine.toLowerCase() === String(name).toLowerCase()) machine = '';
    var right = !machine || !!p.label_ok;
    // "should" = what the label ought to say; defaults to the ingredient's own
    // name, or a custom note when nobody has decided yet (e.g. Peach).
    return { needed: !p.no_label, right: right, machine: machine, trav: !!machine && !p.label_ok, should: (p.label_should_print || '').trim() || String(name) };
  }
  var TRAV = '🙏 Thank you Trav';
  function labelCellsHtml(name) {
    var m = labelMapping(name);
    var yn = function (cls, val, disabled) {
      return '<select class="' + cls + '"' + (disabled ? ' disabled' : '') + '><option value="yes"' + (val ? ' selected' : '') + '>Yes</option><option value="no"' + (!val ? ' selected' : '') + '>No</option></select>';
    };
    var showInput = !!m.machine || !m.right;
    return '<td class="ing-cell-lbl">' + yn('ing-lbl-needed', m.needed) + '</td>' +
      '<td class="ing-cell-lbl">' + (m.needed ? yn('ing-lbl-right' + (m.right ? '' : ' is-wrong'), m.right) : '<span class="ing-label-none">—</span>') + '</td>' +
      '<td class="ing-cell-lbl ing-cell-machine">' + (m.needed
        ? '<input type="text" class="ing-lbl-machine" placeholder="name on machine" value="' + escapeHtml(m.machine) + '"' + (showInput ? '' : ' hidden') + '>' +
          (m.trav ? '<span class="trav-tag">' + TRAV + '</span>' : m.machine ? '<span class="ing-label-shared">Shared label — fine</span>' : '<span class="ing-label-none">same name</span>')
        : '<span class="ing-label-none">—</span>') + '</td>';
  }
  function wireLabelCells(tr, name) {
    function save(changes, el) {
      el.disabled = true;
      apiUpdateIngredient(name, changes).then(function () {
        var key = name.toLowerCase();
        var p = state.ingredientPhotos[key] || (state.ingredientPhotos[key] = { name: name, photo_url: null, frame_height: null, category: '', shelf_life_hours: null, prep_group: null, label_name: '', no_label: false });
        if (changes.label_name !== undefined) p.label_name = changes.label_name || '';
        if (changes.no_label !== undefined) p.no_label = !!changes.no_label;
        if (changes.label_ok !== undefined) p.label_ok = !!changes.label_ok;
        renderIngredientsTable();
      }).catch(function (e) { el.disabled = false; alert('Could not save: ' + e.message); });
    }
    var needed = tr.querySelector('.ing-lbl-needed');
    if (needed) needed.addEventListener('change', function () { save({ no_label: needed.value === 'no' }, needed); });
    var right = tr.querySelector('.ing-lbl-right');
    var machine = tr.querySelector('.ing-lbl-machine');
    if (right) right.addEventListener('change', function () {
      var hasName = !!machine.value.trim();
      // Yes with a different machine name = a shared label that makes sense.
      if (right.value === 'yes') { save({ label_ok: true }, right); return; }
      if (hasName) { save({ label_ok: false }, right); return; }
      // "No" with no machine name yet: ask for it first.
      machine.hidden = false; machine.focus();
    });
    if (machine) machine.addEventListener('change', function () {
      var v = machine.value.trim();
      if (v && v.toLowerCase() === name.toLowerCase()) v = '';
      // A newly typed machine name is wrong unless "Right name" is already Yes.
      save(right && right.value === 'yes' && v ? { label_name: v } : { label_name: v, label_ok: false }, machine);
    });
  }
  function lastLabelCellHtml(name) {
    var info = expiryInfo(name);
    if (!info.labelAt) return '<span class="ing-label-none">—</span>';
    var d = info.labelAt;
    return '<div class="ing-label-when">' + escapeHtml(d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })) + '<br>' +
      escapeHtml(d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })) + '</div>';
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
  function apiSubmitCandidate(c, stepIndex, base64, name, retried) {
    return ensureSubmitToken().then(function (tok) {
      return fetch('/api/write', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-bar-staff': tok, 'x-bar-secret': localStorage.getItem('bar_admin_secret') || '' },
        body: JSON.stringify({ action: 'submit_photo_candidate', payload: { cocktail_id: c.id, step_index: stepIndex, image_base64: base64, content_type: 'image/jpeg', submitted_by: name } })
      });
    }).then(function (r) {
      // A send permission saved at an older login is refused (401) forever;
      // drop it, ask for the bar password once, and try again.
      if (r.status === 401 && !retried) {
        localStorage.removeItem('bar_submit_token');
        return apiSubmitCandidate(c, stepIndex, base64, name, true);
      }
      if (!r.ok) return r.text().then(function (t) {
        var msg; try { msg = JSON.parse(t).error; } catch (e) { msg = null; }
        throw new Error(msg || ('server said ' + r.status + (r.status === 413 ? ' (photo too large)' : '')));
      });
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

  // iPhones never offer to install a web app; Safari users have to know to
  // use Share → Add to Home Screen. Show that once on the home screen, only
  // in iOS Safari and only when not already opened from the home screen.
  function iosInstallHintHtml() {
    var ua = navigator.userAgent || '';
    var isIOS = /iPad|iPhone|iPod/.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
    var standalone = window.navigator.standalone === true || (window.matchMedia && window.matchMedia('(display-mode: standalone)').matches);
    var dismissed = false;
    try { dismissed = localStorage.getItem('ube_ios_hint_dismissed') === '1'; } catch (e) {}
    if (!isIOS || standalone || dismissed) return '';
    return '<div class="ios-hint" id="ios-hint"><div class="ios-hint-text"><strong>Add Ube Express to your Home Screen</strong>' +
      'Tap <span class="ios-share" aria-label="Share">' +
      '<svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true"><path d="M12 3v12M7 8l5-5 5 5M5 12v8h14v-8" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>' +
      '</span> Share in Safari, then <strong>Add to Home Screen</strong>. It opens full screen like an app.</div>' +
      '<button type="button" class="ios-hint-close" id="ios-hint-close" aria-label="Dismiss">✕</button></div>';
  }

  function renderHome() {
    setHeader('🍸 Ube Express', false);
    var main = document.getElementById('app-main');
    main.innerHTML = iosInstallHintHtml() +
      '<div class="home-card" id="home-cocktail-spec">' +
        '<div class="home-card-emoji">🍸</div>' +
        '<div class="home-card-text"><h3>Cocktail Spec</h3><p>Browse the full menu, ingredients and build steps</p></div>' +
      '</div>' +
      '<div class="home-card" id="home-fruit-prep">' +
        '<div class="home-card-emoji">🍋</div>' +
        '<div class="home-card-text"><h3>Fruit Prep</h3><p>Fruit &amp; syrups to portion, sweets garnish stock to replenish</p></div>' +
      '</div>' +
      (function () {
        if (!cheersTravVisible()) return '';
        var open = travTotal();
        var staffOn = (state.settings || {}).cheers_trav_staff === true;
        return '<div class="home-card' + (open ? ' has-trav' : '') + '" id="home-cheers-trav">' +
          '<div class="home-card-emoji">🍻</div>' +
          '<div class="home-card-text"><h3>Cheers Trav' + (open ? ' <span class="pending-count trav-count">' + open + '</span>' : '') + '</h3><p>Menu vs Chilled Pubs app, and label machine names to fix</p></div>' +
        '</div>' +
        (state.role === 'admin'
          ? '<label class="home-toggle" for="cheers-staff-toggle"><input type="checkbox" id="cheers-staff-toggle"' + (staffOn ? ' checked' : '') + '>' +
            '<span>Show Cheers Trav to staff' + (staffOn ? '' : ' <em>(hidden — admin only)</em>') + '</span></label>'
          : '');
      })() +
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
    var ctCard = document.getElementById('home-cheers-trav');
    if (ctCard) ctCard.addEventListener('click', function () { renderCheersTrav('open'); });
    var ctToggle = document.getElementById('cheers-staff-toggle');
    if (ctToggle) ctToggle.addEventListener('change', function () {
      var on = ctToggle.checked;
      ctToggle.disabled = true;
      apiWrite('set_setting', { key: 'cheers_trav_staff', value: on }).then(function () {
        state.settings = state.settings || {}; state.settings.cheers_trav_staff = on;
        renderHome();
      }).catch(function (e) { alert('Could not save: ' + e.message); renderHome(); });
    });
    var candCard = document.getElementById('home-candidates');
    // Candidates arrive from other phones; re-check on every visit to home
    // so the count isn't stuck at whatever it was when the app opened.
    if (candCard && !renderHome._refreshing) {
      renderHome._refreshing = true;
      sbSelect('photo_submissions', 'select=*&status=eq.pending&order=created_at.asc').then(function (rows) {
        renderHome._refreshing = false;
        var before = (state.photoSubmissions || []).length;
        state.photoSubmissions = rows || [];
        if (rows.length !== before && document.getElementById('home-candidates')) renderHome();
      }).catch(function () { renderHome._refreshing = false; });
    }
    if (candCard) candCard.addEventListener('click', function () {
      loadAllData().then(function () { openPhotoReview(null, function () { renderHome(); }); });
    });
    var reportCard = document.getElementById('home-report');
    if (reportCard) reportCard.addEventListener('click', renderReport);
    var ingCard = document.getElementById('home-ingredients');
    if (ingCard) ingCard.addEventListener('click', renderIngredientsTable);
    var iosClose = document.getElementById('ios-hint-close');
    if (iosClose) iosClose.addEventListener('click', function () {
      try { localStorage.setItem('ube_ios_hint_dismissed', '1'); } catch (e) {}
      var h = document.getElementById('ios-hint'); if (h) h.remove();
    });
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

  // "Upcoming" = on the spec ahead of launch (e.g. the Halloween menu),
  // set per cocktail (cocktails.is_upcoming) and cleared once it goes live.
  function upcomingBadge(on) { return on ? '<span class="upcoming-badge">Upcoming</span>' : ''; }

  function cocktailRowHtml(item) {
    if (item.isGroup) {
      var anyNew = item.members.some(function (m) { return state.seen.indexOf(m.id) === -1; });
      // Each flavour also gets a hidden sub-row, so searching "lychee" can
      // surface "Lychee Double Dutch" under its group (see filterMenu).
      var memberRows = item.members.slice().sort(function (a, b) {
        return (a.variant_label || a.name).localeCompare(b.variant_label || b.name);
      }).map(function (m) {
        var hay = (m.name + ' ' + (m.variant_label || '')).toLowerCase();
        return '<div class="cocktail-row variant-hit" data-id="' + m.id + '" data-group-of="' + escapeHtml(item.variant_group) + '" data-name="' + escapeHtml(hay) + '" style="display:none">' +
          '<div class="name">↳ ' + escapeHtml(m.name) + '</div>' +
          upcomingBadge(m.is_upcoming) +
          (state.seen.indexOf(m.id) === -1 ? '<span class="new-badge">New</span>' : '') +
          '</div>';
      }).join('');
      return '<div class="cocktail-row" data-group="' + escapeHtml(item.variant_group) + '" data-name="' + escapeHtml(item.variant_group.toLowerCase()) + '">' +
        iconSvg(item.glass ? 'glass_' + item.glass : 'glass_rocks', 'glass-icon') +
        '<div class="name">' + escapeHtml(item.variant_group) + '<span class="variant-count">' + item.members.length + ' flavours</span></div>' +
        upcomingBadge(item.members.some(function (m) { return m.is_upcoming; })) +
        (anyNew ? '<span class="new-badge">New</span>' : '') +
        '</div>' + memberRows;
    }
    var isNew = state.seen.indexOf(item.id) === -1;
    return '<div class="cocktail-row" data-id="' + item.id + '" data-name="' + escapeHtml(item.name.toLowerCase()) + '">' +
      iconSvg(item.glass ? 'glass_' + item.glass : 'glass_rocks', 'glass-icon') +
      '<div class="name">' + escapeHtml(item.name) + '</div>' +
      upcomingBadge(item.is_upcoming) +
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
          upcomingBadge(c.is_upcoming) +
          (isNew ? '<span class="new-badge">New</span>' : '') +
          '</div>';
      }).join('');
    main.innerHTML = html;
    Array.prototype.forEach.call(main.querySelectorAll('.cocktail-row'), function (row) {
      row.addEventListener('click', function () { openDetail(row.getAttribute('data-id')); });
    });
  }

  // A group row shows if its own name matches OR any flavour inside it does;
  // in the second case the matching flavours appear under it as sub-rows.
  function filterMenu(q) {
    var rows = document.querySelectorAll('#full-list .cocktail-row');
    var hitsByGroup = {};
    Array.prototype.forEach.call(rows, function (row) {
      var g = row.getAttribute('data-group-of');
      if (!g) return;
      var hit = !!q && (row.getAttribute('data-name') || '').indexOf(q) !== -1;
      if (hit) hitsByGroup[g] = true;
      row.style.display = hit ? '' : 'none';
    });
    Array.prototype.forEach.call(rows, function (row) {
      if (row.getAttribute('data-group-of')) return;
      var name = row.getAttribute('data-name') || '';
      var group = row.getAttribute('data-group');
      var show = !q || name.indexOf(q) !== -1 || (group && hitsByGroup[group]);
      row.style.display = show ? '' : 'none';
    });
    // Group name itself matched: the group row is enough, hide its sub-rows.
    Array.prototype.forEach.call(rows, function (row) {
      var g = row.getAttribute('data-group-of');
      if (g && q && g.toLowerCase().indexOf(q) !== -1) row.style.display = 'none';
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

  // Edible garnish types in walk-the-shelf order; anything untyped lands last.
  var GARNISH_TYPE_ORDER = ['Sweets & Candy', 'Popping Boba', 'Dried, Tinned & Preserved', 'Desserts, Gelato & Biscuits', 'Edible Decorations', 'Sugar, Honey & Seasonings'];
  var PROPS_TYPE = 'Garnish Props & Straws';
  function splitGarnish(names) {
    var byType = {}, props = { Straws: [], Props: [] };
    names.forEach(function (n) {
      var p = state.ingredientPhotos[String(n).toLowerCase()];
      var type = (p && p.category) || 'Other';
      if (type === PROPS_TYPE) { (/^straw\b/i.test(n) ? props.Straws : props.Props).push(n); return; }
      (byType[type] = byType[type] || []).push(n);
    });
    var types = Object.keys(byType).sort(function (a, b) {
      var ia = GARNISH_TYPE_ORDER.indexOf(a), ib = GARNISH_TYPE_ORDER.indexOf(b);
      return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib) || a.localeCompare(b);
    });
    return {
      edible: types.map(function (t) { return { title: t, items: byType[t] }; }),
      props: ['Straws', 'Props'].filter(function (k) { return props[k].length; }).map(function (k) { return { title: k, items: props[k] }; })
    };
  }

  // Cocktail mixes batched at close (Alex, 2 Oct 2026): spirits/liqueurs/
  // syrups pre-mixed each night; long mixers (lemonade, juice, soda,
  // raspberry-ade) and pipette/float garnishes are added on shift. No label,
  // no shelf life. Contents name the drink's own ingredient rows, so the
  // per-serve amounts always come from the live spec.
  var CLOSE_MIXES = [
    { mix: 'Bathtub Mix', cocktail: 'Bathtub', items: ['Peach Schnapps', 'Dutch Barn Vodka', 'ASUKI Yuzu Citrus 17% Liquor', 'Lime Juice'] },
    { mix: 'Bloody Bathtub Mix', cocktail: 'Bloody Bathtub', items: ['Dutch Barn Cherry Vodka', 'ASUKI Yuzu Citrus 17% Liquor', 'Finest Call Grenadine'] },
    { mix: 'Cherry Bomb Mix', cocktail: 'Cherry Bomb', items: ['Finest Call Grenadine', 'Amaretto', 'Lime Juice', 'ASUKI Cherry Blossom 17% Liquor', 'Monin Cherry Syrup'] },
    { mix: 'Como Crush Mix', cocktail: 'Como Crush', items: ['Dutch Barn Citrus Vodka', 'ASUKI Yuzu Citrus 17% Liquor', 'Finest Call Grenadine'] },
    { mix: 'Mad Scientist Mix', cocktail: 'Mad Scientist', items: ['Peach Schnapps', 'Dutch Barn Vanilla Vodka'] },
    { mix: 'Pineapple Punch Mix', cocktail: 'Pineapple Punch', items: ['Bacardi', 'Amaretto', 'Peach Schnapps'] }
  ];
  function closeMixRecipe(m) {
    var c = state.cocktails.filter(function (x) { return x.name === m.cocktail; })[0];
    // An upcoming drink isn't served yet, so its mix isn't made at close yet.
    if (!c || c.is_upcoming) return null;
    var ings = state.ingredients[c.id] || [];
    var rows = m.items.map(function (n) {
      var ing = ings.filter(function (i) { return String(i.name).toLowerCase() === n.toLowerCase(); })[0];
      return { name: n, amount: ing ? Number(ing.amount) : null, unit: ing ? ing.unit : '' };
    });
    var total = rows.every(function (r) { return r.unit === 'ml' && r.amount; })
      ? rows.reduce(function (t, r) { return t + r.amount; }, 0) : null;
    return { rows: rows, total: total };
  }
  // A bar night runs past midnight: tonight's close counts from 06:00.
  function barDayStart() {
    var d = new Date(); var x = new Date(d); x.setHours(6, 0, 0, 0);
    if (d < x) x.setDate(x.getDate() - 1);
    return x;
  }
  function closeMixMade(m) {
    var r = state.prep[m.mix.toLowerCase()];
    return !!(r && r.checked && r.checked_at && new Date(r.checked_at) >= barDayStart());
  }
  function setCloseMixMade(m, made) {
    var row = { item_name: m.mix, category: 'close_mix', checked: made, checked_at: made ? new Date().toISOString() : null, updated_at: new Date().toISOString() };
    return anonFetch('prep_checklist_state?on_conflict=item_name', 'POST', [row], 'resolution=merge-duplicates,return=representation')
      .then(function (saved) { saved.forEach(function (r) { state.prep[String(r.item_name).toLowerCase()] = r; }); });
  }
  function closeMixesHtml() {
    var live = CLOSE_MIXES.map(function (m) { return { m: m, r: closeMixRecipe(m) }; }).filter(function (x) { return x.r; });
    if (!live.length) return '';
    var done = live.filter(function (x) { return closeMixMade(x.m); }).length;
    return '<div class="section-label">🌙 Make at Close (' + done + '/' + live.length + ')</div><div class="close-mix-list">' +
      live.map(function (x) {
        var made = closeMixMade(x.m);
        return '<div class="close-mix' + (made ? ' made' : '') + '" data-mix="' + escapeHtml(x.m.mix) + '">' +
          '<label class="close-mix-head"><input type="checkbox" class="close-mix-tick"' + (made ? ' checked' : '') + '> ' +
          '<span class="close-mix-name">' + escapeHtml(x.m.mix) + '</span>' +
          (x.r.total ? '<span class="close-mix-total">' + fmtAmt(x.r.total) + 'ml per serve</span>' : '') + '</label>' +
          '<ul class="close-mix-recipe">' + x.r.rows.map(function (r) {
            return '<li>' + escapeHtml(r.name) + ' <span>' + (r.amount ? escapeHtml(fmtAmt(r.amount) + (r.unit || '')) : '–') + '</span></li>';
          }).join('') + '</ul></div>';
      }).join('') + '</div>';
  }

  function setPrepState(rows) {
    state.prep = {};
    rows.forEach(function (r) { state.prep[String(r.item_name).toLowerCase()] = r; });
  }
  function fetchPrepState() {
    return Promise.all([
      sbSelect('prep_checklist_state', 'select=*'),
      sbSelect('prep_batches', 'select=*&or=(ended_at.is.null,ended_at.gt.' + new Date(Date.now() - 30 * 24 * 3600 * 1000).toISOString() + ')')
    ]).then(function (r) { setPrepState(r[0]); state.batches = r[1]; });
  }

  // Direct anon-key writes, deliberately bypassing the admin-secret-gated
  // /api/write proxy: any logged-in colleague preps, labels, bins and marks
  // stock out (see the tables' RLS policies). Clearing "out of stock" is
  // admin-only in the UI.
  function anonFetch(path, method, body, prefer) {
    var headers = { apikey: SUPABASE_ANON_KEY, Authorization: 'Bearer ' + SUPABASE_ANON_KEY, 'Content-Type': 'application/json' };
    if (prefer) headers.Prefer = prefer;
    return fetch(SUPABASE_URL + '/rest/v1/' + path, { method: method, headers: headers, body: body ? JSON.stringify(body) : undefined })
      .then(function (r) { if (!r.ok) throw new Error('Save failed: ' + r.status); return r.status === 204 ? null : r.json(); });
  }
  function prepRowName(name) {
    var existing = state.prep[String(name).toLowerCase()];
    return existing ? existing.item_name : name;
  }
  function setStockFlags(name, fields) {
    var row = { item_name: prepRowName(name), category: ingredientCategory(name), checked: false, updated_at: new Date().toISOString() };
    for (var k in fields) if (fields.hasOwnProperty(k)) row[k] = fields[k];
    return anonFetch('prep_checklist_state?on_conflict=item_name', 'POST', [row], 'resolution=merge-duplicates,return=representation')
      .then(function (saved) { saved.forEach(function (r) { state.prep[String(r.item_name).toLowerCase()] = r; }); });
  }
  // A new container: labelled now (light green) or still needs a label (dark green).
  function addBatch(name, labelledNow) {
    var now = new Date().toISOString();
    return anonFetch('prep_batches', 'POST', { item_name: name, created_at: now, label_at: labelledNow ? now : null }, 'return=representation')
      .then(function (rows) { state.batches = state.batches.concat(rows); })
      .then(function () { return needsTopUp(name) ? setStockFlags(name, { needs_topup: false }) : null; });
  }
  // "Needs a top up": a colleague flags an item (even a stocked one) so the
  // next opener replenishes it. Cleared by "Topped up" or by prepping a new container.
  function needsTopUp(name) {
    var f = state.prep[String(name).toLowerCase()];
    return !!(f && f.needs_topup && !f.out_of_stock);
  }
  function topUpList(names) {
    return names.filter(needsTopUp).map(function (n) { return { name: n, at: state.prep[String(n).toLowerCase()].needs_topup_at }; })
      .sort(function (a, b) { return String(a.at || '').localeCompare(String(b.at || '')); });
  }
  function endBatch(id, reason) {
    return anonFetch('prep_batches?id=eq.' + id, 'PATCH', { ended_at: new Date().toISOString(), end_reason: reason }, 'return=representation')
      .then(function (rows) { var r = rows[0]; state.batches = state.batches.map(function (b) { return b.id === id ? r : b; }); });
  }
  // Label List "Done": the captured label time on every listed container.
  function recordLabels(batchIds, atIso) {
    if (!batchIds.length) return Promise.resolve();
    return anonFetch('prep_batches?id=in.(' + batchIds.join(',') + ')', 'PATCH', { label_at: atIso }, 'return=representation')
      .then(function (rows) {
        var byId = {}; rows.forEach(function (r) { byId[r.id] = r; });
        state.batches = state.batches.map(function (b) { return byId[b.id] || b; });
      });
  }
  // Ingredients-table correction: set the oldest container's label time
  // (creating a container if there is none).
  function setLabelTime(name, iso) {
    var act = activeBatches(name);
    if (act.length) {
      return anonFetch('prep_batches?id=eq.' + act[0].id, 'PATCH', { label_at: iso }, 'return=representation')
        .then(function (rows) { state.batches = state.batches.map(function (b) { return b.id === rows[0].id ? rows[0] : b; }); });
    }
    if (!iso) return Promise.resolve();
    return anonFetch('prep_batches', 'POST', { item_name: name, created_at: iso, label_at: iso }, 'return=representation')
      .then(function (rows) { state.batches = state.batches.concat(rows); });
  }

  // Correct one container's label date & time (e.g. it was labelled earlier
  // than it was ticked off). Saving also counts as labelled.
  function setBatchLabel(id, iso) {
    return anonFetch('prep_batches?id=eq.' + id, 'PATCH', { label_at: iso }, 'return=representation')
      .then(function (rows) { var r = rows[0]; state.batches = state.batches.map(function (b) { return b.id === id ? r : b; }); });
  }
  function openBatchLabelEdit(chip, fail) {
    var id = chip.getAttribute('data-batch');
    var b = state.batches.filter(function (x) { return x.id === id; })[0];
    if (!b) return;
    var current = new Date(b.label_at || b.created_at);
    chip.classList.add('batch-editing');
    chip.innerHTML = '<label class="batch-edit-label">Label date &amp; time' +
        '<input type="datetime-local" class="batch-edit-input" value="' + toLocalInputValue(current) + '"></label>' +
      '<span class="batch-actions">' +
        '<button type="button" class="batch-btn batch-btn-save">Save</button>' +
        '<button type="button" class="batch-btn batch-btn-cancel">Cancel</button>' +
      '</span>';
    var input = chip.querySelector('.batch-edit-input');
    input.focus();
    chip.querySelector('.batch-btn-cancel').addEventListener('click', renderFruitPrep);
    chip.querySelector('.batch-btn-save').addEventListener('click', function () {
      var d = input.value ? new Date(input.value) : null;
      if (!d || isNaN(d)) { alert('Pick a date and time first.'); return; }
      if (d.getTime() > Date.now() + 5 * 60 * 1000) { alert('That label time is in the future — check the date.'); return; }
      this.disabled = true;
      setBatchLabel(id, d.toISOString()).then(renderFruitPrep).catch(fail);
    });
  }

  function labelQueue() {
    return state.batches.filter(function (b) { return !b.ended_at && !b.label_at; })
      .sort(function (a, b) { return a.item_name.localeCompare(b.item_name) || new Date(a.created_at) - new Date(b.created_at); });
  }
  // Containers to bin: past shelf life (black) or expiring tomorrow (amber).
  function throwOutList() {
    return state.batches.filter(function (b) { return !b.ended_at && b.label_at; })
      .map(function (b) { return { b: b, info: batchInfo(b.item_name, b) }; })
      .filter(function (x) { return x.info.status === 'expired' || x.info.status === 'throw_tonight'; })
      .sort(function (a, b) { return a.info.expiresAt - b.info.expiresAt; });
  }
  var COLOUR_TEXT = { light: 'Stocked', dark: 'Needs label', amber: 'Bin tonight', black: 'Out of date — bin now', red: 'Thrown out — prep', blue: 'Out of stock', none: 'Needs prepping' };
  var RED_TEXT = { thrown: 'Thrown out — prep', restocked: 'Back on — prep', empty: 'Needs prepping' };
  function expiryBadgeHtml(name) {
    var st = itemStatus(name);
    // Not a Fruit Prep item and nothing prepped: no status to show.
    if (st.colour === 'red' && st.reason === 'empty' && !ingredientCategory(name)) return '';
    var info = expiryInfo(name);
    var text = st.colour === 'red' ? RED_TEXT[st.reason] : st.colour === 'light' && info.throwOutDay ? 'Good until ' + fmtDay(info.throwOutDay) : COLOUR_TEXT[st.colour];
    if (st.colour === 'light' && info.status === 'no_shelf_life') text = 'Stocked · shelf life not set';
    return '<span class="exp-badge st-' + st.colour + '">' + escapeHtml(text) + '</span>' + (st.isNew ? '<span class="new-badge-stock" title="Back in stock recently">🆕 back in stock</span>' : '');
  }

  function batchChipHtml(name, b, idx) {
    var c = batchColour(name, b);
    var info = batchInfo(name, b);
    var when = b.label_at ? 'Labelled ' + fmtLabelDate(new Date(b.label_at)) : 'Prepped ' + fmtLabelDate(new Date(b.created_at)) + ' · needs label';
    var exp = info.expiresAt
      ? (info.status === 'expired' ? ' · out of date' : info.status === 'throw_tonight' ? ' · bin tonight' : ' · bin ' + fmtDay(info.throwOutDay))
      : (info.status === 'no_shelf_life' ? ' · shelf life not set' : '');
    return '<div class="batch-chip st-' + c + '" data-batch="' + b.id + '">' +
      '<span class="batch-text">#' + (idx + 1) + ' · ' + escapeHtml(when + exp) + '</span>' +
      '<span class="batch-actions">' +
        '<button type="button" class="batch-btn" data-end="used">Used up</button>' +
        '<button type="button" class="batch-btn batch-btn-danger" data-end="thrown">Thrown out</button>' +
        '<button type="button" class="batch-btn" data-edit-label>✏️ Edit</button>' +
      '</span></div>';
  }
  // Ticked = stocked and usable (light green / dark green / amber);
  // unticked = red / plain / blue / black (Alex's rule).
  var TICKED_COLOURS = { light: true, dark: true, amber: true };
  function prepRowHtml(name) {
    var st = itemStatus(name);
    var oos = st.colour === 'blue';
    var ticked = !!TICKED_COLOURS[st.colour];
    return '<div class="prep-item st-' + st.colour + '" data-item="' + escapeHtml(name) + '">' +
      '<span class="prep-sym" aria-hidden="true"><span class="prep-dot"></span></span>' +
      '<div class="prep-item-body"><div class="prep-item-head">' +
        '<label class="prep-tick"><input type="checkbox" class="prep-tick-input"' + (ticked ? ' checked' : '') + (oos ? ' disabled' : '') +
          ' aria-label="' + escapeHtml(name) + ' stocked"></label>' +
        '<span class="prep-name">' + escapeHtml(name) + '</span>' +
        expiryBadgeHtml(name) +
        (needsTopUp(name) ? '<span class="topup-badge">⬆ Top up</span>' : '') +
        '<span class="prep-item-actions">' +
          (oos
            ? (state.role === 'admin' ? '<button type="button" class="prep-btn prep-restock-btn">Back in stock</button>' : '')
            : (ticked ? '<button type="button" class="prep-btn prep-add-btn" aria-label="Prepped another container">＋ Another</button>' : '') +
              (needsTopUp(name)
                ? '<button type="button" class="prep-btn prep-topup-done-btn">Topped up</button>'
                : '<button type="button" class="prep-btn prep-topup-btn" title="Running low — replenish on next open">Needs top up</button>') +
              '<button type="button" class="prep-btn prep-oos-btn" title="Can\'t stock it — out of stock">Out of stock</button>') +
        '</span>' +
      '</div>' +
      (st.active.length ? '<div class="batch-list">' + st.active.map(function (b, i) { return batchChipHtml(name, b, i); }).join('') + '</div>' : '') +
    '</div></div>';
  }
  // Ticking: did they label it now (light green) or does it still need a label (dark green)?
  function askLabelled(name, onPick, note, onCancel) {
    var sheet = document.createElement('div');
    sheet.id = 'prep-ask-overlay';
    sheet.innerHTML = '<div class="prep-ask">' +
      '<h3>' + escapeHtml(name) + '</h3>' + (note ? '<p class="prep-ask-note">' + escapeHtml(note) + '</p>' : '') + '<p>New container — has it been labelled yet?</p>' +
      '<button type="button" class="btn prep-ask-light">Prepped and Labelled</button>' +
      '<button type="button" class="btn prep-ask-dark">Prepped / Not Labelled</button>' +
      '<button type="button" class="btn btn-secondary prep-ask-cancel">Cancel</button></div>';
    document.body.appendChild(sheet);
    function close() { sheet.remove(); }
    function cancel() { close(); if (onCancel) onCancel(); }
    sheet.querySelector('.prep-ask-light').onclick = function () { close(); onPick(true); };
    sheet.querySelector('.prep-ask-dark').onclick = function () { close(); onPick(false); };
    sheet.querySelector('.prep-ask-cancel').onclick = cancel;
    sheet.addEventListener('click', function (e) { if (e.target === sheet) cancel(); });
  }
  // Unticking a stocked item: were its containers used up or thrown out?
  function askEnded(name, count, onPick, onCancel) {
    var sheet = document.createElement('div');
    sheet.id = 'prep-ask-overlay';
    sheet.innerHTML = '<div class="prep-ask">' +
      '<h3>' + escapeHtml(name) + '</h3><p>' + (count > 1 ? 'All ' + count + ' containers' : 'This container') + ' — what happened?</p>' +
      '<button type="button" class="btn btn-secondary prep-ask-used">Used up</button>' +
      '<button type="button" class="btn btn-danger prep-ask-thrown">Thrown out</button>' +
      '<button type="button" class="btn btn-secondary prep-ask-cancel">Cancel</button></div>';
    document.body.appendChild(sheet);
    function close() { sheet.remove(); }
    function cancel() { close(); if (onCancel) onCancel(); }
    sheet.querySelector('.prep-ask-used').onclick = function () { close(); onPick('used'); };
    sheet.querySelector('.prep-ask-thrown').onclick = function () { close(); onPick('thrown'); };
    sheet.querySelector('.prep-ask-cancel').onclick = cancel;
    sheet.addEventListener('click', function (e) { if (e.target === sheet) cancel(); });
  }

  var PREP_LEGEND = [['light', 'Stocked & labelled'], ['dark', 'Stocked, needs label'], ['amber', 'Bin at close tonight'], ['black', 'Out of date — bin now'], ['red', 'Not at station — needs prepping'], ['blue', 'Out of stock']];
  function renderFruitPrep() {
    setHeader('🍋 Fruit Prep', true, renderHome);
    var main = document.getElementById('app-main');
    main.innerHTML = '<p style="color:var(--muted)">Loading…</p>';
    var lists = computePrepLists();

    fetchPrepState().then(function () {
      var queue = labelQueue();
      var toss = throwOutList();
      var html = '<details class="prep-legend"><summary>Colour key</summary><div class="prep-legend-grid">' +
        PREP_LEGEND.map(function (l) { return '<span class="legend-item st-' + l[0] + '"><span class="prep-dot"></span>' + l[1] + '</span>'; }).join('') +
        '<span class="legend-item"><span class="new-badge-stock">🆕</span> Back in stock (3 days)</span>' +
        '<span class="legend-item"><span class="topup-badge">⬆ Top up</span> Running low — replenish on next open</span></div></details>';

      html += '<div class="section-label">🗑 Throw Out Tonight</div>';
      html += toss.length
        ? '<div class="toss-list">' + toss.map(function (x) {
            return '<div class="toss-row st-' + (x.info.status === 'expired' ? 'black' : 'amber') + '" data-batch="' + x.b.id + '">' +
              '<div class="toss-text"><div class="toss-name">' + escapeHtml(x.b.item_name) + '</div>' +
              '<div class="toss-meta">' + (x.info.status === 'expired' ? 'Out of date since ' : 'Out of date ') + escapeHtml(fmtLabelDate(x.info.expiresAt)) +
              ' · labelled ' + escapeHtml(fmtLabelDate(x.info.labelAt)) + '</div></div>' +
              '<button type="button" class="btn btn-danger toss-btn">Thrown out</button>' +
            '</div>';
          }).join('') + '</div>'
        : '<p class="toss-empty">Nothing to throw out tonight.</p>';

      html += closeMixesHtml();

      var topups = topUpList(lists.fruitSyrup.concat(lists.sweetsGarnish));
      html += '<div class="section-label">⬆ Top Up on Next Open</div>';
      html += topups.length
        ? '<div class="toss-list">' + topups.map(function (x) {
            return '<div class="toss-row topup-row" data-item="' + escapeHtml(x.name) + '">' +
              '<div class="toss-text"><div class="toss-name">' + escapeHtml(x.name) + '</div>' +
              (x.at ? '<div class="toss-meta">Flagged ' + escapeHtml(fmtLabelDate(new Date(x.at))) + '</div>' : '') + '</div>' +
              '<button type="button" class="btn btn-secondary topup-done">Topped up</button>' +
            '</div>';
          }).join('') + '</div>'
        : '<p class="toss-empty">Nothing flagged for a top up.</p>';

      html += '<button id="prep-labels-btn" class="btn btn-primary prep-labels-btn">🏷 Label List' + (queue.length ? ' (' + queue.length + ')' : '') + '</button>';

      html += '<div class="section-label">🍓 Fruit &amp; Syrups to Portion</div>';
      html += '<div class="prep-list">' + (lists.fruitSyrup.length ? lists.fruitSyrup.map(prepRowHtml).join('') :
        '<p style="color:var(--muted)">Nothing on the menu needs this right now.</p>') + '</div>';
      // Garnish split by each item's Ingredients-page type: edible garnish
      // (sub-grouped by type) first, then props & straws in their own section.
      var garnish = splitGarnish(lists.sweetsGarnish);
      html += '<div class="section-label">🍬 Sweets &amp; Garnish to Replenish</div>';
      html += garnish.edible.length ? garnish.edible.map(function (g) {
        return '<div class="prep-subhead">' + escapeHtml(g.title) + '</div><div class="prep-list">' + g.items.map(prepRowHtml).join('') + '</div>';
      }).join('') : '<p style="color:var(--muted)">Nothing on the menu needs this right now.</p>';
      html += '<div class="section-label">🦆 Garnish Props &amp; Straws</div>';
      html += garnish.props.length ? garnish.props.map(function (g) {
        return '<div class="prep-subhead">' + escapeHtml(g.title) + '</div><div class="prep-list">' + g.items.map(prepRowHtml).join('') + '</div>';
      }).join('') : '<p style="color:var(--muted)">Nothing on the menu needs this right now.</p>';
      main.innerHTML = html;

      function fail(e) { alert('Could not save: ' + e.message); renderFruitPrep(); }
      Array.prototype.forEach.call(main.querySelectorAll('.prep-item'), function (row) {
        var name = row.getAttribute('data-item');
        var add = row.querySelector('.prep-add-btn');
        if (add) add.addEventListener('click', function () {
          askLabelled(name, function (labelled) { addBatch(name, labelled).then(renderFruitPrep).catch(fail); });
        });
        var tick = row.querySelector('.prep-tick-input');
        tick.addEventListener('change', function () {
          var wasTicked = !tick.checked;
          tick.checked = wasTicked; // the dialogs decide; the re-render shows the result
          var st = itemStatus(name);
          if (!wasTicked) {
            // Ticking. A black item's out-of-date container(s) are binned first.
            var expired = st.active.filter(function (b) { return batchColour(name, b) === 'black'; });
            askLabelled(name, function (labelled) {
              Promise.all(expired.map(function (b) { return endBatch(b.id, 'thrown'); }))
                .then(function () { return addBatch(name, labelled); })
                .then(renderFruitPrep).catch(fail);
            }, expired.length ? 'The out-of-date container' + (expired.length > 1 ? 's' : '') + ' will be marked as thrown out.' : '');
          } else {
            askEnded(name, st.active.length, function (reason) {
              Promise.all(st.active.map(function (b) { return endBatch(b.id, reason); }))
                .then(renderFruitPrep).catch(fail);
            });
          }
        });
        var oos = row.querySelector('.prep-oos-btn');
        if (oos) wireArmConfirm(oos, 'Tap to confirm', function () {
          setStockFlags(name, { out_of_stock: true, out_of_stock_at: new Date().toISOString(), needs_topup: false }).then(renderFruitPrep).catch(fail);
        });
        var topup = row.querySelector('.prep-topup-btn');
        if (topup) topup.addEventListener('click', function () {
          setStockFlags(name, { needs_topup: true, needs_topup_at: new Date().toISOString() }).then(renderFruitPrep).catch(fail);
        });
        var topupDone = row.querySelector('.prep-topup-done-btn');
        if (topupDone) topupDone.addEventListener('click', function () {
          setStockFlags(name, { needs_topup: false }).then(renderFruitPrep).catch(fail);
        });
        var restock = row.querySelector('.prep-restock-btn');
        if (restock) restock.addEventListener('click', function () {
          setStockFlags(name, { out_of_stock: false, restocked_at: new Date().toISOString() }).then(renderFruitPrep).catch(fail);
        });
        Array.prototype.forEach.call(row.querySelectorAll('.batch-chip'), function (chip) {
          Array.prototype.forEach.call(chip.querySelectorAll('[data-end]'), function (btn) {
            wireArmConfirm(btn, 'Confirm', function () { endBatch(chip.getAttribute('data-batch'), btn.getAttribute('data-end')).then(renderFruitPrep).catch(fail); });
          });
          var edit = chip.querySelector('[data-edit-label]');
          if (edit) edit.addEventListener('click', function () { openBatchLabelEdit(chip, fail); });
        });
      });
      Array.prototype.forEach.call(main.querySelectorAll('.close-mix'), function (el) {
        var m = CLOSE_MIXES.filter(function (x) { return x.mix === el.getAttribute('data-mix'); })[0];
        el.querySelector('.close-mix-tick').addEventListener('change', function (e) {
          setCloseMixMade(m, e.target.checked).then(renderFruitPrep).catch(fail);
        });
      });
      Array.prototype.forEach.call(main.querySelectorAll('.toss-row:not(.topup-row)'), function (row) {
        wireArmConfirm(row.querySelector('.toss-btn'), 'Tap to confirm', function () {
          endBatch(row.getAttribute('data-batch'), 'thrown').then(renderFruitPrep).catch(fail);
        });
      });
      Array.prototype.forEach.call(main.querySelectorAll('.topup-row'), function (row) {
        row.querySelector('.topup-done').addEventListener('click', function () {
          setStockFlags(row.getAttribute('data-item'), { needs_topup: false }).then(renderFruitPrep).catch(fail);
        });
      });
      document.getElementById('prep-labels-btn').addEventListener('click', function () { renderLabelList(labelQueue()); });
    }).catch(function (e) {
      main.innerHTML = '<p>Could not load the prep list: ' + escapeHtml(e.message) + '</p>';
    });
  }

  // Every container that still needs a label. The label time is captured
  // the moment this page opens (editable), and Done saves it on every
  // listed container — that time + shelf life drives every colour.
  function renderLabelList(batches) {
    setHeader('🏷 Label List', true, renderFruitPrep);
    var main = document.getElementById('app-main');
    var now = new Date();

    if (!batches.length) {
      main.innerHTML = '<p style="color:var(--muted)">No labels needed — containers you mark "Prepped / Not Labelled" on Fruit Prep appear here.</p>' +
        '<button id="labels-back-btn" class="btn btn-secondary">← Back to Fruit Prep</button>';
      document.getElementById('labels-back-btn').addEventListener('click', renderFruitPrep);
      return;
    }

    var html = '<div class="label-time-box">' +
        '<label for="label-time-input">Label date &amp; time — write this on every label</label>' +
        '<input type="datetime-local" id="label-time-input" value="' + toLocalInputValue(now) + '">' +
      '</div>' +
      '<p id="labels-note" style="color:var(--muted);margin:10px 0 14px;">' + batches.length + ' container' + (batches.length === 1 ? '' : 's') +
      ' to label. Label everything, then press <strong>Done</strong> — that saves the date &amp; time above on each one.</p>';
    var travCount = cheersTravVisible() ? batches.filter(function (b) { var m = labelMapping(b.item_name); return m.needed && m.trav; }).length : 0;
    if (travCount) html += '<div class="trav-banner">' + TRAV + ' — ' + travCount + ' label' + (travCount === 1 ? '' : 's') +
      ' on this list ' + (travCount === 1 ? 'is' : 'are') + ' under the wrong name on the label machine. Print the name shown, and tell a manager it still needs fixing.</div>';
    html += '<div id="label-grid" class="label-grid">' + batches.map(function (b) {
      var name = b.item_name;
      var hours = shelfLifeHours(name);
      var useBy = hours ? new Date(now.getTime() + hours * 3600 * 1000) : null;
      var ip = state.ingredientPhotos[String(name).toLowerCase()] || {};
      var lm = labelMapping(name);
      var labelHint = ip.no_label
        ? '<div class="label-use label-use-none">No label exists for this — write it on by hand</div>'
        : lm.trav && cheersTravVisible() ? '<div class="label-use label-trav"><span class="trav-tag">' + TRAV + '</span> Label machine has the wrong name — print <strong>' + escapeHtml(lm.machine) + '</strong>' +
            (lm.should !== name ? '<div class="label-should">Should say: ' + escapeHtml(lm.should) + '</div>' : '') + '</div>'
        : lm.machine ? '<div class="label-use">Use label: <strong>' + escapeHtml(lm.machine) + '</strong></div>' : '';
      return '<div class="label-card">' +
        '<div class="label-name">' + escapeHtml(name) + '</div>' + labelHint +
        '<div class="label-date">Use by: <span class="label-useby" data-hours="' + (hours || '') + '">' + (useBy ? fmtLabelDate(useBy) : '<span class="no-print-warn">shelf life not set</span>') + '</span></div>' +
        '</div>';
    }).join('') + '</div>' +
    '<button id="labels-done-btn" class="btn btn-primary labels-done-btn">✅ Done</button>';
    main.innerHTML = html;

    var timeInput = document.getElementById('label-time-input');
    function labelTime() { var d = timeInput.value ? new Date(timeInput.value) : now; return isNaN(d) ? now : d; }
    timeInput.addEventListener('change', function () {
      var at = labelTime();
      Array.prototype.forEach.call(main.querySelectorAll('.label-useby[data-hours]'), function (el) {
        var h = parseFloat(el.getAttribute('data-hours'));
        if (h > 0) el.textContent = fmtLabelDate(new Date(at.getTime() + h * 3600 * 1000));
      });
    });
    var doneBtn = document.getElementById('labels-done-btn');
    doneBtn.addEventListener('click', function () {
      doneBtn.disabled = true;
      doneBtn.textContent = 'Saving…';
      recordLabels(batches.map(function (b) { return b.id; }), labelTime().toISOString()).then(renderFruitPrep).catch(function (e) {
        doneBtn.disabled = false;
        doneBtn.textContent = '✅ Done';
        alert('Could not save the label times: ' + e.message);
      });
    });
  }

  // ---------- CHEERS TRAV: menu vs Chilled Pubs app ----------
  // Every place the printed menu and the Chilled Pubs app disagree. Open
  // rows carry a "🍻 Cheers Trav" so staff and managers see the system still
  // needs fixing (sibling of the label list's "Thank you Trav").
  var CHEERS = '🍻 Cheers Trav';
  // Discrepancy categories. menu_app = printed menu vs Chilled Pubs app;
  // dyslexia = spelling mistakes in the app; nonsense = measurements nobody
  // uses behind the bar (grams). Labels are their own section (Thank you Trav).
  // Monetary (menu / app / till prices) is a separate future investigation.
  var DISC_CATS = [
    { k: 'menu_app', short: '🍻 Menu vs app', title: '🍻 Cheers Trav — menu vs Chilled Pubs app', tag: '🍻 Cheers Trav', thing: 'Drink', menu: true,
      intro: 'Where the printed menu and the Chilled Pubs app disagree.' },
    { k: 'dyslexia', short: '🔤 Dyslexia (spelling)', title: '🔤 Dyslexia — spelling mistakes in the app', tag: '🔤 Cheers Trav', thing: 'Drink', menu: false,
      intro: 'Names spelt wrong in the Chilled Pubs app. Already corrected in Ube Express.' },
    { k: 'nonsense', short: '🤷 Nonsense (measurements)', title: '🤷 Nonsense — measurements nobody uses', tag: '🤷 Cheers Trav', thing: 'Ingredient', menu: false,
      intro: 'Things the app measures in grams. Behind the bar we count, scoop or pour — nobody weighs a garnish.' }
  ];
  // Admin always sees Cheers Trav; staff only once the admin switches it on.
  function cheersTravVisible() { return state.role === 'admin' || (state.settings || {}).cheers_trav_staff === true; }
  // Thank you Trav: every ingredient whose label machine prints a wrong name
  // (set in the Ingredients table: Right name = No). Part of Cheers Trav.
  function travLabels() {
    return Object.keys(state.ingredientPhotos || {}).map(function (k) { return state.ingredientPhotos[k]; })
      .filter(function (p) { var m = labelMapping(p.name); return m.needed && m.trav; })
      .sort(function (a, b) { return a.name.localeCompare(b.name); });
  }
  function travTotal() { return openDiscrepancies().length + travLabels().length; }
  function openDiscrepancies() { return (state.discrepancies || []).filter(function (d) { return !d.resolved; }); }
  function cheersTravBannerHtml(cocktailId) {
    if (!cheersTravVisible()) return '';
    var rows = openDiscrepancies().filter(function (d) { return d.cocktail_id === cocktailId; });
    if (!rows.length) return '';
    return '<div class="trav-banner cheers-banner"><div class="cheers-head"><span class="trav-tag">' + CHEERS + '</span> The Chilled Pubs app has this drink wrong:</div>' +
      rows.map(function (d) {
        return ((d.category || 'menu_app') === 'menu_app'
            ? '<div class="cheers-line"><span class="cheers-k">Menu:</span> ' + escapeHtml(d.menu_says || '—') + '</div>'
            : '<div class="cheers-line"><span class="cheers-k">' + (d.category === 'dyslexia' ? 'Spelling' : 'Measurement') + ':</span></div>') +
          '<div class="cheers-line"><span class="cheers-k">App:</span> ' + escapeHtml(d.app_says || '—') + '</div>' +
          (d.change_needed ? '<div class="cheers-line"><span class="cheers-k">Change:</span> ' + escapeHtml(d.change_needed) + '</div>' : '');
      }).join('<hr class="cheers-hr">') + '</div>';
  }
  // Evidence screenshot slot (menu or app side). Admin taps to add/replace/
  // remove; anyone taps a set one to see it full size.
  function evidenceSlotHtml(d, side) {
    var url = d[side + '_evidence_url'];
    if (url) return '<button type="button" class="ct-ev has-photo" data-side="' + side + '"><img src="' + escapeHtml(url) + '" alt="' + (side === 'menu' ? 'Menu' : 'Chilled Pubs app') + ' screenshot" loading="lazy"></button>';
    return state.role === 'admin' ? '<button type="button" class="ct-ev" data-side="' + side + '">📷 Add ' + (side === 'menu' ? 'menu' : 'app') + ' screenshot</button>' : '';
  }
  function showEvidenceFull(url) {
    var o = document.createElement('div');
    o.id = 'photo-modal-overlay';
    o.innerHTML = '<img src="' + escapeHtml(url) + '" alt="Evidence">';
    o.addEventListener('click', function () { o.remove(); });
    document.body.appendChild(o);
  }
  function wireEvidenceSlot(btn, d, onChange) {
    var side = btn.getAttribute('data-side'), col = side + '_evidence_url';
    btn.addEventListener('click', function () {
      var url = d[col];
      if (state.role !== 'admin') { if (url) showEvidenceFull(url); return; }
      showPhotoActionMenu(!!url, function (action) {
        if (!action) return;
        if (action === 'remove') {
          apiSaveDiscrepancy((function () { var f = { id: d.id }; f[col] = null; return f; })()).then(onChange).catch(function (e) { alert('Could not remove: ' + e.message); });
          return;
        }
        pickPhotoAndUpload(action, function (base64) {
          btn.disabled = true; btn.textContent = 'Uploading…';
          apiUploadPhoto(base64, 'discrepancy', { discrepancy_id: d.id, side: side }).then(function (r) {
            state.discrepancies.forEach(function (x) { if (x.id === d.id) x[col] = r.photo_url; });
            onChange();
          }).catch(function (e) { alert('Could not upload: ' + e.message); onChange(); });
        });
      });
    });
  }
  function travLabelsSectionHtml(admin) {
    var labels = travLabels();
    return '<h2 class="ct-section">' + TRAV + ' — label machine</h2>' +
      '<p class="ing-table-intro">Ingredients the label machine prints under the wrong name. Staff print the machine\'s name for now; ' +
      'once the machine is renamed, mark it fixed. Set these in Ingredients → Right name.</p>' +
      '<div class="ing-table-scroll"><table class="ing-table ct-table ct-label-table"><thead><tr><th>Ingredient</th><th>Label machine prints</th><th>Should print</th><th>Fixed?</th></tr></thead><tbody>' +
      (labels.length ? labels.map(function (p) {
        var m = labelMapping(p.name);
        return '<tr data-ing="' + escapeHtml(p.name) + '"><td class="ct-drink-cell">' + escapeHtml(p.name) + '</td>' +
          '<td>' + escapeHtml(m.machine) + '</td><td>' + (admin
            ? '<textarea class="ct-edit ct-should" rows="2" placeholder="' + escapeHtml(p.name) + '">' + escapeHtml(p.label_should_print || '') + '</textarea>'
            : escapeHtml(m.should)) + '</td>' +
          '<td class="ct-fixed">' + (admin ? '<button type="button" class="btn btn-secondary ct-label-fixed">Machine renamed</button>' : 'No') +
          '<span class="trav-tag">' + TRAV + '</span></td></tr>';
      }).join('') : '<tr><td colspan="4" class="ct-empty">Every label prints the right name — no Thank you Trav needed.</td></tr>') +
      '</tbody></table></div>';
  }
  function apiSaveDiscrepancy(fields) {
    return apiWrite('save_menu_discrepancy', fields).then(function (res) {
      var row = res.row; if (!row) return;
      var found = false;
      state.discrepancies = (state.discrepancies || []).map(function (d) { if (d.id === row.id) { found = true; return row; } return d; });
      if (!found) state.discrepancies.push(row);
    });
  }
  function renderCheersTrav(filter) {
    if (!cheersTravVisible()) { renderHome(); return; }
    setHeader('🍻 Cheers Trav', true, renderHome);
    var main = document.getElementById('app-main');
    main.classList.add('is-wide');
    var admin = state.role === 'admin';
    var all = state.discrepancies || [];
    var rows = all.filter(function (d) { return filter === 'all' ? true : filter === 'fixed' ? d.resolved : !d.resolved; });
    var openN = all.filter(function (d) { return !d.resolved; }).length;
    var drinkOpts = state.cocktails.map(function (c) { return '<option value="' + escapeHtml(c.name) + '">'; }).join('');
    var chip = function (k, label) { return '<button type="button" class="ct-chip' + (filter === k ? ' is-on' : '') + '" data-f="' + k + '">' + label + '</button>'; };
    var total = function (cat) { return all.filter(function (d) { return (d.category || 'menu_app') === cat; }); };
    var html = '<div class="ct-chips">' + chip('open', 'Open') + chip('fixed', 'Fixed') + chip('all', 'All') + '</div>' +
      '<div class="ct-actions"><button type="button" id="ct-report-btn" class="btn btn-secondary">📄 Report (print / PDF)</button></div>' +
      DISC_CATS.map(function (cat) {
        var catAll = total(cat.k);
        var catRows = rows.filter(function (d) { return (d.category || 'menu_app') === cat.k; });
        var open = catAll.filter(function (d) { return !d.resolved; }).length;
        var cols = 3 + (cat.menu ? 1 : 0) + 1 + (admin ? 1 : 0);
        return '<h2 class="ct-section">' + cat.title + '</h2>' +
          '<p class="ing-table-intro">' + cat.intro + ' ' + open + ' open · ' + (catAll.length - open) + ' fixed.</p>' +
          '<div class="ing-table-scroll"><table class="ing-table ct-table' + (cat.menu ? '' : ' ct-table-2') + '"><thead><tr><th>' + cat.thing + '</th>' +
            (cat.menu ? '<th>Menu says</th>' : '') + '<th>Chilled Pubs app says</th><th>What to change</th><th>Fixed?</th>' + (admin ? '<th></th>' : '') + '</tr></thead><tbody>' +
          catRows.map(function (d) {
            var cell = function (field) {
              return admin ? '<textarea class="ct-edit" data-field="' + field + '" rows="2">' + escapeHtml(d[field] || '') + '</textarea>' : escapeHtml(d[field] || '—');
            };
            var drink = d.cocktail_id ? '<button type="button" class="ct-drink" data-cid="' + d.cocktail_id + '">' + escapeHtml(d.drink_name) + '</button>' : escapeHtml(d.drink_name);
            return '<tr data-id="' + d.id + '" class="' + (d.resolved ? 'is-fixed' : '') + '">' +
              '<td class="ct-drink-cell">' + drink + '</td>' +
              (cat.menu ? '<td>' + cell('menu_says') + evidenceSlotHtml(d, 'menu') + '</td>' : '') +
              '<td>' + cell('app_says') + evidenceSlotHtml(d, 'app') + '</td><td>' + cell('change_needed') + '</td>' +
              '<td class="ct-fixed">' + (admin
                ? '<select class="ct-resolved"><option value="no"' + (d.resolved ? '' : ' selected') + '>No</option><option value="yes"' + (d.resolved ? ' selected' : '') + '>Yes</option></select>'
                : (d.resolved ? 'Yes' : 'No')) +
                (d.resolved ? '' : '<span class="trav-tag">' + cat.tag + '</span>') + '</td>' +
              (admin ? '<td><button type="button" class="ct-del" aria-label="Delete">🗑</button></td>' : '') +
            '</tr>';
          }).join('') +
          (catRows.length ? '' : '<tr><td colspan="' + cols + '" class="ct-empty">' + (filter === 'fixed' ? 'Nothing fixed yet.' : 'Nothing open here.') + '</td></tr>') +
          '</tbody></table></div>';
      }).join('') +
      travLabelsSectionHtml(admin) +
      (admin ? '<div class="ct-add"><h3>Add a discrepancy</h3>' +
        '<select id="ct-new-cat">' + DISC_CATS.map(function (c) { return '<option value="' + c.k + '">' + c.short + '</option>'; }).join('') + '</select>' +
        '<input type="text" id="ct-new-drink" list="ct-drinks" placeholder="Drink or ingredient">' +
        '<datalist id="ct-drinks">' + drinkOpts + '</datalist>' +
        '<textarea id="ct-new-menu" rows="2" placeholder="Menu says… (menu vs app only)"></textarea>' +
        '<textarea id="ct-new-app" rows="2" placeholder="Chilled Pubs app says…"></textarea>' +
        '<textarea id="ct-new-change" rows="2" placeholder="What to change…"></textarea>' +
        '<button type="button" id="ct-add-btn" class="btn btn-primary">＋ Add</button></div>' : '');
    main.innerHTML = html;
    function fail(e) { alert('Could not save: ' + e.message); renderCheersTrav(filter); }
    Array.prototype.forEach.call(main.querySelectorAll('.ct-chip'), function (b) {
      b.addEventListener('click', function () { renderCheersTrav(b.getAttribute('data-f')); });
    });
    Array.prototype.forEach.call(main.querySelectorAll('.ct-drink'), function (b) {
      b.addEventListener('click', function () { openDetail(b.getAttribute('data-cid')); });
    });
    Array.prototype.forEach.call(main.querySelectorAll('tr[data-id]'), function (tr) {
      var id = tr.getAttribute('data-id');
      Array.prototype.forEach.call(tr.querySelectorAll('.ct-edit'), function (ta) {
        ta.addEventListener('change', function () {
          var f = {}; f.id = id; f[ta.getAttribute('data-field')] = ta.value;
          ta.disabled = true;
          apiSaveDiscrepancy(f).then(function () { ta.disabled = false; }).catch(fail);
        });
      });
      var drow = state.discrepancies.filter(function (x) { return x.id === id; })[0];
      Array.prototype.forEach.call(tr.querySelectorAll('.ct-ev'), function (btn) { wireEvidenceSlot(btn, drow, function () { renderCheersTrav(filter); }); });
      var res = tr.querySelector('.ct-resolved');
      if (res) res.addEventListener('change', function () {
        res.disabled = true;
        apiSaveDiscrepancy({ id: id, resolved: res.value === 'yes' }).then(function () { renderCheersTrav(filter); }).catch(fail);
      });
      var del = tr.querySelector('.ct-del');
      if (del) wireArmConfirm(del, 'Delete?', function () {
        apiWrite('delete_menu_discrepancy', { id: id }).then(function () {
          state.discrepancies = state.discrepancies.filter(function (d) { return d.id !== id; });
          renderCheersTrav(filter);
        }).catch(fail);
      });
    });
    document.getElementById('ct-report-btn').addEventListener('click', function () { renderCheersTravReport(filter); });
    Array.prototype.forEach.call(main.querySelectorAll('.ct-label-table tr[data-ing]'), function (tr) {
      var btn = tr.querySelector('.ct-label-fixed');
      if (!btn) return;
      var name = tr.getAttribute('data-ing');
      var should = tr.querySelector('.ct-should');
      if (should) should.addEventListener('change', function () {
        should.disabled = true;
        apiUpdateIngredient(name, { label_should_print: should.value }).then(function () {
          var p = state.ingredientPhotos[name.toLowerCase()]; if (p) p.label_should_print = should.value.trim();
          should.disabled = false;
        }).catch(fail);
      });
      wireArmConfirm(btn, 'Tap to confirm', function () {
        apiUpdateIngredient(name, { label_name: '', label_ok: false, label_should_print: '' }).then(function () {
          var p = state.ingredientPhotos[name.toLowerCase()]; if (p) { p.label_name = ''; p.label_ok = false; p.label_should_print = ''; }
          renderCheersTrav(filter);
        }).catch(fail);
      });
    });
    var add = document.getElementById('ct-add-btn');
    if (add) add.addEventListener('click', function () {
      var name = document.getElementById('ct-new-drink').value.trim();
      if (!name) { alert('Enter the drink.'); return; }
      var c = state.cocktails.filter(function (x) { return x.name.toLowerCase() === name.toLowerCase(); })[0];
      add.disabled = true;
      var cat = document.getElementById('ct-new-cat').value;
      apiSaveDiscrepancy({ drink_name: c ? c.name : name, cocktail_id: c ? c.id : null, category: cat,
        menu_says: cat === 'menu_app' ? document.getElementById('ct-new-menu').value : '',
        app_says: document.getElementById('ct-new-app').value, change_needed: document.getElementById('ct-new-change').value })
        .then(function () { renderCheersTrav('open'); }).catch(fail);
    });
  }

  // Presentable "what to change" report: one card per discrepancy, menu and
  // app evidence side by side. Prints cleanly (or Save as PDF) to hand over.
  function renderCheersTravReport(filter) {
    setHeader('📄 Cheers Trav Report', true, function () { renderCheersTrav(filter); });
    var main = document.getElementById('app-main');
    main.classList.add('is-wide');
    var openAll = (state.discrepancies || []).filter(function (d) { return !d.resolved; });
    var rows = openAll.filter(function (d) { return (d.category || 'menu_app') === 'menu_app'; });
    var catTable = function (k) {
      var cat = DISC_CATS.filter(function (c) { return c.k === k; })[0];
      var list = openAll.filter(function (d) { return d.category === k; });
      if (!list.length) return '';
      return '<section class="ctr-card ctr-labels"><h3>' + cat.title + '</h3>' +
        '<table class="ctr-label-table"><thead><tr><th>' + cat.thing + '</th><th>Chilled Pubs app says</th><th>Change to</th></tr></thead><tbody>' +
        list.map(function (d) { return '<tr><td>' + escapeHtml(d.drink_name) + '</td><td>' + escapeHtml(d.app_says || '—') + '</td><td><strong>' + escapeHtml(d.change_needed || '—') + '</strong></td></tr>'; }).join('') +
        '</tbody></table></section>';
    };
    var withBoth = rows.filter(function (d) { return d.menu_evidence_url && d.app_evidence_url; }).length;
    var side = function (label, text, url) {
      return '<div class="ctr-side"><div class="ctr-side-label">' + label + '</div>' +
        '<div class="ctr-says">' + escapeHtml(text || '—') + '</div>' +
        (url ? '<img class="ctr-shot" src="' + escapeHtml(url) + '" alt="' + label + ' screenshot">' : '<div class="ctr-missing">No screenshot yet</div>') + '</div>';
    };
    var today = new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
    main.innerHTML =
      '<div class="ctr-head"><h2>🍻 Cheers Trav — what to change</h2>' +
        '<p>' + rows.length + ' menu discrepanc' + (rows.length === 1 ? 'y' : 'ies') +
          ' · ' + openAll.filter(function (d) { return d.category === 'dyslexia'; }).length + ' spelling' +
          ' · ' + openAll.filter(function (d) { return d.category === 'nonsense'; }).length + ' measurement' +
          ' · ' + travLabels().length + ' label' + (travLabels().length === 1 ? '' : 's') + ' to rename · ' + escapeHtml(today) +
        (withBoth < rows.length ? ' · <span class="ctr-warn">' + (rows.length - withBoth) + ' still missing a screenshot</span>' : '') + '</p>' +
        '<button type="button" id="ctr-print" class="btn btn-primary ctr-print">🖨 Print / Save as PDF</button></div>' +
      rows.map(function (d, i) {
        return '<section class="ctr-card">' +
          '<h3><span class="ctr-num">' + (i + 1) + '</span> ' + escapeHtml(d.drink_name) + '</h3>' +
          (d.change_needed ? '<div class="ctr-change"><strong>Change:</strong> ' + escapeHtml(d.change_needed) + '</div>' : '') +
          '<div class="ctr-sides">' + side('Printed menu', d.menu_says, d.menu_evidence_url) + side('Chilled Pubs app', d.app_says, d.app_evidence_url) + '</div>' +
        '</section>';
      }).join('') +
      (rows.length ? '' : '<p class="ct-empty">No menu discrepancies open.</p>') +
      catTable('dyslexia') + catTable('nonsense') +
      (function () {
        var labels = travLabels();
        if (!labels.length) return '';
        return '<section class="ctr-card ctr-labels"><h3>' + TRAV + ' — rename on the label machine</h3>' +
          '<table class="ctr-label-table"><thead><tr><th>Ingredient</th><th>Machine prints now</th><th>Change to</th></tr></thead><tbody>' +
          labels.map(function (p) { return '<tr><td>' + escapeHtml(p.name) + '</td><td>' + escapeHtml(labelMapping(p.name).machine) + '</td><td><strong>' + escapeHtml(labelMapping(p.name).should) + '</strong></td></tr>'; }).join('') +
          '</tbody></table></section>';
      })();
    document.getElementById('ctr-print').addEventListener('click', function () { window.print(); });
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
      '<h1>' + escapeHtml(c.name) + '</h1>' + (c.is_upcoming ? '<div>' + upcomingBadge(true) + '</div>' : '') +
      '<div class="meta">' + escapeHtml(c.build_method || '') + (c.garnish ? ' &middot; garnish: ' + escapeHtml(c.garnish) : '') + '</div>' +
      '</div>' + cheersTravBannerHtml(id);

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
    // Count units read as plurals above 1 ("8 leaves", "2 sprigs"); the stored unit stays singular.
    var PLURAL = { leaf: 'leaves', sprig: 'sprigs', wedge: 'wedges', scoop: 'scoops', dash: 'dashes', splash: 'splashes', barspoon: 'barspoons' };
    if (PLURAL[unit] && Number(amount) > 1) unit = PLURAL[unit];
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
  function openBuildMode(c, ings, startIdx) {
    var steps = Array.isArray(c.method_steps) ? c.method_steps : [];
    if (!steps.length) return;
    var idx = Math.max(0, Math.min(steps.length - 1, startIdx || 0));
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
      state.navBuild = { id: c.id, idx: idx };
      navArmBackTrap();
      navSave();
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

    function close() { overlay.remove(); state.navBuild = null; navSave(); }
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
      '<div class="toggle-row"><label>Upcoming (not launched yet)</label><input type="checkbox" id="f-is-upcoming"' + (existing && existing.is_upcoming ? ' checked' : '') + '></div>' +

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
        is_upcoming: document.getElementById('f-is-upcoming').checked,
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

  renderHome = navTrack('home', renderHome, function () { return []; });
  renderMenu = navTrack('menu', renderMenu, function () { return []; });
  openVariantPicker = navTrack('variant', openVariantPicker, function (x) { return typeof x === 'string' ? [x] : []; });
  openDetail = navTrack('detail', openDetail, function (x) { return typeof x === 'string' ? [x] : []; });
  renderFruitPrep = navTrack('fruitprep', renderFruitPrep, function () { return []; });
  renderLabelList = navTrack('labels', renderLabelList, function () { return []; });
  renderCheersTrav = navTrack('cheers', renderCheersTrav, function (x) { return typeof x === 'string' ? [x] : []; });
  renderCheersTravReport = navTrack('cheersReport', renderCheersTravReport, function (x) { return typeof x === 'string' ? [x] : []; });
  renderIngredientsTable = navTrack('ingredients', renderIngredientsTable, function () { return []; });
  renderReport = navTrack('report', renderReport, function () { return []; });
  openBatchCalc = navTrack('batch', openBatchCalc, function (c) { return [c.id]; });
  openAdminEditor = navTrack('editor', openAdminEditor, function (ex) { return [ex && ex.id ? ex.id : null]; });
  // Leaving the app is when the OS may later reload it — save scroll then.
  function navSnapshot() {
    var top = nav.stack[nav.stack.length - 1];
    if (top) top.scroll = window.scrollY;
    navSave();
  }
  document.addEventListener('visibilitychange', function () { if (document.visibilityState === 'hidden') navSnapshot(); });
  window.addEventListener('pagehide', navSnapshot);

  document.addEventListener('DOMContentLoaded', boot);
})();
