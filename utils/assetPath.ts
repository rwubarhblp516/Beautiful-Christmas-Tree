export const resolveAssetPath = (relativePath: string) => {
  const sanitized = relativePath.replace(/^\/+/, '');
  // Assets are now moved to the main project's public/christmas-assets folder
  return `/christmas-assets/${sanitized}`;
};
