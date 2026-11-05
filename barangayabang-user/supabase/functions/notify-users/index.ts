import { createClient } from 'npm:@supabase/supabase-js@2';

const ADMIN_EMAIL = 'mecaellacorcotchia15@gmail.com';
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, apikey, content-type, x-client-info',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

type NotificationRequest = {
  type: 'document_status' | 'complaint_status' | 'document_received' | 'complaint_received' | 'announcement';
  recordId: string;
};

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

function getSecretKey() {
  const legacy = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (legacy) return legacy;
  const keys = JSON.parse(Deno.env.get('SUPABASE_SECRET_KEYS') || '{}');
  return keys.default as string | undefined;
}

function getPortalUrl() {
  return (Deno.env.get('PUBLIC_SITE_URL') || 'http://127.0.0.1:4173/pages/user/index.html').replace(/\/$/, '');
}

function portalLink(hash: string) {
  const base = getPortalUrl();
  const path = base.includes('#') ? base.slice(0, base.indexOf('#')) : base;
  return `${path}#${hash}`;
}

function base64(bytes: Uint8Array) {
  let binary = '';
  for (let i = 0; i < bytes.length; i += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  }
  return btoa(binary);
}

function base64Url(bytes: Uint8Array) {
  return base64(bytes).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/, '');
}

function encodeSubject(value: string) {
  return `=?UTF-8?B?${base64(new TextEncoder().encode(value.replace(/[\r\n]/g, ' ')))}?=`;
}

function encodeBody(value: string) {
  return base64(new TextEncoder().encode(value)).replace(/.{1,76}/g, '$&\r\n').trim();
}

function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, (char) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  }[char] || char));
}

function htmlEmail(greeting: string, paragraphs: string[], linkUrl: string, linkLabel: string) {
  const blocks = paragraphs
    .filter(Boolean)
    .map((paragraph) => `<p style="margin:0 0 16px;line-height:1.6">${escapeHtml(paragraph).replaceAll('\n', '<br>')}</p>`)
    .join('');
  return `<!doctype html>
<html lang="en">
  <body style="margin:0;padding:24px;background:#f4f8fb;color:#17344b;font-family:Segoe UI,Arial,sans-serif">
    <article style="max-width:560px;margin:0 auto;padding:24px;background:#fff;border:1px solid #d5e3ee;border-radius:12px">
      <header>
        <p style="margin:0 0 8px;font-size:12px;letter-spacing:.08em;color:#61798b">BARANGAY ABANG</p>
        <h1 style="margin:0 0 16px;font-size:20px">${escapeHtml(greeting)}</h1>
      </header>
      ${blocks}
      <p style="margin:24px 0 0">
        <a href="${escapeHtml(linkUrl)}" style="display:inline-block;padding:10px 16px;background:#1876d1;color:#fff;text-decoration:none;border-radius:8px">${escapeHtml(linkLabel)}</a>
      </p>
      <p style="margin:16px 0 0;font-size:12px;color:#61798b">If the button does not open, copy this address into your browser:<br>${escapeHtml(linkUrl)}</p>
      <footer style="margin-top:24px;font-size:12px;color:#61798b">
        <p>Barangay Abang, Lucban, Quezon</p>
      </footer>
    </article>
  </body>
</html>`;
}

function plainEmail(greeting: string, paragraphs: string[], linkUrl: string, linkLabel: string) {
  return [`${greeting}`, '', ...paragraphs, '', `${linkLabel}: ${linkUrl}`, '', 'Barangay Abang, Lucban, Quezon'].join('\n');
}

async function getGmailAccessToken() {
  const clientId = Deno.env.get('GMAIL_CLIENT_ID');
  const clientSecret = Deno.env.get('GMAIL_CLIENT_SECRET');
  const refreshToken = Deno.env.get('GMAIL_REFRESH_TOKEN');
  const sender = Deno.env.get('GMAIL_SENDER_EMAIL')?.toLowerCase();
  if (!clientId || !clientSecret || !refreshToken || sender !== ADMIN_EMAIL) {
    throw new Error('Gmail sender is not configured in Supabase Secrets.');
  }

  const response = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: refreshToken,
      grant_type: 'refresh_token',
    }),
  });
  const result = await response.json();
  if (!response.ok || !result.access_token) {
    throw new Error('Could not authorize the configured Gmail sender.');
  }
  return result.access_token as string;
}

