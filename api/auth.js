module.exports = async function handler(req, res) {
  if (req.method !== 'POST') { res.status(405).json({ error: 'POST only' }); return; }

  var body = req.body;
  if (typeof body === 'string') {
    try { body = JSON.parse(body); } catch (e) { body = {}; }
  }
  var password = body && body.password;

  if (!password) { res.status(400).json({ error: 'Missing password' }); return; }

  if (password === process.env.ADMIN_PW) {
    res.status(200).json({ role: 'admin', secret: process.env.BAR_ADMIN_SECRET });
    return;
  }
  if (password === process.env.STAFF_PW) {
    res.status(200).json({ role: 'staff' });
    return;
  }
  res.status(401).json({ error: 'Wrong password' });
};
