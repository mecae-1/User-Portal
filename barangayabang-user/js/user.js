/* =====================================================================
   Barangay Abang · User Portal
   ---------------------------------------------------------------------
   One-page app rendered into <div id="app">.
   Sections in this file:
     1. Config & state
     2. Helpers
     3. Data loading (Supabase)
     4. Navigation
     5. Templates: shared layout (header, footer, icons)
     6. Templates: pages (home, announcements, documents, complaints,
        profile, login/signup)
     7. Actions (form submits, modal, menu, dark mode, avatar, sign out)
     8. Event wiring (one delegated listener per event type)
     9. Boot
   Every button uses a data-action attribute and every form uses a
   data-form attribute, so nothing depends on inline onclick handlers.
   ===================================================================== */

'use strict';

/* ---------------------------------------------------------------------
   1. Config & state
   --------------------------------------------------------------------- */

const sb = window.appSupabase;
const SEAL = '../../assets/barangay-seal.jpg';
const DARK_MODE_KEY = 'barangay-abang-dark-mode';

const VIEWS = ['home', 'profile', 'documents', 'complaints', 'announcements', 'login', 'signup'];
const PROTECTED_VIEWS = ['profile', 'documents', 'complaints'];
const AUTH_VIEWS = ['login', 'signup'];

const FALLBACK_ANNOUNCEMENTS = [
  {
    title: 'Barangay Assembly Meeting',
    text: 'Residents are invited to attend the barangay assembly at the Barangay Hall.',
    date: 'Aug 30, 2026',
    type: 'Announcement',
    icon: '📣'
  },
  {
    title: 'Community Clean-up Drive',
    text: 'Join your neighbors for the community clean-up. Contact the Barangay Hall for details.',
    date: 'Aug 28, 2026',
    type: 'Event',
    icon: '▦'
  }
];

const DOCUMENT_TABS = ['Request Documents', 'My Requests', 'Certificates', 'History'];

/* Each field: [name, label, kind = 'text', required = true] */
const DOCUMENT_FORMS = {
  'Certificate of Indigency': {
    requirements: ['Pangalan', 'Cedula', 'Purpose'],
    fields: [['name', 'Pangalan'], ['cedula', 'Cedula'], ['purpose', 'Purpose']]
  },
  'Barangay Clearance': {
    requirements: ['Pangalan', 'Cedula', 'Purpose'],
    fields: [['name', 'Pangalan'], ['cedula', 'Cedula'], ['purpose', 'Purpose']]
  },
  'Barangay Certificate': {
    requirements: ['Pangalan', 'Cedula'],
    fields: [['name', 'Pangalan'], ['cedula', 'Cedula']]
  },
  'Certificate of Residency': {
    requirements: ['Pangalan', 'Cedula', 'Ilang taon nang naninirahan sa barangay'],
    fields: [['name', 'Pangalan'], ['cedula', 'Cedula'], ['years', 'Ilang taon nang naninirahan', 'number']]
  },
  'BPO (Barangay Protection Order)': {
    requirements: [
      'Application o salaysay ng victim-survivor',
      'Pangalan at huling alam na address ng respondent, kung alam',
      'Petsa, oras, lugar, at detalye ng insidente',
      'Iba pang impormasyon o ebidensiyang makatutulong, kung mayroon'
    ],
    fields: [
      ['application', 'Application o salaysay ng victim-survivor', 'textarea'],
      ['respondent', 'Pangalan ng respondent, kung alam', 'text', false],
      ['respondentAddress', 'Huling alam na address ng respondent, kung alam', 'text', false],
      ['incidentDate', 'Petsa ng insidente', 'date'],
      ['incidentTime', 'Oras ng insidente', 'time'],
      ['incidentPlace', 'Lugar ng insidente'],
      ['incidentDetails', 'Detalye ng insidente', 'textarea'],
      ['otherEvidence', 'Iba pang impormasyon o ebidensiya (opsyonal)', 'textarea', false]
    ]
  },
  'Salaysay (Sinumpaang Salaysay o Statement)': {
    requirements: [
      'Valid ID ng nagsasalaysay',
      'Buong pangalan at address',
      'Petsa, oras, at lugar ng pangyayari',
      'Kumpletong detalye ng insidente',
      'Mga pangalan ng taong sangkot o saksi, kung mayroon',
      'Mga kaugnay na ebidensiya, kung mayroon'
    ],
    fields: [
      ['validId', 'Uri ng ID', 'select'],
      ['name', 'Buong pangalan'],
      ['address', 'Address'],
      ['eventDate', 'Petsa ng pangyayari', 'date'],
      ['eventTime', 'Oras ng pangyayari', 'time'],
      ['eventPlace', 'Lugar ng pangyayari'],
      ['incidentDetails', 'Kumpletong detalye ng insidente', 'textarea'],
      ['people', 'Mga taong sangkot o saksi, kung mayroon', 'textarea', false],
      ['evidence', 'Mga kaugnay na ebidensiya, kung mayroon', 'textarea', false]
    ]
  },
  'Pagpapatunay (Certification/Verification)': {
    requirements: ['Cedula', 'Pangalan', 'Address'],
    fields: [['cedula', 'Cedula'], ['name', 'Pangalan'], ['address', 'Address']]
  }
};

const DOCUMENT_TYPES = Object.keys(DOCUMENT_FORMS);

const ID_TYPES = [
  'TIN ID', "Driver's License", 'PhilHealth ID', 'National/PhilSys ID', 'Passport',
  'SSS ID', 'GSIS eCard/ID', 'PRC ID', 'Postal ID', "Voter's ID", 'UMID',
  'Barangay ID', 'Seafarer ID', 'ACR I-Card', 'PWD ID', 'Senior Citizen ID', 'Other'
];

const state = {
  user: null,
  view: 'home',
  pendingView: null,
  docTab: 'Request Documents',
  selectedDocument: '',
  requests: [],
  complaints: [],
  announcements: FALLBACK_ANNOUNCEMENTS,
  profileMenuOpen: false,
  darkMode: localStorage.getItem(DARK_MODE_KEY) === 'true',
  lastFocus: null
};

