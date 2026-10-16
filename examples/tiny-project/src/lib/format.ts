export function formatName(name: string): string {
  return name.replace(/\b\w/g, (letter) => letter.toUpperCase());
}
