const MEMBER_MARKER = '<!----yuyan-member-home---->';

export function shellParts(html: string): [string, string] {
  const memberStart = html.indexOf(MEMBER_MARKER);
  if (memberStart < 0) throw new Error('Worker home template is missing its member shell');
  return [html.slice(0, memberStart), html.slice(memberStart + MEMBER_MARKER.length)];
}

export function shellFor(visitorShell: string, memberShell: string, member: boolean): string {
  const shell = member ? memberShell : visitorShell;
  return shell.replace(' name="yuyan-home-fresh-auth"', ' name="yuyan-home-auth"');
}
