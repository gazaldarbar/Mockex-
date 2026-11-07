(function () {
  'use strict';
  UI.shell();
  const go = () => { App.recordEquity(true); UI.render(); App.start(); };
  if (!Store.s.onboarded) UI.onboarding(go); else go();

  // Android hardware back button when packaged with Capacitor
  try {
    const cap = window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins.App;
    if (cap && cap.addListener) cap.addListener('backButton', () => {
      if (App.overlays.length || document.querySelector('.sheet.on')) history.back();
      else if (App.tab !== 'home') App.go('home'); else cap.exitApp();
    });
  } catch (e) { /* not in Capacitor */ }

  if ('serviceWorker' in navigator && /^https?:$/.test(location.protocol) && !window.Capacitor) navigator.serviceWorker.register('sw.js').catch(() => {});
  window.addEventListener('resize', () => { const on = document.querySelector('#tabbar button.on'), b = document.querySelector('#tabbar .blob'); if (on && b) b.style.transform = `translateX(${on.offsetLeft}px)`; });
})();
