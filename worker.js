/**
 * Cloudflare Worker — NLT Form
 * - GET  /*          → serve asset statici (index.html, ecc.)
 * - POST /api/ticket → proxy verso Freshdesk API
 *
 * Variabile d'ambiente richiesta (Impostazioni → Variabili e segreti):
 *   FD_API_KEY  →  API key Freshdesk (cifrata)
 */

const FD_DOMAIN   = 'doubledsolution.freshdesk.com';
const FD_ENDPOINT = `https://${FD_DOMAIN}/api/v2/tickets`;

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    /* ── CORS preflight ─────────────────────────── */
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: corsHeaders() });
    }

    /* ── API ticket ─────────────────────────────── */
    if (url.pathname === '/api/ticket' && request.method === 'POST') {
      return handleTicket(request, env);
    }

    /* ── Asset statici (index.html, css, js…) ───── */
    return env.ASSETS.fetch(request);
  },
};

/* ═══════════════════════════════════════════════
   HANDLER TICKET
═══════════════════════════════════════════════ */
async function handleTicket(request, env) {
  /* leggi body */
  let body;
  try {
    body = await request.json();
  } catch {
    return json({ ok: false, error: 'Payload JSON non valido' }, 400);
  }

  /* accetta sia i nomi vecchi (ref, fr) che quelli nuovi (referente, franchigia) */
  const tipo       = body.tipo      || '';
  const nome       = body.nome      || '';
  const piva       = body.piva      || '';
  const referente  = body.referente || body.ref || nome;
  const tel        = body.tel       || '';
  const email      = body.email     || '';
  const marca      = body.marca     || '';
  const modello    = body.modello   || '';
  const durata     = body.durata    || '';
  const km         = body.km        || '';
  const franchigia = body.franchigia|| body.fr  || '';
  const note       = body.note      || '';

  /* validazione */
  if (!email || !nome || !marca || !modello) {
    return json({ ok: false, error: 'Campi obbligatori mancanti: nome, email, marca, modello' }, 422);
  }
  const emailOk = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
  if (!emailOk) {
    return json({ ok: false, error: 'Email non valida: ' + email }, 422);
  }

  /* API key */
  const apiKey = env.FD_API_KEY;
  if (!apiKey) {
    return json({ ok: false, error: 'FD_API_KEY non configurata nel Worker — aggiungila in Impostazioni → Variabili' }, 500);
  }

  /* descrizione HTML */
  const r = (label, val) =>
    val ? `<tr>
      <td style="padding:4px 14px 4px 0;color:#555;font-size:13px;white-space:nowrap"><b>${label}</b></td>
      <td style="font-size:13px">${val}</td>
    </tr>` : '';

  const descrizione = `
<h3 style="color:#1c2532;margin:0 0 14px">Richiesta Noleggio a Lungo Termine</h3>
<table cellpadding="0" cellspacing="0" style="border-collapse:collapse">
  ${r('Tipo',           tipo)}
  ${r('Azienda / Nome', nome)}
  ${r('P.IVA / C.F.',   piva)}
  ${r('Referente',      referente)}
  ${r('Telefono',       tel)}
  ${r('Email',          email)}
  <tr><td colspan="2" style="padding:10px 0">
    <hr style="border:none;border-top:1px solid #e0e0e0">
  </td></tr>
  ${r('Marca',          marca)}
  ${r('Modello',        modello)}
  ${r('Durata',         durata ? durata + ' mesi' : '')}
  ${r('Km contratto',   km ? km + ' km' : '')}
  ${r('Franchigia',     franchigia)}
  ${r('Note',           note)}
</table>`;

  const subject = `NLT — ${marca} ${modello} | ${durata || '?'} mesi`;

  const payload = {
    subject,
    description : descrizione,
    email,
    name        : referente,
    phone       : tel,
    priority    : 2,
    status      : 2,
    tags        : ['nlt', 'noleggio-lungo-termine'],
  };

  /* chiamata Freshdesk */
  let fdRes;
  try {
    fdRes = await fetch(FD_ENDPOINT, {
      method  : 'POST',
      headers : {
        'Content-Type'  : 'application/json',
        'Authorization' : 'Basic ' + btoa(apiKey + ':X'),
      },
      body: JSON.stringify(payload),
    });
  } catch (err) {
    return json({ ok: false, error: 'Errore rete verso Freshdesk: ' + err.message }, 502);
  }

  const fdBody = await fdRes.json().catch(() => ({}));

  if (fdRes.status === 201) {
    return json({ ok: true, ticket_id: fdBody.id }, 201);
  }

  /* log errore Freshdesk dettagliato */
  const fdError = fdBody?.errors?.[0]?.message || fdBody?.description || JSON.stringify(fdBody);
  return json({ ok: false, status: fdRes.status, error: 'Freshdesk: ' + fdError }, fdRes.status);
}

/* ── helpers ─────────────────────────────────── */
function corsHeaders() {
  return {
    'Access-Control-Allow-Origin' : '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  };
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', ...corsHeaders() },
  });
}
