'use strict';
// Reused from the existing wallpaper-renderer.mjs reading/surface implementation.
// CSS-module anchors adapted to the pinned 26.1027.51404 application.
const validColor = value => typeof value === 'string' && /^#[0-9a-f]{6}$/i.test(value);
const colorLuminance = hex => hex.slice(1).match(/../g).map(part=>parseInt(part,16)/255).map(v=>v<=.04045?v/12.92:((v+.055)/1.055)**2.4).reduce((sum,v,i)=>sum+v*[.2126,.7152,.0722][i],0);
const colorContrast = (a,b) => {const x=colorLuminance(a),y=colorLuminance(b);return(Math.max(x,y)+.05)/(Math.min(x,y)+.05)};
function readingPalette(options){
  const primary=options.customTextEnabled?options.textPrimary:'#f9fafb';
  let background=options.customTextEnabled&&colorLuminance(primary)<=.179?'#ffffff':'#101014';
  if(colorContrast(primary,background)<4.5)background=colorContrast(primary,'#ffffff')>=4.5?'#ffffff':'#000000';
  const safe=color=>colorContrast(color,background)>=4.5?color:primary;
  return {background,primary,secondary:safe(options.customTextEnabled?options.textSecondary:'#d1d5db'),link:safe(options.customTextEnabled?options.textLink:'#93c5fd')};
}

