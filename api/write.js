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

    res.status(400).json({ error: 'Unknown action' });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
};
