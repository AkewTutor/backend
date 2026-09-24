function getDisplayName(name) {
  if (!name) return 'Student';
  const parts = name.trim().split(' ');
  if (parts.length > 1) {
    return `${parts[0]} ${parts[parts.length - 1][0]}.`;
  }
  return parts[0];
}
