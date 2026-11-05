// Public frontend configuration: Supabase publishable key only.
// Never put an sb_secret_ / service_role key in browser code.
if (!window.supabase?.createClient) {
  throw new Error('Supabase JS SDK did not load. Check the internet connection.');
}
const rememberPreferenceKey = 'barangay-abang-remember-me';
let rememberSession = localStorage.getItem(rememberPreferenceKey) === 'true';
const authStorage = {
  getItem(key) {
    return localStorage.getItem(key) ?? sessionStorage.getItem(key);
  },
  setItem(key, value) {
    const destination = rememberSession ? localStorage : sessionStorage;
    const other = rememberSession ? sessionStorage : localStorage;
    other.removeItem(key);
    destination.setItem(key, value);
  },
  removeItem(key) {
    localStorage.removeItem(key);
    sessionStorage.removeItem(key);
  }
};
window.appAuthStorage = {
  isRememberMe: () => rememberSession,
  setRememberMe(value) {
    rememberSession = Boolean(value);
    localStorage.setItem(rememberPreferenceKey, String(rememberSession));
    // Move an existing auth token to the chosen storage so the checkbox applies immediately.
    for (const storage of [localStorage, sessionStorage]) {
      for (let i = storage.length - 1; i >= 0; i--) {
        const key = storage.key(i);
        if (!key?.endsWith('-auth-token')) continue;
        const token = storage.getItem(key);
        if (token === null) continue;
        const destination = rememberSession ? localStorage : sessionStorage;
        const other = rememberSession ? sessionStorage : localStorage;
        destination.setItem(key, token);
        other.removeItem(key);
      }
    }
  }
};
window.appSupabase = window.supabase.createClient(
  'https://dwdiubwbjpyqvfvxdbat.supabase.co',
  'sb_publishable_hrQLrpvyDUdncxz2xsv0tg_6IAGkvwH',
  { auth: { autoRefreshToken: true, persistSession: true, detectSessionInUrl: true, storage: authStorage } }
);