async function sendGmail(accessToken: string, to: string, subject: string, text: string, html: string) {
  const safeRecipient = to.trim();
  if (!/^[^\s<>@]+@[^\s<>@]+\.[^\s<>@]+$/.test(safeRecipient)) {
    throw new Error('Recipient email address is invalid.');
  }
  const boundary = `barangay_${crypto.randomUUID().replaceAll('-', '')}`;
  const mime = [
    `From: Barangay Abang <${ADMIN_EMAIL}>`,
    `To: ${safeRecipient}`,
    `Subject: ${encodeSubject(subject)}`,
    'MIME-Version: 1.0',
    `Content-Type: multipart/alternative; boundary="${boundary}"`,
    '',
    `--${boundary}`,
    'Content-Type: text/plain; charset=UTF-8',
    'Content-Transfer-Encoding: base64',
    '',
    encodeBody(text),
    `--${boundary}`,
    'Content-Type: text/html; charset=UTF-8',
    'Content-Transfer-Encoding: base64',
    '',
    encodeBody(html),
    `--${boundary}--`,
  ].join('\r\n');

  const response = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/messages/send', {
    method: 'POST',
    headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ raw: base64Url(new TextEncoder().encode(mime)) }),
  });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error?.message || 'Gmail could not send the message.');
  return result.id as string | undefined;
}

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (request.method !== 'POST') return jsonResponse({ error: 'Method not allowed.' }, 405);

  const authHeader = request.headers.get('Authorization');
  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const publishableKeys = JSON.parse(Deno.env.get('SUPABASE_PUBLISHABLE_KEYS') || '{}');
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY') || publishableKeys.default;
  const serviceKey = getSecretKey();
  if (!authHeader || !supabaseUrl || !anonKey || !serviceKey) {
    return jsonResponse({ error: 'Supabase function authentication is not configured.' }, 500);
  }

  const caller = createClient(supabaseUrl, anonKey, { global: { headers: { Authorization: authHeader } } });
  const token = authHeader.replace(/^Bearer\s+/i, '');
  const { data: userData, error: userError } = await caller.auth.getUser(token);
  if (userError || !userData.user) return jsonResponse({ error: 'Sign in as the approved admin first.' }, 401);
  const { data: isAdmin, error: adminError } = await caller.rpc('is_admin');
  const approvedAdmin = !adminError && isAdmin === true && userData.user.email?.toLowerCase() === ADMIN_EMAIL;

  let payload: NotificationRequest;
  try {
    payload = await request.json();
  } catch {
    return jsonResponse({ error: 'Invalid request body.' }, 400);
  }
  if (!['document_status', 'complaint_status', 'document_received', 'complaint_received', 'announcement'].includes(payload.type) ||
      !/^[0-9a-f-]{36}$/i.test(payload.recordId || '')) {
    return jsonResponse({ error: 'Invalid notification type or record ID.' }, 400);
  }
  const isReceipt = payload.type === 'document_received' || payload.type === 'complaint_received';
  if (!isReceipt && !approvedAdmin) return jsonResponse({ error: 'Only the approved admin can send portal email.' }, 403);

  const admin = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
  let recipients: Array<{ email: string; full_name: string }> = [];
  let subject = '';
  let greeting = '';
  let paragraphs: string[] = [];
  let linkHash = 'home';
  let linkLabel = 'Open Barangay Abang portal';
  const eventType = payload.type;

  if (payload.type === 'announcement') {
    const { data: announcement, error } = await admin.from('announcements')
      .select('id,title,body,kind,published').eq('id', payload.recordId).maybeSingle();
    if (error) return jsonResponse({ error: 'Could not load the announcement.' }, 500);
    if (!announcement?.published) return jsonResponse({ error: 'Announcement was not found or is not published.' }, 404);
    const { data: profiles, error: profilesError } = await admin.from('profiles')
      .select('email,full_name').not('email', 'is', null).neq('email', ADMIN_EMAIL);
    if (profilesError) return jsonResponse({ error: 'Could not load recipient addresses.' }, 500);
    recipients = (profiles || []).filter((profile) => profile.email).map((profile) => ({
      email: profile.email,
      full_name: profile.full_name || 'Resident',
    }));
    subject = `Barangay Abang ${announcement.kind || 'Announcement'}: ${announcement.title}`;
    greeting = announcement.title;
    paragraphs = [announcement.body, 'Open the public portal to read this announcement on the website.'];
    linkHash = 'announcements';
    linkLabel = 'View announcement on the website';
  } else {
    const isDocument = payload.type === 'document_status' || payload.type === 'document_received';
    const table = isDocument ? 'document_requests' : 'complaints';
    const { data: record, error } = await admin.from(table)
      .select('id,user_id,status,admin_notes,document_type,purpose,subject').eq('id', payload.recordId).maybeSingle();
    if (error) return jsonResponse({ error: 'Could not load the updated record.' }, 500);
    if (!record) return jsonResponse({ error: 'Updated record was not found.' }, 404);
    if (isReceipt && record.user_id !== userData.user.id) {
      return jsonResponse({ error: 'You can only send an email for your own submission.' }, 403);
    }
    const { data: profile, error: profileError } = await admin.from('profiles')
      .select('email,full_name').eq('id', record.user_id).maybeSingle();
    if (profileError) return jsonResponse({ error: 'Could not load the resident email address.' }, 500);
    if (profile?.email) recipients = [{ email: profile.email, full_name: profile.full_name || 'Resident' }];
    const name = profile?.full_name || 'Resident';
    greeting = `Hello ${name}`;
    if (payload.type === 'document_received') {
      subject = `We received your ${record.document_type} request`;
      paragraphs = [
        `Your request for ${record.document_type} has been received. The barangay will review it and email you again when the status changes.`,
        record.purpose ? `Purpose: ${record.purpose}` : '',
        'Open the portal to track this request on the website.',
      ];
      linkHash = 'documents';
      linkLabel = 'Track your document request';
    } else if (payload.type === 'complaint_received') {
      subject = `We received your complaint: ${record.subject}`;
      paragraphs = [
        'Your complaint has been received by Barangay Abang. Staff will review it and email you again when the status changes.',
        `Subject: ${record.subject}`,
        'Open the portal to track this concern on the website.',
      ];
      linkHash = 'complaints';
      linkLabel = 'Track your complaint';
    } else if (payload.type === 'document_status') {
      const done = record.status === 'Completed' || record.status === 'Approved';
      subject = done
        ? `Your ${record.document_type} request is ${record.status.toLowerCase()}`
        : `Document request update: ${record.document_type}`;
      paragraphs = [
        done
          ? `Your ${record.document_type} request is ${record.status.toLowerCase()}. ${record.status === 'Completed' ? 'You can now review it in the portal and follow any pickup instructions from the barangay office.' : 'The barangay has approved it for processing.'}`
          : `Your ${record.document_type} request status is now: ${record.status}.`,
        record.admin_notes ? `Admin note: ${record.admin_notes}` : '',
        'Open the portal to see this update on the website.',
      ];
      linkHash = 'documents';
      linkLabel = 'Open your document request';
    } else {
      subject = `Complaint update: ${record.subject}`;
      paragraphs = [
        `Your complaint status is now: ${record.status}.`,
        record.admin_notes ? `Admin note: ${record.admin_notes}` : '',
        'Open the portal to see this update on the website.',
      ];
      linkHash = 'complaints';
      linkLabel = 'Open your complaint';
    }
  }

  if (!recipients.length) return jsonResponse({ sent: 0, failed: 0, message: 'No email recipients were found.' });

  const linkUrl = portalLink(linkHash);
  const text = plainEmail(greeting, paragraphs.filter(Boolean), linkUrl, linkLabel);
  const html = htmlEmail(greeting, paragraphs.filter(Boolean), linkUrl, linkLabel);

  let accessToken: string;
  try {
    accessToken = await getGmailAccessToken();
  } catch (error) {
    return jsonResponse({ error: error instanceof Error ? error.message : 'Gmail is not configured.' }, 503);
  }

  let sent = 0;
  let failed = 0;
  for (const recipient of recipients) {
    let status: 'sent' | 'failed' = 'failed';
    let providerMessageId: string | undefined;
    let errorMessage: string | null = null;
    try {
      providerMessageId = await sendGmail(accessToken, recipient.email, subject, text, html);
      status = 'sent';
      sent++;
    } catch (error) {
      failed++;
      errorMessage = error instanceof Error ? error.message : 'Email could not be sent.';
      console.error('Email send failed:', errorMessage);
    }
    await admin.from('notification_log').insert({
      recipient_email: recipient.email,
      event_type: eventType,
      record_id: payload.recordId,
      send_status: status,
      provider_message_id: providerMessageId || null,
      error_message: errorMessage,
      sent_at: status === 'sent' ? new Date().toISOString() : null,
    });
  }

  return jsonResponse({ sent, failed, total: recipients.length });
});
