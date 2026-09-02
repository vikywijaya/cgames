'use strict';
(function() {
  // ── Auto-hide back button when lobby phase is not active ──
  const btn = document.querySelector('.tv-back-btn');
  const lobby = document.getElementById('lobbyPhase')
    || document.getElementById('lobby')
    || document.querySelector('.tv-lobby');

  const logo = document.querySelector('.tv-logo');

  if (lobby) {
    function updateLobbyElements() {
      const lobbyVisible = lobby.classList.contains('active')
        || (!lobby.classList.contains('hidden') && getComputedStyle(lobby).display !== 'none');
      if (btn) {
        btn.style.opacity = lobbyVisible ? '' : '0';
        btn.style.pointerEvents = lobbyVisible ? '' : 'none';
      }
      if (logo) {
        logo.style.opacity = lobbyVisible ? '' : '0';
        logo.style.pointerEvents = lobbyVisible ? '' : 'none';
      }
    }
    new MutationObserver(updateLobbyElements).observe(lobby, { attributes: true, attributeFilter: ['class', 'style'] });
    updateLobbyElements();
  }

  // ── Hide lottie animation when players have joined ──
  const lottie = document.querySelector('.tv-qr-lottie');
  const playerList = document.getElementById('lobbyPlayerList')
    || document.querySelector('.player-list');
  if (lottie && playerList) {
    function updateLottie() {
      const hasPlayers = playerList.querySelector('.tv-player-item, .player-chip');
      lottie.style.display = hasPlayers ? 'none' : '';
    }
    new MutationObserver(updateLottie).observe(playerList, { childList: true, subtree: true });
    updateLottie();
  }
})();
