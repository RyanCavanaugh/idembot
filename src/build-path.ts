export default function path(...parts: (string | number)[]) {
    return '/' + parts.map(encodeURIComponent).join('/');
}
