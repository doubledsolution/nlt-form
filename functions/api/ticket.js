export async function onRequestPost({ request, env }) {
  let body;
  try { body = await request.json(); }
  catch { return resp({ ok: false, error: 'Payload non valido' }, 400); }

  const nome    = body.nome    || '';
  const email   = body.email   || '';
  const marca   = body.marca   || '';
  const modello = body.modello || '';
  const ref     = body.ref || body.referente || nome;
  const fr      = body.fr  || body.franchigia || '';

  if (!nome || !email || !marca || !modello)
    return resp({ ok: false, error: 'Campi obbligatori mancanti' }, 422);

  const apiKey = env.FD_API_KEY;
  if (!apiKey)
    return resp({ ok: false, error: 'FD_API_KEY non configurata' }, 500);

  const rr = (l, v) => v
    ? `<tr><td style="padding:3px 12px 3px 0;color:#555;font-size:13px"><b>${l}</b></td><td style="font-size:13px">${v}</td></tr>`
    : '';

  const desc = `<h3 style="color:#0d1e90;margin:0 0 12px">Richiesta NLT</h3>
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
  ${rr('Durata',       body.durata ? body.durata+' mesi' : '')}
  ${rr('Km',           body.km ? body.km+' km' : '')}
  ${rr('Franchigia',   fr)}
  ${rr('Note',         body.note)}
</table>`;

  try {
    const fd = await fetch('https://doubledsolution.freshdesk.com/api/v2/tickets', {
      method : 'POST',
      headers: {
        'Content-Type' : 'application/json',
        'Authorization': 'Basic ' + btoa(apiKey + ':X'),
      },
      body: JSON.stringify({
        subject    : `NLT — ${marca} ${modello} | ${body.durata || '?'} mesi`,
        description: desc,
        email,
        name       : ref,
        phone      : body.tel || '',
        priority   : 2,
        status     : 2,
        tags       : ['nlt', 'noleggio-lungo-termine'],
      }),
    });

    const data = await fd.json().catch(() => ({}));

    if (fd.status === 201)
      return resp({ ok: true, ticket_id: data.id }, 201);

    const errMsg = data?.errors?.[0]?.message || data?.description || JSON.stringify(data);
    return resp({ ok: false, error: 'Freshdesk: ' + errMsg }, fd.status);

  } catch (e) {
    return resp({ ok: false, error: 'Errore rete: ' + e.message }, 502);
  }
}

function resp(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}
