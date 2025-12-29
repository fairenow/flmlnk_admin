const SIGN_IN_PATH = "/signin";

type SignInQuery = Record<string, string | undefined>;

export function buildSignInUrl(params?: SignInQuery) {
  const url = new URL(SIGN_IN_PATH, "http://localhost");

  Object.entries(params ?? {}).forEach(([key, value]) => {
    if (!value) return;
    url.searchParams.set(key, value);
  });

  const query = url.searchParams.toString();
  return query ? `${SIGN_IN_PATH}?${query}` : SIGN_IN_PATH;
}

export { SIGN_IN_PATH };
