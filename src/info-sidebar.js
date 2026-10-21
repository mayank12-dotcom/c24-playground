const escapeHTML = value => String(value ?? '').replace(/[&<>"']/g, character => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
}[character]));

function sourceLink(source) {
  if (!source || typeof source.url !== 'string') return '';
  let url;
  try { url = new URL(source.url); } catch { return ''; }
  if (url.protocol !== 'https:') return '';
  return `<a class="info-source" href="${escapeHTML(url.href)}" target="_blank" rel="noopener noreferrer">${escapeHTML(source.label || 'Learn more')} ↗</a>`;
}

/** Render information independently of the retained application/chat DOM. */
export function renderInfoSidebar(root, object) {
  const title = object.title || object.label || 'CARS24';
  const sections = Array.isArray(object.sections) ? object.sections : [];
  root.innerHTML = `<div class="info-sidebar-body"><span class="eyebrow">CARS24</span><h3>${escapeHTML(title)}</h3><p class="info-intro">${escapeHTML(object.summary)}</p>${sections.map(section => `<section class="info-section"><h4>${escapeHTML(section.title)}</h4><p>${escapeHTML(section.body)}</p></section>`).join('')}${sourceLink(object.source)}</div>`;
  root.setAttribute('aria-label', `${title} information`);
}
