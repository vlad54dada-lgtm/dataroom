/** Maps raw Supabase auth errors to specific, non-apologetic copy. */
export function authErrorMessage(message: string): string {
  const m = message.toLowerCase();
  if (m.includes("invalid login credentials"))
    return "Incorrect email or password";
  if (m.includes("already registered"))
    return "An account with this email already exists";
  if (m.includes("at least 6 characters"))
    return "Password must be at least 6 characters";
  if (m.includes("valid email")) return "Enter a valid email address";
  // Supabase's built-in mailer only delivers to a limited set of addresses
  // on free projects — surface it as a delivery problem, not a typo.
  if (m.includes("is invalid"))
    return "Couldn't send an email to this address";
  if (m.includes("different from the old"))
    return "New password must be different from the old one";
  if (m.includes("rate limit") || m.includes("too many"))
    return "Too many attempts — try again in a minute";
  return message;
}
