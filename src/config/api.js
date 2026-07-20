// API Configuration for fetching data from GitHub
const BASE_URL = 'https://raw.githubusercontent.com/Hasan72341/KBG_Links/refs/heads/main';

export const API_ENDPOINTS = {
  about: `${BASE_URL}/about.json`,
  events: `${BASE_URL}/events.json`,
  home: `${BASE_URL}/home.json`,
  navbar: `${BASE_URL}/navbar.json`,
  footer: `${BASE_URL}/footer.json`,
  projects: `${BASE_URL}/projects.json`,
  team: `${BASE_URL}/team.json`,
};

/* Utility function to fetch data from URLs.

   Stale-while-revalidate over sessionStorage, plus an 8s timeout.

   With the ~180 KB gz of the old 3D stack gone, this cross-origin request to
   raw.githubusercontent.com IS first paint — every page renders the loading
   strand until it lands. That makes it effectively all of TTI, and it had
   neither a cache nor a timeout: a hung socket left the page drawing forever.

   BASE_URL, API_ENDPOINTS and the fetchData(url) signature are unchanged, and
   no JSON key is read here — the shape stays opaque. Callers cannot tell the
   difference, except that a return visit paints without a round trip. */
export const fetchData = async (url) => {
  const key = `kbg:${url}`;

  let cached = null;
  try {
    cached = JSON.parse(sessionStorage.getItem(key));
  } catch {
    /* private mode, storage disabled, or a corrupt entry — just refetch */
  }

  const live = (async () => {
    const ctl = new AbortController();
    const t = setTimeout(() => ctl.abort(), 8000);
    try {
      const response = await fetch(url, { signal: ctl.signal });
      if (!response.ok) {
        throw new Error(`Failed to fetch data: ${response.statusText}`);
      }
      const json = await response.json();
      try {
        sessionStorage.setItem(key, JSON.stringify(json));
      } catch {
        /* quota / private mode — the cache is an optimisation, not a contract */
      }
      return json;
    } finally {
      clearTimeout(t);
    }
  })();

  // Serve the cached sheet immediately and revalidate behind it. The rejection
  // must be swallowed here: without it, an offline revalidate is an unhandled
  // rejection even though the page rendered fine from cache.
  if (cached) {
    live.catch(() => {});
    return cached;
  }

  return live;
};

// Prefetch on nav intent. Best-effort by design: the page fetches again anyway
// (hitting the cache this warmed), so a failure here is never surfaced.
export const prefetch = (url) => {
  fetchData(url).catch(() => {});
};
