const toggle = document.getElementById('theme-toggle');

function updateThemeButton() {
  const light = document.documentElement.classList.contains('light-mode');
  toggle.textContent = light ? '☾' : '☼';
  toggle.setAttribute('aria-label', `Switch to ${light ? 'dark' : 'light'} theme`);
  toggle.title = `Switch to ${light ? 'dark' : 'light'} theme`;
}

updateThemeButton();
toggle.addEventListener('click', () => {
  document.documentElement.classList.toggle('light-mode');
  localStorage.setItem('theme', document.documentElement.classList.contains('light-mode') ? 'light' : 'dark');
  updateThemeButton();
});
