export default function path(...parts: Array<string | number>): string {
    return "/" + parts.map(p => p.toString()).map(encodeURIComponent).join("/");
}
