import { useState, useEffect } from 'react';

interface WindowDimensions {
  viewportWidth: number;
  viewportHeight: number;
}

function getWindowDimensions(): WindowDimensions {
  const { innerWidth: viewportWidth, innerHeight: viewportHeight } = window;
  return { viewportWidth, viewportHeight };
}


export default function useWindowDimensions(): WindowDimensions {
  const [windowDimensions, setWindowDimensions] = useState<WindowDimensions>(getWindowDimensions());

  useEffect(() => {
    function handleResize() {
      setWindowDimensions(getWindowDimensions());
    }

    window.addEventListener('load', handleResize);
    window.addEventListener('resize', handleResize);
    return () => {[window.removeEventListener('load', handleResize), window.removeEventListener('resize', handleResize)]};
  }, []); // Empty dependency array ensures the effect runs only once on mount and cleans up on unmount

  return windowDimensions;
}