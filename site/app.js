(() => {
  'use strict';
  const data = window.WICHTEL_DATA;
  const select = document.getElementById('person');
  const result = document.getElementById('result');
  const status = document.getElementById('status');
  const open = document.getElementById('open-letter');
  if (!data || !Number.isInteger(data.year) || !Array.isArray(data.people) || !data.allocations) {
    select.options[0].textContent = 'Zurzeit nicht verfügbar';
    status.textContent = 'Der Wichtelbrief konnte nicht geladen werden. Bitte versuche es später erneut.';
    return;
  }
  document.title = `Wichteln ${data.year}`;
  document.getElementById('year').textContent = `Weihnachten ${data.year}`;
  document.getElementById('edition').textContent = data.year;
  document.getElementById('demo').hidden = !data.demo;
  select.options[0].textContent = 'Bitte wähle deinen Namen';
  data.people.forEach(name => select.add(new Option(name, name)));
  select.disabled = false;
  open.disabled = false;
  const close = () => { result.hidden = true; status.textContent = ''; };
  select.addEventListener('change', close);
  document.getElementById('reveal-form').addEventListener('submit', event => {
    event.preventDefault();
    const name = select.value;
    const recipients = data.allocations[name];
    if (!name || !Array.isArray(recipients) || recipients.length !== 2) {
      close(); status.textContent = 'Für diesen Namen liegt keine gültige Zuordnung vor.'; return;
    }
    document.getElementById('greeting').textContent = `Hallo ${name},`;
    const list = document.getElementById('recipients');
    list.replaceChildren();
    recipients.forEach(recipient => {
      const item = document.createElement('div'); item.className = 'recipient';
      const mark = document.createElement('span'); mark.className = 'recipient-mark'; mark.textContent = '✳'; mark.setAttribute('aria-hidden', 'true');
      const label = document.createElement('span'); label.textContent = recipient;
      item.append(mark, label); list.append(item);
    });
    status.textContent = ''; result.hidden = false;
  });
  document.getElementById('close-letter').addEventListener('click', () => { close(); open.focus(); });
  document.getElementById('about-toggle').addEventListener('click', event => {
    const about = document.getElementById('about'); about.hidden = !about.hidden;
    event.currentTarget.setAttribute('aria-expanded', String(!about.hidden));
  });
})();
