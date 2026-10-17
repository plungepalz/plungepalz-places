'use client';

interface CoverImageProps {
  src: string | null | undefined;
  alt: string;
  className?: string;
}

export default function CoverImage({ src, alt, className }: CoverImageProps) {
  if (!src) {
    return (
      <div className={`flex items-center justify-center bg-gradient-to-br from-orange-100 to-amber-50 ${className ?? ''}`}>
        <svg className="h-8 w-8 text-orange-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden>
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={1.8}
            d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z"
          />
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
        </svg>
      </div>
    );
  }

  return (
    // Cover images come from arbitrary remote URLs (API / Unsplash mocks), so next/image domains cannot be enumerated.
    // eslint-disable-next-line @next/next/no-img-element
    <img src={src} alt={alt} className={className} />
  );
}
