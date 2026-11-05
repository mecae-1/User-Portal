const SUPABASE_URL = "YOUR_SUPABASE_PROJECT_URL";
const SUPABASE_KEY = "YOUR_SUPABASE_PUBLISHABLE_KEY";

const client = window.supabase.createClient(
  SUPABASE_URL,
  SUPABASE_KEY
);

document.getElementById("signupForm").addEventListener(
  "submit",
  async function (event) {
    event.preventDefault();

    const name = document.getElementById("name").value.trim();
    const email = document.getElementById("email").value.trim();
    const password = document.getElementById("password").value;
    const message = document.getElementById("signupMessage");
    const button = document.getElementById("signupBtn");

    button.disabled = true;
    message.textContent = "Creating account...";

    try {
      const { data, error } = await client.auth.signUp({
        email,
        password,
        options: {
          data: { full_name: name }
        }
      });

      if (error) throw error;

      message.style.color = "green";
      message.textContent = data.session
        ? "Account created successfully! You can now continue."
        : "Account created! Check your email to confirm your account.";

    } catch (error) {
      console.error("Signup error:", error);
      message.style.color = "red";
      message.textContent = error.message || "Registration failed.";
    } finally {
      button.disabled = false;
    }
  }
);
