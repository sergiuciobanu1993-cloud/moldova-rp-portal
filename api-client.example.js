// Exemplu de client frontend pentru etapa următoare.
export async function login(login, password) {
  const response = await fetch("/api/auth/login", {
    method: "POST",
    headers: {"Content-Type": "application/json"},
    body: JSON.stringify({login, password})
  });
  return response.json();
}
