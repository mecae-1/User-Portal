# Email notification setup

The `notify-users` Supabase Edge Function sends Gmail messages from `mecaellacorcotchia15@gmail.com`. It sends a status update to the account that submitted a document request or complaint, and sends a published announcement to registered user accounts. The Edge Function checks that its caller is the one allowlisted admin. Gmail OAuth credentials stay in Supabase Secrets; they must never be added to frontend JavaScript.

## One-time Gmail API setup

1. Sign in to Google Cloud with `mecaellacorcotchia15@gmail.com`, create/select a project, enable the Gmail API, and create an OAuth client for a Web application.
2. In the OAuth consent configuration, add the account as a test user if the app remains in Testing. Add `https://developers.google.com/oauthplayground` as an authorized redirect URI on the OAuth client.
3. Open [Google OAuth 2.0 Playground](https://developers.google.com/oauthplayground), open its settings, enable “Use your own OAuth credentials,” and enter that OAuth client ID and secret.
4. Authorize the Gmail scope `https://www.googleapis.com/auth/gmail.send`, grant access as `mecaellacorcotchia15@gmail.com`, exchange the code, and copy the refresh token. Keep the client secret and refresh token private.

For an external Google OAuth app left in Testing, Google issues Gmail-scope refresh tokens that expire after 7 days. For ongoing use, publish the OAuth app and complete any verification Google requires; Google classifies `gmail.send` as a sensitive scope. See [Google OAuth refresh-token limits](https://developers.google.com/identity/protocols/oauth2) and [Gmail API scope classification](https://developers.google.com/workspace/gmail/api/auth/scopes).

Google requires the Gmail `gmail.send` authorization scope for the Gmail API send operation: [Gmail API send method](https://developers.google.com/workspace/gmail/api/reference/rest/v1/users.messages/send).

## Configure and deploy

In Supabase Dashboard > Project > Edge Functions > Secrets, add these four secrets (values from the OAuth setup above):

- `GMAIL_CLIENT_ID`
- `GMAIL_CLIENT_SECRET`
- `GMAIL_REFRESH_TOKEN`
- `GMAIL_SENDER_EMAIL` = `mecaellacorcotchia15@gmail.com`
- `PUBLIC_SITE_URL` = the live user portal address, for example `https://your-domain/pages/user/index.html` (local preview: `http://127.0.0.1:4173/pages/user/index.html`)

Deploy `notify-users` from the Supabase Dashboard under Edge Functions > Deploy a new function > Via Editor, or use the Supabase CLI. The Edge Function receives the signed-in caller's JWT through `supabase.functions.invoke`; it separately checks the admin allowlist for staff notifications and checks record ownership for submission receipts. See [Supabase Dashboard Edge Function deployment](https://supabase.com/docs/guides/functions/quickstart-dashboard), [Edge Function auth](https://supabase.com/docs/guides/functions/auth), and [Function secrets](https://supabase.com/docs/guides/functions/secrets).

Also run `admin-email-migration.sql` in SQL Editor. The email allowlist migration does not change an existing Supabase Auth user's email: create/confirm the new `mecaellacorcotchia15@gmail.com` admin account through the admin signup page, or change the Auth email in Supabase and complete its confirmation. Then sign in with the new address.

The function uses Supabase's injected service key only on the server to read recipients and write `notification_log`; never copy that key to browser code. After deploying and adding secrets, update a test document/complaint status and publish an announcement to confirm delivery.
