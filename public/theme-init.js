// Runs before the app and stylesheet to avoid flashing the wrong appearance.
(function () {
  var preference = 'system';
  try {
    var stored = localStorage.getItem('repo-atlas:theme');
    if (stored === 'light' || stored === 'dark') preference = stored;
  } catch (_) {
    // Private/restricted storage must not prevent the viewer from opening.
  }
  var theme =
    preference === 'system'
      ? matchMedia('(prefers-color-scheme: dark)').matches
        ? 'dark'
        : 'light'
      : preference;
  document.documentElement.dataset.theme = theme;
  document.documentElement.dataset.themePreference = preference;
  document.documentElement.style.colorScheme = theme;
  var meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.content = theme === 'light' ? '#f5f7f2' : '#101312';
})();
