export type Theme = "light" | "dark";

/** Clave de `localStorage` con la elección explícita de la persona. Sin ella se sigue el sistema. */
export const THEME_STORAGE_KEY = "theme";

/**
 * Script en línea del `<head>`: fija `data-theme` en `<html>` antes del primer pintado
 * (elección guardada o, en la primera visita, `prefers-color-scheme`), para evitar el parpadeo.
 */
export const THEME_INIT_SCRIPT = `(function(){var t;try{t=localStorage.getItem("${THEME_STORAGE_KEY}")}catch(e){}if(t!=="light"&&t!=="dark"){t=window.matchMedia("(prefers-color-scheme: dark)").matches?"dark":"light"}document.documentElement.dataset.theme=t})();`;
