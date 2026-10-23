(() => {
  'use strict';
  const data = window.WICHTEL_DATA;
  const select = document.getElementById('person');
  const result = document.getElementById('result');
  const status = document.getElementById('status');
  const open = document.getElementById('open-letter');
  const confirmation = document.getElementById('confirmation');
  let pendingName = null;
  if (!data || !Number.isInteger(data.year) || !Array.isArray(data.people) || !data.allocations) {
    select.options[0].textContent = 'Zurzeit nicht verfügbar';
    status.textContent = 'Der Wichtelbrief konnte nicht geladen werden. Bitte versuche es später erneut.';
    return;
  }
  document.title = `Wichteln ${data.year}`;
  const yearLabel = document.getElementById('year');
  if (yearLabel) yearLabel.textContent = `Weihnachten ${data.year}`;
  document.getElementById('edition').textContent = data.year;
  document.getElementById('demo').hidden = !data.demo;
  select.options[0].textContent = 'Bitte wähle deinen Namen';
  data.people.forEach(name => select.add(new Option(name, name)));
  select.disabled = false;
  open.disabled = false;
  const close = () => {
    result.hidden = true;
    document.getElementById('recipients').replaceChildren();
    document.getElementById('greeting').textContent = '';
    status.textContent = '';
    pendingName = null;
    if (confirmation.open) confirmation.close('cancel');
  };
  select.addEventListener('change', close);
  document.getElementById('reveal-form').addEventListener('submit', event => {
    event.preventDefault();
    const name = select.value;
    const recipients = data.allocations[name];
    if (!name || !Array.isArray(recipients) || recipients.length !== 2) {
      close(); status.textContent = 'Für diesen Namen liegt keine gültige Zuordnung vor.'; return;
    }
    close();
    pendingName = name;
    document.getElementById('confirmation-title').textContent = `Bist du wirklich ${name}?`;
    document.getElementById('confirmation-description').textContent = `Du öffnest den Wichtelbrief für ${name}. Bitte bestätige nur, wenn das dein eigener Name ist.`;
    confirmation.showModal();
  });
  confirmation.addEventListener('close', () => {
    const name = pendingName;
    pendingName = null;
    if (confirmation.returnValue !== 'confirm' || !name || select.value !== name) return;
    const recipients = data.allocations[name];
    document.getElementById('greeting').textContent = `Hallo ${name},`;
    const list = document.getElementById('recipients');
    list.replaceChildren();
    recipients.forEach(recipient => {
      const item = document.createElement('div'); item.className = 'recipient';
      const mark = document.createElement('img'); mark.className = 'recipient-mark'; mark.src = 'star.svg'; mark.alt = ''; mark.setAttribute('aria-hidden', 'true');
      const label = document.createElement('span'); label.textContent = recipient;
      item.append(mark, label); list.append(item);
    });
    status.textContent = ''; result.hidden = false;
  });
  document.getElementById('close-letter').addEventListener('click', () => { close(); open.focus(); });
})();
