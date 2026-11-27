// Gallery enlarged view. Progressive enhancement: each tile is a link to the photo's own page, and this script
// opens the same photo in a modal <dialog> instead. The browser's modal dialog makes the rest of the page inert,
// closes on Escape and returns focus; this script adds Close, Previous and Next buttons and arrow keys.
// Served as a file from this site (no inline code) so the Content-Security-Policy can stay at script-src 'self'.
(() => {
  const grid = document.querySelector('[data-lightbox]');
  if (!grid || typeof HTMLDialogElement !== 'function') return;
  const tiles = [...grid.querySelectorAll('a.photo-tile')];
  if (!tiles.length) return;
  const s = grid.dataset;

  const el = (tag, attrs = {}, text) => {
    const n = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs)) n.setAttribute(k, v);
    if (text) n.textContent = text;
    return n;
  };

  const dialog = el('dialog', { class: 'lightbox', 'aria-labelledby': 'lb-title' });
  const close = el('button', { type: 'button', class: 'lb-close' }, s.close);
  const figure = el('figure');
  const img = el('img', { alt: '' });
  const cap = el('figcaption');
  const title = el('h2', { id: 'lb-title' });
  const meta = el('div', { class: 'lb-meta' });
  const count = el('p', { class: 'lb-count muted', 'aria-live': 'polite' });
  const bar = el('div', { class: 'lb-bar' });
  const prev = el('button', { type: 'button' }, s.prev);
  const next = el('button', { type: 'button' }, s.next);
  cap.append(title, meta, count);
  figure.append(img, cap);
  bar.append(prev, next, close);
  dialog.append(bar, figure);
  document.body.append(dialog);

  let current = 0;
  let opener = null;

  const show = (i) => {
    current = (i + tiles.length) % tiles.length;
    const tile = tiles[current];
    const thumb = tile.querySelector('img');
    const data = tile.parentElement.querySelector('.photo-meta');
    img.src = tile.dataset.full;
    img.alt = thumb ? thumb.alt : '';
    title.textContent = data ? data.dataset.title : '';
    meta.replaceChildren(...(data ? [...data.children].map((c) => c.cloneNode(true)) : []));
    count.textContent = s.count.replace('{n}', String(current + 1)).replace('{total}', String(tiles.length));
  };

  tiles.forEach((tile, i) => {
    tile.addEventListener('click', (e) => {
      if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return; // new tab or window: follow the link
      e.preventDefault();
      opener = tile;
      show(i);
      dialog.showModal();
      close.focus();
    });
  });

  close.addEventListener('click', () => dialog.close());
  prev.addEventListener('click', () => show(current - 1));
  next.addEventListener('click', () => show(current + 1));
  dialog.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowLeft') { e.preventDefault(); show(current - 1); }
    else if (e.key === 'ArrowRight') { e.preventDefault(); show(current + 1); }
  });
  // A click on the backdrop (outside the dialog box) closes it.
  dialog.addEventListener('click', (e) => {
    if (e.target !== dialog) return;
    const r = dialog.getBoundingClientRect();
    const inside = e.clientX >= r.left && e.clientX <= r.right && e.clientY >= r.top && e.clientY <= r.bottom;
    if (!inside) dialog.close();
  });
  dialog.addEventListener('close', () => {
    img.removeAttribute('src');
    // Return focus to the tile for the photo last shown, so arrowing through photos keeps the visitor's place.
    // Deferred one frame so it runs after the browser's own focus restore to the opening tile.
    const target = tiles[current] ?? opener;
    requestAnimationFrame(() => target?.focus());
  });
})();
