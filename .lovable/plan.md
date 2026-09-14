# Reset the administrator password

Existing passwords cannot be shown — they are stored scrambled and are unreadable, even to me. So instead I will set a brand-new password for the admin account and tell you what it is.

## What will happen

- Account affected: **jaideeprajpurohit21@gmail.com** (Jaideep Rajpurohit, administrator).
- I generate a strong random password (long, mixed characters) so it passes the app's leaked-password check.
- I set it on that account and confirm the account can sign in with it.
- I show you the new password in chat so you can sign in right away.
- The staff account is left untouched.

## Notes

- The old admin password stops working the moment the new one is set.
- If you'd rather choose the password yourself, tell me the exact one and I'll use that instead — it must be at least 8 characters and not a commonly breached password.
- After signing in you can change it again from the app at any time.

## Technical detail

The change is made through the backend's admin user API (service-role side only), which updates the stored password for that user. No database schema or app code changes are involved, and the password is never written into project files.
