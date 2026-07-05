(() => {
  window.addEventListener('load', () => {
    import('/photo-permission-ui.js?v=1').catch(() => {});
  });
})();
