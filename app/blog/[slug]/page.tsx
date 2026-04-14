import { notFound } from "next/navigation";
import type { Metadata } from "next";
import Link from "next/link";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import { blogPosts, getPostBySlug } from "../data";
import PostContent from "./PostContent";

interface PageProps {
  params: Promise<{ slug: string }>;
}

export async function generateStaticParams() {
  return blogPosts.map((post) => ({ slug: post.slug }));
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug } = await params;
  const post = getPostBySlug(slug);

  if (!post) {
    return {
      title: "Post nije pronađen — EMNA Interijeri Blog",
    };
  }

  return {
    title: `${post.title} — EMNA Interijeri Blog`,
    description: post.excerpt,
    openGraph: {
      title: post.title,
      description: post.excerpt,
      type: "article",
      publishedTime: post.date,
      authors: ["EMNA Interijeri"],
    },
  };
}

export default async function BlogPostPage({ params }: PageProps) {
  const { slug } = await params;
  const post = getPostBySlug(slug);

  if (!post) {
    notFound();
  }

  return (
    <>
      <Header />
      <main className="bg-white min-h-screen">
        {/* ── Dark hero with title ── */}
        <section className="bg-brand-black pt-32 pb-16 px-6 lg:px-8">
          <div className="max-w-3xl mx-auto">
            {/* Breadcrumb */}
            <nav className="flex items-center gap-2 text-white/30 text-xs font-sans tracking-wider mb-8">
              <Link href="/" className="hover:text-white/60 transition-colors">
                Početna
              </Link>
              <span>/</span>
              <Link
                href="/blog"
                className="hover:text-white/60 transition-colors"
              >
                Blog
              </Link>
              <span>/</span>
              <span className="text-white/50 truncate max-w-[200px]">
                {post.title}
              </span>
            </nav>

            {/* Category badge */}
            <span className="inline-block text-xs tracking-[0.2em] uppercase font-sans text-accent border border-accent/30 px-3 py-1 mb-5">
              {post.category}
            </span>

            {/* Title */}
            <h1 className="font-serif text-3xl md:text-4xl lg:text-5xl text-white font-light leading-tight mb-8">
              {post.title}
            </h1>

            {/* Meta row */}
            <div className="flex items-center gap-6 text-white/30 text-xs font-sans">
              <span>{post.date}</span>
              <span className="w-px h-3 bg-white/20" />
              <span>{post.readTime}</span>
            </div>
          </div>
        </section>

        {/* ── Thin accent bar ── */}
        <div className="h-px bg-gradient-to-r from-transparent via-accent/40 to-transparent" />

        {/* ── Article body ── */}
        <article className="max-w-3xl mx-auto px-6 lg:px-8 py-16">
          <PostContent content={post.content} />

          {/* ── CTA at end of post ── */}
          <div className="mt-16 border border-accent/30 bg-stone-50 p-8 md:p-10">
            <p className="text-accent text-xs tracking-[0.25em] uppercase font-sans mb-3">
              Vaša kuhinja
            </p>
            <h2 className="font-serif text-2xl md:text-3xl text-brand-black font-light mb-3">
              Zainteresirani? Pogledajte kako izgleda vaša kuhinja.
            </h2>
            <p className="font-sans text-stone-600 font-light text-sm mb-7">
              Besplatna 3D vizualizacija vašeg prostora — bez obveza, bez
              skrivenih troškova.
            </p>
            <Link
              href="/#konfigurator"
              className="inline-block bg-brand-black text-white text-xs tracking-wider px-8 py-3.5 hover:bg-brand-dark transition-colors duration-300 font-sans"
            >
              Zatražite besplatni 3D dizajn
            </Link>
          </div>

          {/* ── Back to blog link ── */}
          <div className="mt-10 pt-8 border-t border-stone-200">
            <Link
              href="/blog"
              className="font-sans text-xs tracking-wider text-stone-400 hover:text-brand-black transition-colors duration-200"
            >
              ← Natrag na blog
            </Link>
          </div>
        </article>
      </main>
      <Footer />
    </>
  );
}
