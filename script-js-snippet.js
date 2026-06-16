let deferredInstallPrompt = null;

window.addEventListener("beforeinstallprompt", (event) => {
  event.preventDefault();
  deferredInstallPrompt = event;

  const installBtn = document.getElementById("installBtn");
  if (installBtn) installBtn.style.display = "inline-flex";
});

window.addEventListener("appinstalled", () => {
  deferredInstallPrompt = null;
  const installBtn = document.getElementById("installBtn");
  if (installBtn) installBtn.style.display = "none";
});

async function promptInstall() {
  if (!deferredInstallPrompt) return;

  deferredInstallPrompt.prompt();
  await deferredInstallPrompt.userChoice;

  deferredInstallPrompt = null;

  const installBtn = document.getElementById("installBtn");
  if (installBtn) installBtn.style.display = "none";
}