const CSS = `
#sfw-panel input[type="checkbox"] {
  appearance: auto;
  width: 15px;
  height: 15px;
  margin-inline: 6px;
  vertical-align: middle;
  accent-color: #60a5fa;
}
/* Scope changes to enabled wallpaper and the shipped Codex shell surfaces.
   No broad descendant transparency or security-policy changes. */
html[data-codex-wallpaper-enabled="true"],
html[data-codex-wallpaper-enabled="true"] body { background: transparent !important; }
html[data-codex-wallpaper-enabled="true"] body { isolation: isolate; }
html[data-codex-wallpaper-enabled="true"] #root { background-color: transparent !important; }
/* The feature rail is already transparent in the shipped desktop component.
   Its shell/left-panel backings can still paint underneath it. Clear only
   those owners that actually contain the rail; child controls keep their fill. */
html[data-codex-wallpaper-enabled="true"] :is([data-app-shell-frame],.app-shell-left-panel:not([data-slate-sidebar-peeking="true"])):has(nav[data-app-navigation-rail]) {
  background: transparent !important;
}
html[data-codex-wallpaper-enabled="true"] nav[data-app-navigation-rail]:not([data-slate-sidebar-peeking="true"] nav) {
  background-color: color-mix(in srgb, var(--color-surface, #202020) var(--codex-wallpaper-surface-opacity, 0%), transparent) !important;
}
html[data-codex-wallpaper-enabled="true"] :is(._WorkspaceContent_yl8z4_2,._WorkspaceContent_azz1c_2)::before { background-color: transparent !important; }
html[data-codex-wallpaper-enabled="true"] [data-app-shell-main-surface="default"] {
  background-color: color-mix(in srgb, var(--color-surface, #202020) var(--codex-wallpaper-surface-opacity, 0%), transparent) !important;
}
/* The shipped content pane owns a separate background, outside the main
   conversation viewport. Override that backing only; descendants keep their
   editor, media, menu and input backgrounds. */
html[data-codex-wallpaper-enabled="true"] [data-app-shell-pane-frame] {
  background-color: color-mix(in srgb, var(--app-shell-panel-background, var(--color-surface, #202020)) var(--codex-wallpaper-surface-opacity, 0%), transparent) !important;
}
/* Only the direct drawer backing in the shipped split-view gets this utility.
   Do not make arbitrary .bg-surface descendants transparent. */
html[data-codex-wallpaper-enabled="true"] .group\\/split-view > .electron\\:bg-surface {
  background-color: color-mix(in srgb, var(--color-surface, #202020) var(--codex-wallpaper-surface-opacity, 0%), transparent) !important;
}
/* Docked and peeking sidebars are the same wallpaper surface. Theme-owned
   menus and dialogs inside them keep their independent backgrounds. */
html[data-codex-wallpaper-enabled="true"] [data-slate-sidebar-content],
html[data-codex-wallpaper-enabled="true"] #app-shell-sidebar ._ConversationSidebar_1uxfp_2 {
  background-color: color-mix(in srgb, var(--color-surface, #202020) var(--codex-wallpaper-surface-opacity, 0%), transparent) !important;
}
html[data-codex-wallpaper-enabled="true"] [data-slate-sidebar-peeking="true"] [data-slate-sidebar-content] {
  box-shadow: none !important;
}
/* The shipped conversation footer has separate full-width surface and fade
   decorations. Remove those decorations, keeping the actual composer intact. */
html[data-codex-wallpaper-enabled="true"] [data-thread-scroll-footer],
html[data-codex-wallpaper-enabled="true"] [data-request-input-activity-root] div[aria-hidden="true"].pointer-events-none.absolute.inset-x-0.z-0:is(.bg-surface,.bg-gradient-to-t) {
  background: transparent !important;
}
/* The current shipped footer renders its fade inside the scroll spacer, apart
   from the footer surface. Its gradient comes from a CSS module, not the old
   .bg-gradient-to-t utility. Both parts are decoration, not input backgrounds. */
html[data-codex-wallpaper-enabled="true"] [data-request-input-activity-root] div[aria-hidden="true"]._background_18hic_2,
html[data-codex-wallpaper-enabled="true"] div[aria-hidden="true"]._MainContentTopFade_azz1c_2 {
  background: transparent !important;
}
/* Independent message reading boxes, with real padding and a visible edge.
   Never paint the whole thread/sidebar; never stack nested Markdown boxes. */
html[data-codex-wallpaper-enabled="true"][data-codex-wallpaper-readable="true"] [data-thread-user-message-navigation-content]
  :is(.markdown,[data-markdown-text-tone],[data-user-message-bubble]):not(:is(.markdown,[data-markdown-text-tone],[data-user-message-bubble]) *):not([class*="[--resource-card-row-padding-x:"],[class*="[--resource-card-row-padding-x:"] *) {
  --codex-reading-fill: var(--codex-wallpaper-reading-background, #101014);
  background-color: var(--codex-reading-fill) !important;
  border: 1px solid color-mix(in srgb, var(--codex-wallpaper-reading-primary, #f9fafb) 18%, transparent);
  border-radius: 12px;
  box-sizing: border-box;
  padding: 12px 16px;
  box-shadow: 0 2px 8px #0002;
}
/* Override only ordinary text roles in reading/navigation, preserving status,
   syntax, menus, buttons and composer palettes. All values are validated hex. */
/* Resolve the original theme tokens at the document root, before reading
   columns override them. These aliases follow theme changes without sampling
   DOM styles, observers or a renderer polling loop. */
html[data-codex-wallpaper-custom-text="true"],
html[data-codex-wallpaper-readable="true"] {
  --codex-wallpaper-theme-text: var(--color-text, #f4f4f5);
  --codex-wallpaper-theme-prose: var(--color-text-prose, var(--color-text, #f4f4f5));
  --codex-wallpaper-theme-primary: var(--color-text-primary, var(--color-text, #f4f4f5));
  --codex-wallpaper-theme-emphasis: var(--color-text-emphasis, var(--color-text, #f4f4f5));
  --codex-wallpaper-theme-secondary: var(--color-text-secondary, #a1a1aa);
  --codex-wallpaper-theme-tertiary: var(--color-text-tertiary, var(--color-text-secondary, #a1a1aa));
  --codex-wallpaper-theme-description: var(--color-token-description-foreground, var(--color-text-secondary, #a1a1aa));
  --codex-wallpaper-theme-markdown-link: var(--markdown-link-color, var(--color-token-text-link-foreground, #60a5fa));
  --codex-wallpaper-theme-link: var(--color-token-text-link-foreground, var(--markdown-link-color, #60a5fa));
}
html[data-codex-wallpaper-custom-text="true"] :is([data-thread-user-message-navigation-content],[data-slate-sidebar-content],[data-app-shell-page-header]) {
  --color-text: var(--codex-wallpaper-text-primary) !important;
  --color-text-prose: var(--codex-wallpaper-text-primary) !important;
  --color-text-primary: var(--codex-wallpaper-text-primary) !important;
  --color-text-emphasis: var(--codex-wallpaper-text-primary) !important;
  --color-text-secondary: var(--codex-wallpaper-text-secondary) !important;
  --color-text-tertiary: var(--codex-wallpaper-text-secondary) !important;
  --color-token-description-foreground: var(--codex-wallpaper-text-secondary) !important;
  --markdown-link-color: var(--codex-wallpaper-text-link) !important;
  --color-token-text-link-foreground: var(--codex-wallpaper-text-link) !important;
  color: var(--codex-wallpaper-text-primary);
}
/* The pinned ResourceCard declares this row-padding property on its root;
   variants may replace the value. Its surface remains themed, so its subtree must
   retain the theme palette (file labels, action buttons, nested diff content).
   Status/syntax tokens and every background are deliberately untouched. */
html[data-codex-wallpaper-custom-text="true"] :is([data-thread-user-message-navigation-content],[data-slate-sidebar-content],[data-app-shell-page-header]) [class*="[--resource-card-row-padding-x:"],
html[data-codex-wallpaper-enabled="true"][data-codex-wallpaper-readable="true"] [data-thread-user-message-navigation-content] [class*="[--resource-card-row-padding-x:"] {
  --color-text: var(--codex-wallpaper-theme-text) !important;
  --color-text-prose: var(--codex-wallpaper-theme-prose) !important;
  --color-text-primary: var(--codex-wallpaper-theme-primary) !important;
  --color-text-emphasis: var(--codex-wallpaper-theme-emphasis) !important;
  --color-text-secondary: var(--codex-wallpaper-theme-secondary) !important;
  --color-text-tertiary: var(--codex-wallpaper-theme-tertiary) !important;
  --color-token-description-foreground: var(--codex-wallpaper-theme-description) !important;
  --markdown-link-color: var(--codex-wallpaper-theme-markdown-link) !important;
  --color-token-text-link-foreground: var(--codex-wallpaper-theme-link) !important;
  color: var(--codex-wallpaper-theme-text);
}
html[data-codex-wallpaper-custom-text="true"] [data-thread-user-message-navigation-content] :is(.markdown,[data-markdown-text-tone]):not([class*="[--resource-card-row-padding-x:"] *) {
  --markdown-link-color: var(--codex-wallpaper-text-link) !important;
}
html[data-codex-wallpaper-custom-text="true"] :is([data-thread-user-message-navigation-content],[data-slate-sidebar-content]) :is(.markdown a,[data-markdown-text-tone] a) {
  color: var(--markdown-link-color) !important;
}
/* User Markdown reads a separate user-message token. Set it alongside prose
   tokens inside reading text, so a native white bubble cannot retain pale text. */
html[data-codex-wallpaper-enabled="true"][data-codex-wallpaper-readable="true"] [data-thread-user-message-navigation-content]
  :is(.markdown,[data-markdown-text-tone],[data-user-message-bubble]):not([class*="[--resource-card-row-padding-x:"],[class*="[--resource-card-row-padding-x:"] *) {
  --color-text: var(--codex-wallpaper-reading-primary, #f9fafb) !important;
  --color-text-prose: var(--codex-wallpaper-reading-primary, #f9fafb) !important;
  --color-text-primary: var(--codex-wallpaper-reading-primary, #f9fafb) !important;
  --color-text-emphasis: var(--codex-wallpaper-reading-primary, #f9fafb) !important;
  --color-text-user-message: var(--codex-wallpaper-reading-primary, #f9fafb) !important;
  --color-background-user-message: var(--codex-wallpaper-reading-background, #101014) !important;
  --color-text-secondary: var(--codex-wallpaper-reading-secondary, #d1d5db) !important;
  --color-text-tertiary: var(--codex-wallpaper-reading-secondary, #d1d5db) !important;
  --markdown-link-color: var(--codex-wallpaper-reading-link, #93c5fd) !important;
  color: var(--codex-wallpaper-reading-primary, #f9fafb);
}
@media (forced-colors: active) {
  html[data-codex-wallpaper-enabled="true"] [data-app-shell-main-surface="default"],
  html[data-codex-wallpaper-enabled="true"] [data-app-shell-pane-frame],
  html[data-codex-wallpaper-enabled="true"] .group\\/split-view > .electron\\:bg-surface,
  html[data-codex-wallpaper-enabled="true"] [data-slate-sidebar-content],
  html[data-codex-wallpaper-enabled="true"][data-codex-wallpaper-readable="true"] [data-thread-user-message-navigation-content] :is(.markdown,[data-markdown-text-tone],[data-user-message-bubble]) { background: Canvas !important; box-shadow: none; }
}
`;

