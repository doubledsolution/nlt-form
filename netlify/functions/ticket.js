const https = require('https');

exports.handler = async (event) => {
  const H = {
    'Access-Control-Allow-Origin' : '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Content-Type': 'application/json'
  };

  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers: H, body: '' };

  // Versione identificabile
  const VERSION = 'v4-test-2026-05-30';

  let b = {};
  try { b = JSON.parse(event.body || '{}'); } catch(e) {}

  const apiKey = process.env.FD_API_KEY;

  // Se non c'è email, ritorna eco di quello che ha ricevuto
  const email = (b.email || '').trim();
  if (!email) {
    return {
      statusCode: 422, headers: H,
      body: JSON.stringify({
        ok: false,
        version: VERSION,
        error: 'Email mancante',
        received: b,
        has_api_key: !!apiKey
      })
    };
  }

  if (!apiKey) {
    return {
      statusCode: 500, headers: H,
      body: JSON.stringify({ ok: false, version: VERSION, error: 'FD_API_KEY mancante su Netlify' })
    };
  }

  // Chiama Freshdesk
  const rr = (l,v) => v ? `<tr><td style="padding:3px 10px 3px 0;color:#555;font-size:13px"><b>${l}</b></td><td style="font-size:13px">${v}</td></tr>` : '';
  const nome    = (b.nome || 'N/D').trim();
  const marca   = (b.marca || 'N/D').trim();
  const modello = (b.modello || 'N/D').trim();
  const ref     = (b.ref || b.referente || nome).trim();

  const desc = `<h3 style="color:#0d1e90">Richiesta NLT</h3><table>
    ${rr('Tipo',b.tipo)}${rr('Azienda/Nome',nome)}${rr('P.IVA',b.piva)}
    ${rr('Referente',ref)}${rr('Tel',b.tel)}${rr('Email',email)}
    <tr><td colspan="2"><hr style="border:none;border-top:1px solid #ddd;margin:6px 0"></td></tr>
    ${rr('Marca',marca)}${rr('Modello',modello)}
    ${rr('Durata',b.durata?b.durata+' mesi':'')}
    ${rr('Km',b.km?b.km+' km':'')}
    ${rr('Franchigia',b.fr||b.franchigia)}${rr('Note',b.note)}
  </table>`;

  const payload = JSON.stringify({
    subject: `NLT — ${marca} ${modello} | ${b.durata||'?'} mesi`,
    description: desc,
    email,
    name: ref || nome,
    phone: (b.tel||'').trim(),
    priority: 2, status: 2,
    tags: ['nlt','noleggio-lungo-termine']
  });

  const auth = Buffer.from(apiKey+':X').toString('base64');

  try {
    const r = await new Promise((resolve, reject) => {
      const req = https.request({
        hostname: 'doubledsolution.freshdesk.com',
        path: '/api/v2/tickets',
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Basic ' + auth,
          'Content-Length': Buffer.byteLength(payload)
        }
      }, (res) => {
        let d = '';
        res.on('data', c => d += c);
        res.on('end', () => resolve({ status: res.statusCode, body: d }));
      });
      req.on('error', reject);
      req.write(payload);
      req.end();
    });

    let fd = {};
    try { fd = JSON.parse(r.body); } catch(e) {}

    if (r.status === 201) {
      return { statusCode: 201, headers: H, body: JSON.stringify({ ok: true, version: VERSION, ticket_id: fd.id }) };
    }

    const errMsg = fd?.errors?.[0]?.message || fd?.description || r.body.substring(0,300);
    return {
      statusCode: r.status, headers: H,
      body: JSON.stringify({ ok: false, version: VERSION, error: 'Freshdesk ' + r.status + ': ' + errMsg })
    };

  } catch(e) {
    return {
      statusCode: 502, headers: H,
      body: JSON.stringify({ ok: false, version: VERSION, error: 'Errore rete: ' + e.message })
    };
  }
};
