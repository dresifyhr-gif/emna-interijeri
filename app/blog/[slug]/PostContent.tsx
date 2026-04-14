"use client";

import { motion } from "framer-motion";

interface PostContentProps {
  content: string;
}

export default function PostContent({ content }: PostContentProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.6, ease: "easeOut" }}
      className="blog-prose font-sans text-brand-mid font-light leading-relaxed"
      dangerouslySetInnerHTML={{ __html: content }}
    />
  );
}
