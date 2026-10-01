var crypto = require('crypto');

// Staff can't edit anything, but they can SUBMIT a step photo as a candidate
// for admin review. This token (derived from the admin secret, so no extra
// env var) authorises exactly that one action in api/write.js.
function staffSubmitToken() {
  return crypto.createHmac('sha256', String(process.env.BAR_ADMIN_SECRET || '')).update('ube-staff-photo-submit').digest('hex');
}

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') { res.status(405).json({ error: 'POST only' }); return; }

  var body = req.body;
  if (typeof body === 'string') {
    try { body = JSON.parse(body); } catch (e) { body = {}; }
  }
  var password = body && body.password;

  if (!password) { res.status(400).json({ error: 'Missing password' }); return; }

  if (password === process.env.ADMIN_PW) {
    res.status(200).json({ role: 'admin', secret: process.env.BAR_ADMIN_SECRET, submit_token: staffSubmitToken() });
    return;
  }
  if (password === process.env.STAFF_PW) {
    res.status(200).json({ role: 'staff', submit_token: staffSubmitToken() });
    return;
  }
  res.status(401).json({ error: 'Wrong password' });
};

module.exports.staffSubmitToken = staffSubmitToken;
