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

async function searchWikimediaPhoto(term) {
  var url = 'https://commons.wikimedia.org/w/api.php?action=query&generator=search&gsrnamespace=6&gsrsearch=' +
    encodeURIComponent(term) + '&gsrlimit=1&prop=imageinfo&iiprop=url&format=json';
  var r = await fetch(url, { headers: { 'User-Agent': 'UbeExpress/1.0 (internal bar staff tool; https://ubeexpress.vercel.app)' } });
  if (!r.ok) return null;
  var data = await r.json();
  var pages = data && data.query && data.query.pages;
  if (!pages) return null;
  var first = Object.keys(pages).map(function (k) { return pages[k]; })[0];
  var info = first && first.imageinfo && first.imageinfo[0];
  return info ? info.url : null;
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

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') { res.status(405).json({ error: 'POST only' }); return; }

  var secret = req.headers['x-bar-secret'];
  if (!secret || secret !== process.env.BAR_ADMIN_SECRET) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }

  var body = req.body;
  if (typeof body === 'string') {
    try { body = JSON.parse(body); } catch (e) { body = {}; }
  }
  var action = body && body.action;
  var payload = body && body.payload;

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
        await sbFetch('ingredient_photos?name=eq.' + encodeURIComponent(payload.ingredient_name), {
          method: 'DELETE',
          headers: sbHeaders()
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

    if (action === 'fetch_stock_photo') {
      var term = payload && payload.ingredient_name;
      if (!term) { res.status(400).json({ error: 'Missing ingredient_name' }); return; }

      var stockUrl = await searchWikimediaPhoto(term);
      if (!stockUrl) {
        res.status(200).json({ ok: true, found: false });
        return;
      }

      await sbFetch('ingredient_photos?on_conflict=name', {
        method: 'POST',
        headers: Object.assign(sbHeaders(), { Prefer: 'resolution=merge-duplicates' }),
        body: JSON.stringify({ name: term, photo_url: stockUrl, is_stock: true, updated_at: new Date().toISOString() })
      });

      res.status(200).json({ ok: true, found: true, photo_url: stockUrl });
      return;
    }

    res.status(400).json({ error: 'Unknown action' });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
};
