(function () {
  'use strict';

  var DEFERRED_PROMPT = null;
  var INSTALL_FLAG_KEY = 'nebras_install_dismissed';

  /* ============================================
     1. SERVICE WORKER REGISTRATION + UPDATE
     ============================================ */
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('./sw.js').then(function(reg) {
      // Detect new SW waiting to activate
      reg.addEventListener('updatefound', function() {
        var newWorker = reg.installing;
        newWorker.addEventListener('statechange', function() {
          if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
            // New version available — activate immediately
            newWorker.postMessage({ action: 'skipWaiting' });
          }
        });
      });

      // Check for updates every 30 minutes
      setInterval(function() { reg.update(); }, 30 * 60 * 1000);
    }).catch(function () {});

    // Reload when new SW takes control
    var refreshing = false;
    navigator.serviceWorker.addEventListener('controllerchange', function() {
      if (!refreshing) {
        refreshing = true;
        window.location.reload();
      }
    });
  }

  /* ============================================
     2. INSTALL PROMPT (Mobile only)
     ============================================ */
  function isMobile() {
    return /Mobi|Android|iPhone|iPad|iPod|webOS|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent)
      || (window.matchMedia && window.matchMedia('(max-width: 900px)').matches);
  }

  function isInstallExpired() {
    var val = localStorage.getItem(INSTALL_FLAG_KEY);
    if (!val) return true;
    if (val === 'installed') return false;
    var ts = parseInt(val, 10);
    if (isNaN(ts)) return true;
    return Date.now() - ts > 7 * 24 * 60 * 60 * 1000;
  }

  function markInstallDismissed() {
    localStorage.setItem(INSTALL_FLAG_KEY, String(Date.now()));
  }

  function markInstallAccepted() {
    localStorage.setItem(INSTALL_FLAG_KEY, 'installed');
  }

  function showInstallModal() {
    var overlay = document.createElement('div');
    overlay.className = 'nebras-install-overlay active';
    overlay.innerHTML =
      '<div class="nebras-install-modal">'
        + '<div class="nebras-install-header">'
          + '<img src="./assets/image/icon-192.png" alt="Nebras">'
          + '<div>'
            + '<h3>Nebras</h3>'
            + '<p>Psychologie en ligne</p>'
          + '</div>'
        + '</div>'
        + '<div class="nebras-install-body">Installez l\'application pour un accès rapide et une expérience optimale.</div>'
        + '<div class="nebras-install-actions">'
          + '<button class="nebras-install-later" id="nebrasInstallLater">Plus tard</button>'
          + '<button class="nebras-install-btn" id="nebrasInstallConfirm">Télécharger</button>'
        + '</div>'
      + '</div>';

    document.body.appendChild(overlay);

    document.getElementById('nebrasInstallConfirm').addEventListener('click', function () {
      if (DEFERRED_PROMPT) {
        DEFERRED_PROMPT.prompt();
        DEFERRED_PROMPT.userChoice.then(function (choiceResult) {
          if (choiceResult.outcome === 'accepted') {
            markInstallAccepted();
          }
          DEFERRED_PROMPT = null;
        });
      }
      overlay.remove();
    });

    document.getElementById('nebrasInstallLater').addEventListener('click', function () {
      markInstallDismissed();
      overlay.remove();
    });
  }

  window.addEventListener('beforeinstallprompt', function (e) {
    DEFERRED_PROMPT = e;
    if (isMobile() && isInstallExpired()) {
      e.preventDefault();
      showInstallModal();
    }
  });

  window.addEventListener('appinstalled', function () {
    markInstallAccepted();
    DEFERRED_PROMPT = null;
  });

  /* ============================================
     3. SPLASH SCREEN (Mobile only)
     ============================================ */
  var splash = document.querySelector('.nebras-splash');
  if (splash) {
    if (!isMobile()) {
      splash.style.display = 'none';
    } else {
      var hasSeenSplash = sessionStorage.getItem('nebras_splash_seen');
      if (hasSeenSplash) {
        splash.classList.add('hidden');
      } else {
        sessionStorage.setItem('nebras_splash_seen', 'true');
        var MIN_DISPLAY_MS = 1500;
        var MAX_DISPLAY_MS = 3000;
        var startTime = Date.now();
        var hidden = false;

        function hideSplash() {
          if (hidden) return;
          hidden = true;
          var elapsed = Date.now() - startTime;
          var delay = Math.max(0, MIN_DISPLAY_MS - elapsed);
          setTimeout(function () {
            splash.classList.add('hidden');
            setTimeout(function () {
              splash.style.display = 'none';
            }, 500);
          }, delay);
        }

        window.addEventListener('load', hideSplash);
        setTimeout(hideSplash, MAX_DISPLAY_MS);
      }
    }
  }

})();
