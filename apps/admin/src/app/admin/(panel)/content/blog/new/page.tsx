import type { Metadata } from 'next'
import { NewBlogPost } from '@/components/blog/blog-editor'

export async function generateMetadata(): Promise<Metadata> {
  return { title: 'New post' }
}

export default function NewBlogPostPage() {
  return (
    <main className="mx-auto max-w-7xl px-4 py-8">
      <NewBlogPost />
    </main>
  )
}
