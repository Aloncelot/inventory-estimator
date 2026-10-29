'use client';
// Legacy route: projects open inside the main app now.
import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

export default function ProjectClient() {
  const router = useRouter();
  useEffect(() => { router.replace('/'); }, [router]);
  return <main className="app-content"><div className="empty-state">Opening the estimator…</div></main>;
}
