import type { AnnouncementBar as AnnouncementBarData } from '@nowoll/validation'
import Link from 'next/link'

// Thin strip above the header, e.g. "Free delivery in Dhaka over ৳2,000".
// Text and link come from Admin → Content (content block "announcement_bar").
export function AnnouncementBar({ data }: { data: AnnouncementBarData }) {
  return (
    <div className="bg-brand px-4 py-2 text-center text-sm text-brand-foreground">
      {data.href ? (
        <Link href={data.href} className="underline-offset-4 hover:underline">
          {data.text}
        </Link>
      ) : (
        data.text
      )}
    </div>
  )
}
