// Replace the body of loginRequest with a real call once the API exists:
//
//   const res = await fetch(`${import.meta.env.VITE_API_URL}/api/auth/login`, {
//     method: 'POST',
//     headers: { 'Content-Type': 'application/json' },
//     body: JSON.stringify({ email, password }),
//   });
//   if (!res.ok) throw new Error('Invalid email or password');
//   const { token, email: returnedEmail, role } = await res.json();
//   return { token, email: returnedEmail, role };
//
// The .NET API issues a JWT with a role claim (ASP.NET Core Identity role).
// Decode that claim server-side or include it directly in the login response body —
// don't infer role on the client from anything but the token.

export async function loginRequest(email, password) {
  await new Promise((r) => setTimeout(r, 300));

  if (!email || !password) {
    throw new Error('Email and password are required');
  }

  const role = email.toLowerCase().startsWith('admin') ? 'admin' : 'user';

  return {
    token: 'mock-token',
    email,
    role,
  };
}
