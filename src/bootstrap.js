// Keep the desktop game and its dependencies off smaller screens entirely.
const desktop = window.matchMedia('(min-width: 1280px)');
let started = false;
function boot() {
  if (!desktop.matches || started) return;
  started = true;
  import('./main.js').catch(error => {
    console.error('Unable to load Common Ground:', error);
    started = false;
    const loading = document.getElementById('loading');
    if (loading) loading.textContent = 'The experience couldn’t load. Please refresh to try again.';
  });
}
desktop.addEventListener('change', boot);
boot();
