export default function path(...parts: Array<string | number>): string {
    return "/" + parts.map(encodeURIComponent).join("/");
}