const DEFAULTS = Object.freeze({
  readableSurfaces: true,
  surfaceOpacity: 0,
  customTextEnabled: false,
  textPrimary: '#ffffff',
  textSecondary: '#d1d5db',
  textLink: '#60a5fa',
});

function normalize(value = {}) {
  const result = { ...DEFAULTS };
  for (const key of ['readableSurfaces', 'customTextEnabled']) {
    if (typeof value[key] === 'boolean') result[key] = value[key];
  }
  if (Number.isFinite(value.surfaceOpacity)) {
    result.surfaceOpacity = Math.min(100, Math.max(0, value.surfaceOpacity));
  }
  for (const key of ['textPrimary', 'textSecondary', 'textLink']) {
    if (validColor(value[key])) result[key] = value[key];
  }
  return result;
}

function update(current, request) {
  const next = normalize(current);
  for (const key of Object.keys(DEFAULTS)) {
    if (Object.hasOwn(request, key)) {
      const candidate = normalize({ ...next, [key]: request[key] });
      next[key] = candidate[key];
    }
  }
  return next;
}

function mount(document, panel, commit) {
  const root = document.documentElement;
  const style = document.createElement('style');
  style.id = 'sfw-appearance-style';
  style.textContent = CSS;
  document.head.append(style);
  const section = document.createElement('fieldset');
  section.id = 'sfw-reading-controls';
  section.style.cssText = 'border:0;border-top:1px solid #ffffff30;padding:12px 0 0;margin:14px 0 0';
  const legend = document.createElement('legend');
  legend.textContent = '阅读与界面';
  section.append(legend);
  const controls = {};
  for (const [key, title, type] of [
    ['readableSurfaces', '文字阅读底框', 'checkbox'],
    ['surfaceOpacity', '界面底色强度', 'range'],
    ['customTextEnabled', '自定义文字颜色', 'checkbox'],
    ['textPrimary', '正文颜色', 'color'],
    ['textSecondary', '辅助文字颜色', 'color'],
    ['textLink', '链接颜色', 'color'],
  ]) {
    const label = document.createElement('label');
    label.append(document.createTextNode(title + ' '));
    const input = document.createElement('input');
    input.type = type;
    input.id = 'sfw-' + key;
    input.setAttribute('aria-label', title);
    if (type === 'range') { input.min = '0'; input.max = '100'; input.step = '5'; }
    input.onchange = () => commit({ [key]: type === 'checkbox' ? input.checked : type === 'range' ? Number(input.value) : input.value });
    label.append(input);
    section.append(label);
    controls[key] = input;
  }
  panel.append(section);
  return {
    apply(state) {
      const options = normalize(state);
      const enabled = !!state.enabled && (!!state.url || state.kind === 'we');
      root.dataset.codexWallpaperEnabled = String(enabled);
      root.dataset.codexWallpaperReadable = String(enabled && options.readableSurfaces);
      root.dataset.codexWallpaperCustomText = String(enabled && options.customTextEnabled);
      root.style.setProperty('--codex-wallpaper-surface-opacity', options.surfaceOpacity + '%');
      for (const [key, value] of Object.entries(readingPalette(options))) {
        root.style.setProperty('--codex-wallpaper-reading-' + key, value);
      }
      for (const key of ['Primary', 'Secondary', 'Link']) {
        root.style.setProperty('--codex-wallpaper-text-' + key.toLowerCase(), options['text' + key]);
      }
      for (const [key, input] of Object.entries(controls)) {
        if (input.type === 'checkbox') input.checked = options[key];
        else input.value = String(options[key]);
        if (input.type === 'color') input.disabled = !options.customTextEnabled;
      }
    },
  };
}

module.exports = { CSS, normalize, update, readingPalette, colorContrast, mount };
