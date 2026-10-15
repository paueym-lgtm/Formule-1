"use strict";
// Load after paddock.js. Reuse the Egypt track already registered in index.html.
if (!otherCatalog.some(c => c.key === 'egypt')) {
  otherCatalog.push({
    key: 'egypt', country: 'Égypte', name: 'Soliman Le Magnifique',
    city: 'Sharm el-Sheikh', code: 'EG', length: TRACKS.egypt.length
  });
}
const previousCatalogUpdate = updateCatalogFromTrack;
$('trackSel').removeEventListener('change', previousCatalogUpdate);
updateCatalogFromTrack = function () {
  catalogSelection = trackKey;
  catalogCategory = otherCatalog.some(c => c.key === trackKey) ? 'other' : 'gp';
  const c = [...gpCatalog, ...otherCatalog].find(c => c.key === trackKey);
  if (c) $('lobbyTrackName').textContent = `${c.country} · ${c.name}`;
};
{
  const select = $('trackSel');
  let group = [...select.querySelectorAll('optgroup')].find(g => g.label === 'Autres circuits');
  if (!group) { group = document.createElement('optgroup'); group.label = 'Autres circuits'; select.append(group); }
  if (!select.querySelector('option[value="egypt"]')) {
    const option = document.createElement('option');
    option.value = 'egypt'; option.textContent = 'Égypte · Soliman Le Magnifique'; group.append(option);
  }
  select.value = trackKey;
}
updateCatalogFromTrack();
if (!$('pdCatalog').hidden) { renderCatalog(); renderCatalogDetail(); }
$('trackSel').addEventListener('change', updateCatalogFromTrack);
