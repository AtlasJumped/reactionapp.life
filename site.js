(function () {
  try {
    var els = document.querySelectorAll('.way,.cards li,.status>div,.moments li,.cgrid li');
    if (!('IntersectionObserver' in window)) return;
    els.forEach(function (e) { e.classList.add('reveal'); });
    var io = new IntersectionObserver(function (en) {
      en.forEach(function (x) { if (x.isIntersecting) { x.target.classList.add('in'); io.unobserve(x.target); } });
    }, { threshold: 0.12 });
    els.forEach(function (e) { io.observe(e); });
  } catch (e) { }
})();
