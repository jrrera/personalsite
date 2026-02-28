document.addEventListener('DOMContentLoaded', function () {
  var logo = document.querySelector('.header__logo');
  if (!logo) return;

  var container = document.createElement('div');
  container.className = 'logo-bars';

  // Each bar is 2px wide + 8px gap = 10px per unit, matching the original gradient
  var numBars = 100;
  var staggerSeconds = 0.07;

  for (var i = 0; i < numBars; i++) {
    var bar = document.createElement('div');
    bar.className = 'logo-bar';
    bar.style.animationDelay = (i * staggerSeconds) + 's';
    container.appendChild(bar);
  }

  logo.appendChild(container);
  logo.classList.add('logo-bars-ready');
});
