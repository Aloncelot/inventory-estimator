// src/components/InteriorWalls.jsx
'use client';
import WallCategory from '@/components/WallCategory';

export default function InteriorWalls({ title = 'Interior walls', ...props }) {
  return <WallCategory variant="interior" title={title} {...props} />;
}