const app = document.querySelector('#app');

/* ---------------------------------------------------------------------
   2. Helpers
   --------------------------------------------------------------------- */

function esc(value) {
  const map = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
  return String(value ?? '').replace(/[&<>"']/g, ch => map[ch]);
}

function formatDate(value) {
  return new Date(value).toLocaleDateString('en', { month: 'short', day: '2-digit', year: 'numeric' });
}

function initials(name) {
  return (name || 'U').split(' ').filter(Boolean).map(part => part[0]).slice(0, 2).join('');
}

function explainError(error) {
  return error?.message || 'Something went wrong. Please try again.';
}

let toastTimer = null;
function toast(message) {
  const region = document.querySelector('#toast');
  if (!region) return;
  region.innerHTML = `<p class="toast">${esc(message)}</p>`;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { region.innerHTML = ''; }, 3800);
}

/* Disable a form's submit button while an async action runs. */
async function withBusy(form, busyLabel, task) {
  const button = form?.querySelector('[type="submit"]');
  const label = button?.textContent;
  if (button) {
    button.disabled = true;
    button.textContent = busyLabel;
  }
  try {
    await task();
  } catch (error) {
    console.error(error);
    toast(explainError(error));
  } finally {
    if (button && button.isConnected) {
      button.disabled = false;
      button.textContent = label;
    }
  }
}

function requireSupabase() {
  if (sb) return true;
  toast('Online services are unavailable. Check your internet connection and reload.');
  return false;
}

/* ---------------------------------------------------------------------
   3. Data loading (Supabase)
   --------------------------------------------------------------------- */

async function loadUser() {
  if (!sb) return;
  const { data: { user: authUser }, error } = await sb.auth.getUser();
  if (error || !authUser) {
    state.user = null;
    return;
  }

  const metadata = authUser.user_metadata || {};
  const { data: profile, error: profileError } = await sb
    .from('profiles')
    .select('id,email,full_name,username,announcement_email_opt_in,avatar_path')
    .eq('id', authUser.id)
    .maybeSingle();

  if (profileError) {
    toast('Could not load your profile: ' + explainError(profileError));
    state.user = {
      id: authUser.id,
      email: authUser.email || '',
      name: metadata.full_name || authUser.email || '',
      username: metadata.username || '',
      avatarUrl: metadata.avatar_url || ''
    };
    return;
  }

  let avatarUrl = '';
  if (profile?.avatar_path) {
    const { data } = await sb.storage.from('avatars').createSignedUrl(profile.avatar_path, 3600);
    avatarUrl = data?.signedUrl || '';
  }

  state.user = {
    id: authUser.id,
    email: authUser.email || profile?.email || '',
    name: profile?.full_name || metadata.full_name || authUser.email || '',
    username: profile?.username || metadata.username || '',
    avatarUrl,
    avatarPath: profile?.avatar_path || '',
    announcement_email_opt_in: profile?.announcement_email_opt_in || false
  };
}

async function loadAnnouncements() {
  if (!sb) return;
  const { data, error } = await sb
    .from('announcements')
    .select('id,title,body,kind,published_at')
    .eq('published', true)
    .order('published_at', { ascending: false });

  if (error) {
    console.warn('Could not load announcements:', error.message);
    return;
  }

  state.announcements = (data || []).map(item => ({
    id: item.id,
    title: item.title,
    text: item.body,
    date: item.published_at ? formatDate(item.published_at) : 'Recently',
    type: item.kind,
    icon: item.kind === 'Event' ? '▦' : '📣'
  }));

  if (state.view === 'home' || state.view === 'announcements') render();
}

async function loadRequests() {
  if (!sb || !state.user) return;
  const { data, error } = await sb
    .from('document_requests')
    .select('id,document_type,purpose,status,admin_notes,created_at,updated_at')
    .order('created_at', { ascending: false });

  if (error) {
    toast('Could not load document requests: ' + explainError(error));
    return;
  }

  state.requests = (data || []).map(row => ({
    id: row.id,
    type: row.document_type,
    purpose: row.purpose,
    status: row.status,
    notes: row.admin_notes,
    date: formatDate(row.created_at),
    updated_at: row.updated_at
  }));

  if (state.view === 'documents') render();
}

async function loadComplaints() {
  if (!sb || !state.user) return;
  const { data, error } = await sb
    .from('complaints')
    .select('id,subject,details,status,admin_notes,created_at,updated_at')
    .order('created_at', { ascending: false });

  if (error) {
    toast('Could not load complaints: ' + explainError(error));
    return;
  }

  state.complaints = (data || []).map(row => ({
    id: row.id,
    subject: row.subject,
    details: row.details,
    status: row.status,
    notes: row.admin_notes,
    date: formatDate(row.created_at),
    updated_at: row.updated_at
  }));

  if (state.view === 'complaints') render();
}

/* ---------------------------------------------------------------------
   4. Navigation
   --------------------------------------------------------------------- */

function currentHash() {
  return decodeURIComponent((location.hash || '#home').slice(1));
}

function syncHash() {
  const next = '#' + state.view;
  if (location.hash !== next) history.replaceState(null, '', next);
}

function setView(next, fromHash = false) {
  const previous = state.view;
  state.profileMenuOpen = false;

  if (!VIEWS.includes(next)) next = 'home';
  if (PROTECTED_VIEWS.includes(next) && !state.user) {
    state.pendingView = next;
    next = 'login';
    fromHash = false;
  }

  state.view = next;
  if (!fromHash) syncHash();
  render();
  if (previous !== next) window.scrollTo({ top: 0 });

  if (next === 'home' || next === 'announcements') loadAnnouncements();
  if (next === 'documents') loadRequests();
  if (next === 'complaints') loadComplaints();
}

/* ---------------------------------------------------------------------
   5. Templates: shared layout
   --------------------------------------------------------------------- */

function navItems() {
  const guest = [['Home', 'home'], ['Announcements', 'announcements']];
  const member = [
    ['Home', 'home'], ['My Profile', 'profile'], ['Documents', 'documents'],
    ['Complaints', 'complaints'], ['Announcements', 'announcements']
  ];
  return state.user ? member : guest;
}

function avatarMarkup(extraClass = '') {
  const { user } = state;
  return user.avatarUrl
    ? `<span class="avatar ${extraClass}"><img src="${esc(user.avatarUrl)}" alt=""></span>`
    : `<span class="avatar ${extraClass}">${esc(initials(user.name))}</span>`;
}

function profileMenu() {
  const { user, profileMenuOpen, darkMode } = state;
  return `
    <div class="profile-wrap">
      <button class="profile-trigger" type="button" data-action="toggle-profile-menu"
        aria-expanded="${profileMenuOpen}" aria-controls="profileMenu">
        ${avatarMarkup()}
        <span class="profile-name">${esc(user.name)}</span>
        <span class="caret" aria-hidden="true">▼</span>
      </button>
      <div class="profile-menu" id="profileMenu" ${profileMenuOpen ? '' : 'hidden'}>
        <p class="menu-user">${esc(user.name)}</p>
        <button type="button" data-action="toggle-dark-mode" aria-pressed="${darkMode}">
          <span aria-hidden="true">🌓</span> ${darkMode ? 'Light' : 'Dark'} mode
        </button>
        <button type="button" data-action="go" data-view="profile">
          <span aria-hidden="true">👤</span> Customize profile
        </button>
        <button type="button" class="logout-item" data-action="sign-out">
          <span aria-hidden="true">🚪</span> Log out
        </button>
      </div>
    </div>`;
}

function siteHeader() {
  const links = navItems().map(([label, hash]) => {
    const current = state.view === hash;
    return `<li><a href="#${hash}" class="${current ? 'active' : ''}" ${current ? 'aria-current="page"' : ''}>${label}</a></li>`;
  }).join('');

  const actions = state.user
    ? profileMenu()
    : `<div class="guest-actions">
         <a class="btn" href="#login">Log In</a>
         <a class="btn primary" href="#signup">Sign Up</a>
       </div>`;

  return `
    <header class="top">
      <a class="brand" href="#home">
        <img src="${SEAL}" alt="Official seal of Barangay Abang">
        <strong>Barangay Abang</strong>
      </a>
      <nav class="topnav" aria-label="Primary">
        <ul>${links}</ul>
      </nav>
      ${actions}
    </header>`;
}

function siteFooter() {
  return `
    <footer class="footer">
      <div class="footer-top">
        <section aria-label="About Barangay Abang">
          <div class="footer-brand">
            <img src="${SEAL}" alt="Official seal of Barangay Abang">
            <div><strong>Barangay Abang</strong><small>Lucban, Quezon</small></div>
          </div>
          <p>A cleaner, safer, and more progressive Barangay Abang for a better tomorrow.</p>
        </section>
        <nav aria-labelledby="footerLinksTitle">
          <h2 id="footerLinksTitle">Quick Links</h2>
          <ul class="footer-nav">
            <li><a href="#home">Home</a></li>
            <li><a href="#announcements">Announcements</a></li>
            <li><a href="#documents">Services</a></li>
            <li><a href="#complaints">Contact</a></li>
          </ul>
        </nav>
        <section aria-labelledby="footerContactTitle">
          <h2 id="footerContactTitle">Contact Us</h2>
          <address>Barangay Abang, Lucban, Quezon<br>Official contact details to be configured</address>
        </section>
        <section aria-labelledby="footerSocialTitle">
          <h2 id="footerSocialTitle">Follow Us</h2>
          <p>Official social channels will be added by the barangay.</p>
        </section>
      </div>
      <p class="footer-bottom">
        <small>© 2026 Barangay Abang. All rights reserved.</small>
        <small>Barangay Abang Information Portal</small>
      </p>
    </footer>`;
}

function eyeIcon(slash = false) {
  const paths = slash
    ? '<path d="m3 3 18 18"/><path d="M10.6 10.6a2 2 0 0 0 2.8 2.8"/><path d="M9.9 5.2A10.8 10.8 0 0 1 12 5c6 0 9.5 7 9.5 7a14.8 14.8 0 0 1-3.1 3.8"/><path d="M6.2 6.2C3.8 7.8 2.5 12 2.5 12s3.5 7 9.5 7a10 10 0 0 0 3-.5"/>'
    : '<path d="M2.5 12s3.5-7 9.5-7 9.5 7 9.5 7-3.5 7-9.5 7-9.5-7-9.5-7Z"/><circle cx="12" cy="12" r="2.7"/>';
  return `<svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${paths}</svg>`;
}

const HALL_ILLUSTRATION = `
  <svg viewBox="0 0 320 170" role="img" aria-label="Illustration of a barangay hall">
    <path fill="#8cd1b5" d="M20 170V94q0-24 20-24t20 24v76M260 170V84q0-22 20-22t20 22v86"/>
    <path stroke="#438d70" stroke-width="4" fill="none" d="M40 80v90M280 72v98M24 111h32m-28 20h28m-11-45 12-13m-17 13L28 72m244 25h31m-28 20h28m-12-45 13-13m-18 13-16-17"/>
    <path fill="#fff" stroke="#9fc8df" stroke-width="3" d="M91 78h140v92H91z"/>
    <path fill="#3184d8" d="m75 82 86-66 86 66h-25l-61-46-61 46z"/>
    <path fill="#dcefff" d="M104 91h114v79H104z"/>
    <path fill="#fff" stroke="#7fb4dc" stroke-width="3" d="M143 119h36v51h-36zM115 104h19v24h-19zm74 0h19v24h-19z"/>
    <path fill="#1c70c2" d="M157 27h9v16h-9z"/>
    <circle fill="#247bca" cx="161" cy="62" r="10"/>
    <path fill="#fff" d="M160 56h2v12h-2zm-4 4h10v2h-10z"/>
  </svg>`;

const AUTH_WAVES = `
  <svg viewBox="0 0 520 145" preserveAspectRatio="none" aria-hidden="true">
    <path fill="#c0e7e7" d="M0 40C90 82 143 107 250 75s177-25 270 2v68H0Z"/>
    <path fill="#92d1d5" d="M0 72c106 28 155 48 254 21 99-28 174-16 266 5v47H0Z"/>
    <path fill="#65b8c2" d="M0 106c94 9 160 26 259 5 95-20 181-17 261 1v33H0Z"/>
  </svg>`;

/* ---------------------------------------------------------------------
   6. Templates: pages
   --------------------------------------------------------------------- */

function tile(href, symbol, title, text) {
  return `
    <li>
      <a class="tile" href="${href}">
        <span class="symbol" aria-hidden="true">${symbol}</span>
        <strong>${title}</strong>
        <small>${text}</small>
      </a>
    </li>`;
}

function homePage() {
  const { user } = state;
  const greeting = user ? `Welcome, ${esc(user.name)}!` : 'Welcome to Barangay Abang!';
  const intro = user
    ? 'Access your barangay services conveniently and easily.'
    : 'Access barangay services, community announcements, and local information.';

  const tiles = user
    ? tile('#profile', '▣', 'My Profile', 'View and update your personal information') +
      tile('#documents', '▤', 'Request Document', 'Apply for barangay clearance, certificate and more') +
      tile('#complaints', '▤', 'Submit Complaint', 'Report concerns and blotter incidents') +
      tile('#announcements', '📣', 'Announcements', 'Latest news and events from the barangay')
    : tile('#announcements', '📣', 'Announcements', 'Read the latest news and events from the barangay') +
      tile('#login', '▤', 'Document Services', 'Sign in to request and track barangay documents') +
      tile('#login', '▣', 'Community Concerns', 'Sign in to submit and track a concern') +
      tile('#signup', '♙', 'Create an Account', 'Register to use barangay online services');

  return `
    <main class="main" id="main" tabindex="-1">
      <section class="hero" aria-labelledby="heroTitle">
        <div>
          <h1 id="heroTitle">${greeting}</h1>
          <p>${intro}</p>
          ${user ? '' : '<p class="hero-cta"><a class="btn primary" href="#signup">Create an account</a></p>'}
        </div>
        <figure class="hero-art">${HALL_ILLUSTRATION}</figure>
      </section>

      <nav aria-label="${user ? 'Resident services' : 'Public services'}">
        <ul class="tile-grid">${tiles}</ul>
      </nav>

      <section class="latest-announcements" aria-labelledby="latestTitle">
        <header class="section-title">
          <div>
            <h2 id="latestTitle">Latest Announcements</h2>
            <p>Updates and events from Barangay Abang</p>
          </div>
          <a class="btn" href="#announcements">View all</a>
        </header>
        ${announcementList(state.announcements.slice(0, 2), 3)}
      </section>

      ${user ? '' : '<p class="notice">Public information is available without an account. Sign in to request services or view your personal records.</p>'}
    </main>`;
}

function announcementList(items, headingLevel = 2) {
  if (!items.length) return '<p class="empty box">No public announcements right now.</p>';
  const h = `h${headingLevel}`;
  return `
    <ul class="announcement-list">
      ${items.map(item => `
        <li>
          <article class="announcement">
            <span class="announcement-icon" aria-hidden="true">${esc(item.icon)}</span>
            <div>
              <${h}>${esc(item.title)}</${h}>
              <p>${esc(item.text)}</p>
              <p><time>${esc(item.date)}</time></p>
            </div>
            <span class="tag ${item.type === 'Event' ? 'event' : ''}">${esc(item.type)}</span>
          </article>
        </li>`).join('')}
    </ul>`;
}

function announcementsPage() {
  return `
    <main class="main" id="main" tabindex="-1">
      <header class="section-title">
        <div>
          <h1>Announcements &amp; Events</h1>
          <p>News and activities from Barangay Abang.</p>
        </div>
      </header>
      ${announcementList(state.announcements, 2)}
    </main>`;
}

/* ---- Documents ---- */

function documentsPage() {
  const { docTab, requests, selectedDocument } = state;
  const isRequestTab = docTab === 'Request Documents';

  const filtered =
    docTab === 'My Requests' ? requests.filter(r => ['Pending', 'Processing'].includes(r.status)) :
    docTab === 'Certificates' ? requests.filter(r => ['Approved', 'Completed'].includes(r.status)) :
    docTab === 'History' ? requests : [];

  const tabs = DOCUMENT_TABS.map(label => `
    <button type="button" class="${docTab === label ? 'active' : ''}" data-action="doc-tab"
      data-tab="${esc(label)}" aria-pressed="${docTab === label}">${label}</button>`).join('');

  const body = isRequestTab
    ? `<section class="form-shell document-request-shell" aria-labelledby="chooseDocTitle">
         <h2 id="chooseDocTitle">Choose a document</h2>
         <div class="field">
           <label for="documentType">Document type</label>
           <select id="documentType" data-change="document-type">
             <option value="">Select a document</option>
             ${DOCUMENT_TYPES.map(name => `<option value="${esc(name)}" ${name === selectedDocument ? 'selected' : ''}>${esc(name)}</option>`).join('')}
           </select>
         </div>
         <div id="documentFormArea">${documentFormArea(selectedDocument)}</div>
       </section>`
    : requestTable(filtered);

  return `
    <main class="main" id="main" tabindex="-1">
      <header class="section-title">
        <div>
          <h1>${isRequestTab ? 'Request a Document' : esc(docTab)}</h1>
          <p>Choose the document you need and complete its requirements.</p>
        </div>
      </header>
      <nav class="subnav" aria-label="Document sections">${tabs}</nav>
      ${isRequestTab ? '' : '<p class="notice">When the admin updates your request, an email with a link to this page is sent to your profile address from the barangay Gmail account.</p>'}
      ${body}
    </main>`;
}

function documentFormArea(type) {
  return type
    ? documentForm(type)
    : '<p class="empty">Choose a document type to see its requirements and application form.</p>';
}

function documentField([key, label, kind = 'text', required = true]) {
  const id = `doc-${key}`;
  const req = required ? 'required' : '';
  let control;

  if (kind === 'textarea') {
    control = `<textarea id="${id}" name="${key}" ${req}></textarea>`;
  } else if (kind === 'select') {
    control = `
      <select id="${id}" name="${key}" required data-change="id-type">
        <option value="">Select ID type</option>
        ${ID_TYPES.map(idType => `<option value="${esc(idType)}">${esc(idType)}</option>`).join('')}
      </select>
      <div class="field other-id-field" id="otherIdField" hidden>
        <label for="doc-otherIdType">Please specify the ID</label>
        <input id="doc-otherIdType" name="otherIdType">
      </div>`;
  } else {
    control = `<input id="${id}" name="${key}" type="${kind}" ${req} ${kind === 'number' ? 'min="0"' : ''}>`;
  }

  return `
    <div class="field">
      <label for="${id}">${esc(label)}${required ? '' : ' (opsyonal)'}</label>
      ${control}
    </div>`;
}

function documentForm(type) {
  const form = DOCUMENT_FORMS[type];
  if (!form) return '';

  // Cedula is brought to the office, so it is listed as a requirement, not a field.
  const requirements = form.requirements.includes('Cedula') ? ['Cedula'] : [];
  const fields = form.fields.filter(([key]) => key !== 'cedula');

  return `
    ${requirements.length ? `
      <aside class="document-requirements" aria-label="Requirements">
        <strong>Requirements</strong>
        <ul>${requirements.map(item => `<li>${esc(item)}</li>`).join('')}</ul>
      </aside>` : ''}
    <h3 class="document-form-title">${esc(type)}: Fill out the form</h3>
    <form data-form="document">
      <input type="hidden" name="documentType" value="${esc(type)}">
      ${fields.map(documentField).join('')}
      <button class="btn primary" type="submit">Submit request</button>
    </form>`;
}

function statusBadge(status, map) {
  return `<span class="status ${map[status] || ''}">${esc(status)}</span>`;
}

function requestTable(items) {
  if (!items.length) return '<p class="empty box">No requests in this section yet.</p>';
  const fallbackNote = status =>
    status === 'Completed' ? 'Ready for pickup' :
    status === 'Approved' ? 'Approved for processing' :
    status === 'Pending' ? 'Submitted' : 'Under review';

  return `
    <section class="box table-scroll" aria-label="${esc(state.docTab)}">
      <table>
        <caption class="visually-hidden">Your document requests</caption>
        <thead>
          <tr>
            <th scope="col">ID</th><th scope="col">Document</th><th scope="col">Date Requested</th>
            <th scope="col">Status</th><th scope="col">Update</th>
          </tr>
        </thead>
        <tbody>
          ${items.map(r => `
            <tr>
              <th scope="row">${esc(r.id.slice(0, 8))}</th>
              <td>${esc(r.type)}</td>
              <td>${esc(r.date)}</td>
              <td>${statusBadge(r.status, { Pending: 'pending', Processing: 'processing' })}</td>
              <td>${esc(r.notes || fallbackNote(r.status))}</td>
            </tr>`).join('')}
        </tbody>
      </table>
    </section>`;
}

/* ---- Complaints ---- */

function complaintsPage() {
  const { complaints } = state;
  const fallbackNote = status =>
    status === 'Resolved' ? 'Resolved' : status === 'Open' ? 'Received' : 'Being reviewed';

  const table = complaints.length
    ? `<section class="box table-scroll" aria-label="Your complaints">
         <table>
           <caption class="visually-hidden">Your filed complaints</caption>
           <thead>
             <tr>
               <th scope="col">ID</th><th scope="col">Subject</th><th scope="col">Date Filed</th>
               <th scope="col">Status</th><th scope="col">Update</th>
             </tr>
           </thead>
           <tbody>
             ${complaints.map(c => `
               <tr>
                 <th scope="row">${esc(c.id.slice(0, 8))}</th>
                 <td>${esc(c.subject)}</td>
                 <td>${esc(c.date)}</td>
                 <td>${statusBadge(c.status, { Open: 'open', 'In Progress': 'processing' })}</td>
                 <td>${esc(c.notes || fallbackNote(c.status))}</td>
               </tr>`).join('')}
           </tbody>
         </table>
       </section>`
    : '<p class="empty box">You have not filed a concern yet.</p>';

  return `
    <main class="main" id="main" tabindex="-1">
      <header class="section-title">
        <div>
          <h1>Complaints &amp; Concerns</h1>
          <p>Share a concern with the barangay and follow its status.</p>
        </div>
        <button class="btn primary" type="button" data-action="open-complaint">＋ Submit Complaint</button>
      </header>
      <p class="notice">Please include only details needed to review your concern. When the admin updates your report, an email with a link to this page is sent to your profile address.</p>
      ${table}
    </main>`;
}

/* ---- Profile ---- */

function profilePage() {
  const { user } = state;
  return `
    <main class="main" id="main" tabindex="-1">
      <header class="section-title">
        <div>
          <h1>My Profile</h1>
          <p>Review and update your account details.</p>
        </div>
      </header>
      <div class="profile-grid">
        <form class="profile-card" data-form="profile" aria-labelledby="personalInfoTitle">
          <h2 id="personalInfoTitle">Personal Information</h2>
          <div class="avatar-editor">
            ${user.avatarUrl
              ? `<span class="avatar avatar-large"><img src="${esc(user.avatarUrl)}" alt="Your profile photo"></span>`
              : `<span class="avatar avatar-large">${esc(initials(user.name))}</span>`}
            <div>
              <strong>Profile photo</strong>
              <label class="btn photo-button" for="avatarFile">Upload photo</label>
              <input id="avatarFile" type="file" accept="image/png,image/jpeg,image/webp" data-change="avatar">
              <small>PNG, JPG, or WebP. Up to 2 MB.</small>
            </div>
          </div>
          <div class="field">
            <label for="pName">Full name</label>
            <input id="pName" name="full_name" value="${esc(user.name)}" autocomplete="name" required>
          </div>
          <div class="field">
            <label for="pEmail">Email address</label>
            <input id="pEmail" type="email" value="${esc(user.email)}" readonly>
          </div>
          <div class="field">
            <label for="pUsername">Username</label>
            <input id="pUsername" name="username" value="${esc(user.username || '')}" autocomplete="username">
          </div>
          <button class="btn primary" type="submit">Save changes</button>
        </form>
        <section class="profile-card" aria-labelledby="notificationsTitle">
          <h2 id="notificationsTitle">Account &amp; notifications</h2>
          <p class="notice">Document and complaint updates are emailed to this account. Published announcements are emailed to registered users, with a button that opens this website. Mail is sent from the Barangay Abang admin Gmail account.</p>
        </section>
      </div>
    </main>`;
}

/* ---- Login / Signup ---- */

function passwordField(id, label, autocomplete) {
  return `
    <div class="field password-field">
      <label for="${id}">${label}</label>
      <input id="${id}" type="password" autocomplete="${autocomplete}" minlength="8" required>
      <button class="password-toggle" type="button" data-action="toggle-password" data-target="${id}"
        aria-label="Show password" title="Show password" aria-pressed="false">${eyeIcon()}</button>
    </div>`;
}

function authPage() {
  const signup = state.view === 'signup';
  const remember = window.appAuthStorage?.isRememberMe() ? 'checked' : '';

  const fields = signup
    ? `<div class="field">
         <label for="aName">Full Name</label>
         <input id="aName" autocomplete="name" required>
       </div>
       <div class="field">
         <label for="aUsername">Username</label>
         <input id="aUsername" autocomplete="username" required>
       </div>
       <div class="field">
         <label for="aEmail">Email Address</label>
         <input id="aEmail" type="email" autocomplete="email" required>
       </div>
       ${passwordField('aPassword', 'Password', 'new-password')}
       ${passwordField('aConfirm', 'Confirm Password', 'new-password')}
       <label class="opt-in"><input id="aNewsOptIn" type="checkbox"> Email me public announcements and events.</label>`
    : `<div class="field">
         <label for="aEmail">Username or Email</label>
         <input id="aEmail" type="text" autocomplete="username" required>
       </div>
       ${passwordField('aPassword', 'Password', 'current-password')}
       <label class="remember-row"><input id="rememberMe" type="checkbox" ${remember}> Remember me</label>`;

  return `
    <main class="auth-page" id="main" tabindex="-1">
      <article class="auth-card">
        <aside class="auth-brand">
          <img src="${SEAL}" alt="Barangay Abang official seal">
          <p class="auth-heading">Barangay Abang</p>
          <p class="auth-kicker">USER PORTAL</p>
          <p>Secure. Efficient. For a Better Community.</p>
          ${AUTH_WAVES}
        </aside>
        <section class="auth-form-wrap">
          <form class="auth-form" data-form="${signup ? 'signup' : 'login'}" aria-labelledby="authTitle">
            <p class="auth-back"><a href="#home">← Back to home</a></p>
            <h1 id="authTitle">${signup ? 'User Signup' : 'User Login'}</h1>
            <p>${signup ? 'Create your account to access barangay services and updates.' : 'Enter your credentials to access your account.'}</p>
            ${fields}
            <button class="btn primary" type="submit">${signup ? 'Sign Up' : 'Login'}</button>
            <p class="auth-foot">
              ${signup ? 'Already have an account?' : 'Don’t have an account?'}
              <a href="#${signup ? 'login' : 'signup'}">${signup ? 'Login' : 'Sign Up'}</a>
            </p>
            <p class="notice">Secure sign-in is handled by Supabase. Your password is never stored by this page.</p>
          </form>
        </section>
      </article>
    </main>`;
}

/* ---- Render ---- */

function currentPage() {
  switch (state.view) {
    case 'documents': return documentsPage();
    case 'complaints': return complaintsPage();
    case 'announcements': return announcementsPage();
    case 'profile': return state.user ? profilePage() : homePage();
    default: return homePage();
  }
}

function render() {
  const authMode = AUTH_VIEWS.includes(state.view);
  document.body.classList.toggle('auth-active', authMode);
  document.body.classList.toggle('dark-mode', state.darkMode);
  app.innerHTML = authMode
    ? authPage()
    : `<div class="wrap">${siteHeader()}${currentPage()}${siteFooter()}</div>`;
}

/* ---------------------------------------------------------------------
   7. Actions
   --------------------------------------------------------------------- */

async function loginUser(form) {
  if (!requireSupabase()) return;
  const identifier = form.querySelector('#aEmail').value.trim();
  const password = form.querySelector('#aPassword').value;
  window.appAuthStorage?.setRememberMe(form.querySelector('#rememberMe')?.checked || false);

  let error;
  if (identifier.includes('@')) {
    ({ error } = await sb.auth.signInWithPassword({ email: identifier, password }));
  } else {
    const { data, error: functionError } = await sb.functions.invoke('login-with-username', {
      body: { username: identifier, password }
    });
    if (functionError) {
      toast('Username login is not set up yet. Please use your email until the Supabase function is deployed.');
      return;
    }
    if (!data?.session) {
      toast('Invalid username/email or password.');
      return;
    }
    ({ error } = await sb.auth.setSession(data.session));
  }

  if (error) {
    toast('Invalid username/email or password.');
    return;
  }

  await loadUser();
  const next = state.pendingView || 'home';
  state.pendingView = null;
  setView(next);
  toast('Signed in.');
}

async function signupUser(form) {
  if (!requireSupabase()) return;
  const password = form.querySelector('#aPassword').value;
  const confirm = form.querySelector('#aConfirm').value;
  if (password !== confirm) {
    toast('Passwords do not match.');
    form.querySelector('#aConfirm').focus();
    return;
  }

  const metadata = {
    full_name: form.querySelector('#aName').value.trim(),
    username: form.querySelector('#aUsername').value.trim().toLowerCase(),
    announcement_email_opt_in: form.querySelector('#aNewsOptIn').checked
  };

  const { data, error } = await sb.auth.signUp({
    email: form.querySelector('#aEmail').value.trim(),
    password,
    options: { data: metadata, emailRedirectTo: location.origin + location.pathname }
  });

  if (error) {
    toast(explainError(error));
    return;
  }
  if (!data.session) {
    setView('login');
    toast('Check your email to confirm the account, then sign in.');
    return;
  }

  await loadUser();
  setView('home');
  toast('Your account is ready.');
}

async function saveProfile(form) {
  if (!requireSupabase() || !state.user) return;
  const full_name = form.querySelector('#pName').value.trim();
  const username = form.querySelector('#pUsername').value.trim();
  const { error } = await sb.from('profiles').update({ full_name, username }).eq('id', state.user.id);
  if (error) {
    toast('Could not save profile: ' + explainError(error));
    return;
  }
  state.user = { ...state.user, name: full_name, username };
  render();
  toast('Profile updated.');
}

function deliveryMessage(prefix, delivery, mailError) {
  const failed = mailError || delivery?.failed || !delivery?.sent;
  return failed
    ? `${prefix}; email confirmation could not be sent: ${mailError?.message || 'No email was delivered.'}`
    : `${prefix}; confirmation sent to your email.`;
}

async function submitDocument(form) {
  if (!requireSupabase()) return;
  const values = Object.fromEntries(new FormData(form).entries());
  const type = values.documentType;
  const definition = DOCUMENT_FORMS[type];
  if (!definition) {
    toast('Please choose a valid document type.');
    return;
  }

  const purpose = (values.purpose || type).trim();
  const details = Object.entries(values)
    .filter(([key, value]) => key !== 'documentType' && key !== 'purpose' && String(value).trim())
    .map(([key, value]) => {
      const field = definition.fields.find(item => item[0] === key);
      const label = key === 'otherIdType' ? 'Other ID type' : field?.[1] || key;
      return `${label}: ${String(value).trim()}`;
    })
    .join('\n');

  const { data: record, error } = await sb
    .from('document_requests')
    .insert({ document_type: type, purpose, details: details || null })
    .select('id')
    .single();

  if (error) {
    toast('Could not submit request: ' + explainError(error));
    return;
  }

  const { data: delivery, error: mailError } = await sb.functions.invoke('notify-users', {
    body: { type: 'document_received', recordId: record.id }
  });

  state.selectedDocument = '';
  state.docTab = 'My Requests';
  setView('documents');
  await loadRequests();
  toast(deliveryMessage('Request submitted', delivery, mailError));
}

async function submitComplaint(form) {
  if (!requireSupabase()) return;
  const { data: record, error } = await sb
    .from('complaints')
    .insert({
      subject: form.querySelector('#cSubject').value.trim(),
      details: form.querySelector('#cDetails').value.trim()
    })
    .select('id')
    .single();

  if (error) {
    toast('Could not submit complaint: ' + explainError(error));
    return;
  }

  const { data: delivery, error: mailError } = await sb.functions.invoke('notify-users', {
    body: { type: 'complaint_received', recordId: record.id }
  });

  closeModal();
  setView('complaints');
  await loadComplaints();
  toast(deliveryMessage('Complaint filed', delivery, mailError));
}

function openComplaintModal() {
  if (!state.user) {
    setView('login');
    return;
  }
  state.lastFocus = document.activeElement;
  document.querySelector('#modal').innerHTML = `
    <div class="modal-bg" data-action="modal-backdrop">
      <section class="modal" role="dialog" aria-modal="true" aria-labelledby="modalTitle">
        <header class="modal-head">
          <h2 id="modalTitle">Submit a Complaint</h2>
          <button class="btn" type="button" data-action="close-modal" aria-label="Close">✕</button>
        </header>
        <form class="modal-body" data-form="complaint">
          <div class="field">
            <label for="cSubject">Subject</label>
            <input id="cSubject" required placeholder="Short summary">
          </div>
          <div class="field">
            <label for="cDetails">Details</label>
            <textarea id="cDetails" required placeholder="Describe the concern"></textarea>
          </div>
          <div class="modal-actions">
            <button type="button" class="btn" data-action="close-modal">Cancel</button>
            <button class="btn primary" type="submit">Submit complaint</button>
          </div>
        </form>
      </section>
    </div>`;
  document.querySelector('#cSubject')?.focus();
}

function closeModal() {
  const modal = document.querySelector('#modal');
  if (!modal.innerHTML) return;
  modal.innerHTML = '';
  if (state.lastFocus?.isConnected) state.lastFocus.focus();
  state.lastFocus = null;
}

function togglePassword(button) {
  const input = document.getElementById(button.dataset.target);
  if (!input) return;
  const show = input.type === 'password';
  input.type = show ? 'text' : 'password';
  const label = show ? 'Hide password' : 'Show password';
  button.setAttribute('aria-label', label);
  button.setAttribute('title', label);
  button.setAttribute('aria-pressed', String(show));
  button.innerHTML = eyeIcon(show);
}

function toggleProfileMenu(force) {
  state.profileMenuOpen = typeof force === 'boolean' ? force : !state.profileMenuOpen;
  render();
  if (state.profileMenuOpen) document.querySelector('#profileMenu button')?.focus();
  else document.querySelector('.profile-trigger')?.focus();
}

function toggleDarkMode() {
  state.darkMode = !state.darkMode;
  localStorage.setItem(DARK_MODE_KEY, String(state.darkMode));
  render();
  document.querySelector('[data-action="toggle-dark-mode"]')?.focus();
}

function chooseDocTab(tab) {
  state.docTab = tab;
  render();
  loadRequests();
}

function selectDocumentType(type) {
  state.selectedDocument = type;
  const area = document.querySelector('#documentFormArea');
  if (area) area.innerHTML = documentFormArea(type);
}

function toggleOtherId(value) {
  const field = document.querySelector('#otherIdField');
  const input = document.querySelector('#doc-otherIdType');
  if (!field || !input) return;
  field.hidden = value !== 'Other';
  input.required = value === 'Other';
}

async function uploadAvatar(input) {
  const file = input.files?.[0];
  if (!file || !state.user || !requireSupabase()) return;

  if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
    toast('Choose a PNG, JPG, or WebP image.');
    input.value = '';
    return;
  }
  if (file.size > 2 * 1024 * 1024) {
    toast('The profile photo must be 2 MB or smaller.');
    input.value = '';
    return;
  }

  toast('Uploading photo…');
  const path = `${state.user.id}/avatar`;
  const { error: uploadError } = await sb.storage.from('avatars').upload(path, file, { upsert: true, contentType: file.type });
  if (uploadError) {
    toast('Could not upload photo: ' + explainError(uploadError));
    return;
  }

  const { error: profileError } = await sb.from('profiles').update({ avatar_path: path }).eq('id', state.user.id);
  if (profileError) {
    toast('Photo uploaded, but the profile could not be updated: ' + explainError(profileError));
    return;
  }

  const { data: signed } = await sb.storage.from('avatars').createSignedUrl(path, 3600);
  state.user = { ...state.user, avatarPath: path, avatarUrl: signed?.signedUrl || '' };
  render();
  toast('Profile photo updated.');
}

