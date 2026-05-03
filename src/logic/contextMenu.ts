export function installGlobalContextMenuBlocker(target: EventTarget = window) {
  const blockContextMenu = (event: Event) => {
    event.preventDefault();
  };

  target.addEventListener("contextmenu", blockContextMenu, { capture: true });

  return () => {
    target.removeEventListener("contextmenu", blockContextMenu, { capture: true });
  };
}
