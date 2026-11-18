import { createRequire } from 'node:module';
import plugin from 'tailwindcss/plugin';
import type { Config } from 'tailwindcss';

const require = createRequire(import.meta.url);
const tokens = require('../docs/design/tokens.json') as {
  color: {
    theme: Record<string, GuestTheme>;
    shared: { error: string };
    app: Record<string, string>;
  };
  font: { serif: { family: string }; sans: { family: string } };
  space: Record<string, number>;
  radius: { sm: number; md: number; lg: number; pill: number; device: number };
  shadow: Record<string, string>;
  typeScale: Record<string, { size: number; lineHeight: number; letterSpacing?: string }>;
};

type GuestTheme = {
  bg: string;
  surface: string;
  text: string;
  text2: string;
  line: string;
  accent: string;
  accentPressed: string;
  onAccent: string;
  outer: string;
};

function family(value: string): string[] {
  return value.split(',').map((part) => part.trim().replace(/^'|'$/g, ''));
}

function guestVars(theme: GuestTheme): Record<string, string> {
  return {
    '--guest-bg': theme.bg,
    '--guest-surface': theme.surface,
    '--guest-text': theme.text,
    '--guest-text2': theme.text2,
    '--guest-line': theme.line,
    '--guest-accent': theme.accent,
    '--guest-accent-pressed': theme.accentPressed,
    '--guest-on-accent': theme.onAccent,
    '--guest-outer': theme.outer,
  };
}

const spacing = Object.fromEntries(Object.entries(tokens.space).map(([key, value]) => [key, `${value}px`]));

function fontSize(name: string): [string, { lineHeight: string; letterSpacing?: string }] {
  const scale = tokens.typeScale[name];
  return [`${scale.size}px`, { lineHeight: String(scale.lineHeight), letterSpacing: scale.letterSpacing }];
}

const config: Config = {
  theme: {
    extend: {
      spacing,
      colors: {
        bg: 'var(--guest-bg)',
        surface: 'var(--guest-surface)',
        ink: 'var(--guest-text)',
        mute: 'var(--guest-text2)',
        line: 'var(--guest-line)',
        accent: 'var(--guest-accent)',
        'accent-pressed': 'var(--guest-accent-pressed)',
        'on-accent': 'var(--guest-on-accent)',
        outer: 'var(--guest-outer)',
        error: tokens.color.shared.error,
        app: tokens.color.app,
      },
      fontFamily: {
        serif: family(tokens.font.serif.family),
        sans: family(tokens.font.sans.family),
      },
      fontSize: {
        eyebrow: fontSize('eyebrow'),
        'display-name': fontSize('displayName'),
        heading: fontSize('heading'),
        title: fontSize('title'),
        'display-date': fontSize('displayDate'),
        'display-date-xl': fontSize('displayDateXL'),
        body: fontSize('body'),
        label: fontSize('label'),
        caption: fontSize('caption'),
        'app-title': fontSize('appTitle'),
        'app-section': fontSize('appSection'),
        'app-body': fontSize('appBody'),
        'app-input': fontSize('appInputMobile'),
        'app-label': fontSize('appLabel'),
        'app-caption': fontSize('appCaption'),
      },
      borderRadius: {
        sm: `${tokens.radius.sm}px`,
        md: `${tokens.radius.md}px`,
        lg: `${tokens.radius.lg}px`,
        pill: `${tokens.radius.pill}px`,
        device: `${tokens.radius.device}px`,
      },
      boxShadow: {
        envelope: tokens.shadow.envelope,
        floating: tokens.shadow.floating,
        toast: tokens.shadow.toast,
        card: tokens.shadow.card,
        dialog: tokens.shadow.dialog,
        sheet: tokens.shadow.sheet,
        'preview-frame': tokens.shadow.previewFrame,
      },
      maxWidth: {
        column: '430px',
        content: '342px',
      },
      transitionTimingFunction: {
        standard: 'cubic-bezier(0.2, 0, 0, 1)',
        enter: 'cubic-bezier(0.16, 1, 0.3, 1)',
        exit: 'cubic-bezier(0.4, 0, 1, 1)',
        'in-out-soft': 'cubic-bezier(0.65, 0, 0.35, 1)',
      },
    },
  },
  plugins: [
    plugin(({ addBase }) => {
      const ivory = tokens.color.theme.ivory;
      const sage = tokens.color.theme.sage;
      const mist = tokens.color.theme.mist;
      addBase({
        ':root': {
          '--drop-envelope': tokens.shadow.envelope,
          '--app-bg': tokens.color.app.bg,
          '--app-surface': tokens.color.app.surface,
          '--app-sunken': tokens.color.app.sunken,
          '--app-selected': tokens.color.app.selected,
          '--app-text': tokens.color.app.text,
          '--app-text2': tokens.color.app.text2,
          '--app-line': tokens.color.app.line,
          '--app-border': tokens.color.app.border,
          '--app-primary': tokens.color.app.primary,
          '--app-primary-pressed': tokens.color.app.primaryPressed,
          '--app-on-primary': tokens.color.app.onPrimary,
          '--app-focus': tokens.color.app.focus,
          '--app-success': tokens.color.app.success,
          '--app-warning': tokens.color.app.warning,
          '--app-error': tokens.color.app.error,
          '--app-info': tokens.color.app.info,
          '--app-scrim': tokens.color.app.scrim,
        },
        ':root, [data-theme="ivory"]': guestVars(ivory),
        '[data-theme="sage"]': guestVars(sage),
        '[data-theme="mist"]': guestVars(mist),
        'body:has([data-theme="ivory"])': { background: ivory.outer },
        'body:has([data-theme="sage"])': { background: sage.outer },
        'body:has([data-theme="mist"])': { background: mist.outer },
      });
    }),
  ],
};

export default config;
