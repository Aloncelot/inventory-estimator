// src/lib/allowedUsers.js
// Only these Google accounts can use the app.
// Override with NEXT_PUBLIC_ALLOWED_EMAILS="a@x.com,b@y.com" if needed.
const DEFAULT_ALLOWED = ["aloncelot@gmail.com", "arch.alonso.correa@gmail.com"];

export const ALLOWED_EMAILS = (process.env.NEXT_PUBLIC_ALLOWED_EMAILS || DEFAULT_ALLOWED.join(","))
  .split(",")
  .map((e) => e.trim().toLowerCase())
  .filter(Boolean);

export const isAllowedEmail = (email) =>
  !!email && ALLOWED_EMAILS.includes(String(email).trim().toLowerCase());
