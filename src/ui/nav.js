// Navigation between screens without circular imports: the shell registers the handler.
let handler = null;
export const setNav = (fn) => { handler = fn; };
export const go = (view, sub = null) => handler?.(view, sub);
