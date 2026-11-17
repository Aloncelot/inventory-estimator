// src/app/projects/[projectId]/page.jsx
// Legacy route kept for old links: it sends people to /app. The static export
// needs at least one path, hence the 'default' param.
import ProjectClient from './client';
export async function generateStaticParams() {
  return [{ projectId: 'default' }];
}

export default function ProjectPage() {
  return <ProjectClient />;
}