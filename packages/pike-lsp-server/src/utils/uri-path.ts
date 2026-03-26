export function uriToFsPath(uri: string): string {
  if (!uri.startsWith('file://')) {
    return uri;
  }

  return decodeURIComponent(uri.replace(/^file:\/\//, ''));
}
