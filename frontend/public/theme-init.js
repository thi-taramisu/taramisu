// Runs before the application and its styles to avoid a flash of the wrong theme.
// Keep the storage keys in sync with src/features/theme/theme.ts.
(() => {
  let theme = 'light'
  let scheme = 'neutral'
  try {
    if (localStorage.getItem('taramisu.theme') === 'dark') theme = 'dark'
    const savedScheme = localStorage.getItem('taramisu.colorScheme')
    if (savedScheme === 'ocean' || savedScheme === 'iris') scheme = savedScheme
  } catch {
    // Storage can be unavailable; light and neutral remain the defaults.
  }
  document.documentElement.dataset.colorScheme = scheme
  document.documentElement.classList.toggle('dark', theme === 'dark')
  document.documentElement.style.colorScheme = theme
})()
