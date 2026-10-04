/**
 * Joins class names, skipping false/null/undefined — so conditional classes
 * read naturally: cn('px-4', isActive && 'font-bold', className)
 */
export function cn(...classes: (string | false | null | undefined)[]): string {
  return classes.filter(Boolean).join(' ')
}
