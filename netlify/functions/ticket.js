exports.handler = async function(event) {
  const H = {
    'Access-Control-Allow-Origin':  '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Content-Type': 'application/json',
  };

  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers: H, body: '' };
  if (event.httpMethod !== 'POST')   return { statusCode: 405, headers: H, body: JSON.stringify({ ok: false, error: 'Method not allowed' }) };

  const apiKey = process.env.FD_API_KEY;
  const domain = process.env.FD_DOMAIN || 'doubledsolution';

  if (!apiKey) {
    return { statusCode: 500, headers: H, body: JSON.stringify({ ok: false, error: 'FD_API_KEY non configurata' }) };
  }

  let b = {};
  try { b = JSON.parse(event.body || '{}'); } catch(e) {
    return { statusCode: 400, headers: H, body: JSON.stringify({ ok: false, error: 'JSON non valido' }) };
  }

  const email = (b.email || '').trim();
  if (!email) return { statusCode: 422, headers: H, body: JSON.stringify({ ok: false, error: 'Email obbligatoria' }) };

  // Costruisce descrizione HTML
  const rr = (l, v) => v ? `<tr><td style="padding:4px 12px 4px 0;color:#555;font-weight:600;font-size:13px;white-space:nowrap">${l}</td><td style="font-size:13px;color:#0a0f2e">${v}</td></tr>` : '';
  const nome    = (b.name || b.nome || 'N/D').trim();
  const marca   = (b.marca || 'N/D').trim();
  const modello = (b.modello || 'N/D').trim();
  const durata  = b.durata || '?';
  const km      = b.km ? Number(b.km).toLocaleString('it-IT') + ' km' : 'N/D';
  const fr      = b.franchigia !== undefined ? (b.franchigia === true || b.franchigia === 'Sì' ? 'Sì' : 'No') : (b.fr || 'N/D');

  const desc = `<h2 style="color:#0d1e90;font-family:sans-serif;margin-bottom:16px">Richiesta Noleggio Lungo Termine</h2>
<table style="border-collapse:collapse;font-family:sans-serif;width:100%;max-width:600px">
  <tr style="background:#f0f4ff"><td colspan="2" style="padding:8px 12px;font-weight:700;color:#0d1e90;font-size:12px;letter-spacing:.1em;text-transform:uppercase">Intestatario</td></tr>
  ${rr('Tipo', b.tipo)}${rr('Azienda / Nome', nome)}${rr('P.IVA / CF', b.piva_cf || b.piva || b.cf || '')}
  <tr style="background:#f0f4ff"><td colspan="2" style="padding:8px 12px;font-weight:700;color:#0d1e90;font-size:12px;letter-spacing:.1em;text-transform:uppercase">Referente</td></tr>
  ${rr('Nome', b.referente || b.ref || nome)}${rr('Telefono', b.phone || b.tel)}${rr('Email', email)}
  <tr style="background:#f0f4ff"><td colspan="2" style="padding:8px 12px;font-weight:700;color:#0d1e90;font-size:12px;letter-spacing:.1em;text-transform:uppercase">Veicolo</td></tr>
  ${rr('Marca', marca)}${rr('Modello', modello)}
  <tr style="background:#f0f4ff"><td colspan="2" style="padding:8px 12px;font-weight:700;color:#0d1e90;font-size:12px;letter-spacing:.1em;text-transform:uppercase">Contratto</td></tr>
  ${rr('Durata', durata + ' mesi')}${rr('Km Totali', km)}${rr('Franchigia', fr)}
  ${b.note ? rr('Note', b.note) : ''}
</table>`;

  const fdPayload = {
    subject:     `NLT — ${marca} ${modello} (${durata} mesi) — ${nome}`,
    description: desc,
    email,
    name:        b.name || b.referente || b.ref || nome,
    phone:       (b.phone || b.tel || '').trim(),
    priority:    2,
    status:      2,
    tags:        ['nlt', 'noleggio-lungo-termine'],
  };

  // Aggiunge custom_fields solo se presenti e non vuoti
  if (b.custom_fields && Object.keys(b.custom_fields).length) {
    fdPayload.custom_fields = b.custom_fields;
  }

  // Usa https nativo (compatibile con tutti i runtime Netlify)
  const https = require('https');
  const auth  = Buffer.from(apiKey + ':X').toString('base64');
  const body  = JSON.stringify(fdPayload);

  try {
    const result = await new Promise((resolve, reject) => {
      const req = https.request({
        hostname: `${domain}.freshdesk.com`,
        path:     '/api/v2/tickets',
        method:   'POST',
        headers: {
          'Content-Type':   'application/json',
          'Authorization':  'Basic ' + auth,
          'Content-Length': Buffer.byteLength(body),
        }
      }, res => {
        let data = '';
        res.on('data', c => data += c);
        res.on('end', () => resolve({ status: res.statusCode, body: data }));
      });
      req.on('error', reject);
      req.write(body);
      req.end();
    });

    let fd = {};
    try { fd = JSON.parse(result.body); } catch(e) {}

    if (result.status === 201) {
      return { statusCode: 201, headers: H, body: JSON.stringify({ ok: true, id: fd.id }) };
    }

    const errMsg = fd?.errors?.[0]?.message || fd?.description || result.body.substring(0, 200);
    return { statusCode: result.status, headers: H, body: JSON.stringify({ ok: false, error: errMsg }) };

  } catch(e) {
    return { statusCode: 502, headers: H, body: JSON.stringify({ ok: false, error: 'Rete: ' + e.message }) };
  }
};
