const https = require('https');

exports.handler = async (event) => {
  const headers = {
    'Access-Control-Allow-Origin' : '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Content-Type': 'application/json'
  };

  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers, body: '' };
  }
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, headers, body: JSON.stringify({ error: 'Method not allowed' }) };
  }

  let body;
  try {
    body = JSON.parse(event.body || '{}');
  } catch(e) {
    return { statusCode: 400, headers, body: JSON.stringify({ error: 'JSON non valido: ' + e.message }) };
  }

  // Log per debug
  console.log('BODY RICEVUTO:', JSON.stringify(body));

  // Campi con fallback
  const nome    = body.nome    || body.name  || 'N/D';
  const email   = body.email   || '';
  const marca   = body.marca   || 'N/D';
  const modello = body.modello || 'N/D';
  const ref     = body.ref || body.referente || nome;
  const fr      = body.fr  || body.franchigia || '';

  // Solo email è strettamente obbligatoria per Freshdesk
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return { statusCode: 422, headers, body: JSON.stringify({ error: 'Email obbligatoria e valida. Ricevuto: ' + JSON.stringify(body) }) };
  }

  const apiKey = process.env.FD_API_KEY;
  if (!apiKey) {
    return { statusCode: 500, headers, body: JSON.stringify({ error: 'FD_API_KEY non configurata' }) };
  }

  const rr = (l, v) => v
    ? `<tr><td style="padding:3px 12px 3px 0;color:#555;font-size:13px"><b>${l}</b></td><td style="font-size:13px">${v}</td></tr>`
    : '';

  const description = `
<h3 style="color:#0d1e90;margin:0 0 12px">Richiesta Noleggio a Lungo Termine</h3>
<table cellpadding="0" cellspacing="0">
  ${rr('Tipo',         body.tipo)}
  ${rr('Azienda/Nome', nome)}
  ${rr('P.IVA/C.F.',   body.piva)}
  ${rr('Referente',    ref)}
  ${rr('Telefono',     body.tel)}
  ${rr('Email',        email)}
  <tr><td colspan="2"><hr style="border:none;border-top:1px solid #ddd;margin:8px 0"></td></tr>
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
    name       : ref,
    phone      : body.tel || '',
    priority   : 2,
    status     : 2,
    tags       : ['nlt', 'noleggio-lungo-termine'],
  });

  const auth = Buffer.from(apiKey + ':X').toString('base64');

  const result = await new Promise((resolve, reject) => {
    const options = {
      hostname: 'doubledsolution.freshdesk.com',
      path    : '/api/v2/tickets',
      method  : 'POST',
      headers : {
        'Content-Type'  : 'application/json',
        'Authorization' : 'Basic ' + auth,
        'Content-Length': Buffer.byteLength(fdPayload),
      },
    };
    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => resolve({ status: res.statusCode, body: data }));
    });
    req.on('error', reject);
    req.write(fdPayload);
    req.end();
  });

  console.log('FRESHDESK STATUS:', result.status, 'BODY:', result.body);

  const fd = JSON.parse(result.body || '{}');

  if (result.status === 201) {
    return { statusCode: 201, headers, body: JSON.stringify({ ok: true, ticket_id: fd.id }) };
  }

  const errMsg = fd?.errors?.[0]?.message || fd?.description || result.body;
  return { statusCode: result.status, headers, body: JSON.stringify({ ok: false, error: 'Freshdesk: ' + errMsg }) };
};
