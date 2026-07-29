(() => {
  const button = document.querySelector(".yk-page-top");
  if (!button) return;

  const sync = () => button.classList.toggle("is-visible", window.scrollY > 480);
  button.addEventListener("click", () => {
    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    window.scrollTo({ top: 0, behavior: reduceMotion ? "auto" : "smooth" });
  });
  window.addEventListener("scroll", sync, { passive: true });
  sync();
})();
