// src/app/projects/[projectId]/page.jsx
import ProjectClient from './client';
export async function generateStaticParams() {
  return [{ projectId: 'default' }];
}

export default function ProjectPage() {
  return <ProjectClient />;
}