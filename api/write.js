var SUPABASE_URL = 'https://ousaticrzizhddqfljwl.supabase.co';

function sbHeaders() {
  return {
    apikey: process.env.SUPABASE_SERVICE_ROLE_KEY,
    Authorization: 'Bearer ' + process.env.SUPABASE_SERVICE_ROLE_KEY,
    'Content-Type': 'application/json'
  };
}

async function sbFetch(path, options) {
  var r = await fetch(SUPABASE_URL + '/rest/v1/' + path, options);
  if (!r.ok) {
    var text = await r.text();
    throw new Error('Supabase write failed (' + r.status + '): ' + text);
  }
  return r;
}

async function uploadPhotoToStorage(base64, contentType, targetLabel) {
  var ext = (contentType.split('/')[1] || 'jpg').replace('jpeg', 'jpg');
  var objectPath = (targetLabel || 'misc') + '/' + Date.now() + '-' + Math.random().toString(36).slice(2) + '.' + ext;
  var bytes = Buffer.from(base64, 'base64');

  var r = await fetch(SUPABASE_URL + '/storage/v1/object/photos/' + objectPath, {
    method: 'POST',
    headers: {
      apikey: process.env.SUPABASE_SERVICE_ROLE_KEY,
      Authorization: 'Bearer ' + process.env.SUPABASE_SERVICE_ROLE_KEY,
      'Content-Type': contentType,
      'x-upsert': 'true'
    },
    body: bytes
  });
  if (!r.ok) {
    var text = await r.text();
    throw new Error('Photo upload failed (' + r.status + '): ' + text);
  }
  return SUPABASE_URL + '/storage/v1/object/public/photos/' + objectPath;
}

var staffSubmitToken = require('./auth.js').staffSubmitToken;

