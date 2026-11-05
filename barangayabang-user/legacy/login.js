const SUPABASE_URL = "YOUR_SUPABASE_PROJECT_URL";
const SUPABASE_KEY = "YOUR_SUPABASE_PUBLISHABLE_KEY";

const supabaseClient = window.supabase.createClient(
  SUPABASE_URL,
  SUPABASE_KEY
);

const loginForm = document.getElementById("loginForm");
const loginMessage = document.getElementById("loginMessage");
const loginBtn = document.getElementById("loginBtn");

loginForm.addEventListener("submit", async function (event) {
  event.preventDefault();

  const email = document.getElementById("email").value.trim();
  const password = document.getElementById("password").value;

  loginBtn.disabled = true;
  loginBtn.textContent = "Logging in...";
  loginMessage.textContent = "";

  try {
    const { data, error } =
      await supabaseClient.auth.signInWithPassword({
        email: email,
        password: password
      });

    if (error) {
      throw error;
    }

    loginMessage.textContent = "Login successful!";
    loginMessage.style.color = "green";

    // Palitan ito kung iba ang lokasyon ng dashboard.
    window.location.href = "dashboard.html";

  } catch (error) {
    console.error("Login error:", error);

    loginMessage.textContent =
      error.message || "Login failed. Please try again.";

    loginMessage.style.color = "red";

  } finally {
    loginBtn.disabled = false;
    loginBtn.textContent = "Login";
  }
});