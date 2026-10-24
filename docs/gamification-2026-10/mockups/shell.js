// Injects the iOS status bar, the revamp tab bar and the home indicator into
// every .phone. Usage: <div class="phone" data-tab="home|plan|shop|train|you|none">.
(function () {
  const ico = {
    shop: '<path d="M6 7h12l-1 12H7L6 7z"/><path d="M9 7a3 3 0 0 1 6 0"/>',
    plan: '<rect x="4" y="5" width="16" height="15" rx="2"/><path d="M4 10h16M9 3v4M15 3v4"/>',
    home: '<path d="M4 11l8-6 8 6v8a1 1 0 0 1-1 1h-5v-6h-4v6H5a1 1 0 0 1-1-1z"/>',
    train: '<path d="M3 10v4M21 10v4M6 7v10M18 7v10M6 12h12"/>',
    you: '<circle cx="12" cy="8" r="4"/><path d="M4 20c1.5-4 4.5-6 8-6s6.5 2 8 6"/>',
  };
  const tabs = [
    ['shop', 'Shop'],
    ['plan', 'Meals'],
    ['home', 'Today'],
    ['train', 'Train'],
    ['you', 'You'],
  ];
  document.querySelectorAll('.phone').forEach((p) => {
    const status = document.createElement('div');
    status.className = 'status';
    status.innerHTML = '<span>9:41</span><span class="r">●●●● 5G ▮▮▮</span>';
    if (p.dataset.dark) status.style.color = '#fff';
    p.prepend(status);
    const t = p.dataset.tab;
    if (t && t !== 'none') {
      const bar = document.createElement('nav');
      bar.className = 'tabbar';
      bar.innerHTML = tabs
        .map(
          ([k, l]) =>
            `<div class="tab${k === t ? ' on' : ''}"><svg viewBox="0 0 24 24" fill="${k === t ? 'currentColor' : 'none'}" fill-opacity=".15" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${ico[k]}</svg>${l}</div>`,
        )
        .join('');
      p.append(bar);
    }
    const hi = document.createElement('div');
    hi.className = 'home-ind';
    if (p.dataset.dark) hi.style.background = '#fff';
    p.append(hi);
  });
  // Confetti: <div class="confetti" data-n="26"></div>, deterministic positions.
  const colors = ['#944a00', '#f59e0b', '#059669', '#f97316', '#7c3aed', '#fbbf24'];
  document.querySelectorAll('.confetti').forEach((c) => {
    const n = Number(c.dataset.n || 24);
    const top = Number(c.dataset.top || 0);
    const h = Number(c.dataset.h || 260);
    let s = 7;
    const rnd = () => (s = (s * 9301 + 49297) % 233280) / 233280;
    for (let i = 0; i < n; i++) {
      const e = document.createElement('i');
      e.style.left = `${rnd() * 100}%`;
      e.style.top = `${top + rnd() * h}px`;
      e.style.background = colors[i % colors.length];
      e.style.transform = `rotate(${rnd() * 360}deg)`;
      if (i % 3 === 0) {
        e.style.width = '7px';
        e.style.height = '7px';
        e.style.borderRadius = '999px';
      }
      c.append(e);
    }
  });
})();