// Fruit Prep tick/label state is keyed by ingredient name, so it follows a
// rename/swap/merge: moved to the new name, or (if the new name already has
// its own state) the old row is dropped and the kept one wins.
async function movePrepState(fromKey, toName) {
  // Prepped containers follow the ingredient too.
  var batches = await (await sbFetch('prep_batches?select=id,item_name', { headers: sbHeaders() })).json();
  var ids = batches.filter(function (b) { return String(b.item_name).toLowerCase() === fromKey; }).map(function (b) { return b.id; });
  if (ids.length) {
    await sbFetch('prep_batches?id=in.(' + ids.join(',') + ')', { method: 'PATCH', headers: sbHeaders(), body: JSON.stringify({ item_name: toName }) });
  }
  var rows = await (await sbFetch('prep_checklist_state?select=id,item_name', { headers: sbHeaders() })).json();
  var from = rows.filter(function (r) { return String(r.item_name).toLowerCase() === fromKey; })[0];
  if (!from) return;
  var to = rows.filter(function (r) { return String(r.item_name).toLowerCase() === toName.toLowerCase(); })[0];
  if (to && to.id !== from.id) {
    await sbFetch('prep_checklist_state?id=eq.' + from.id, { method: 'DELETE', headers: sbHeaders() });
  } else {
    await sbFetch('prep_checklist_state?id=eq.' + from.id, { method: 'PATCH', headers: sbHeaders(), body: JSON.stringify({ item_name: toName, updated_at: new Date().toISOString() }) });
  }
}

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') { res.status(405).json({ error: 'POST only' }); return; }

  var body = req.body;
  if (typeof body === 'string') {
    try { body = JSON.parse(body); } catch (e) { body = {}; }
  }
  var action = body && body.action;
  var payload = body && body.payload;

  // Every action is admin-only, except staff submitting a step-photo
  // CANDIDATE (it never changes the live recipe — admin reviews it first).
  var secret = req.headers['x-bar-secret'];
  var isAdmin = !!secret && secret === process.env.BAR_ADMIN_SECRET;
  var staffToken = req.headers['x-bar-staff'];
  var isStaffSubmit = action === 'submit_photo_candidate' && !!staffToken && staffToken === staffSubmitToken();
  if (!isAdmin && !isStaffSubmit) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }

  try {
    if (action === 'create_cocktail' || action === 'update_cocktail') {
      var cocktailRow = {
        name: payload.name,
        glass: payload.glass,
        build_method: payload.build_method,
        garnish: payload.garnish,
        is_mocktail: !!payload.is_mocktail,
        variant_group: payload.variant_group || null,
        variant_label: payload.variant_label || null,
        method_steps: payload.method_steps || [],
        batchable: !!payload.batchable,
        batch_target_ml: payload.batch_target_ml || null,
        updated_at: new Date().toISOString()
      };

      var cocktailId = payload.id;
      if (action === 'create_cocktail') {
        var createRes = await sbFetch('cocktails', {
          method: 'POST',
          headers: Object.assign(sbHeaders(), { Prefer: 'return=representation' }),
          body: JSON.stringify(cocktailRow)
        });
        var created = await createRes.json();
        cocktailId = created[0].id;
      } else {
        await sbFetch('cocktails?id=eq.' + cocktailId, {
          method: 'PATCH',
          headers: sbHeaders(),
          body: JSON.stringify(cocktailRow)
        });
        // replace all ingredients for this cocktail rather than diff/merge
        await sbFetch('cocktail_ingredients?cocktail_id=eq.' + cocktailId, {
          method: 'DELETE',
          headers: sbHeaders()
        });
      }

      var ingRows = (payload.ingredients || []).map(function (ing, idx) {
        return { cocktail_id: cocktailId, name: ing.name, amount: ing.amount, unit: ing.unit, sort_order: idx };
      });
      if (ingRows.length) {
        await sbFetch('cocktail_ingredients', {
          method: 'POST',
          headers: sbHeaders(),
          body: JSON.stringify(ingRows)
        });
      }

      res.status(200).json({ ok: true, id: cocktailId });
      return;
    }

    if (action === 'delete_cocktail') {
      await sbFetch('cocktails?id=eq.' + payload.id, { method: 'DELETE', headers: sbHeaders() });
      res.status(200).json({ ok: true });
      return;
    }

    if (action === 'upload_photo') {
      var photoUrl = await uploadPhotoToStorage(payload.image_base64, payload.content_type || 'image/jpeg', payload.target);

      if (payload.target === 'step') {
        var getRes = await sbFetch('cocktails?id=eq.' + payload.cocktail_id + '&select=method_steps', { headers: sbHeaders() });
        var rows = await getRes.json();
        var steps = (rows[0] && rows[0].method_steps) || [];
        if (!steps[payload.step_index]) { res.status(400).json({ error: 'Bad step index' }); return; }
        steps[payload.step_index].photo_url = photoUrl;
        await sbFetch('cocktails?id=eq.' + payload.cocktail_id, {
          method: 'PATCH',
          headers: sbHeaders(),
          body: JSON.stringify({ method_steps: steps, updated_at: new Date().toISOString() })
        });
      } else if (payload.target === 'ingredient') {
        await sbFetch('ingredient_photos?on_conflict=name', {
          method: 'POST',
          headers: Object.assign(sbHeaders(), { Prefer: 'resolution=merge-duplicates' }),
          body: JSON.stringify({ name: payload.ingredient_name, photo_url: photoUrl, is_stock: false, updated_at: new Date().toISOString() })
        });
      } else if (payload.target === 'cocktail') {
        await sbFetch('cocktails?id=eq.' + payload.cocktail_id, {
          method: 'PATCH',
          headers: sbHeaders(),
          body: JSON.stringify({ photo_url: photoUrl, updated_at: new Date().toISOString() })
        });
      } else if (payload.target === 'discrepancy') {
        // Cheers Trav evidence screenshot: side = 'menu' | 'app'.
        var evCol = payload.side === 'app' ? 'app_evidence_url' : payload.side === 'menu' ? 'menu_evidence_url' : null;
        if (!evCol || !payload.discrepancy_id) { res.status(400).json({ error: 'Bad evidence target' }); return; }
        var evRow = { updated_at: new Date().toISOString() }; evRow[evCol] = photoUrl;
        await sbFetch('menu_discrepancies?id=eq.' + encodeURIComponent(payload.discrepancy_id), { method: 'PATCH', headers: sbHeaders(), body: JSON.stringify(evRow) });
      } else {
        res.status(400).json({ error: 'Bad target' });
        return;
      }

      res.status(200).json({ ok: true, photo_url: photoUrl });
      return;
    }

    if (action === 'remove_photo') {
      if (payload.target === 'step') {
        var getRes2 = await sbFetch('cocktails?id=eq.' + payload.cocktail_id + '&select=method_steps', { headers: sbHeaders() });
        var rows2 = await getRes2.json();
        var steps2 = (rows2[0] && rows2[0].method_steps) || [];
        if (!steps2[payload.step_index]) { res.status(400).json({ error: 'Bad step index' }); return; }
        delete steps2[payload.step_index].photo_url;
        await sbFetch('cocktails?id=eq.' + payload.cocktail_id, {
          method: 'PATCH',
          headers: sbHeaders(),
          body: JSON.stringify({ method_steps: steps2, updated_at: new Date().toISOString() })
        });
      } else if (payload.target === 'ingredient') {
        // Clear the photo but keep the row — it also holds the ingredient's type.
        await sbFetch('ingredient_photos?name=eq.' + encodeURIComponent(payload.ingredient_name), {
          method: 'PATCH',
          headers: sbHeaders(),
          body: JSON.stringify({ photo_url: null, frame_height: null, updated_at: new Date().toISOString() })
        });
      } else if (payload.target === 'cocktail') {
        await sbFetch('cocktails?id=eq.' + payload.cocktail_id, {
          method: 'PATCH',
          headers: sbHeaders(),
          body: JSON.stringify({ photo_url: null, updated_at: new Date().toISOString() })
        });
      } else {
        res.status(400).json({ error: 'Bad target' });
        return;
      }

      res.status(200).json({ ok: true });
      return;
    }

    if (action === 'update_step_frame_height') {
      var getRes3 = await sbFetch('cocktails?id=eq.' + payload.cocktail_id + '&select=method_steps', { headers: sbHeaders() });
      var rows3 = await getRes3.json();
      var steps3 = (rows3[0] && rows3[0].method_steps) || [];
      if (!steps3[payload.step_index]) { res.status(400).json({ error: 'Bad step index' }); return; }
      steps3[payload.step_index].frame_height = payload.frame_height;
      await sbFetch('cocktails?id=eq.' + payload.cocktail_id, {
        method: 'PATCH',
        headers: sbHeaders(),
        body: JSON.stringify({ method_steps: steps3, updated_at: new Date().toISOString() })
      });
      res.status(200).json({ ok: true });
      return;
    }

    if (action === 'submit_photo_candidate') {
      if (!payload || !payload.cocktail_id || !(payload.step_index >= 0) || !payload.image_base64) {
        res.status(400).json({ error: 'Missing photo or step' }); return;
      }
      var cRes = await sbFetch('cocktails?id=eq.' + payload.cocktail_id + '&select=method_steps', { headers: sbHeaders() });
      var cRows = await cRes.json();
      var cSteps = (cRows[0] && cRows[0].method_steps) || [];
      var cStep = cSteps[payload.step_index];
      if (!cStep) { res.status(400).json({ error: 'Bad step index' }); return; }
      var candUrl = await uploadPhotoToStorage(payload.image_base64, payload.content_type || 'image/jpeg', 'candidate');
      await sbFetch('photo_submissions', {
        method: 'POST',
        headers: sbHeaders(),
        body: JSON.stringify({
          cocktail_id: payload.cocktail_id,
          step_index: payload.step_index,
          // Snapshot of the step's text, so the review can warn if the
          // recipe's steps were merged/reordered after this was sent.
          step_instruction: cStep.instruction || '',
          photo_url: candUrl,
          submitted_by: String(payload.submitted_by || '').slice(0, 60) || null
        })
      });
      res.status(200).json({ ok: true });
      return;
    }

    if (action === 'review_photo_submission') {
      var sRes = await sbFetch('photo_submissions?id=eq.' + payload.id + '&select=*', { headers: sbHeaders() });
      var sub = (await sRes.json())[0];
      if (!sub) { res.status(404).json({ error: 'Submission not found' }); return; }
      if (sub.status !== 'pending') { res.status(409).json({ error: 'Already ' + sub.status }); return; }
      if (payload.decision === 'accept') {
        var aRes = await sbFetch('cocktails?id=eq.' + sub.cocktail_id + '&select=method_steps', { headers: sbHeaders() });
        var aSteps = ((await aRes.json())[0] || {}).method_steps || [];
        var idx = payload.step_index != null ? payload.step_index : sub.step_index;
        if (!aSteps[idx]) { res.status(400).json({ error: 'That step no longer exists' }); return; }
        aSteps[idx].photo_url = sub.photo_url;
        await sbFetch('cocktails?id=eq.' + sub.cocktail_id, {
          method: 'PATCH', headers: sbHeaders(),
          body: JSON.stringify({ method_steps: aSteps, updated_at: new Date().toISOString() })
        });
      } else if (payload.decision !== 'reject') {
        res.status(400).json({ error: 'Bad decision' }); return;
      }
      await sbFetch('photo_submissions?id=eq.' + sub.id, {
        method: 'PATCH', headers: sbHeaders(),
        body: JSON.stringify({ status: payload.decision === 'accept' ? 'accepted' : 'rejected', reviewed_at: new Date().toISOString() })
      });
      res.status(200).json({ ok: true });
      return;
    }

    if (action === 'update_cocktail_frame_height') {
      var fh = parseInt(payload.frame_height, 10);
      if (!payload.cocktail_id || !(fh >= 60 && fh <= 500)) { res.status(400).json({ error: 'Bad frame height' }); return; }
      await sbFetch('cocktails?id=eq.' + payload.cocktail_id, {
        method: 'PATCH',
        headers: sbHeaders(),
        body: JSON.stringify({ photo_frame_height: fh, updated_at: new Date().toISOString() })
      });
      res.status(200).json({ ok: true });
      return;
    }

    if (action === 'update_ingredient') {
      // Ingredients table edits: change an ingredient's type and/or rename it
      // everywhere it's used. Names are matched case-insensitively in JS (not
      // via ilike — names like "17% Liquor" contain SQL wildcard characters).
      var oldName = String(payload.name || '').trim();
      if (!oldName) { res.status(400).json({ error: 'Missing ingredient name' }); return; }
      var oldKey = oldName.toLowerCase();
      var now = new Date().toISOString();
      var ipRes = await sbFetch('ingredient_photos?select=id,name', { headers: sbHeaders() });
      var ipRows = await ipRes.json();
      var ipRow = ipRows.filter(function (r) { return String(r.name).toLowerCase() === oldKey; })[0];

      if (payload.shelf_life_hours !== undefined) {
        var slh = payload.shelf_life_hours === null || payload.shelf_life_hours === '' ? null : Number(payload.shelf_life_hours);
        if (slh !== null && !(slh > 0 && slh <= 24 * 365)) { res.status(400).json({ error: 'Shelf life must be between 1 hour and a year' }); return; }
        if (ipRow) {
          await sbFetch('ingredient_photos?id=eq.' + ipRow.id, { method: 'PATCH', headers: sbHeaders(), body: JSON.stringify({ shelf_life_hours: slh, updated_at: now }) });
        } else {
          await sbFetch('ingredient_photos', { method: 'POST', headers: sbHeaders(), body: JSON.stringify({ name: oldName, shelf_life_hours: slh, is_stock: false }) });
        }
      }

      if (payload.label_name !== undefined || payload.no_label !== undefined || payload.label_ok !== undefined) {
        var lbl = {};
        if (payload.label_name !== undefined) lbl.label_name = String(payload.label_name || '').trim().slice(0, 80) || null;
        if (payload.no_label !== undefined) lbl.no_label = !!payload.no_label;
        if (payload.label_ok !== undefined) lbl.label_ok = !!payload.label_ok;
        lbl.updated_at = now;
        if (ipRow) {
          await sbFetch('ingredient_photos?id=eq.' + ipRow.id, { method: 'PATCH', headers: sbHeaders(), body: JSON.stringify(lbl) });
        } else {
          lbl.name = oldName; lbl.is_stock = false; delete lbl.updated_at;
          await sbFetch('ingredient_photos', { method: 'POST', headers: sbHeaders(), body: JSON.stringify(lbl) });
        }
      }

      if (payload.prep_group !== undefined) {
        var pg = payload.prep_group || null;
        if (pg !== null && pg !== 'fruit_syrup' && pg !== 'sweets_garnish') { res.status(400).json({ error: 'Bad Fruit Prep group' }); return; }
        if (ipRow) {
          await sbFetch('ingredient_photos?id=eq.' + ipRow.id, { method: 'PATCH', headers: sbHeaders(), body: JSON.stringify({ prep_group: pg, updated_at: now }) });
        } else {
          await sbFetch('ingredient_photos', { method: 'POST', headers: sbHeaders(), body: JSON.stringify({ name: oldName, prep_group: pg, is_stock: false }) });
        }
      }

      if (payload.category !== undefined) {
        var cat = String(payload.category || '').trim() || null;
        if (ipRow) {
          await sbFetch('ingredient_photos?id=eq.' + ipRow.id, { method: 'PATCH', headers: sbHeaders(), body: JSON.stringify({ category: cat, updated_at: now }) });
        } else {
          await sbFetch('ingredient_photos', { method: 'POST', headers: sbHeaders(), body: JSON.stringify({ name: oldName, category: cat, is_stock: false }) });
        }
      }

      if (payload.new_name !== undefined) {
        var newName = String(payload.new_name || '').trim().replace(/\s+/g, ' ');
        if (!newName) { res.status(400).json({ error: 'New name is empty' }); return; }
        var newKey = newName.toLowerCase();
        if (newKey !== oldKey) {
          var clash = ipRows.some(function (r) { return String(r.name).toLowerCase() === newKey; });
          var ciAll = await (await sbFetch('cocktail_ingredients?select=id,name', { headers: sbHeaders() })).json();
          if (clash || ciAll.some(function (r) { return String(r.name).toLowerCase() === newKey; })) {
            res.status(409).json({ error: '"' + newName + '" already exists — merging two ingredients isn\'t supported here' });
            return;
          }
        }
        // 1. Ingredient rows in every drink
        var ciRows = (await (await sbFetch('cocktail_ingredients?select=id,name', { headers: sbHeaders() })).json())
          .filter(function (r) { return String(r.name).toLowerCase() === oldKey; });
        if (ciRows.length) {
          await sbFetch('cocktail_ingredients?id=in.(' + ciRows.map(function (r) { return r.id; }).join(',') + ')', {
            method: 'PATCH', headers: sbHeaders(), body: JSON.stringify({ name: newName })
          });
        }
        // 2. Build steps that list it (names + per-step amount keys)
        var cocktails = await (await sbFetch('cocktails?select=id,method_steps', { headers: sbHeaders() })).json();
        var stepsTouched = 0;
        for (var ci = 0; ci < cocktails.length; ci++) {
          var steps = cocktails[ci].method_steps;
          if (!Array.isArray(steps)) continue;
          var hit = false;
          steps.forEach(function (st) {
            if (Array.isArray(st.ingredient_names)) {
              st.ingredient_names = st.ingredient_names.map(function (n) {
                if (String(n).toLowerCase() === oldKey) { hit = true; return newName; }
                return n;
              });
            }
            if (st.ingredient_amounts && typeof st.ingredient_amounts === 'object') {
              Object.keys(st.ingredient_amounts).forEach(function (k) {
                if (k.toLowerCase() === oldKey) {
                  var v = st.ingredient_amounts[k];
                  delete st.ingredient_amounts[k];
                  st.ingredient_amounts[newKey] = v;
                  hit = true;
                }
              });
            }
          });
          if (hit) {
            stepsTouched++;
            await sbFetch('cocktails?id=eq.' + cocktails[ci].id, { method: 'PATCH', headers: sbHeaders(), body: JSON.stringify({ method_steps: steps, updated_at: now }) });
          }
        }
        // 3. Its photo/type row
        if (ipRow) {
          await sbFetch('ingredient_photos?id=eq.' + ipRow.id, { method: 'PATCH', headers: sbHeaders(), body: JSON.stringify({ name: newName, updated_at: now }) });
        }
        if (newKey !== oldKey || newName !== oldName) await movePrepState(oldKey, newName);
        res.status(200).json({ ok: true, renamed_rows: ciRows.length, drinks_with_steps_updated: stepsTouched });
        return;
      }
      res.status(200).json({ ok: true });
      return;
    }

    if (action === 'swap_ingredient') {
      // Permanent stock swap (e.g. Bacardi -> Duppy Share): every drink that
      // uses the old ingredient is rewritten to use the replacement (its
      // ingredient rows AND build steps), then the old ingredient is dropped
      // from the list. The replacement may be an existing ingredient or a
      // brand-new name.
      var fromName = String(payload.name || '').trim();
      var toName = String(payload.replacement || '').trim().replace(/\s+/g, ' ');
      if (!fromName || !toName) { res.status(400).json({ error: 'Pick an ingredient and its replacement' }); return; }
      var fromKey = fromName.toLowerCase(), toKey = toName.toLowerCase();
      if (fromKey === toKey) { res.status(400).json({ error: 'That is the same ingredient' }); return; }
      var stamp = new Date().toISOString();
      var allIp = await (await sbFetch('ingredient_photos?select=*', { headers: sbHeaders() })).json();
      var fromIp = allIp.filter(function (r) { return String(r.name).toLowerCase() === fromKey; })[0];
      var toIp = allIp.filter(function (r) { return String(r.name).toLowerCase() === toKey; })[0];
      var allCi = await (await sbFetch('cocktail_ingredients?select=id,name,cocktail_id', { headers: sbHeaders() })).json();
      // If the replacement already exists, use its exact spelling.
      var existingTo = allCi.filter(function (r) { return String(r.name).toLowerCase() === toKey; })[0];
      if (toIp) toName = toIp.name; else if (existingTo) toName = existingTo.name;
      var fromRows = allCi.filter(function (r) { return String(r.name).toLowerCase() === fromKey; });
      var toCocktails = {};
      allCi.forEach(function (r) { if (String(r.name).toLowerCase() === toKey) toCocktails[r.cocktail_id] = true; });
      var both = fromRows.filter(function (r) { return toCocktails[r.cocktail_id]; });
      if (both.length) {
        var bothNames = await (await sbFetch('cocktails?select=name&id=in.(' + both.map(function (r) { return r.cocktail_id; }).join(',') + ')', { headers: sbHeaders() })).json();
        res.status(409).json({ error: 'Already uses both in: ' + bothNames.map(function (c) { return c.name; }).join(', ') + ' — fix those drinks by hand first' });
        return;
      }
      if (fromRows.length) {
        await sbFetch('cocktail_ingredients?id=in.(' + fromRows.map(function (r) { return r.id; }).join(',') + ')', {
          method: 'PATCH', headers: sbHeaders(), body: JSON.stringify({ name: toName })
        });
      }
      var escRe = function (s) { return String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); };
      var nameSet = {};
      allCi.concat(allIp).forEach(function (r) { nameSet[String(r.name)] = true; });
      var longerNames = Object.keys(nameSet).filter(function (n) {
        var l = n.toLowerCase(); return l !== fromKey && l.indexOf(fromKey) !== -1;
      }).sort(function (a, b) { return b.length - a.length; });
      var cks = await (await sbFetch('cocktails?select=id,method_steps', { headers: sbHeaders() })).json();
      var swappedDrinks = 0;
      for (var si = 0; si < cks.length; si++) {
        var sSteps = cks[si].method_steps;
        if (!Array.isArray(sSteps)) continue;
        var sHit = false;
        sSteps.forEach(function (st) {
          if (Array.isArray(st.ingredient_names)) {
            st.ingredient_names = st.ingredient_names.map(function (n) {
              if (String(n).toLowerCase() === fromKey) { sHit = true; return toName; }
              return n;
            });
          }
          if (st.ingredient_amounts && typeof st.ingredient_amounts === 'object') {
            Object.keys(st.ingredient_amounts).forEach(function (k) {
              if (k.toLowerCase() === fromKey) { var v = st.ingredient_amounts[k]; delete st.ingredient_amounts[k]; st.ingredient_amounts[toKey] = v; sHit = true; }
            });
          }
          if (st.instruction && typeof st.instruction === 'string') {
            // Mask longer ingredient names that contain this one (e.g. swapping
            // "Bacardi" must not touch "Bacardi Spiced"), replace, then unmask.
            var masked = st.instruction, masks = [];
            longerNames.forEach(function (ln, mi) {
              var mre = new RegExp(escRe(ln), 'g');
              masked = masked.replace(mre, function (m) { masks.push(m); return '\u0000' + (masks.length - 1) + '\u0000'; });
            });
            // Exact, same-case name only: a generic word in prose ("a mint
            // sprig") must never be rewritten into a product name.
            var re = new RegExp('\\b' + escRe(fromName) + '\\b', 'g');
            if (re.test(masked)) {
              masked = masked.replace(re, toName);
              st.instruction = masked.replace(/\u0000(\d+)\u0000/g, function (_, i) { return masks[+i]; });
              sHit = true;
            }
          }
        });
        if (sHit) {
          swappedDrinks++;
          await sbFetch('cocktails?id=eq.' + cks[si].id, { method: 'PATCH', headers: sbHeaders(), body: JSON.stringify({ method_steps: sSteps, updated_at: stamp }) });
        }
      }
      // The old ingredient leaves the list. A brand-new replacement inherits
      // its type and shelf life (but not its photo — it's a different product).
      if (fromIp) {
        if (toIp) {
          // Merge: the kept ingredient picks up anything only the old one had.
          var fill = {};
          ['category', 'shelf_life_hours', 'photo_url', 'frame_height', 'prep_group', 'label_name'].forEach(function (f) {
            if ((toIp[f] === null || toIp[f] === undefined || toIp[f] === '') && fromIp[f] !== null && fromIp[f] !== undefined && fromIp[f] !== '') fill[f] = fromIp[f];
          });
          if (fill.frame_height !== undefined && !(fill.photo_url || toIp.photo_url)) delete fill.frame_height;
          if (Object.keys(fill).length) {
            fill.updated_at = stamp;
            await sbFetch('ingredient_photos?id=eq.' + toIp.id, { method: 'PATCH', headers: sbHeaders(), body: JSON.stringify(fill) });
          }
          await sbFetch('ingredient_photos?id=eq.' + fromIp.id, { method: 'DELETE', headers: sbHeaders() });
        } else {
          await sbFetch('ingredient_photos?id=eq.' + fromIp.id, {
            method: 'PATCH', headers: sbHeaders(),
            body: JSON.stringify({ name: toName, photo_url: null, frame_height: null, updated_at: stamp })
          });
        }
      }
      await movePrepState(fromKey, toName);
      res.status(200).json({ ok: true, replacement: toName, ingredient_rows: fromRows.length, drinks_with_steps_updated: swappedDrinks });
      return;
    }

    if (action === 'update_ingredient_frame_height') {
      var ifh = parseInt(payload.frame_height, 10);
      if (!payload.ingredient_name || !(ifh >= 60 && ifh <= 500)) { res.status(400).json({ error: 'Bad frame height' }); return; }
      await sbFetch('ingredient_photos?name=eq.' + encodeURIComponent(payload.ingredient_name), {
        method: 'PATCH',
        headers: sbHeaders(),
        body: JSON.stringify({ frame_height: ifh, updated_at: new Date().toISOString() })
      });
      res.status(200).json({ ok: true });
      return;
    }

    // Menu ↔ Chilled Pubs app discrepancies ("Cheers Trav" table).
    if (action === 'save_menu_discrepancy') {
      var clip = function (v, n) { return v === undefined ? undefined : (String(v || '').trim().slice(0, n) || null); };
      var md = { updated_at: new Date().toISOString() };
      if (payload.drink_name !== undefined) md.drink_name = clip(payload.drink_name, 120);
      if (payload.cocktail_id !== undefined) md.cocktail_id = payload.cocktail_id || null;
      if (payload.menu_says !== undefined) md.menu_says = clip(payload.menu_says, 600);
      if (payload.app_says !== undefined) md.app_says = clip(payload.app_says, 600);
      if (payload.change_needed !== undefined) md.change_needed = clip(payload.change_needed, 600);
      if (payload.menu_evidence_url !== undefined) md.menu_evidence_url = payload.menu_evidence_url || null;
      if (payload.app_evidence_url !== undefined) md.app_evidence_url = payload.app_evidence_url || null;
      if (payload.resolved !== undefined) { md.resolved = !!payload.resolved; md.resolved_at = payload.resolved ? md.updated_at : null; }
      var mdOut;
      if (payload.id) {
        mdOut = await sbFetch('menu_discrepancies?id=eq.' + encodeURIComponent(payload.id), { method: 'PATCH', headers: Object.assign(sbHeaders(), { Prefer: 'return=representation' }), body: JSON.stringify(md) });
      } else {
        if (!md.drink_name) { res.status(400).json({ error: 'Drink name needed' }); return; }
        mdOut = await sbFetch('menu_discrepancies', { method: 'POST', headers: Object.assign(sbHeaders(), { Prefer: 'return=representation' }), body: JSON.stringify(md) });
      }
      res.status(200).json({ ok: true, row: (await mdOut.json())[0] || null });
      return;
    }
    if (action === 'delete_menu_discrepancy') {
      if (!payload.id) { res.status(400).json({ error: 'id needed' }); return; }
      await sbFetch('menu_discrepancies?id=eq.' + encodeURIComponent(payload.id), { method: 'DELETE', headers: sbHeaders() });
      res.status(200).json({ ok: true });
      return;
    }

    res.status(400).json({ error: 'Unknown action' });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
};
