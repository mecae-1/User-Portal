/* =====================================================================
   Barangay Abang · Dashboard page (pages/dashboard/index.html)
   ---------------------------------------------------------------------
   Pages are <section class="page"> elements; the URL hash picks which
   one is visible (#home, #login, #signup, #dashboard, #announcements).
   All links are normal href="#..." links, so the browser Back button
   works too. Accounts use the same Supabase project as the user portal
   (js/supabase-client.js), so passwords are never stored in the browser.
   ===================================================================== */

'use strict';

const sb = window.appSupabase;
const $ = id => document.getElementById(id);

const PAGES = ['home', 'login', 'signup', 'dashboard', 'announcements'];
const PROTECTED_PAGES = ['dashboard'];

let currentUser = null;      // { id, email, name }
let pendingPage = null;      // where to go after logging in

/* ---------------------------------------------------------------------
   Helpers
   --------------------------------------------------------------------- */

function esc(value) {
  const map = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
  return String(value ?? '').replace(/[&<>"']/g, ch => map[ch]);
}

function showMessage(id, message, success = false) {
  const element = $(id);
  element.textContent = message;
  element.style.color = success ? 'green' : 'crimson';
}

async function withBusy(button, busyLabel, task) {
  const label = button.textContent;
  button.disabled = true;
  button.textContent = busyLabel;
  try {
    await task();
  } finally {
    button.disabled = false;
    button.textContent = label;
  }
}

function offlineNotice(messageId) {
  showMessage(messageId, 'Online services are unavailable. Check your internet connection and reload.');
}

/* ---------------------------------------------------------------------
   Session
   --------------------------------------------------------------------- */

async function loadUser() {
  if (!sb) {
    currentUser = null;
    return;
  }
  const { data: { user } } = await sb.auth.getUser();
  if (!user) {
    currentUser = null;
    return;
  }
  const { data: profile } = await sb
    .from('profiles')
    .select('full_name')
    .eq('id', user.id)
    .maybeSingle();

  currentUser = {
    id: user.id,
    email: user.email,
    name: profile?.full_name || user.user_metadata?.full_name || user.email
  };
}

/* ---------------------------------------------------------------------
   Navigation
   --------------------------------------------------------------------- */

function pageFromHash() {
  const hash = location.hash.slice(1);
  return PAGES.includes(hash) ? hash : 'home';
}

function goTo(pageId) {
  if (location.hash === '#' + pageId) showPage(pageId);
  else location.hash = pageId; // triggers hashchange → showPage
}

function showPage(pageId) {
  if (!PAGES.includes(pageId)) pageId = 'home';

  if (PROTECTED_PAGES.includes(pageId) && !currentUser) {
    pendingPage = pageId;
    history.replaceState(null, '', '#login');
    pageId = 'login';
  }

  // Signed-in users skip the login/signup forms.
  if ((pageId === 'login' || pageId === 'signup') && currentUser) {
    history.replaceState(null, '', '#dashboard');
    pageId = 'dashboard';
  }

  document.querySelectorAll('.page').forEach(section => {
    section.classList.toggle('active', section.id === pageId);
  });

  document.querySelectorAll('[data-nav]').forEach(link => {
    if (link.dataset.nav === pageId) link.setAttribute('aria-current', 'page');
    else link.removeAttribute('aria-current');
  });

  if (pageId === 'dashboard' && currentUser) {
    $('dashboardTitle').textContent = `Welcome, ${currentUser.name}!`;
  }
  if (pageId === 'announcements') loadAnnouncements();

  window.scrollTo({ top: 0, behavior: 'smooth' });
  updateNavigation();
}

function updateNavigation() {
  const signedIn = Boolean(currentUser);
  $('guestNav').hidden = signedIn;
  $('userNav').hidden = !signedIn;
  $('dashboardNavItem').hidden = !signedIn;
  $('welcomeText').textContent = signedIn ? `Hi, ${currentUser.name}` : '';
}

/* ---------------------------------------------------------------------
   Announcements
   --------------------------------------------------------------------- */

async function loadAnnouncements() {
  const list = $('announcementList');
  if (!sb) {
    list.innerHTML = '<li class="card"><p>Announcements are unavailable offline.</p></li>';
    return;
  }

  const { data, error } = await sb
    .from('announcements')
    .select('id,title,body,kind,published_at')
    .eq('published', true)
    .order('published_at', { ascending: false });

  if (error) {
    list.innerHTML = '<li class="card"><p>Could not load announcements right now.</p></li>';
    return;
  }
  if (!data?.length) {
    list.innerHTML = '<li class="card"><p>No announcements yet.</p></li>';
    return;
  }

  list.innerHTML = data.map(item => `
    <li>
      <article class="card">
        <h2>${esc(item.title)}</h2>
        <p>${esc(item.body)}</p>
        <p><small>${esc(item.kind || 'Announcement')} ·
          <time datetime="${esc(item.published_at || '')}">${item.published_at ? new Date(item.published_at).toLocaleDateString('en', { month: 'short', day: '2-digit', year: 'numeric' }) : 'Recently'}</time></small></p>
      </article>
    </li>`).join('');
}

/* ---------------------------------------------------------------------
   Sign up
   --------------------------------------------------------------------- */

$('signupForm').addEventListener('submit', event => {
  event.preventDefault();
  const form = event.currentTarget;

  const name = $('fullName').value.trim();
  const username = $('signupUsername').value.trim().toLowerCase();
  const email = $('signupEmail').value.trim().toLowerCase();
  const password = $('signupPassword').value;
  const confirmPassword = $('confirmPassword').value;

  if (!name || !username || !email || !password || !confirmPassword) {
    showMessage('signupMessage', 'Please complete all fields.');
    return;
  }
  if (!$('signupEmail').checkValidity()) {
    showMessage('signupMessage', 'Please enter a valid email address.');
    $('signupEmail').focus();
    return;
  }
  if (password.length < 8) {
    showMessage('signupMessage', 'Password must contain at least 8 characters.');
    $('signupPassword').focus();
    return;
  }
  if (password !== confirmPassword) {
    showMessage('signupMessage', 'Passwords do not match.');
    $('confirmPassword').focus();
    return;
  }
  if (!sb) {
    offlineNotice('signupMessage');
    return;
  }

  withBusy(form.querySelector('[type="submit"]'), 'Creating account…', async () => {
    const { data, error } = await sb.auth.signUp({
      email,
      password,
      options: {
        data: { full_name: name, username },
        emailRedirectTo: location.origin + location.pathname + '#dashboard'
      }
    });

    if (error) {
      showMessage('signupMessage', error.message || 'Registration failed.');
      return;
    }

    form.reset();
    if (data.session) {
      await loadUser();
      showMessage('signupMessage', '', true);
      goTo('dashboard');
    } else {
      showMessage('signupMessage', 'Account created! Check your email to confirm it, then log in.', true);
    }
  });
});

/* ---------------------------------------------------------------------
   Log in (email, or username via the login-with-username function)
   --------------------------------------------------------------------- */

$('loginForm').addEventListener('submit', event => {
  event.preventDefault();
  const form = event.currentTarget;

  const identifier = $('loginEmail').value.trim();
  const password = $('loginPassword').value;

  if (!identifier || !password) {
    showMessage('loginMessage', 'Please enter your username or email and password.');
    return;
  }
  if (!sb) {
    offlineNotice('loginMessage');
    return;
  }

  withBusy(form.querySelector('[type="submit"]'), 'Logging in…', async () => {
    let error;
    if (identifier.includes('@')) {
      ({ error } = await sb.auth.signInWithPassword({ email: identifier.toLowerCase(), password }));
    } else {
      const { data, error: functionError } = await sb.functions.invoke('login-with-username', {
        body: { username: identifier, password }
      });
      if (functionError || !data?.session) {
        error = functionError || new Error('Invalid username or password.');
      } else {
        ({ error } = await sb.auth.setSession(data.session));
      }
    }

    if (error) {
      showMessage('loginMessage', 'Incorrect username/email or password. Please try again.');
      return;
    }

    form.reset();
    showMessage('loginMessage', '', true);
    await loadUser();
    const next = pendingPage || 'dashboard';
    pendingPage = null;
    goTo(next);
  });
});

/* ---------------------------------------------------------------------
   Log out
   --------------------------------------------------------------------- */

$('logoutBtn').addEventListener('click', async event => {
  const button = event.currentTarget;
  await withBusy(button, 'Logging out…', async () => {
    if (sb) await sb.auth.signOut();
  });
  currentUser = null;
  updateNavigation();
  goTo('home');
});

/* ---------------------------------------------------------------------
   Boot
   --------------------------------------------------------------------- */

window.addEventListener('hashchange', () => showPage(pageFromHash()));

(async function init() {
  try {
    await loadUser();
  } catch (error) {
    console.error('Could not restore session:', error);
  }
  showPage(pageFromHash());
})();