async function signOut() {
  if (!requireSupabase()) return;
  const { error } = await sb.auth.signOut();
  if (error) {
    toast(explainError(error));
    return;
  }
  state.user = null;
  state.profileMenuOpen = false;
  state.pendingView = null;
  setView('home');
  toast('You have signed out.');
}

/* ---------------------------------------------------------------------
   8. Event wiring
   --------------------------------------------------------------------- */

const clickActions = {
  'toggle-profile-menu': () => toggleProfileMenu(),
  'toggle-dark-mode': () => toggleDarkMode(),
  'sign-out': () => signOut(),
  'go': el => setView(el.dataset.view),
  'doc-tab': el => chooseDocTab(el.dataset.tab),
  'open-complaint': () => openComplaintModal(),
  'close-modal': () => closeModal(),
  'modal-backdrop': (el, event) => { if (event.target === el) closeModal(); },
  'toggle-password': el => togglePassword(el)
};

const formHandlers = {
  login: { busy: 'Logging in…', run: loginUser },
  signup: { busy: 'Creating account…', run: signupUser },
  profile: { busy: 'Saving…', run: saveProfile },
  document: { busy: 'Submitting…', run: submitDocument },
  complaint: { busy: 'Submitting…', run: submitComplaint }
};

const changeHandlers = {
  'document-type': el => selectDocumentType(el.value),
  'id-type': el => toggleOtherId(el.value),
  'avatar': el => uploadAvatar(el)
};

