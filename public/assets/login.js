(() => {
  const form = document.getElementById('f');
  const err = document.getElementById('err');
  if (!form) return;

  form.addEventListener('submit', async (e) => {
    // Progressive enhancement: try fetch first for inline error UX
    e.preventDefault();
    err.textContent = '';
    try {
      const formData = new URLSearchParams(new FormData(form));
      const res = await fetch('/login', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'Accept': 'application/json'
        },
        body: formData
      });
      const ct = res.headers.get('content-type') || '';
      if (!ct.includes('application/json')) {
        // Server might have redirected (non-JSON). Follow full redirect.
        window.location.href = '/';
        return;
      }
      const json = await res.json();
      if (!json.ok) { err.textContent = json.error || 'Invalid password'; return; }
      window.location.href = '/';
    } catch {
      // Fallback: let the browser submit normally if fetch fails
      form.submit();
    }
  });
})();