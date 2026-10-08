/** @type {import('tailwindcss').Config} */
module.exports = {
  darkMode: ["class"],
  content: [
    './pages/**/*.{ts,tsx}',
    './components/**/*.{ts,tsx}',
    './app/**/*.{ts,tsx}',
    './src/**/*.{ts,tsx}',
    './index.html',
    './src/**/*.{js,ts,jsx,tsx}',
  ],
  theme: {
    container: {
      center: true,
      padding: "2rem",
      screens: {
        "2xl": "1400px",
      },
    },
    extend: {
      colors: {
        border: "hsl(var(--border))",
        input: "hsl(var(--input))",
        ring: "hsl(var(--ring))",
        background: "hsl(var(--background))",
        foreground: "hsl(var(--foreground))",
        primary: {
          DEFAULT: "hsl(var(--primary))",
          foreground: "hsl(var(--primary-foreground))",
        },
        secondary: {
          DEFAULT: "hsl(var(--secondary))",
          foreground: "hsl(var(--secondary-foreground))",
        },
        destructive: {
          DEFAULT: "hsl(var(--destructive))",
          foreground: "hsl(var(--destructive-foreground))",
        },
        muted: {
          DEFAULT: "hsl(var(--muted))",
          foreground: "hsl(var(--muted-foreground))",
        },
        accent: {
          DEFAULT: "hsl(var(--accent))",
          foreground: "hsl(var(--accent-foreground))",
        },
        popover: {
          DEFAULT: "hsl(var(--popover))",
          foreground: "hsl(var(--popover-foreground))",
        },
        card: {
          DEFAULT: "hsl(var(--card))",
          foreground: "hsl(var(--card-foreground))",
        },
      },
      borderRadius: {
        DEFAULT: "calc(var(--radius) - 6px)",
        lg: "var(--radius)",
        md: "calc(var(--radius) - 2px)",
        sm: "calc(var(--radius) - 4px)",
        xl: "calc(var(--radius) + 2px)",
        "2xl": "calc(var(--radius) + 4px)",
        "3xl": "calc(var(--radius) + 8px)",
      },
      keyframes: {
        "accordion-down": {
          from: { height: 0 },
          to: { height: "var(--radix-accordion-content-height)" },
        },
        "accordion-up": {
          from: { height: "var(--radix-accordion-content-height)" },
          to: { height: 0 },
        },
      },
      animation: {
        "accordion-down": "accordion-down 0.2s ease-out",
        "accordion-up": "accordion-up 0.2s ease-out",
      },
      typography: {
        DEFAULT: {
          css: {
            maxWidth: 'none',
            color: 'hsl(var(--obsidian-text))',
            a: {
              color: 'hsl(var(--purple-400))',
              '&:hover': {
                color: 'hsl(var(--purple-300))',
              },
            },
            h1: {
              color: 'hsl(var(--obsidian-text))',
            },
            h2: {
              color: 'hsl(var(--obsidian-text))',
            },
            h3: {
              color: 'hsl(var(--obsidian-text))',
            },
            h4: {
              color: 'hsl(var(--obsidian-text))',
            },
            h5: {
              color: 'hsl(var(--obsidian-text))',
            },
            h6: {
              color: 'hsl(var(--obsidian-text))',
            },
            strong: {
              color: 'hsl(var(--obsidian-text))',
            },
            code: {
              color: 'hsl(var(--obsidian-text))',
              backgroundColor: 'hsl(var(--obsidian-panel))',
              padding: '0.2em 0.4em',
              borderRadius: '0.25rem',
            },
            pre: {
              backgroundColor: 'hsl(var(--obsidian-panel))',
              color: 'hsl(var(--obsidian-text))',
            },
            blockquote: {
              borderLeftColor: 'hsl(var(--obsidian-border))',
              color: 'hsl(var(--obsidian-text-muted))',
            },
            hr: {
              borderColor: 'hsl(var(--obsidian-border))',
            },
            ol: {
              color: 'hsl(var(--obsidian-text))',
            },
            ul: {
              color: 'hsl(var(--obsidian-text))',
            },
            li: {
              color: 'hsl(var(--obsidian-text))',
            },
            p: {
              color: 'hsl(var(--obsidian-text))',
            },
          },
        },
      },
      fontFamily: {
        sans: ['"Source Sans 3"', 'sans-serif'],
        sourceSans3: ['"Source Sans 3"', 'sans-serif'],
        inter: ['Inter', 'sans-serif'],
        merriweather: ['Merriweather', 'serif'],
        poppins: ['Poppins', 'sans-serif'],
        robotoSlab: ['Roboto Slab', 'serif'],
        ibmPlexMono: ['IBM Plex Mono', 'monospace'],
      },
      fontWeight: {
        normal: '400',
        medium: '500',
        semibold: '600',
        bold: '650',
      },
    },
  },
  plugins: [require("tailwindcss-animate"), require("@tailwindcss/typography")],
}
