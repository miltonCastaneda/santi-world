/** Ícono de aviso cuando no se pudo guardar. Sin texto de error: el detalle queda para los padres. */
export function setupSaveWarning(): { show(): void; hide(): void } {
  const icon = document.createElement("div");
  icon.className = "save-warning";
  icon.setAttribute("role", "status");
  icon.setAttribute("aria-label", "No se pudo guardar");
  icon.textContent = "⚠️💾";
  icon.hidden = true;
  document.body.append(icon);
  return {
    show: () => (icon.hidden = false),
    hide: () => (icon.hidden = true),
  };
}
