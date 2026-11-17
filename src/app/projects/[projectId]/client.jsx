// src/app/projects/[projectId]/client.jsx
// Legacy route: projects open inside the main app now.
'use client';
import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

export default function ProjectClient() {
  const router = useRouter();
  useEffect(() => { router.replace('/app'); }, [router]);
  return <main className="app-content"><div className="empty-state">Opening the estimator…</div></main>;
}
