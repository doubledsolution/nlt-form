/**
 * Cloudflare Worker — NLT API Proxy → Freshdesk
 * Solo /api/ticket (POST) — GitHub Pages serve l'HTML
 *
 * Variabile d'ambiente richiesta:
 *   FD_API_KEY  →  API key Freshdesk (cifrata)
 */

const FD_ENDPOINT = 'https://doubledsolution.freshdesk.com/api/v2/tickets';

const CORS = {
  'Access-Control-Allow-Origin' : '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

export default {
  async fetch(request, env) {

    /* ── Preflight CORS ────────────────────────── */
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: CORS });
    }

    /* ── Solo POST /api/ticket ─────────────────── */
    const url = new URL(request.url);
    if (url.pathname !== '/api/ticket' || request.method !== 'POST') {
      return new Response(JSON.stringify({ error: 'Not found' }), {
        status: 404,
        headers: { 'Content-Type': 'application/json', ...CORS },
      });
    }

    /* ── Leggi payload ─────────────────────────── */
    let body;
    try { body = await request.json(); }
    catch { return fail('Payload JSON non valido', 400); }

    const nome  = body.nome  || '';
    const email = body.email || '';
    const marca = body.marca || '';
    const modello = body.modello || '';

    if (!nome || !email || !marca || !modello) {
      return fail('Campi obbligatori mancanti: nome, email, marca, modello', 422);
    }

    /* ── FD_API_KEY ────────────────────────────── */
    const apiKey = env.FD_API_KEY;
    if (!apiKey) return fail('FD_API_KEY non configurata in Cloudflare → Variabili e segreti', 500);

    /* ── Costruisci descrizione HTML ───────────── */
    const rr = (l, v) => v
      ? `<tr><td style="padding:3px 14px 3px 0;color:#555;font-size:13px"><b>${l}</b></td><td style="font-size:13px">${v}</td></tr>`
      : '';

    const desc = `
<h3 style="color:#0d1e90;margin:0 0 12px">Richiesta NLT</h3>
<table cellpadding="0" cellspacing="0">
  ${rr('Tipo',         body.tipo)}
  ${rr('Azienda/Nome', nome)}
  ${rr('P.IVA/C.F.',   body.piva)}
  ${rr('Referente',    body.ref || body.referente)}
  ${rr('Telefono',     body.tel)}
  ${rr('Email',        email)}
  <tr><td colspan="2"><hr style="border:none;border-top:1px solid #ddd;margin:8px 0"></td></tr>
  ${rr('Marca',        marca)}
  ${rr('Modello',      modello)}
  ${rr('Durata',       body.durata ? body.durata+' mesi' : '')}
  ${rr('Km',           body.km ? body.km+' km' : '')}
  ${rr('Franchigia',   body.fr || body.franchigia)}
  ${rr('Note',         body.note)}
</table>`;

    /* ── Chiamata Freshdesk ─────────────────────── */
    let res;
    try {
      res = await fetch(FD_ENDPOINT, {
        method : 'POST',
        headers: {
          'Content-Type' : 'application/json',
          'Authorization': 'Basic ' + btoa(apiKey + ':X'),
        },
        body: JSON.stringify({
          subject    : `NLT — ${marca} ${modello} | ${body.durata||'?'} mesi`,
          description: desc,
          email,
          name       : body.ref || body.referente || nome,
          phone      : body.tel || '',
          priority   : 2,
          status     : 2,
          tags       : ['nlt','noleggio-lungo-termine'],
        }),
      });
    } catch (e) {
      return fail('Errore rete verso Freshdesk: ' + e.message, 502);
    }

    const fd = await res.json().catch(() => ({}));

    if (res.status === 201) {
      return ok({ ok: true, ticket_id: fd.id });
    }

    const errMsg = fd?.errors?.[0]?.message || fd?.description || JSON.stringify(fd);
    return fail('Freshdesk: ' + errMsg, res.status);
  },
};

function ok(data)         { return new Response(JSON.stringify(data), { status: 201, headers: { 'Content-Type':'application/json', ...CORS } }); }
function fail(msg, status){ return new Response(JSON.stringify({ ok:false, error:msg }), { status, headers: { 'Content-Type':'application/json', ...CORS } }); }
