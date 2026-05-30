const https = require('https');

exports.handler = async (event) => {
  const CORS = {
    'Access-Control-Allow-Origin' : '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Content-Type': 'application/json'
  };

  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers: CORS, body: '' };
  }

  // Accetta qualsiasi metodo che non sia OPTIONS (per sicurezza)
  let body = {};
  try {
    if (event.body) {
      body = typeof event.body === 'string' ? JSON.parse(event.body) : event.body;
    }
  } catch(e) {
    console.log('Parse error:', e.message, 'Raw body:', event.body);
    body = {};
  }

  console.log('RECEIVED:', JSON.stringify(body));

  const email   = (body.email   || '').trim();
  const nome    = (body.nome    || body.name || 'N/D').trim();
  const marca   = (body.marca   || 'N/D').trim();
  const modello = (body.modello || 'N/D').trim();
  const ref     = (body.ref || body.referente || nome).trim();
  const fr      = (body.fr  || body.franchigia || '').trim();

  if (!email) {
    return {
      statusCode: 422, headers: CORS,
      body: JSON.stringify({ ok: false, error: 'Email mancante. Body: ' + JSON.stringify(body) })
    };
  }

  const apiKey = process.env.FD_API_KEY;
  if (!apiKey) {
    return {
      statusCode: 500, headers: CORS,
      body: JSON.stringify({ ok: false, error: 'FD_API_KEY non configurata su Netlify' })
    };
  }

  const rr = (l, v) => v
    ? `<tr><td style="padding:3px 12px 3px 0;color:#555;font-size:13px;white-space:nowrap"><b>${l}</b></td><td style="font-size:13px">${v}</td></tr>`
    : '';

  const description = `
<h3 style="color:#0d1e90;margin:0 0 14px">Richiesta Noleggio a Lungo Termine</h3>
<table cellpadding="0" cellspacing="0" style="border-collapse:collapse">
  ${rr('Tipo',         body.tipo)}
  ${rr('Azienda/Nome', nome)}
  ${rr('P.IVA/C.F.',   body.piva)}
  ${rr('Referente',    ref)}
  ${rr('Telefono',     body.tel)}
  ${rr('Email',        email)}
  <tr><td colspan="2" style="padding:8px 0"><hr style="border:none;border-top:1px solid #e0e0e0"></td></tr>
  ${rr('Marca',        marca)}
  ${rr('Modello',      modello)}
  ${rr('Durata',       body.durata ? body.durata + ' mesi' : '')}
  ${rr('Km',           body.km ? body.km + ' km' : '')}
  ${rr('Franchigia',   fr)}
  ${rr('Note',         body.note)}
</table>`;

  const fdPayload = JSON.stringify({
    subject    : `NLT — ${marca} ${modello} | ${body.durata || '?'} mesi`,
    description,
    email,
    name       : ref || nome,
    phone      : (body.tel || '').trim(),
    priority   : 2,
    status     : 2,
    tags       : ['nlt', 'noleggio-lungo-termine'],
  });

  const auth = Buffer.from(apiKey + ':X').toString('base64');

  const result = await new Promise((resolve, reject) => {
    const req = https.request({
      hostname: 'doubledsolution.freshdesk.com',
      path    : '/api/v2/tickets',
      method  : 'POST',
      headers : {
        'Content-Type'  : 'application/json',
        'Authorization' : 'Basic ' + auth,
        'Content-Length': Buffer.byteLength(fdPayload),
      },
    }, (res) => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => resolve({ status: res.statusCode, body: data }));
    });
    req.on('error', reject);
    req.write(fdPayload);
    req.end();
  });

  console.log('FD STATUS:', result.status, 'BODY:', result.body.substring(0, 200));

  let fd = {};
  try { fd = JSON.parse(result.body); } catch(e) {}

  if (result.status === 201) {
    return {
      statusCode: 201, headers: CORS,
      body: JSON.stringify({ ok: true, ticket_id: fd.id })
    };
  }

  const errMsg = fd?.errors?.[0]?.message || fd?.description || result.body.substring(0, 200);
  return {
    statusCode: result.status, headers: CORS,
    body: JSON.stringify({ ok: false, error: 'Freshdesk error: ' + errMsg })
  };
};
