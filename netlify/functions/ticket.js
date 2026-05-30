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

  if (!apiKey) return { statusCode: 500, headers: H, body: JSON.stringify({ ok: false, error: 'FD_API_KEY non configurata' }) };

  let b = {};
  try { b = JSON.parse(event.body || '{}'); } catch(e) {
    return { statusCode: 400, headers: H, body: JSON.stringify({ ok: false, error: 'JSON non valido' }) };
  }

  // Normalizza tutto come stringa
  const email   = String(b.email   || '').trim();
  const name    = String(b.name    || b.referente || 'Cliente NLT').trim();
  const phone   = String(b.phone   || '').trim();
  const marca   = String(b.marca   || 'N/D').trim();
  const modello = String(b.modello || 'N/D').trim();
  const durata  = String(b.durata  || '?').trim();
  const km      = String(b.km      || '').trim();
  const tipo    = String(b.tipo    || '').trim();
  const pivaOcf = String(b.piva_cf || '').trim();
  const fr      = String(b.franchigia || 'No').trim();
  const note    = String(b.note    || '').trim();
  const referente = String(b.referente || name).trim();

  if (!email) return { statusCode: 422, headers: H, body: JSON.stringify({ ok: false, error: 'Email obbligatoria' }) };

  const kmFmt = km ? Number(km.replace(/\D/g,'')).toLocaleString('it-IT') + ' km' : 'N/D';

  const rr = (l, v) => v ? `<tr><td style="padding:5px 14px 5px 0;color:#555;font-weight:600;font-size:13px">${l}</td><td style="font-size:13px;color:#0a0f2e">${v}</td></tr>` : '';

  const desc = [
    '<h2 style="color:#0d1e90;font-family:sans-serif">Richiesta Noleggio Lungo Termine</h2>',
    '<table style="border-collapse:collapse;font-family:sans-serif;width:100%;max-width:580px">',
    '<tr style="background:#f0f4ff"><td colspan="2" style="padding:7px 12px;font-weight:700;color:#0d1e90;font-size:11px;text-transform:uppercase">Intestatario</td></tr>',
    rr('Tipo', tipo),
    rr('Azienda / Nome', name),
    rr('P.IVA / CF', pivaOcf),
    '<tr style="background:#f0f4ff"><td colspan="2" style="padding:7px 12px;font-weight:700;color:#0d1e90;font-size:11px;text-transform:uppercase">Referente</td></tr>',
    rr('Nome', referente),
    rr('Telefono', phone),
    rr('Email', email),
    '<tr style="background:#f0f4ff"><td colspan="2" style="padding:7px 12px;font-weight:700;color:#0d1e90;font-size:11px;text-transform:uppercase">Veicolo</td></tr>',
    rr('Marca', marca),
    rr('Modello', modello),
    '<tr style="background:#f0f4ff"><td colspan="2" style="padding:7px 12px;font-weight:700;color:#0d1e90;font-size:11px;text-transform:uppercase">Contratto</td></tr>',
    rr('Durata', durata + ' mesi'),
    rr('Km Totali', kmFmt),
    rr('Franchigia', fr),
    note ? rr('Note', note) : '',
    '</table>',
  ].join('');

  // Payload MINIMO - solo campi certi di Freshdesk
  const fdPayload = {
    subject:     'NLT \u2014 ' + marca + ' ' + modello + ' (' + durata + ' mesi) \u2014 ' + name,
    description: desc,
    email:       email,
    name:        name,
    priority:    2,
    status:      2,
    tags:        ['nlt', 'noleggio-lungo-termine'],
  };

  // Aggiungi phone SOLO se non vuoto
  if (phone) fdPayload.phone = phone;

  const https = require('https');
  const auth  = Buffer.from(apiKey + ':X').toString('base64');
  const body  = JSON.stringify(fdPayload);

  try {
    const result = await new Promise((resolve, reject) => {
      const req = https.request({
        hostname: domain + '.freshdesk.com',
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

    // Ritorna errore dettagliato per debug
    return {
      statusCode: result.status,
      headers: H,
      body: JSON.stringify({
        ok: false,
        error: fd?.errors?.[0]?.message || fd?.description || 'Errore Freshdesk ' + result.status,
        errors: fd?.errors || [],
        raw: result.body.substring(0, 500),
      })
    };

  } catch(e) {
    return { statusCode: 502, headers: H, body: JSON.stringify({ ok: false, error: 'Rete: ' + e.message }) };
  }
};