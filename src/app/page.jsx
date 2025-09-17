'use client';
import ExteriorWalls from '@/components/ExteriorWalls';
import InteriorWalls from '@/components/InteriorWalls';

export default function Home() {
console.log('InteriorWalls is', InteriorWalls);
  return (
    <main style={{ padding: 24 }}>
      <ExteriorWalls />      
      <InteriorWalls />
    </main>
  );
}
