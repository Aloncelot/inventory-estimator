'use client';
// Legacy route: the project list lives in the main app (Projects).
import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

export default function ProjectsPage() {
  const router = useRouter();
  useEffect(() => { router.replace('/'); }, [router]);
  return <main className="app-content"><div className="empty-state">Opening the estimator…</div></main>;
}