document.addEventListener('click', event => {
  // Close the profile menu when clicking anywhere outside it.
  // (Updates the DOM directly so links clicked at the same time still work.)
  if (state.profileMenuOpen && !event.target.closest('.profile-wrap')) {
    state.profileMenuOpen = false;
    document.querySelector('#profileMenu')?.setAttribute('hidden', '');
    document.querySelector('.profile-trigger')?.setAttribute('aria-expanded', 'false');
  }

  const el = event.target.closest('[data-action]');
  if (!el) return;
  const action = clickActions[el.dataset.action];
  if (action) action(el, event);
});

document.addEventListener('submit', event => {
  const form = event.target.closest('[data-form]');
  const handler = form && formHandlers[form.dataset.form];
  if (!handler) return;
  event.preventDefault();
  withBusy(form, handler.busy, () => handler.run(form));
});

document.addEventListener('change', event => {
  const el = event.target.closest('[data-change]');
  const handler = el && changeHandlers[el.dataset.change];
  if (handler) handler(el);
});

document.addEventListener('keydown', event => {
  if (event.key !== 'Escape') return;
  if (document.querySelector('#modal').innerHTML) closeModal();
  else if (state.profileMenuOpen) toggleProfileMenu(false);
});

window.addEventListener('hashchange', () => {
  const hash = VIEWS.includes(currentHash()) ? currentHash() : 'home';
  if (hash !== state.view) setView(hash, true);
});

/* Used by pages/user/signup.html */
window.setView = setView;

/* ---------------------------------------------------------------------
   9. Boot
   --------------------------------------------------------------------- */

async function boot() {
  if (sb) {
    const { data: { session } } = await sb.auth.getSession();
    if (session) await loadUser();
  }

  const hash = currentHash();
  state.view = /signup\.html$/i.test(location.pathname) ? 'signup' : VIEWS.includes(hash) ? hash : 'home';
  if (PROTECTED_VIEWS.includes(state.view) && !state.user) {
    state.pendingView = state.view;
    state.view = 'login';
  }

  syncHash();
  render();
  loadAnnouncements();
  if (state.view === 'documents') loadRequests();
  if (state.view === 'complaints') loadComplaints();

  if (!sb) toast('Online services are unavailable. Check your internet connection and reload.');
}

if (sb) {
  sb.auth.onAuthStateChange((_event, session) => {
    setTimeout(async () => {
      if (session) await loadUser();
      else state.user = null;
      if (!AUTH_VIEWS.includes(state.view)) render();
    }, 0);
  });
}

boot();
