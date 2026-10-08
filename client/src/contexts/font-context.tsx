import { createContext, useContext, useState, useEffect, ReactNode } from 'react';

type FontType = 'Source Sans 3' | 'Inter' | 'Merriweather' | 'Poppins' | 'Roboto Slab';

interface FontContextType {
  font: FontType;
  setFont: (font: FontType) => void;
}

const FontContext = createContext<FontContextType | undefined>(undefined);

export function FontProvider({ children }: { children: ReactNode }) {
  const [font, setFont] = useState<FontType>('Source Sans 3');

  useEffect(() => {
    // Load saved font preference from localStorage, use v2 key to bust old caches
    const savedFont = localStorage.getItem('preferred-font-v2') as FontType;
    if (savedFont) {
      setFont(savedFont);
      applyFont(savedFont);
    } else {
      // Apply default font immediately if no saved preference
      applyFont('Source Sans 3');
    }
  }, []);

  const applyFont = (newFont: FontType) => {
    // Remove any existing font classes
    document.body.classList.remove('font-sourcesans3', 'font-inter', 'font-merriweather', 'font-poppins', 'font-robotoslab');

    // Add the new font class
    const fontClass = `font-${newFont.toLowerCase().replaceAll(' ', '')}`;
    document.body.classList.add(fontClass);

    // Set the font family directly as well
    document.body.style.fontFamily = `'${newFont}', sans-serif`;

    console.log('Applied font:', newFont, 'with class:', fontClass);
  };

  const handleSetFont = (newFont: FontType) => {
    console.log('Setting font to:', newFont);
    setFont(newFont);
    localStorage.setItem('preferred-font-v2', newFont);
    applyFont(newFont);
  };

  return (
    <FontContext.Provider value={{ font, setFont: handleSetFont }}>
      {children}
    </FontContext.Provider>
  );
}

export function useFont() {
  const context = useContext(FontContext);
  if (context === undefined) {
    throw new Error('useFont must be used within a FontProvider');
  }
  return context;
}
