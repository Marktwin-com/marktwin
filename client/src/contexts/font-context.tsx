import { createContext, useContext, useState, useEffect, ReactNode } from 'react';

type FontType = 'Inter' | 'Merriweather' | 'Poppins' | 'Roboto Slab';

interface FontContextType {
  font: FontType;
  setFont: (font: FontType) => void;
}

const FontContext = createContext<FontContextType | undefined>(undefined);

export function FontProvider({ children }: { children: ReactNode }) {
  const [font, setFont] = useState<FontType>('Inter');

  useEffect(() => {
    // Load saved font preference from localStorage
    const savedFont = localStorage.getItem('preferred-font') as FontType;
    if (savedFont) {
      setFont(savedFont);
      applyFont(savedFont);
    }
  }, []);

  const applyFont = (newFont: FontType) => {
    // Remove any existing font classes
    document.body.classList.remove('font-inter', 'font-merriweather', 'font-poppins', 'font-robotoSlab');
    
    // Add the new font class
    const fontClass = `font-${newFont.toLowerCase().replace(' ', '')}`;
    document.body.classList.add(fontClass);
    
    // Set the font family directly as well
    document.body.style.fontFamily = `${newFont}, sans-serif`;
    
    console.log('Applied font:', newFont, 'with class:', fontClass);
  };

  const handleSetFont = (newFont: FontType) => {
    console.log('Setting font to:', newFont);
    setFont(newFont);
    localStorage.setItem('preferred-font', newFont);
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