"use client";

import { motion } from "framer-motion";

export default function WhatsAppButton() {
  return (
    <div className="fixed bottom-6 right-6 z-50 group">
      {/* Tooltip */}
      <div className="absolute right-16 top-1/2 -translate-y-1/2 bg-white text-brand-black text-xs px-3 py-2 rounded-lg shadow-lg whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity duration-200 pointer-events-none">
        Pišite nam na WhatsApp
      </div>

      <motion.a
        href="https://wa.me/385000000000"
        target="_blank"
        rel="noopener noreferrer"
        aria-label="Kontaktirajte nas na WhatsApp"
        whileHover={{ scale: 1.1 }}
        whileTap={{ scale: 0.95 }}
        className="relative flex items-center justify-center w-14 h-14 bg-[#25D366] rounded-full shadow-lg shadow-green-900/30"
      >
        {/* Pulse ring */}
        <span className="absolute inset-0 rounded-full bg-[#25D366] animate-ping opacity-25" />

        {/* WhatsApp icon */}
        <svg
          width="28"
          height="28"
          viewBox="0 0 28 28"
          fill="none"
          className="relative z-10"
        >
          <path
            d="M14 2C7.373 2 2 7.373 2 14c0 2.157.572 4.177 1.57 5.924L2 26l6.25-1.543A11.934 11.934 0 0014 26c6.627 0 12-5.373 12-12S20.627 2 14 2z"
            fill="white"
            fillOpacity="0.2"
          />
          <path
            d="M14 3.5C8.201 3.5 3.5 8.201 3.5 14c0 2.09.585 4.04 1.604 5.7L3.5 24.5l5.02-1.585A10.443 10.443 0 0014 24.5c5.799 0 10.5-4.701 10.5-10.5S19.799 3.5 14 3.5z"
            stroke="white"
            strokeWidth="1.2"
          />
          <path
            d="M10.5 9.5c-.2-.5-.4-.5-.6-.5h-.5c-.2 0-.5.1-.8.4-.3.3-1 1-1 2.4s1 2.8 1.2 3c.2.2 2 3.1 4.8 4.3 2.4 1 2.9.8 3.4.7.5-.1 1.6-.7 1.9-1.3.3-.6.3-1.2.2-1.3-.1-.1-.4-.2-.8-.4-.4-.2-2.2-1.1-2.5-1.2-.3-.1-.6-.2-.8.2-.2.4-.9 1.2-1.1 1.4-.2.2-.4.2-.8 0-.4-.2-1.7-.6-3.2-2-.6-.5-1-1.1-1.1-1.5-.1-.4.1-.6.3-.8.2-.2.4-.4.5-.7.1-.3.1-.5 0-.7-.1-.2-.8-1.9-1.1-2.5z"
            fill="white"
          />
        </svg>
      </motion.a>
    </div>
  );
}
