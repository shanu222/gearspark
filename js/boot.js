/* GearSpark — boot: show a friendly recovery screen if anything fails at runtime. */
(function () {
  'use strict';
  function fatal() {
    var f = document.getElementById('fatal');
    if (f) f.hidden = false;
  }
  window.addEventListener('error', function (e) {
    // Ignore errors from browser extensions or other origins.
    if (e.filename && e.filename.indexOf(location.origin) !== 0 && location.protocol !== 'file:') return;
    fatal();
  });
  window.addEventListener('unhandledrejection', fatal);
  document.addEventListener('DOMContentLoaded', function () {
    var b = document.getElementById('btn-reload');
    if (b) b.addEventListener('click', function () { location.reload(); });
  });
})();
